FROM python:3.12-slim
WORKDIR /workspace
COPY api/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY api ./api
COPY contract ./contract
EXPOSE 8000
ENV PYTHONUNBUFFERED=1
# Hosts such as Render inject PORT and terminate TLS in front of the container.
CMD ["sh", "-c", "uvicorn api.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=*"]
