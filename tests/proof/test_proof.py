import json
from pathlib import Path
from copy import deepcopy
import pytest
from contract.state import LedgerState, emit
from contract.errors import DomainError
from api.app.modules.proof import service as d
from api.app.modules.proof.package import make_package, verify, seal

def state():
    s=LedgerState.from_dict(json.loads(Path('contract/fixtures/m104.json').read_text()))
    j=s.jobs['J-2240']; j['technician_id']='priya'; j['presence_confirmed']=True
    from api.app.modules.ledger.uploads import record_upload
    png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII='
    for kind in ('before_photo','after_photo'):
        record_upload(s,{'photo_id':kind,'job_id':j['id'],'type':kind,'content_base64':png},s.users['priya'])
        d.attach_evidence(s,j['id'],{'type':kind,'photo_id':kind},'priya')
    emit(s,'StoreIssued',j['machine_id'],{'job_id':j['id'],'resource':'HS-40','quantity':1,'technician_id':'priya'},'storekeeper')
    return s

def clean(s):
    return d.submit_report(s,'J-2240',{'parts':{'HS-40':1},'checklist':s.metadata['required_checklist']},'priya')

def test_discrepancy_blocks_acceptance():
    s=state(); d.submit_report(s,'J-2240',{'parts':{'HS-40':2},'checklist':s.metadata['required_checklist']},'priya')
    with pytest.raises(DomainError,match='Resolve'): d.accept(s,'J-2240',{'pin':'4826','device_id':'device-supervisor','report_hash':s.jobs['J-2240']['report_hash']},s.users['supervisor'])

def test_van_variance_is_balanced_and_backed():
    s=state();d.submit_report(s,'J-2240',{'parts':{'HS-40':1,'O-RING':2},'checklist':s.metadata['required_checklist']},'priya')
    v=d.explain_variance(s,'J-2240',{'part':'O-RING','reason':'Used van stock'},'priya')
    assert v['auto']; assert s.balances['van:priya:stock|O-RING']==2
    from api.app.modules.ledger.domain import invariants
    assert invariants(s); assert d.reconcile(s,'J-2240')['outcome']=='Explained variance'

def test_registered_device_exact_report_and_fix_guard():
    s=state();clean(s); j=s.jobs['J-2240'];p={'pin':'4826','device_id':'other','report_hash':j['report_hash']}
    with pytest.raises(DomainError):d.accept(s,j['id'],p,s.users['supervisor'])
    p['device_id']='device-supervisor';d.accept(s,j['id'],p,s.users['supervisor']); assert j['acceptance']=='Accepted, fix not independently confirmed'

def test_customer_verifies_offline(tmp_path,monkeypatch):
    monkeypatch.setenv('RIVET_KEY_PATH',str(tmp_path/'key'));s=state();clean(s)
    d.check_out(s,'J-2240',{},'priya');d.machine_running(s,'J-2240','simulated telemetry','system')
    j=s.jobs['J-2240'];receipt=d.accept(s,j['id'],{'pin':'4826','device_id':'device-supervisor','report_hash':j['report_hash']},s.users['supervisor'])
    pkg=make_package(s,j['id']);key=pkg['key']['public_key'];assert verify(pkg,key,[receipt])['valid']
    edited=deepcopy(pkg);edited['body']['events'][0]['payload']['type']='altered';assert not verify(edited,key,[receipt])['valid']
    from contract.canonical import digest,machine_view,GENESIS
    body=edited['body'];previous=GENESIS
    for e in body['events']:e['machine_prev_hash']=previous;e['machine_hash']=digest(previous,machine_view(e));previous=e['machine_hash']
    body['head']=previous;rewritten=seal(body)
    assert verify(rewritten,key)['valid'];assert not verify(rewritten,key,[receipt])['valid']

def test_deeming_only_after_both_reminders():
    s=state();clean(s);s.now='2026-10-08T03:32:00+00:00';d.reminders(s)
    assert s.jobs['J-2240']['acceptance']=='Deemed accepted';assert s.jobs['J-2240']['reminders']==[12,20]

def test_sla_checkout_used_when_normal_arrives_within_stabilisation():
    s=state();s.now='2026-10-07T06:50:00+00:00';d.check_out(s,'J-2240',{},'priya');s.now='2026-10-07T07:00:00+00:00';d.machine_running(s,'J-2240','simulated telemetry','system');assert s.jobs['J-2240']['restored_at']=='2026-10-07T06:50:00+00:00'

def test_browser_verifies_python_signature_and_anchored_rewrite(tmp_path,monkeypatch):
    import subprocess,shutil
    if not shutil.which('node'):pytest.skip('Node required for browser canonical verification')
    monkeypatch.setenv('RIVET_KEY_PATH',str(tmp_path/'key'));s=state();clean(s)
    d.check_out(s,'J-2240',{},'priya');d.machine_running(s,'J-2240','simulated telemetry','system');j=s.jobs['J-2240']
    receipt=d.accept(s,j['id'],{'pin':'4826','device_id':'device-supervisor','report_hash':j['report_hash']},s.users['supervisor']);pkg=make_package(s,j['id']);key=pkg['key']['public_key']
    body=deepcopy(pkg['body']);body['events'][0]['payload']['rewrite']=True
    from contract.canonical import digest,machine_view,GENESIS
    previous=GENESIS
    for e in body['events']:e['machine_prev_hash']=previous;e['machine_hash']=digest(previous,machine_view(e));previous=e['machine_hash']
    body['head']=previous;rewritten=seal(body)
    cases=[{'name':'clean','package':pkg,'key':key,'anchors':[receipt],'expected':True},{'name':'rewritten anchored','package':rewritten,'key':key,'anchors':[receipt],'expected':False},{'name':'rewritten unanchored','package':rewritten,'key':key,'anchors':[],'expected':True}]
    path=tmp_path/'cases.json';path.write_text(json.dumps(cases));result=subprocess.run(['node','tests/proof/check_vectors.mjs',str(path)],capture_output=True,text=True)
    assert result.returncode==0,result.stdout+result.stderr

def test_three_auto_variances_weekly_cap():
    s=state()
    for n in range(4):
        j=deepcopy(s.jobs['J-2240']);j['id']=f'J-cap-{n}';j['issued_parts']={};s.jobs[j['id']]=j
        d.submit_report(s,j['id'],{'parts':{'O-RING':1},'checklist':s.metadata['required_checklist']},'priya')
        v=d.explain_variance(s,j['id'],{'part':'O-RING','reason':'Used van stock'},'priya')
        assert v['auto']==(n<3)
    assert s.balances['van:priya:stock|O-RING']==1

def test_photo_metadata_cannot_satisfy_mandatory_evidence():
    s=state();s.jobs['J-2240']['evidence']=[]
    with pytest.raises(DomainError,match='Upload'):d.attach_evidence(s,'J-2240',{'type':'before_photo'},'priya')
    result=clean(s);assert result['reconciliation']['outcome']=='Unexplained'
    assert any(e['type']=='ClosureBlocked' for e in s.events)

def test_technician_report_cannot_rewrite_store_issue():
    s=state();s.jobs['J-2240']['issued_parts']['HS-40']=2
    result=d.submit_report(s,'J-2240',{'parts':{'HS-40':2},'checklist':s.metadata['required_checklist']},'priya')
    row=result['reconciliation']['rows'][0];assert row['corroborated']==1;assert row['outcome']=='Unexplained'
    corrected=clean(s);assert corrected['reconciliation']['outcome']=='Clean'
    assert s.jobs['J-2240']['state']=='awaiting_acceptance'
    assert any(e['type']=='ClosureBlocked' for e in s.events)

def test_running_before_checkout_does_not_stop_sla():
    s=state();clean(s);d.machine_running(s,'J-2240','simulated telemetry','system')
    s.now='2026-10-07T06:50:00+00:00';d.check_out(s,'J-2240',{},'priya')
    j=s.jobs['J-2240'];assert 'restored_at' not in j
    d.accept(s,j['id'],{'pin':'4826','device_id':'device-supervisor','report_hash':j['report_hash']},s.users['supervisor'])
    assert j['acceptance']=='Accepted, fix not independently confirmed'
    d.machine_running(s,j['id'],'simulated telemetry','system');d.fix_failed(s,j['id'],'system');assert j['state']=='reopened';assert 'sla' not in j

def test_storekeeper_issue_scope_uses_source_warehouse():
    s=state();j=s.jobs['J-2240'];j['issued_parts']={}
    result=d.store_issue(s,j['id'],{'resource':'HS-40','quantity':1},s.users['storekeeper'])
    assert result['quantity']==1;assert s.balances['job:J-2240:issued|HS-40']==1
    assert s.users['storekeeper']['sites']==['site-b'];assert j['site_id']=='site-a'
