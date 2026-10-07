from datetime import datetime,timedelta
from api.app.core.runtime import fixture
from api.app.core.scheduler import tick
from api.app.modules.ledger.domain import create_request,assign,invariants

def test_missed_checkin_creates_one_dropout_with_recovery():
    s=fixture();create_request(s,{'machine_id':'M-104'});assign(s,'J-2231','ravi')
    for job in s.jobs.values():
        if job['id']!='J-2231':job['check_in_at']=job['created_at']
    s.now=(datetime.fromisoformat(s.jobs['J-2231']['planned_start'])+timedelta(minutes=21)).isoformat()
    result=tick(s);assert result['missed_checkin_technicians']==['ravi'] and s.breaches
    count=len(s.breaches);tick(s);assert len(s.breaches)==count
    invariants(s)
