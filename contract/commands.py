from pydantic import BaseModel, Field, ConfigDict
from typing import Any

class Command(BaseModel):
    model_config = ConfigDict(extra='allow')

class CreateRequest(Command):
    machine_id: str
    fault: str = 'hydraulic_leak'
    source: str = 'portal'
    description: str = ''

class AssignJob(Command):
    technician_id: str | None = None

class Hold(Command):
    job_id: str
    resource: str
    source: str
    quantity: int = Field(default=1, gt=0)
    type: str = 'PART_HOLD'
    expires_at: str | None = None

class DeviceCommand(Command):
    idempotency_key: str
    device_seq: int = Field(gt=0)
    device_ts: str
    type: str
    job_id: str
    payload: dict[str, Any] = Field(default_factory=dict)

class DeviceBatch(Command):
    commands: list[DeviceCommand]

class Report(Command):
    parts: dict[str, int] = Field(default_factory=dict)
    checklist: list[str] = Field(default_factory=list)
    minutes: int = 60
    notes: str = ''

class Accept(Command):
    pin: str
    device_id: str
    report_hash: str | None = None

DEVICE_TYPES = ['CheckIn','StartWork','TaskLogged','PartScanned','ReadingRecorded','EvidenceAttached','ReportDropout','IssueReported','SiteAccessRefused','SubmitReport','CheckOut']
