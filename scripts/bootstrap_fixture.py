"""Deterministic M-104 fixture and shared cross-language hash vectors."""
import json
from datetime import datetime, timedelta
from pathlib import Path
from contract.state import LedgerState, emit
from contract.canonical import GENESIS, digest

def fixture():
    s = LedgerState()
    s.sites = {k: {'id': k, 'name': name, 'customer_id': 'customer-plant' if k != 'site-c' else 'customer-other', 'timezone': 'Asia/Kolkata', 'lat_e6': lat, 'lng_e6': lng}
               for k,name,lat,lng in [('site-a','Aster Works · Plant A',19076000,72877000),('site-b','Site B · Parts depot',19198000,72987000),('site-c','Site C · Remote plant',20760000,73150000)]}
    s.contracts = {'P1': {'id':'P1','resolution_minutes':240,'response_minutes':120,'penalty_rate_paise':500000,'penalty_unit_minutes':15,'penalty_cap_paise':5000000,'calendar':'24x7','auto_approve_paise':1000000},
                   'P2': {'id':'P2','resolution_minutes':240,'response_minutes':180,'penalty_rate_paise':300000,'penalty_unit_minutes':15,'penalty_cap_paise':5000000,'calendar':'24x7','auto_approve_paise':1000000}}
    for i in range(12):
        mid = ['M-104','M-117','M-122'][i] if i < 3 else f'M-{130+i}'
        s.machines[mid] = {'id':mid,'name':'Hydraulic press' if i==0 else 'Industrial drive', 'site_id':'site-a' if i < 8 else 'site-c','contract_id':'P1' if i==0 else 'P2','eligible':True,'status':'Running','sensor':i==0}
    for name,km,eta,cert in [('Ravi',6,9,True),('Priya',12,18,True),('Karthik',17,25,True),('Arjun',7,10,False),('Meena',150,150,True),('Dev',20,30,True)]:
        tid=name.lower()
        s.technicians[tid]={'id':tid,'name':name,'skills':{'hydraulics':2,'gearbox':2},'certificate_valid':cert,'certificate_expires':'2027-10-01' if cert else '2026-09-01','available':True,'distance_km':km,'travel_minutes':eta,'site_id':'site-c' if name=='Meena' else 'site-a','shift_slots':32,'device_id':f'device-{tid}'}
        s.balances[f'tech:{tid}:2026-10-07:free|TIME']=32
    s.technicians['priya']['shift_end']='2026-10-07T08:30:00+00:00'
    # Karthik is qualified for Ravi's gearbox jobs, not the level-2 hydraulic repair.
    s.technicians['karthik']['skills']['hydraulics']=1
    s.technicians['contractor-1']={'id':'contractor-1','name':'Approved contractor','contractor':True,'approved':True,'sites':['site-a'],'skills':{'hydraulics':2},'certificate_valid':True,'certificate_expires':'2027-10-01','available':True,'distance_km':21,'travel_minutes':31,'site_id':'site-a','shift_slots':32,'device_id':'device-contractor-1','fee_paise':450000}
    s.balances['tech:contractor-1:2026-10-07:free|TIME']=32
    s.balances.update({'store:site-b:available|HS-40':1,'job:J-2240:reserved|HS-40':1,'store:site-a:available|HS-40':0,'van:priya:stock|O-RING':4,'store:site-b:available|JACK':1})
    for i in range(17): s.balances[f'store:site-b:available|PART-{i+1:02d}']=5
    s.metadata={'fixture_version':1,'durations':{'hydraulic_leak':55,'gearbox_overhaul':95},'part_costs_paise':{'HS-40':240000,'O-RING':15000,'JACK':0},'required_checklist':['isolate','inspect','replace','test','before_photo','after_photo'],'initial_resource_totals':{},'next_request':2231,'demo_credentials':{'otp':'246810','supervisor_pin':'4826'},'gate_keys':{},'seed_history':{'hydraulic_leak':[50,53,55,58,60],'gearbox_overhaul':[85,90,95,100,105]}}
    for account,qty in s.balances.items():
        resource=account.rsplit('|',1)[1]
        s.metadata['initial_resource_totals'][resource]=s.metadata['initial_resource_totals'].get(resource,0)+qty
    for i in range(11):
        jid=['J-2236','J-2239','J-2240'][i] if i<3 else f'J-{2250+i}'
        mid=['M-117','M-122','M-133'][i] if i<3 else list(s.machines)[i]
        tech=['ravi','ravi','dev','karthik','priya','dev','dev','dev','meena','meena','meena'][i]
        slot=['06:30','08:10','03:35','09:50','05:55','05:15','07:00','08:40','03:35','05:15','07:00'][i]
        due=['08:45','10:00','06:00','12:00','08:00','07:30','09:00','11:00','06:00','07:30','09:00'][i]
        start=f'2026-10-07T{slot}:00+00:00'
        s.jobs[jid]={'id':jid,'machine_id':mid,'site_id':s.machines[mid]['site_id'],'technician_id':tech,'state':'assigned','priority':'P1' if i==2 else 'P2','fault':'gearbox_overhaul','created_at':'2026-10-07T03:00:00+00:00','deadline':f'2026-10-07T{due}:00+00:00','planned_start':start,'duration_minutes':95,'planned_parts':{'HS-40':1} if i==2 else {},'issued_parts':{'HS-40':1} if i==2 else {},'evidence':[],'tasks':[],'checklist':[],'acceptance':'Pending','on_site':i==2}
        source=f'tech:{tech}:2026-10-07:free'; destination=f'job:{jid}:allocated'
        s.balances[source+'|TIME']-=7;s.balances[destination+'|TIME']=7
        tx=f'seed-time-{i+1:03d}'
        s.entries.extend([{'transaction_id':tx,'account':source,'resource':'TIME','quantity':-7,'actor':'fixture','occurred_at':s.now},{'transaction_id':tx,'account':destination,'resource':'TIME','quantity':7,'actor':'fixture','occurred_at':s.now}])
        previous=[c['id'] for c in s.commitments.values() if c.get('type')=='TECH_TIME' and c.get('owner')==tech]
        s.commitments['time:'+jid]={'id':'time:'+jid,'type':'TECH_TIME','job_id':jid,'resource':'TIME','owner':tech,'state':'HELD','source':source,'reservation_account':destination,'quantity':7,'starts_at':start,'ends_at':(datetime.fromisoformat(start)+timedelta(minutes=95)).isoformat(),'depends_on':previous[-1:]}
        s.commitments['sla:'+jid]={'id':'sla:'+jid,'type':'SLA_WINDOW','job_id':jid,'state':'ACTIVE','deadline':s.jobs[jid]['deadline'],'depends_on':['time:'+jid]}
    s.commitments['hold-existing']={'id':'hold-existing','type':'PART_HOLD','job_id':'J-2240','resource':'HS-40','quantity':1,'source':'store:site-b:available','owner':'dev','state':'HELD','physical_location':'site-b','expires_at':'2026-10-07T12:00:00+00:00','depends_on':['time:J-2240']}
    s.users={
        'coordinator':{'user_id':'coordinator','role':'coordinator','tenant_id':s.tenant_id,'sites':['site-a','site-b','site-c'],'device_id':'device-coordinator'},
        'manager':{'user_id':'manager','role':'manager','tenant_id':s.tenant_id,'sites':['site-a','site-b','site-c'],'device_id':'device-manager'},
        'supervisor':{'user_id':'supervisor','role':'supervisor','tenant_id':s.tenant_id,'sites':['site-a','site-b'],'device_id':'device-supervisor','pin':'4826'},
        'requester':{'user_id':'requester','role':'requester','tenant_id':s.tenant_id,'sites':['site-a'],'device_id':'device-requester'},
        'storekeeper':{'user_id':'storekeeper','role':'storekeeper','tenant_id':s.tenant_id,'sites':['site-b'],'device_id':'device-storekeeper'},
        'auditor':{'user_id':'auditor','role':'auditor','tenant_id':s.tenant_id,'sites':['site-a','site-b','site-c'],'device_id':'device-auditor'},
        'admin':{'user_id':'admin','role':'admin','tenant_id':s.tenant_id,'sites':['site-a','site-b','site-c'],'device_id':'device-admin'}}
    for tid in s.technicians:
        s.users[tid]={'user_id':tid,'role':'technician','tenant_id':s.tenant_id,'sites':['site-a','site-b','site-c'],'technician_id':tid,'device_id':f'device-{tid}'}
        s.devices[f'device-{tid}']={'id':f'device-{tid}','user_id':tid,'last_seq':0,'last_sync':s.now,'results':{},'pending':{}}
    emit(s,'StockReceived',None,{'resource':'O-RING','quantity':4,'location':'site-b'})
    emit(s,'StoreIssued',None,{'resource':'O-RING','quantity':4,'technician_id':'priya','received_at':'2026-10-05T03:30:00+00:00'})
    return s

if __name__=='__main__':
    folder=Path('contract/fixtures'); folder.mkdir(parents=True,exist_ok=True)
    (folder/'m104.json').write_text(json.dumps(fixture().to_dict(),indent=2,ensure_ascii=False),encoding='utf-8')
    (folder/'explanations.json').write_text(json.dumps({'plan-A':'Priya takes M-104 with the existing seal kit; Karthik covers the later jobs. No SLA misses and no additional stock contention.'},indent=2),encoding='utf-8')
    vectors=[]; prev=GENESIS
    for obj in [{'type':'RequestCreated','payload':{'machine':'M-104'}},{'type':'CommitmentHeld','payload':{'quantity':1}},{'type':'TaskLogged','payload':{'note':'café · सेवा'}},{'type':'ReportSubmitted','payload':{'parts':{'O-RING':2,'HS-40':1}}},{'type':'CustomerAccepted','payload':{'accepted':True,'optional':None}}]:
        h=digest(prev,obj); vectors.append({'previous':prev,'value':obj,'expected':h}); prev=h
    Path('contract/hash_vectors.json').write_text(json.dumps(vectors,ensure_ascii=False,indent=2),encoding='utf-8')
