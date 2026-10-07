PYTHON ?= python
.PHONY: api mock openapi test-ledger test-sync test-exceptions test-proof thesis
api:
	$(PYTHON) -m uvicorn api.app.main:app --host 127.0.0.1 --port 8000
mock: api
openapi:
	$(PYTHON) scripts/export_openapi.py
test-ledger:
	$(PYTHON) -m pytest tests/ledger -q
test-sync:
	$(PYTHON) -m pytest tests/sync -q
test-exceptions:
	$(PYTHON) -m pytest tests/exceptions -q
test-proof:
	$(PYTHON) -m pytest tests/proof -q
thesis:
	$(PYTHON) -m pytest tests/test_thesis.py -q
