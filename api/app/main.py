import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contract.errors import DomainError
from api.app.modules.ledger.routes import router as ledger_router
from contextlib import asynccontextmanager,suppress
import logging

@asynccontextmanager
async def lifespan(app):
    async def worker():
        from api.app.core.runtime import store
        from api.app.core.scheduler import tick
        while True:
            await asyncio.sleep(60)
            try:await asyncio.to_thread(store.mutate,tick)
            except Exception:logging.getLogger('rivet.scheduler').exception('Scheduler tick failed; transaction rolled back')
    task=asyncio.create_task(worker())
    try:yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):await task

app=FastAPI(title='Rivet Industrial Service API',version='0.1.0',description='Person A service lifecycle, recovery and verifiable history backend',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=os.getenv('CORS_ORIGINS','http://localhost:3000,http://127.0.0.1:3000').split(','),allow_credentials=True,allow_methods=['*'],allow_headers=['*'])

@app.middleware('http')
async def idempotency_context(request,call_next):
    from api.app.core.idempotency import request_idempotency
    import json
    from api.app.core.auth import identify
    key=request.headers.get('idempotency-key');marker=None
    if key and request.method in ('POST','PUT','PATCH','DELETE'):
        try:
            user=await asyncio.to_thread(identify,request.headers.get('authorization','').removeprefix('Bearer '))
            raw=await request.body()
            body=json.loads(raw) if raw else {}
            marker=request_idempotency.set({'key':user['user_id']+':'+key,'body':{'method':request.method,'path':request.url.path,'body':body}})
        except (DomainError,ValueError):pass
    try:return await call_next(request)
    finally:
        if marker:request_idempotency.reset(marker)

@app.exception_handler(DomainError)
async def domain_error(request,exc):return JSONResponse(status_code=exc.status,content=exc.as_dict())

app.include_router(ledger_router)
for module in ('exceptions','proof'):
    try:
        import importlib
        app.include_router(importlib.import_module(f'api.app.modules.{module}.routes').router)
    except ModuleNotFoundError as exc:
        if exc.name != f'api.app.modules.{module}.routes' and exc.name != f'api.app.modules.{module}':raise

@app.get('/health')
def health():return {'status':'ok','environment':os.getenv('ENV','demo')}

@app.get('/health/db')
def health_db():
    """Touches the database. Pinged by the keep-warm job, which also stops a free Supabase project from pausing for inactivity."""
    from sqlalchemy import text
    from api.app.core.runtime import store
    try:
        with store.engine.connect() as connection:connection.execute(text('SELECT 1'))
    except Exception:
        logging.getLogger('rivet.health').exception('Database health check failed')
        return JSONResponse(status_code=503,content={'status':'unavailable','database':'unreachable'})
    return {'status':'ok','database':'reachable'}

@app.websocket('/ws')
async def websocket(ws:WebSocket):
    from api.app.core.auth import identify
    from api.app.core.runtime import store
    from api.app.core.views import may_see_events
    try:principal=await asyncio.to_thread(identify,ws.query_params.get('token',''))
    except Exception:await ws.close(code=4401);return
    await ws.accept();cursor=0
    try:
        while True:
            state=store.read()
            assigned={j['id'] for j in state.jobs.values() if j.get('technician_id')==principal.get('technician_id')}
            events=[] if not may_see_events(principal['role']) else [e for e in state.events[cursor:] if e['machine'] and state.machines[e['machine']]['site_id'] in principal['sites'] and (principal['role']!='technician' or e['payload'].get('job_id') in assigned)]
            if events:await ws.send_json({'events':events,'cursor':len(state.events)})
            cursor=len(state.events);await asyncio.sleep(1)
    except WebSocketDisconnect:pass
