"""Explicitly simulated feed. Run with --status fault to open M-104 service."""
import argparse,json,urllib.request,uuid
p=argparse.ArgumentParser();p.add_argument('--url',default='http://localhost:8000');p.add_argument('--status',choices=['fault','running'],default='fault');p.add_argument('--pressure',type=int);a=p.parse_args()
def post(path,body,token=None):
    headers={'Content-Type':'application/json','Idempotency-Key':str(uuid.uuid4())}
    if token:headers['Authorization']='Bearer '+token
    with urllib.request.urlopen(urllib.request.Request(a.url+path,data=json.dumps(body).encode(),headers=headers)) as r:return json.load(r)
auth=post('/auth/token',{'user_id':'coordinator','otp':'246810'})
print(json.dumps(post('/telemetry',{'machine_id':'M-104','reading_id':str(uuid.uuid4()),'status':a.status,'pressure_bar':a.pressure or (140 if a.status=='running' else 90),'simulated':True},auth['access_token']),indent=2))
