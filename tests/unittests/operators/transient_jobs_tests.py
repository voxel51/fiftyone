"""Tests for transient Execution Store job coordination.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import concurrent.futures
import datetime

from bson import ObjectId

from fiftyone.factory.repos.execution_store import InMemoryExecutionStoreRepo
from fiftyone.operators.store import (
    ExecutionStore,
    ExecutionStoreService,
    TransientJobCoordinator,
)


def _coordinator(store=None):
    if store is not None:
        return TransientJobCoordinator(store, ttl_seconds=60, lease_seconds=10)
    repository = InMemoryExecutionStoreRepo(dataset_id=ObjectId())
    service = ExecutionStoreService(repo=repository)
    store = ExecutionStore("jobs", service, default_policy="evict")
    return TransientJobCoordinator(store, ttl_seconds=60, lease_seconds=10)


def test_job_fields_are_detached_and_immutable():
    coordinator = _coordinator()
    scope = {"sample_id": "sample"}
    payload = {"topics": ["/camera"]}

    job = coordinator.create(
        job_id="job", owner="user", scope=scope, payload=payload
    )
    scope["sample_id"] = "changed"
    payload["topics"].append("/imu")
    job["scope"]["sample_id"] = "also-changed"

    stored = coordinator.get("job")
    assert stored["owner"] == "user"
    assert stored["scope"] == {"sample_id": "sample"}
    assert stored["payload"] == {"topics": ["/camera"]}


def test_only_one_worker_claims_and_stale_fencing_tokens_are_rejected():
    coordinator = _coordinator()
    coordinator.create(job_id="job", owner="user", scope={}, payload={})

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        claims = list(
            executor.map(
                lambda _: coordinator.claim("job", allow_reclaim=False),
                range(8),
            )
        )

    claimed = [claim for claim in claims if claim is not None]
    assert len(claimed) == 1
    token = claimed[0]["fencing_token"]
    assert coordinator.set_progress("job", token + 1, {"items": 1}) is None
    assert coordinator.heartbeat("job", token) is not None
    assert coordinator.complete("job", token, {"items": 1})["state"] == (
        "completed"
    )
    assert coordinator.fail("job", token, "late") is None


def test_expired_lease_can_be_reclaimed_with_a_new_fencing_token(monkeypatch):
    now = datetime.datetime(2026, 8, 25, tzinfo=datetime.timezone.utc)
    monkeypatch.setattr(
        "fiftyone.operators.store.transient_jobs._now", lambda: now
    )
    coordinator = _coordinator()
    coordinator.create(job_id="job", owner="user", scope={}, payload={})
    first = coordinator.claim("job")

    now += datetime.timedelta(seconds=11)
    assert coordinator.heartbeat("job", first["fencing_token"]) is None
    second = coordinator.claim("job")

    assert second["fencing_token"] == first["fencing_token"] + 1
    assert coordinator.heartbeat("job", first["fencing_token"]) is None
    assert coordinator.heartbeat("job", second["fencing_token"]) is not None


def test_cancellation_is_visible_across_coordinators():
    repository = InMemoryExecutionStoreRepo(dataset_id=ObjectId())
    service = ExecutionStoreService(repo=repository)
    store = ExecutionStore("jobs", service, default_policy="evict")
    coordinator = _coordinator(store)
    peer = _coordinator(store)
    coordinator.create(job_id="job", owner="user", scope={}, payload={})
    claim = coordinator.claim("job")

    requested = peer.request_cancel("job")

    assert requested["state"] == "running"
    assert requested["cancel_requested"] is True
    observed = coordinator.get("job")
    assert observed["state"] == "running"
    assert observed["cancel_requested"] is True
    canceled = coordinator.cancel("job", claim["fencing_token"])
    assert canceled["state"] == "canceled"
    assert canceled["lease_expires_at"] is None


def test_expired_job_can_be_failed_without_a_worker_token(monkeypatch):
    now = datetime.datetime(2026, 8, 25, tzinfo=datetime.timezone.utc)
    monkeypatch.setattr(
        "fiftyone.operators.store.transient_jobs._now", lambda: now
    )
    coordinator = _coordinator()
    coordinator.create(job_id="job", owner="user", scope={}, payload={})
    claim = coordinator.claim("job")

    assert coordinator.fail_expired("job", "worker lost") is None
    now += datetime.timedelta(seconds=11)
    failed = coordinator.fail_expired("job", "worker lost")

    assert failed["state"] == "failed"
    assert failed["error"] == "worker lost"
    assert failed["lease_expires_at"] is None
    assert coordinator.complete("job", claim["fencing_token"]) is None
