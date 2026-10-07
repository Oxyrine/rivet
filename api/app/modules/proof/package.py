"""Portable Ed25519 packages and pure offline verification."""
import base64
import os
from pathlib import Path
from hashlib import sha256
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, PublicFormat, NoEncryption
from contract.canonical import canonical_json, digest, machine_view, GENESIS
from contract.sla import outcome

def signing_key():
    encoded=os.environ.get('RIVET_SIGNING_KEY')
    if encoded:  # hosted: the key is a secret, never a file on an ephemeral disk
        try:return Ed25519PrivateKey.from_private_bytes(base64.b64decode(encoded,validate=True))
        except Exception as exc:raise RuntimeError('RIVET_SIGNING_KEY must be the base64 of a 32-byte Ed25519 private key') from exc
    path=Path(os.environ.get('RIVET_KEY_PATH','api/data/provider-ed25519.key'))
    path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():
        key=Ed25519PrivateKey.generate()
        try:
            with path.open('xb') as f: f.write(key.private_bytes(Encoding.Raw,PrivateFormat.Raw,NoEncryption()))
        except FileExistsError: pass
    return Ed25519PrivateKey.from_private_bytes(path.read_bytes())

def public_key():
    raw=signing_key().public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
    return {'key_id':os.environ.get('RIVET_KEY_ID','k-demo-01'),'public_key':base64.b64encode(raw).decode(),'fingerprint':sha256(raw).hexdigest()}

def seal(body):
    return {'body':body,'key':public_key(),'signature':base64.b64encode(signing_key().sign(canonical_json(body).encode())).decode()}

def make_package(s,job_id):
    j=s.jobs[job_id]; machine=j['machine_id']; events=[e for e in s.events if e.get('machine')==machine]
    contract=s.contracts[s.machines[machine]['contract_id']]
    return seal({'version':1,'job_id':job_id,'machine_id':machine,'generated_at':s.now,'events':events,'head':events[-1]['machine_hash'] if events else GENESIS,'report':j.get('report'), 'report_hash':j.get('report_hash'),'acceptance':j.get('acceptance'),'reconciliation':j.get('reconciliation'),'contract':contract,'sla':j.get('sla'),'receipts':[r for r in s.receipts if r['machine_id']==machine]})

def verify(package,pinned_key,anchors=()):
    body=package['body']; errors=[]
    if package['key']['public_key']!=pinned_key: errors.append('Signing key differs from pinned onboarding key')
    try: Ed25519PublicKey.from_public_bytes(base64.b64decode(pinned_key)).verify(base64.b64decode(package['signature']),canonical_json(body).encode())
    except Exception: errors.append('Provider signature invalid')
    previous=GENESIS; byseq={}
    for index,event in enumerate(body['events'],1):
        if event['machine_seq']!=index or event['machine_prev_hash']!=previous or digest(previous,machine_view(event))!=event['machine_hash']:
            errors.append(f'Machine chain diverges at event {index}'); break
        previous=event['machine_hash']; byseq[index]=previous
    if previous!=body['head']: errors.append('Package head does not match chain')
    if body.get('report') and sha256(canonical_json(body['report']).encode()).hexdigest()!=body.get('report_hash'):
        errors.append('Report fingerprint mismatch')
    for anchor in anchors:
        if anchor['machine_id']==body['machine_id'] and byseq.get(anchor['machine_seq'])!=anchor['machine_hash']:
            errors.append(f"History diverges from customer-held acceptance at event {anchor['machine_seq']}")
    sla=None
    restored=[e for e in body['events'] if e['type']=='ServiceRestored' and e['payload'].get('job_id')==body['job_id']]
    reports=[e for e in body['events'] if e['type']=='RequestCreated' and e['payload'].get('job_id')==body['job_id']]
    if restored:
        p=restored[-1]['payload']; start=p.get('started_at') or (reports[0]['occurred_at'] if reports else None)
        if start:
            sla=outcome(start,p['restored_at'],p['contract'],p['pauses'])
            if sla!=body['sla']: errors.append('SLA result differs from event recomputation')
    return {'valid':not errors,'errors':errors,'head':previous,'sla':sla,'signature_valid':not any('signature' in e.lower() for e in errors)}
