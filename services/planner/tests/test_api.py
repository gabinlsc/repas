from fastapi.testclient import TestClient

from planner.app import app
from tests.helpers import recipe, request

client = TestClient(app)


def test_health_and_metrics() -> None:
    assert client.get("/health").json() == {"status": "ok", "version": "1"}
    assert "planner_requests_total" in client.get("/metrics").text


def test_plan_endpoint() -> None:
    body = request([recipe("a"), recipe("b")], days=2).model_dump(mode="json")
    r = client.post("/v1/plan", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["version"] == "1"
    assert len(data["meals"]) == 2


def test_invalid_payload_is_422() -> None:
    assert client.post("/v1/plan", json={"version": "2"}).status_code == 422
