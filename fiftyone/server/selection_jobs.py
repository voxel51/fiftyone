"""Bounded background workers for large selection captures and subset writes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context
from datetime import datetime, timezone
import logging
import threading
import time
from uuid import uuid4

from bson import BSON

import fiftyone.core.subsets as fosub
import fiftyone.core.selection_context as fosc
from fiftyone.operators.store import ExecutionStore, TransientJobCoordinator
import fiftyone.server.selection as foss

logger = logging.getLogger(__name__)

_EXECUTORS = {
    "read": ThreadPoolExecutor(
        max_workers=2, thread_name_prefix="selection-count"
    ),
    "write": ThreadPoolExecutor(
        max_workers=2, thread_name_prefix="selection-save"
    ),
}
_SLOTS = {kind: threading.BoundedSemaphore(8) for kind in _EXECUTORS}
_SCHEDULED = set()
_LOCK = threading.Lock()
_KINDS = {"snapshot", "capture", "add", "scope", "summary"}


class SelectionJobCanceled(Exception):
    """Stops work at a batch boundary without undoing completed writes."""


def _check_write_access(dataset):
    fosc.check_access(dataset, "edit")
    pass


def _coordinator(dataset):
    return TransientJobCoordinator(
        ExecutionStore.create(
            "selection_jobs",
            dataset_id=dataset._doc.id,
            default_policy="evict",
        ),
        ttl_seconds=7 * 24 * 60 * 60,
        lease_seconds=5 * 60,
    )


def start_job(dataset, data):
    """Starts an idempotent request and returns without waiting for its scan."""
    kind = data.get("kind")
    request = data.get("request")
    job_id = data.get("id")
    if kind not in _KINDS or not isinstance(request, dict):
        raise ValueError("Choose a selection job kind and request")
    if not isinstance(job_id, str) or not 1 <= len(job_id) <= 128:
        raise ValueError("A job requires a stable request ID")
    if len(BSON.encode(request)) > 4 * 1024 * 1024:
        raise ValueError("Use a server snapshot for large selections")
    if kind == "add":
        _check_write_access(dataset)
    coordinator = _coordinator(dataset)
    job = coordinator.get(job_id)
    payload = {"kind": kind, "request": request}
    if job is not None:
        _check_owner(dataset, job)
        if job["payload"] != payload:
            raise ValueError("This job ID already captures another request")
    else:
        from fiftyone.operators.store.transient_jobs import (
            TransientJobAlreadyExists,
        )

        if (
            kind == "add"
            and request.get("snapshotId")
            and not fosub.is_add_prepared(
                dataset,
                request["subsetId"],
                request["operationId"],
                snapshot_id=request["snapshotId"],
            )
        ):
            foss.retain_snapshot(dataset, request["snapshotId"])
        try:
            job = coordinator.create(
                owner=str(fosc.get_actor()),
                scope={"dataset_id": str(dataset._doc.id)},
                payload=payload,
                job_id=job_id,
            )
        except TransientJobAlreadyExists:
            return start_job(dataset, data)
    if job["state"] == "requested":
        _schedule(dataset, job_id, job["payload"]["kind"])
    return job_response(job)


def get_job(dataset, job_id):
    """Reads caller-owned progress, detecting an interrupted worker."""
    coordinator = _coordinator(dataset)
    job = coordinator.get(job_id)
    _check_owner(dataset, job)
    expires = job.get("lease_expires_at")
    if (
        job["state"] == "running"
        and expires
        and expires.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc)
    ):
        coordinator.fail_expired(
            job_id, "The server worker stopped. Retry to continue."
        )
        job = coordinator.get(job_id)
    elif job["state"] == "requested":
        _schedule(dataset, job_id, job["payload"]["kind"])
    return job_response(job)


def cancel_job(dataset, job_id):
    """Requests cancellation; committed members are intentionally retained."""
    coordinator = _coordinator(dataset)
    job = coordinator.get(job_id)
    _check_owner(dataset, job)
    coordinator.request_cancel(job_id)
    return job_response(coordinator.get(job_id))


def retry_job(dataset, job_id):
    """Retries the same captured add, or explicitly recaptures a failed scan."""
    coordinator = _coordinator(dataset)
    job = coordinator.get(job_id)
    _check_owner(dataset, job)
    if job["state"] not in {"failed", "canceled"}:
        return job_response(job)
    # An add retains operationId and snapshotId across attempts. A failed
    # capture deliberately starts over; it must never merge two live scans.
    return start_job(dataset, {"id": uuid4().hex, **job["payload"]})


def _check_owner(dataset, job):
    if (
        not job
        or job["owner"] != str(fosc.get_actor())
        or job["scope"] != {"dataset_id": str(dataset._doc.id)}
    ):
        raise ValueError("This selection job is not available")


def job_response(job):
    """Returns progress without exposing the captured request or credentials."""
    return {
        "id": job["id"],
        "kind": job["payload"]["kind"],
        "state": job["state"],
        "cancelRequested": job["cancel_requested"],
        "progress": job["progress"],
        "result": job["result"],
        "error": job["error"],
    }


def _schedule(dataset, job_id, kind):
    lane = "read" if kind in {"scope", "summary"} else "write"
    slots = _SLOTS[lane]
    key = (str(dataset._doc.id), job_id)
    with _LOCK:
        if key in _SCHEDULED or not slots.acquire(blocking=False):
            return
        _SCHEDULED.add(key)
    context = copy_context()

    def run():
        try:
            context.run(_run_job, dataset, job_id)
        finally:
            with _LOCK:
                _SCHEDULED.discard(key)
            slots.release()

    try:
        _EXECUTORS[lane].submit(run)
    except RuntimeError:
        with _LOCK:
            _SCHEDULED.discard(key)
        slots.release()


def _run_job(dataset, job_id):
    coordinator = _coordinator(dataset)
    job = coordinator.claim(job_id, allow_reclaim=False)
    if job is None:
        return
    token = job["fencing_token"]
    stop = threading.Event()
    last_report = 0
    last_phase = None

    def heartbeat():
        # A Mongo aggregation may take longer than a batch or the worker lease.
        while not stop.wait(30):
            try:
                if coordinator.heartbeat(job_id, token) is None:
                    return
            except Exception:
                logger.exception("Selection job heartbeat failed")

    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()

    def progress(phase, done=0, total=None, result=None):
        nonlocal last_report, last_phase
        now = time.monotonic()
        if phase == last_phase and now - last_report < 0.5:
            return
        current = coordinator.get(job_id)
        if (
            not current
            or current["state"] != "running"
            or current["fencing_token"] != token
        ):
            raise SelectionJobCanceled()
        value = {"phase": phase, "done": done, "total": total}
        if result:
            value.update(
                added=result["added"], duplicates=result["duplicates"]
            )
        if coordinator.set_progress(job_id, token, value) is None:
            raise SelectionJobCanceled()
        last_report, last_phase = now, phase
        if current["cancel_requested"]:
            raise SelectionJobCanceled()

    try:
        kind = job["payload"]["kind"]
        request = job["payload"]["request"]
        progress(
            {"snapshot": "capturing", "add": "preparing"}.get(kind, "counting")
        )
        if kind == "snapshot":
            result = foss.create_snapshot(dataset, request, progress=progress)
        elif kind == "add":
            _check_write_access(dataset)
            if not fosub.is_add_prepared(
                dataset,
                request["subsetId"],
                request["operationId"],
                members=request.get("members"),
                snapshot_id=request.get("snapshotId"),
            ):
                foss.prepare_subset_add(
                    dataset, request, progress=progress, preview=False
                )
            result = fosub.apply_add(
                dataset, request["operationId"], progress=progress
            )
        elif kind in {"scope", "capture"}:
            result = foss.resolve_scope(dataset, request, progress=progress)
        else:
            result = fosub.subset_summary(
                dataset, request["subsetId"], counts=True
            )
        # Cancellation after the final committed batch must report completion.
        coordinator.complete(job_id, token, result)
    except SelectionJobCanceled:
        coordinator.cancel(job_id, token)
    except Exception as error:
        logger.exception("Selection job %s failed", job_id)
        message = (
            str(error)
            if isinstance(error, (ValueError, PermissionError))
            else "The operation could not finish. Retry to continue."
        )
        coordinator.fail(job_id, token, message)
    finally:
        stop.set()
