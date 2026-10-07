import base64
import pytest
from api.app.core.runtime import fixture
from api.app.modules.ledger.domain import create_request,assign
from api.app.modules.ledger.uploads import record_upload,attach_uploaded,uploaded_content
from contract.errors import DomainError

PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=')

def setup(monkeypatch,tmp_path):
    monkeypatch.setenv('EVIDENCE_DIR',str(tmp_path/'evidence'))
    s=fixture();create_request(s,{'machine_id':'M-104'});assign(s,'J-2231','ravi')
    return s,s.users['ravi']

def test_upload_retries_signature_hash_and_private_scope(monkeypatch,tmp_path):
    s,p=setup(monkeypatch,tmp_path);body={'photo_id':'photo-a','job_id':'J-2231','content_base64':base64.b64encode(PNG).decode(),'filename':'../before.png','type':'before_photo'}
    record=record_upload(s,body,p);assert record['content_type']=='image/png' and record['filename']=='before.png'
    assert record_upload(s,body,p)['duplicate']
    item=attach_uploaded(s,'J-2231',{'photo_id':'photo-a','type':'before_photo'},'ravi');assert item['authentic'] and item['sha256']==record['sha256']
    with pytest.raises(DomainError):record_upload(s,{**body,'content_base64':base64.b64encode(PNG+b'other').decode()},p)
    with pytest.raises(DomainError):attach_uploaded(s,'J-2231',{'photo_id':'photo-a','type':'after_photo'},'ravi')
    with pytest.raises(DomainError):uploaded_content(s,'photo-a',s.users['priya'])
    content,_=uploaded_content(s,'photo-a',p);assert content==PNG
    (tmp_path/'evidence'/record['sha256']).write_bytes(b'corrupted')
    with pytest.raises(DomainError):uploaded_content(s,'photo-a',p)

def test_missing_or_invalid_upload_cannot_authenticate_photo(monkeypatch,tmp_path):
    s,p=setup(monkeypatch,tmp_path)
    with pytest.raises(DomainError):attach_uploaded(s,'J-2231',{'photo_id':'made-up','type':'before_photo','authentic':True},'ravi')
    with pytest.raises(DomainError):record_upload(s,{'photo_id':'bad','job_id':'J-2231','content_base64':base64.b64encode(b'<script>').decode(),'filename':'valid.png'},p)
