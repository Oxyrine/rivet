"""HTTP vertical slice owned by Person A. No mocks of the domain or database."""
import base64
import json
from pathlib import Path
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from contract.sla import instant
from api.app.main import app
from api.app.core.runtime import store
from api.app.modules.ledger.domain import invariants
from api.app.modules.proof.package import verify,seal
from contract.canonical import digest,machine_view,GENESIS

FIXTURE=json.loads(Path('contract/fixtures/m104.json').read_text(encoding='utf-8'))

@pytest.fixture
def http():
    store.reset()
    with TestClient(app) as client: yield client

def headers(client,user):
    r=client.post('/auth/token',json={'user_id':user,'otp':FIXTURE['metadata']['demo_credentials']['otp']})
    assert r.status_code==200,r.text
    return {'Authorization':'Bearer '+r.json()['access_token'],'Idempotency-Key':str(uuid4())}

def post(client,path,body=None,user='coordinator'):
    r=client.post(path,json=body or {},headers=headers(client,user))
    assert r.status_code<300,(path,r.status_code,r.text)
    return r.json()

def clock(client,time): return post(client,'/admin/clock',{'set':f'2026-10-07T{time}+05:30'},'admin')

def request_and_assign(client):
    clock(client,'09:02:00')
    request=post(client,'/requests',{'machine_id':'M-104','fault':'hydraulic_leak'})
    assert request['validation']['parts']
    post(client,f"/requests/{request['id']}/approve")
    job=post(client,f"/jobs/{request['job_id']}/assign",{'technician_id':'ravi'})
    s=store.read(); assert s.balances['store:site-b:available|HS-40']==0
    assert s.balances[f"job:{job['id']}:reserved|HS-40"]==1
    assert invariants(s)
    return job

def recover(client):
    job=request_and_assign(client)
    clock(client,'10:10:00')
    result=post(client,'/technicians/ravi/dropout',{'reason':'vehicle_breakdown'})
    s=store.read(); assert not s.technicians['ravi']['available']
    assert s.breaches
    breach=next(reversed(s.breaches))
    response=client.get(f'/breaches/{breach}/impact',headers=headers(client,'coordinator'))
    assert response.status_code==200,response.text
    impact=response.json()
    assert set(impact['affected_jobs'])=={'J-2231','J-2236','J-2239'}
    plans=client.get(f'/breaches/{breach}/plans',headers=headers(client,'coordinator')).json()
    options=plans['plans'] if isinstance(plans,dict) else plans
    assert options
    post(client,f"/plans/{options[0]['id']}/approve")
    assert invariants(store.read())
    return store.read().jobs[job['id']]

@pytest.mark.thesis
def test_request_to_recovery_http(http):
    job=recover(http)
    assert job['technician_id']!='ravi'
    assert store.read().balances['job:J-2231:reserved|HS-40']==1

@pytest.mark.thesis
def test_complete_verified_record_and_insider_rewrite(http):
    job=recover(http); tech=job['technician_id']
    # The fixture is tuned so the first feasible plan uses Priya's stocked van.
    assert tech=='priya'
    post(http,'/customer-commitments/permit_to_work:J-2231/confirm',{},'supervisor')
    clock(http,'11:05:00')
    gate=Ed25519PrivateKey.generate(); public=base64.b64encode(gate.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)).decode()
    post(http,'/sites/site-a/gate-key',{'public_key':public},'supervisor')
    window=int(instant(store.read().now).timestamp())//30
    code={'window':window,'signature':base64.b64encode(gate.sign(f'site-a|{window}'.encode())).decode()}
    post(http,'/jobs/J-2231/actions/CheckIn',{'arrival_code':code,'gps':{'lat_e6':19076000,'lng_e6':72877000},'machine_qr':'M-104'},tech)
    r=http.post('/jobs/J-2231/actions/StartWork',json={},headers=headers(http,tech))
    assert r.status_code==409 and r.json()['code']=='PERMIT_PENDING'
    clock(http,'11:17:00'); post(http,'/customer-commitments/permit_to_work:J-2231/fulfil',{},'supervisor')
    clock(http,'11:20:00'); post(http,'/jobs/J-2231/actions/StartWork',{},tech)
    post(http,'/stores/issue',{'job_id':'J-2231','resource':'HS-40','quantity':1},'storekeeper')
    post(http,'/jobs/J-2231/actions/PartScanned',{'resource':'HS-40','quantity':1},tech)
    for kind in ('before_photo','after_photo'):
        # Tiny real PNG fixture; the server checks bytes and computes its own hash.
        png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6iAAAAABJRU5ErkJggg=='
        post(http,'/evidence/uploads',{'photo_id':kind,'job_id':'J-2231','type':kind,'content_base64':png},tech)
        post(http,'/jobs/J-2231/evidence',{'type':kind,'photo_id':kind},tech)
    clock(http,'12:20:00'); post(http,'/jobs/J-2231/checkout',{},tech)
    post(http,'/telemetry',{'machine_id':'M-104','reading_id':str(uuid4()),'running':True,'in_band':True,'pressure_bar':140,'status':'running'})
    checklist=FIXTURE['metadata']['required_checklist']
    bad=post(http,'/jobs/J-2231/report',{'parts':{'HS-40':2},'checklist':checklist},tech)
    assert bad['reconciliation']['outcome']=='Unexplained'
    supervisor=store.read().users['supervisor']
    body={'pin':supervisor['pin'],'device_id':supervisor['device_id'],'report_hash':store.read().jobs['J-2231']['report_hash']}
    blocked=http.post('/jobs/J-2231/accept',json=body,headers=headers(http,'supervisor'));assert blocked.status_code==409
    clock(http,'12:24:00')
    post(http,'/jobs/J-2231/report',{'parts':{'HS-40':1,'O-RING':2},'checklist':checklist,'minutes':60},tech)
    post(http,'/jobs/J-2231/variance',{'part':'O-RING','reason':'Used van stock'},tech)
    job=store.read().jobs['J-2231'];assert job['reconciliation']['outcome']=='Explained variance'
    assert job['sla']['margin_minutes']==54
    clock(http,'12:26:00');body['report_hash']=job['report_hash'];receipt=post(http,'/jobs/J-2231/accept',body,'supervisor')
    package=http.get('/machines/M-104/package',headers=headers(http,'supervisor')).json()
    assert package['body']['acceptance']=='Verified'
    pinned=public_key=package['key']['public_key']
    assert verify(package,pinned,[receipt])['valid']
    # Rehash and resign with the real provider key: only the customer's remembered anchor detects it.
    changed=json.loads(json.dumps(package['body']));changed['events'][0]['payload']['description']='rewritten'
    previous=GENESIS
    for event in changed['events']:
        event['machine_prev_hash']=previous;event['machine_hash']=digest(previous,machine_view(event));previous=event['machine_hash']
    changed['head']=previous
    attacked=seal(changed)
    assert verify(attacked,pinned)['valid']
    assert not verify(attacked,pinned,[receipt])['valid']
    assert invariants(store.read())

def test_role_and_site_isolation(http):
    assert http.get('/dashboard/summary').status_code==401
    forbidden=http.post('/requests',json={'machine_id':list(FIXTURE['machines'])[-1]},headers=headers(http,'requester'))
    assert forbidden.status_code==404
    assert http.post('/admin/clock',json={'advance':1},headers=headers(http,'supervisor')).status_code==403
