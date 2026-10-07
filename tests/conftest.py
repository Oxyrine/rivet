"""Keep HTTP integration state separate from the running demo database."""
import os
from pathlib import Path
os.environ['ENV']='test'
os.environ.setdefault('DISABLE_SQLALCHEMY_CEXT_RUNTIME','1')
os.environ['DATABASE_URL']='sqlite:///'+str(Path('.test-tmp-db/integration.db').resolve()).replace('\\','/')
Path('.test-tmp-db').mkdir(exist_ok=True)
os.environ['RIVET_KEY_PATH']=str(Path('.test-tmp-db/provider.key').resolve())
