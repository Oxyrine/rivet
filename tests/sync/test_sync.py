from api.app.core.runtime import fixture
from api.app.modules.ledger.domain import create_request, assign, invariants
from api.app.modules.ledger.sync import replay
from contract.errors import DomainError
import pytest
import base64
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from datetime import datetime,timedelta
from api.app.modules.ledger.sync import presence

def setup():
    state=fixture();create_request(state,{'machine_id':'M-104'});assign(state,'J-2231','ravi');return state,state.users['ravi']

def cmd(seq,kind='TaskLogged',**payload):return {'idempotency_key':f'key-{seq}','device_seq':seq,'device_ts':'2026-10-07T03:32:00+00:00','type':kind,'job_id':'J-2231','payload':payload}

def test_gap_then_duplicate_replay():
    s,p=setup();assert replay(s,'device-ravi',[cmd(2)],p)['results'][0]['status']=='held_gap'
    accepted=replay(s,'device-ravi',[cmd(1)],p)
    assert len(accepted['results'])==2 and all(r['status']=='accepted' for r in accepted['results'])
    count=len(s.events);out=replay(s,'device-ravi',[cmd(1),cmd(2)],p)
    assert all(r['status']=='duplicate' for r in out['results']) and len(s.events)==count

def test_stale_assignment_preserves_evidence_and_permit_gate():
    s,p=setup();r=replay(s,'device-ravi',[cmd(1,'StartWork')],p)
    assert r['results'][0]['code']=='PERMIT_PENDING'
    s.jobs['J-2231'].update(technician_id='priya',reassigned_from=['ravi'])
    r=replay(s,'device-ravi',[cmd(2,'PartScanned',resource='HS-40',quantity=1)],p)
    assert r['results'][0]['code']=='JOB_REASSIGNED' and s.jobs['J-2231']['evidence']
    invariants(s)

def test_key_reuse_conflict():
    s,p=setup();replay(s,'device-ravi',[cmd(1)],p)
    with pytest.raises(DomainError):replay(s,'device-ravi',[cmd(1,notes='changed')],p)

def test_signed_arrival_requires_site_gps_and_rejects_expired_window():
    s,p=setup();key=Ed25519PrivateKey.generate();s.metadata['gate_keys']['site-a']=base64.b64encode(key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)).decode()
    window=int(datetime.fromisoformat(s.now).timestamp())//30
    code={'window':window,'signature':base64.b64encode(key.sign(f'site-a|{window}'.encode())).decode()}
    assert presence(s,s.jobs['J-2231'],{'arrival_code':code,'gps':{'lat_e6':19076000,'lng_e6':72877000}})=='strong'
    assert presence(s,s.jobs['J-2231'],{'arrival_code':code,'gps':{'lat_e6':0,'lng_e6':0}})=='weak'
    s.now=(datetime.fromisoformat(s.now)+timedelta(seconds=61)).isoformat()
    with pytest.raises(DomainError):presence(s,s.jobs['J-2231'],{'arrival_code':code})


def test_reassigned_technician_facts_are_evidence_not_job_state():
    s,p=setup();job=s.jobs['J-2231'];job['technician_id']='priya';job['reassigned_from']=['ravi']
    out=replay(s,'device-ravi',[cmd(1,'TaskLogged',checklist=['isolate'])],p)['results'][0]
    assert out['code']=='JOB_REASSIGNED'
    assert job['checklist']==[] and job['tasks']==[] and job['evidence']
    invariants(s)

def test_unrelated_technician_cannot_write_to_a_job():
    s,p=setup();job=s.jobs['J-2231'];job['technician_id']='priya'
    for seq,kind in enumerate(('TaskLogged','ReadingRecorded','EvidenceAttached'),1):
        out=replay(s,'device-ravi',[cmd(seq,kind,checklist=['isolate'])],p)['results'][0]
        assert out['status']=='rejected' and out['code']=='NOT_FOUND',kind
    assert job['checklist']==[] and job['evidence']==[] and not job.get('readings')

def test_rate_limited_commands_are_deferred_not_reported_as_gaps():
    s,p=setup()
    out=replay(s,'device-ravi',[cmd(n) for n in range(1,13)],p)
    statuses=[r['status'] for r in out['results']]
    assert statuses.count('accepted')==10 and statuses.count('deferred')==2 and 'held_gap' not in statuses
    assert out['sequence_gaps']==0
    final=replay(s,'device-ravi',[cmd(11),cmd(12)],p)
    assert [r['status'] for r in final['results']]==['accepted','accepted']


def test_offline_issue_report_replays_as_an_auditable_shortfall():
    s,p=setup()
    issue=cmd(1,'IssueReported')
    issue['payload']={'kind':'part_shortage','details':{'resource':'HS-40','note':'Shelf is empty'}}
    result=replay(s,'device-ravi',[issue],p)
    assert result['results'][0]['status']=='accepted'
    hold=next(c for c in s.commitments.values() if c.get('job_id')=='J-2231' and c.get('resource')=='HS-40')
    assert hold['state']=='BREACHED'
    assert any(b['type']=='PART_SHORTFALL' for b in s.breaches.values())
