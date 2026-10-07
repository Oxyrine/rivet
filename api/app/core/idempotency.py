from contextvars import ContextVar

# Request context is copied into Starlette worker threads. Explicit keys remain usable by scripts.
request_idempotency = ContextVar('request_idempotency', default=None)
