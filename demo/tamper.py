"""Create both a naive edit and the realistic insider rewrite/re-sign attack."""
import argparse,json
from pathlib import Path
from copy import deepcopy
from contract.canonical import GENESIS,digest,machine_view
from api.app.modules.proof.package import seal
p=argparse.ArgumentParser();p.add_argument('package');p.add_argument('--output',default='demo/tampered');a=p.parse_args()
pkg=json.loads(Path(a.package).read_text());naive=deepcopy(pkg)
naive['body']['events'][0]['payload']['insider_edit']='maintenance record rewritten'
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);(out/'naive-edit.json').write_text(json.dumps(naive,indent=2))
body=deepcopy(naive['body']);previous=GENESIS
for e in body['events']:
    e['machine_prev_hash']=previous;e['machine_hash']=digest(previous,machine_view(e));previous=e['machine_hash']
body['head']=previous
(out/'rewritten-resigned.json').write_text(json.dumps(seal(body),indent=2))
print('Wrote naive-edit.json and rewritten-resigned.json. Verify with the previously remembered customer head.')
