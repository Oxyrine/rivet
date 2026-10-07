from pydantic import BaseModel
from typing import Any

class Event(BaseModel):
    event_id: str
    tenant_id: str
    tenant_seq: int
    machine: str | None
    machine_seq: int | None
    type: str
    occurred_at: str
    actor: str
    payload: dict[str, Any]
    cause_hash: str | None
    prev_hash: str
    hash: str
    machine_prev_hash: str
    machine_hash: str | None
