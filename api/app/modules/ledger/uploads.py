"""Private content-addressed evidence storage; client metadata never authenticates bytes."""
import base64
import hashlib
import os
import re
from pathlib import Path
from contract.errors import DomainError
from contract.state import emit
from api.app.core.runtime import ROOT
from api.app.core.auth import scoped_job

def data_dir():
    directory=Path(os.getenv('EVIDENCE_DIR',str(ROOT/'data/evidence')))
    directory.mkdir(parents=True,exist_ok=True)
    return directory

def content_type(content):
    if content.startswith(b'\x89PNG\r\n\x1a\n'):return 'image/png',10*1024*1024
    if content.startswith(b'\xff\xd8\xff') and content.endswith(b'\xff\xd9'):return 'image/jpeg',10*1024*1024
    if content.startswith(b'%PDF-') and b'%%EOF' in content[-1024:]:return 'application/pdf',20*1024*1024
    raise DomainError('INVALID_FILE_TYPE','Only PNG, JPEG and PDF content is accepted',status=422)

def decode_upload(body):
    ident=body.get('photo_id','')
    if not isinstance(ident,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',ident):raise DomainError('INVALID_PHOTO_ID','Photo id must contain letters, digits, hyphens or underscores',status=422)
    encoded=body.get('content_base64')
    if not isinstance(encoded,str) or len(encoded)>28*1024*1024:raise DomainError('FILE_TOO_LARGE','Evidence file exceeds its size limit',status=413)
    try:content=base64.b64decode(encoded,validate=True)
    except Exception:raise DomainError('INVALID_FILE','File must contain valid base64 bytes',status=422)
    mime,limit=content_type(content)
    if len(content)>limit:raise DomainError('FILE_TOO_LARGE','Images are limited to 10 MB and PDFs to 20 MB',status=413)
    return ident,content,mime,hashlib.sha256(content).hexdigest()

def record_upload(state,body,principal):
    # Enforce tenant/job/assignment scope before touching the filesystem.
    job=scoped_job(state,body.get('job_id'),principal)
    if body.get('type') is not None and not isinstance(body['type'],str):raise DomainError('INVALID_EVIDENCE_TYPE','Evidence type must be a string',status=422)
    ident,content,mime,digest=decode_upload(body)
    uploads=state.metadata.setdefault('uploads',{})
    prior=uploads.get(ident)
    if prior:
        if prior['sha256']!=digest or prior['job_id']!=job['id']:raise DomainError('PHOTO_ID_CONFLICT','Photo id is already linked to different bytes or a different job')
        return dict(prior,duplicate=True)
    path=data_dir()/digest
    if not path.exists():
        # Exclusive create avoids rewriting a hash-named object during concurrent retries.
        try:
            with path.open('xb') as file:file.write(content)
        except FileExistsError:pass
    metadata={'photo_id':ident,'job_id':job['id'],'sha256':digest,'size_bytes':len(content),'content_type':mime,'filename':Path(str(body.get('filename','evidence'))).name,'uploaded_at':state.now,'uploaded_by':principal['user_id'],'type':body.get('type'),'url':'/evidence/uploads/'+ident}
    uploads[ident]=metadata
    emit(state,'EvidenceUploaded',job['machine_id'],metadata,principal['user_id'])
    return metadata

def uploaded_content(state,ident,principal):
    record=state.metadata.get('uploads',{}).get(ident)
    if not record:raise DomainError('NOT_FOUND','Uploaded evidence not found',status=404)
    scoped_job(state,record['job_id'],principal)
    path=data_dir()/record['sha256']
    if not path.is_file():raise DomainError('EVIDENCE_MISSING','Evidence bytes are missing from storage',status=404)
    if hashlib.sha256(path.read_bytes()).hexdigest()!=record['sha256']:raise DomainError('EVIDENCE_TAMPERED','Stored evidence bytes do not match the recorded hash')
    return path,record

def attach_uploaded(state,job_id,payload,actor):
    job=state.jobs[job_id];photo_id=payload.get('photo_id')
    record=state.metadata.get('uploads',{}).get(photo_id)
    evidence_type=payload.get('type') or payload.get('photo_type') or payload.get('kind')
    if evidence_type is not None and not isinstance(evidence_type,str):raise DomainError('INVALID_EVIDENCE_TYPE','Evidence type must be a string',status=422)
    if evidence_type in ('before_photo','after_photo','permit_photo','delivery_note','signed_sheet'):
        if not record or record['job_id']!=job_id:raise DomainError('EVIDENCE_UPLOAD_REQUIRED','Upload file bytes before attaching photo evidence',{'photo_id':photo_id})
        if record.get('type') and record['type']!=evidence_type:raise DomainError('EVIDENCE_TYPE_CONFLICT','Uploaded evidence type cannot be changed')
        principal=state.users.get(actor)
        if not principal:raise DomainError('FORBIDDEN','Unknown evidence author',status=403)
        uploaded_content(state,photo_id,principal)
        if evidence_type.endswith('_photo') and not record['content_type'].startswith('image/'):raise DomainError('INVALID_FILE_TYPE','Photo evidence must be an image',status=422)
    ident=photo_id or f'evidence-{len(state.evidence)+1:06d}'
    prior=state.evidence.get(ident)
    if prior:
        if prior.get('job_id')!=job_id:raise DomainError('PHOTO_ID_CONFLICT','Evidence belongs to another job')
        if prior.get('type')!=evidence_type:raise DomainError('EVIDENCE_TYPE_CONFLICT','Evidence is already attached with a different type')
        return prior
    item={'id':ident,'job_id':job_id,'actor':actor,'captured_at':payload.get('captured_at',state.now),'type':evidence_type,'authentic':bool(record),'uploaded_file':photo_id if record else None,'sha256':record['sha256'] if record else None,'content_type':record['content_type'] if record else None,'notes':payload.get('notes','')}
    state.evidence[ident]=item
    if ident not in job['evidence']:job['evidence'].append(ident)
    emit(state,'EvidenceAttached',job['machine_id'],item,actor)
    return item
