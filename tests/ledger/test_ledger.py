from concurrent.futures import ThreadPoolExecutor
import pytest
from contract.state import LedgerState
from contract.commands import Hold
from contract.errors import DomainError
from api.app.core.runtime import Store, fixture, Event, Entry
from api.app.modules.ledger.domain import apply, invariants, create_request, assign, hold, move
from sqlalchemy import text
from hypothesis import given, strategies as st

def test_pure_apply_and_conservation():
    state=fixture();create_request(state,{'machine_id':'M-104'});assign(state,'J-2231')
    before=state.to_dict()
    with pytest.raises(DomainError):apply(state,Hold(job_id='J-2231',resource='HS-40',source='store:site-b:available',quantity=2))
    assert state.to_dict()==before
    invariants(state)

@given(st.lists(st.integers(min_value=1,max_value=4),min_size=1,max_size=50))
def test_random_balanced_stock_moves(quantities):
    state=fixture()
    for i,quantity in enumerate(quantities):
        source,dest=('van:priya:stock','custody:priya') if i%2==0 else ('custody:priya','van:priya:stock')
        before=state.to_dict()
        try:move(state,source,dest,'O-RING',quantity)
        except DomainError:assert state.to_dict()==before
        invariants(state)

def test_fifty_way_last_unit_race(tmp_path):
    store=Store('sqlite:///'+str(tmp_path/'race.db'))
    def reserve(_):
        try:
            store.mutate(lambda s:hold(s,{'job_id':'J-2236','resource':'HS-40','source':'store:site-b:available','quantity':1}))
            return True
        except DomainError as e:
            assert e.code=='INSUFFICIENT_BALANCE';return False
    with ThreadPoolExecutor(max_workers=50) as pool:results=list(pool.map(reserve,range(50)))
    assert sum(results)==1
    invariants(store.read())

def test_persistence_idempotency_and_immutable_journal(tmp_path):
    url='sqlite:///'+str(tmp_path/'state.db');store=Store(url)
    result=store.mutate(lambda s:hold(s,{'job_id':'J-2236','resource':'HS-40','source':'store:site-b:available','quantity':1}),key='once',body={'qty':1})
    assert store.mutate(lambda s:1/0,key='once',body={'qty':1})==result
    with pytest.raises(DomainError):store.mutate(lambda s:None,key='once',body={'qty':2})
    assert Store(url).read().balances['store:site-b:available|HS-40']==0
    with pytest.raises(Exception):
        with store.engine.begin() as conn:conn.execute(text("UPDATE event SET tenant_seq=99"))
    with pytest.raises(Exception):
        with store.engine.begin() as conn:conn.execute(text("DELETE FROM ledger_entry"))


def test_contention_line_is_computed_from_the_ledger():
    from api.app.core.runtime import fixture
    from api.app.modules.ledger.domain import create_request
    state=fixture();line=create_request(state,{'machine_id':'M-104'})['validation']['contention']
    assert line=="HS-40: 1 left after J-2240's hold"
    for key in [k for k in state.balances if k.startswith('store:') and k.endswith('|HS-40')]:state.balances[key]=0
    state.jobs.pop('J-2231');state.requests.clear();state.metadata['next_request']=2231
    assert create_request(state,{'machine_id':'M-104'})['validation']['contention']=="HS-40: 0 left after J-2240's hold"
