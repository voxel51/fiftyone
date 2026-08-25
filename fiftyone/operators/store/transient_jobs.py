"""Transient job coordination backed by Execution Store.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import copy
import datetime
import uuid


_IMMUTABLE_FIELDS = ("id", "owner", "scope", "payload", "created_at")
_TERMINAL_STATES = {"completed", "failed", "canceled"}


class TransientJobCoordinator:
    """Coordinates short-lived work through one Execution Store.

    This class owns coordination state only. Callers remain responsible for
    starting workers and transporting their results.

    Args:
        store: an :class:`fiftyone.operators.store.ExecutionStore`
        ttl_seconds (86400): retention for job records
        lease_seconds (900): duration of a worker claim
    """

    def __init__(self, store, ttl_seconds=24 * 60 * 60, lease_seconds=15 * 60):
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be positive")
        if lease_seconds <= 0:
            raise ValueError("lease_seconds must be positive")
        self._store = store
        self._ttl_seconds = int(ttl_seconds)
        self._lease_seconds = int(lease_seconds)

    def create(self, *, owner, scope, payload, job_id=None):
        """Creates one requested job with immutable caller data."""

        now = _now()
        job = {
            "id": job_id or uuid.uuid4().hex,
            "owner": copy.deepcopy(owner),
            "scope": copy.deepcopy(scope),
            "payload": copy.deepcopy(payload),
            "state": "requested",
            "created_at": now,
            "updated_at": now,
            "expires_at": now + datetime.timedelta(seconds=self._ttl_seconds),
            "lease_expires_at": None,
            "fencing_token": 0,
            "cancel_requested": False,
            "progress": None,
            "result": None,
            "error": None,
        }
        if not self._store.set_if_absent(
            job["id"], job, ttl=self._ttl_seconds
        ):
            raise TransientJobAlreadyExists(job["id"])
        return copy.deepcopy(job)

    def get(self, job_id):
        """Returns a detached job value, or ``None`` when it is absent."""

        value = self._store.get(job_id)
        return copy.deepcopy(value) if value is not None else None

    def claim(self, job_id, *, allow_reclaim=True):
        """Atomically claims one requested or lease-expired job.

        Returns:
            the claimed job, including its new fencing token, or ``None``
        """

        def claim_job(job, now):
            claimable = job["state"] == "requested"
            if job["state"] == "running" and allow_reclaim:
                expires_at = job.get("lease_expires_at")
                claimable = expires_at is None or _utc(expires_at) <= now
            if not claimable or job.get("cancel_requested"):
                return None
            job["state"] = "running"
            job["fencing_token"] = int(job.get("fencing_token") or 0) + 1
            job["lease_expires_at"] = now + datetime.timedelta(
                seconds=self._lease_seconds
            )
            return job

        return self._mutate(job_id, claim_job)

    def heartbeat(self, job_id, fencing_token):
        """Renews a running worker's lease."""

        def heartbeat_job(job, now):
            if not _is_current_worker(job, fencing_token, now):
                return None
            job["lease_expires_at"] = now + datetime.timedelta(
                seconds=self._lease_seconds
            )
            return job

        return self._mutate(job_id, heartbeat_job)

    def set_progress(self, job_id, fencing_token, progress):
        """Persists progress from the current fenced worker."""

        def update(job, now):
            if not _is_current_worker(job, fencing_token, now):
                return None
            job["progress"] = copy.deepcopy(progress)
            job["lease_expires_at"] = now + datetime.timedelta(
                seconds=self._lease_seconds
            )
            return job

        return self._mutate(job_id, update)

    def request_cancel(self, job_id):
        """Requests cancellation or cancels work that has not been claimed."""

        def request(job, now):
            if job["state"] in _TERMINAL_STATES:
                return None
            job["cancel_requested"] = True
            if job["state"] == "requested":
                job["state"] = "canceled"
                job["lease_expires_at"] = None
            return job

        return self._mutate(job_id, request)

    def cancel(self, job_id, fencing_token):
        """Marks the current worker's job canceled."""

        return self._finish(job_id, fencing_token, "canceled")

    def complete(self, job_id, fencing_token, result=None):
        """Completes the current worker's job."""

        return self._finish(
            job_id,
            fencing_token,
            "completed",
            result=copy.deepcopy(result),
        )

    def fail(self, job_id, fencing_token, error):
        """Fails the current worker's job with a caller-sanitized error."""

        return self._finish(job_id, fencing_token, "failed", error=str(error))

    def fail_expired(self, job_id, error):
        """Fails a running job whose worker lease has expired.

        This is a coordinator recovery transition rather than a worker
        mutation, so it is guarded by the expired lease instead of a fencing
        token. A current worker still owns every mutation while its lease is
        valid.
        """

        def fail_job(job, now):
            expires_at = job.get("lease_expires_at")
            if (
                job["state"] != "running"
                or expires_at is None
                or _utc(expires_at) > now
            ):
                return None
            job["state"] = "failed"
            job["lease_expires_at"] = None
            job["result"] = None
            job["error"] = str(error)
            return job

        return self._mutate(job_id, fail_job)

    def _finish(
        self, job_id, fencing_token, state, *, result=None, error=None
    ):
        def finish(job, now):
            if not _is_current_worker(job, fencing_token, now):
                return None
            job["state"] = state
            job["lease_expires_at"] = None
            job["result"] = result
            job["error"] = error
            return job

        return self._mutate(job_id, finish)

    def _mutate(self, job_id, transform):
        for _ in range(16):
            current = self.get(job_id)
            if current is None:
                return None
            now = _now()
            updated = transform(copy.deepcopy(current), now)
            if updated is None:
                return None
            _validate_immutable_fields(current, updated)
            updated["updated_at"] = now
            updated["expires_at"] = now + datetime.timedelta(
                seconds=self._ttl_seconds
            )
            if self._store.compare_and_set(
                job_id,
                current,
                updated,
                ttl=self._ttl_seconds,
            ):
                return copy.deepcopy(updated)
        raise TransientJobConflict(job_id)


def _is_current_worker(job, fencing_token, now):
    expires_at = job.get("lease_expires_at")
    return (
        job["state"] == "running"
        and job.get("fencing_token") == fencing_token
        and expires_at is not None
        and _utc(expires_at) > now
    )


def _validate_immutable_fields(current, updated):
    for field in _IMMUTABLE_FIELDS:
        if current.get(field) != updated.get(field):
            raise ValueError(f"Transient job field '{field}' is immutable")


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _utc(value):
    if value.tzinfo is None:
        return value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(datetime.timezone.utc)


class TransientJobAlreadyExists(RuntimeError):
    """Raised when a transient job ID already exists."""

    def __init__(self, job_id):
        super().__init__(f"Transient job already exists: {job_id}")
        self.job_id = job_id


class TransientJobConflict(RuntimeError):
    """Raised when concurrent writers repeatedly prevent a job mutation."""

    def __init__(self, job_id):
        super().__init__(f"Transient job update conflicted: {job_id}")
        self.job_id = job_id
