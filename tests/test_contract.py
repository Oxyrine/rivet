import json
from pathlib import Path
import pytest
from contract.canonical import digest, canonical_json
from contract.sla import running_seconds, outcome

def test_hash_vectors_and_no_floats():
    for v in json.loads(Path('contract/hash_vectors.json').read_text(encoding='utf-8')):
        assert digest(v['previous'],v['value']) == v['expected']
    with pytest.raises(ValueError): canonical_json({'quantity':1.5})

def test_sla_overlapping_pauses_do_not_double_count():
    pauses=[{'start':'2026-10-07T10:00:00Z','end':'2026-10-07T10:20:00Z','confirmed':True},
            {'start':'2026-10-07T10:10:00Z','end':'2026-10-07T10:30:00Z','confirmed':True},
            {'start':'2026-10-07T10:40:00Z','end':'2026-10-07T10:50:00Z','confirmed':False}]
    assert running_seconds('2026-10-07T09:00:00Z','2026-10-07T11:00:00Z',pauses)==90*60
    result=outcome('2026-10-07T09:00:00Z','2026-10-07T13:20:00Z',{'resolution_minutes':240,'penalty_unit_minutes':15,'penalty_rate_paise':300000,'penalty_cap_paise':5000000})
    assert result['penalty_paise']==600000
