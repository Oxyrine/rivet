from fastapi.testclient import TestClient

from api.app.core.runtime import store
from api.app.main import app


def token(client):
    response = client.post('/auth/token', json={'user_id': 'coordinator', 'otp': '246810'})
    assert response.status_code == 200
    return {'Authorization': 'Bearer ' + response.json()['access_token']}


def test_two_consecutive_pressure_outliers_create_one_telemetry_request():
    store.reset()
    # Leave telemetry independent from the scripted open jobs so a new anomaly is not a duplicate fault report.
    store.mutate(lambda state: (state.jobs.clear(), state.requests.clear(), state.metadata.update(next_request=3000)))
    with TestClient(app) as client:
        headers = token(client)
        for number in range(10):
            response = client.post('/telemetry', json={'machine_id': 'M-104', 'reading_id': f'baseline-{number}', 'status': 'running', 'pressure_bar': 140}, headers=headers)
            assert response.status_code == 200, response.text
            assert response.json()['recorded']
        first = client.post('/telemetry', json={'machine_id': 'M-104', 'reading_id': 'outlier-1', 'status': 'running', 'pressure_bar': 200}, headers=headers)
        second = client.post('/telemetry', json={'machine_id': 'M-104', 'reading_id': 'outlier-2', 'status': 'running', 'pressure_bar': 200}, headers=headers)
    assert first.status_code == 200 and first.json()['recorded']
    assert second.status_code == 200, second.text
    body = second.json()
    assert body['source'] == 'telemetry anomaly'
    assert body['anomaly'][0]['metric'] == 'pressure_bar'
    assert any(event['type'] == 'TelemetryAnomalyDetected' for event in store.read().events)
