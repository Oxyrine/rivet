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
    s.jobs['J-2231']['technician_id']='priya'
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
