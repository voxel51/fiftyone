"""
The push orchestrator: session → media upload → metadata ingest → close.

Re-running a push is safe end to end: the local state file skips media that
already landed, and the server upserts metadata batches idempotently. A
mid-push credential expiry renews once (single-flight across upload
workers) and retries the file.
"""

import concurrent.futures
import hashlib
import json
import os
import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Dict, List, Optional

from .errors import CredentialExpiredError, RefusedError, SessionExpiredError
from .manifest import PushPlan
from .session import (
    BatchLimits,
    CloseOutcome,
    OnboardingClient,
    RejectedSample,
    UploadSession,
)
from .store import store_client_for
from .transport import Http

DEFAULT_STATE_DIR = os.path.join("~", ".fiftyone", "cloud-push")
DEFAULT_UPLOAD_WORKERS = 8
STATE_FLUSH_EVERY = 20


class PushStage(str, Enum):
    UPLOADING = "uploading"
    INGESTING = "ingesting"
    CLOSING = "closing"


@dataclass(frozen=True)
class PushEvent:
    stage: PushStage
    done: int
    total: int
    detail: str = ""


ProgressCallback = Callable[[PushEvent], None]


@dataclass
class PushState:
    """What resuming needs: the open session and which media already landed."""

    session_id: str
    prefix: str
    store_root: str
    limits: BatchLimits
    uploaded_keys: List[str] = field(default_factory=list)


class PushStateStore:
    """Per-(cloud, dataset) resume records under ``~/.fiftyone/cloud-push``."""

    def __init__(
        self, api_url: str, dataset_name: str, state_dir: Optional[str] = None
    ):
        identity = hashlib.sha1(
            f"{api_url}\n{dataset_name}".encode("utf-8")
        ).hexdigest()[:16]
        self.__path = os.path.join(
            os.path.expanduser(state_dir or DEFAULT_STATE_DIR),
            f"{identity}.json",
        )

    def load(self) -> Optional[PushState]:
        if not os.path.isfile(self.__path):
            return None
        with open(self.__path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        limits = data["limits"]
        return PushState(
            session_id=data["session_id"],
            prefix=data["prefix"],
            store_root=data["store_root"],
            limits=BatchLimits(
                max_batch_bytes=int(limits["max_batch_bytes"]),
                max_batch_samples=int(limits["max_batch_samples"]),
            ),
            uploaded_keys=list(data.get("uploaded_keys") or []),
        )

    def save(self, state: PushState) -> None:
        os.makedirs(os.path.dirname(self.__path), exist_ok=True)
        data = {
            "session_id": state.session_id,
            "prefix": state.prefix,
            "store_root": state.store_root,
            "limits": {
                "max_batch_bytes": state.limits.max_batch_bytes,
                "max_batch_samples": state.limits.max_batch_samples,
            },
            "uploaded_keys": state.uploaded_keys,
        }
        with open(self.__path, "w", encoding="utf-8") as handle:
            json.dump(data, handle)

    def clear(self) -> None:
        if os.path.isfile(self.__path):
            os.remove(self.__path)


@dataclass(frozen=True)
class PushOutcome:
    dataset: str
    session_id: str
    uploaded: int
    skipped_uploads: int
    missing_files: int
    accepted: int
    rejected: List[RejectedSample]
    samples: int
    shortfall: int


class Pusher:
    def __init__(
        self,
        client: OnboardingClient,
        http: Http,
        state_store: PushStateStore,
        max_workers: int = DEFAULT_UPLOAD_WORKERS,
        on_progress: Optional[ProgressCallback] = None,
    ):
        self.__client = client
        self.__http = http
        self.__state_store = state_store
        self.__max_workers = max_workers
        self.__on_progress = on_progress or (lambda event: None)
        self.__token = ""
        self.__token_lock = threading.Lock()
        self.__session_snapshot: Optional[UploadSession] = None

    def push(
        self, dataset_name: str, plan: PushPlan, fresh: bool = False
    ) -> PushOutcome:
        if fresh:
            self.__state_store.clear()

        session_id, state = self.__open_session(dataset_name, plan)
        uploaded, skipped = self.__upload_media(session_id, plan, state)
        accepted, rejected = self.__ingest_metadata(session_id, plan, state)
        closed = self.__close(session_id)
        self.__state_store.clear()

        return PushOutcome(
            dataset=closed.dataset,
            session_id=session_id,
            uploaded=uploaded,
            skipped_uploads=skipped,
            missing_files=len(plan.missing),
            accepted=accepted,
            rejected=rejected,
            samples=closed.samples,
            shortfall=closed.shortfall,
        )

    def __open_session(self, dataset_name: str, plan: PushPlan):
        state = self.__state_store.load()
        if state is not None:
            resumed = self.__resume(state)
            if resumed is not None:
                return resumed
            self.__state_store.clear()

        session = self.__client.create_session(
            dataset_name, plan.summary, plan.manifest_entries
        )
        state = PushState(
            session_id=session.session_id,
            prefix=session.prefix,
            store_root=session.store_root,
            limits=session.limits,
        )
        self.__state_store.save(state)
        self.__token = session.credential.token if session.credential else ""
        self.__session_snapshot = session
        return session.session_id, state

    def __resume(self, state: PushState):
        """Revalidates a saved session. A no-store session has no credential
        to renew, so it resumes as-is and any staleness surfaces at ingest."""
        credential = None
        if state.store_root:
            try:
                credential = self.__client.renew(state.session_id)
            except (RefusedError, SessionExpiredError):
                return None

        self.__token = credential.token if credential else ""
        self.__session_snapshot = UploadSession(
            session_id=state.session_id,
            dataset_uuid="",
            prefix=state.prefix,
            store_root=state.store_root,
            credential=credential,
            session_expires_at=None,
            limits=state.limits,
        )
        return state.session_id, state

    def __upload_media(
        self, session_id: str, plan: PushPlan, state: PushState
    ):
        store = store_client_for(
            self.__session_snapshot, lambda: self.__token, self.__http
        )

        already = set(state.uploaded_keys)
        pending = [
            entry for entry in plan.media if entry.dest_key not in already
        ]
        skipped = len(plan.media) - len(pending)
        total = len(plan.media)
        done = skipped
        state_lock = threading.Lock()

        def upload_one(entry):
            for attempt in (1, 2):
                token_seen = self.__token
                try:
                    store.put(
                        entry.local_path, f"{state.prefix}{entry.dest_key}"
                    )
                    return
                except CredentialExpiredError:
                    if attempt == 2:
                        raise
                    self.__renew_once(session_id, token_seen)

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=self.__max_workers
        ) as pool:
            futures = {
                pool.submit(upload_one, entry): entry for entry in pending
            }
            for future in concurrent.futures.as_completed(futures):
                future.result()
                entry = futures[future]
                with state_lock:
                    state.uploaded_keys.append(entry.dest_key)
                    done += 1
                    if done % STATE_FLUSH_EVERY == 0:
                        self.__state_store.save(state)
                self.__on_progress(
                    PushEvent(PushStage.UPLOADING, done, total, entry.dest_key)
                )

        self.__state_store.save(state)
        return len(pending), skipped

    def __renew_once(self, session_id: str, token_seen: str) -> None:
        """Single-flight renewal: whichever worker hits the expiry first
        renews; the rest observe the fresh token and just retry."""
        with self.__token_lock:
            if self.__token != token_seen:
                return
            self.__token = self.__client.renew(session_id).token

    def __ingest_metadata(
        self, session_id: str, plan: PushPlan, state: PushState
    ):
        filepath_map = plan.filepath_map(state.prefix)
        batches = _batch(plan.sample_docs, state.limits)

        accepted = 0
        rejected: List[RejectedSample] = []
        for index, batch in enumerate(batches):
            batch_map = {
                doc["filepath"]: filepath_map[doc["filepath"]]
                for doc in batch
                if doc.get("filepath") in filepath_map
            }
            outcome = self.__client.ingest(session_id, batch, batch_map)
            accepted += outcome.accepted
            rejected.extend(outcome.rejected)
            self.__on_progress(
                PushEvent(
                    PushStage.INGESTING,
                    index + 1,
                    len(batches),
                    f"{accepted} samples accepted",
                )
            )

        return accepted, rejected

    def __close(self, session_id: str) -> CloseOutcome:
        self.__on_progress(PushEvent(PushStage.CLOSING, 0, 1))
        closed = self.__client.close(session_id)
        self.__on_progress(PushEvent(PushStage.CLOSING, 1, 1))
        return closed


def _batch(docs: List[Dict], limits: BatchLimits) -> List[List[Dict]]:
    """Greedy chunking under both server caps; every batch carries at least
    one document so an oversized single doc still ships (and the server
    answers for it)."""
    batches: List[List[Dict]] = []
    current: List[Dict] = []
    current_bytes = 0

    for doc in docs:
        doc_bytes = len(json.dumps(doc, default=str))
        over_count = len(current) >= limits.max_batch_samples
        over_bytes = (
            current and current_bytes + doc_bytes > limits.max_batch_bytes
        )
        if over_count or over_bytes:
            batches.append(current)
            current = []
            current_bytes = 0
        current.append(doc)
        current_bytes += doc_bytes

    if current:
        batches.append(current)
    return batches
