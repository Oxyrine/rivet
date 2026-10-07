import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_field_app_checklist_matches_the_required_checklist():
    """The report screen lists the items the API requires; a drift would flag every report as incomplete."""
    required = json.loads((ROOT / 'contract' / 'fixtures' / 'm104.json').read_text(encoding='utf-8'))['metadata']['required_checklist']
    source = (ROOT / 'web' / 'lib' / 'report.ts').read_text(encoding='utf-8')
    block = source[source.index('REPORT_CHECKLIST'):]
    block = block[:block.index('];')]
    assert re.findall(r"\{ id: '([a-z_]+)'", block) == required
