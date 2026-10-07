import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from api.app.main import app
Path('contract/openapi.json').write_text(json.dumps(app.openapi(),indent=2),encoding='utf-8')
print('Exported contract/openapi.json')
