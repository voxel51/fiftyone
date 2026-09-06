"""
The typed client for the ``/onboarding/*`` surface. Clients speak typed REST
only — never the SDK in API mode — and the ordering is the server's:
admission at session creation, ingest last, referencing the session.
"""

import datetime
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

from .errors import (
    CloudUnavailableError,
    KeyRefusedError,
    RefusedError,
    SessionExpiredError,
)
from .transport import Http, HttpReply

API_KEY_HEADER = "X-API-Key"


class UploadFormat(str, Enum):
    FIFTYONE_NATIVE = "fiftyone-native"


@dataclass(frozen=True)
class ManifestSummary:
    """What the push intends to move, declared up front for admission."""

    file_count: int
    total_bytes: int

    def to_dict(self) -> Dict[str, int]:
        return {"file_count": self.file_count, "total_bytes": self.total_bytes}


@dataclass(frozen=True)
class ManifestEntry:
    """One declared object: the key it lands at under the session prefix and
    how many bytes it carries. Itemizes the summary, so admission can check a
    per-object claim rather than only the total."""

    dest_key: str
    size_bytes: int

    def to_dict(self) -> Dict[str, Any]:
        return {"dest_key": self.dest_key, "size_bytes": self.size_bytes}


# Above this the entries are omitted and the summary travels alone: the
# session document holds them inline, so an unbounded manifest would outgrow
# it. Paged minting replaces this with a pull, and the constant goes with it.
# Kept in step with the server's ONBOARDING_MAX_MANIFEST_ENTRIES.
MAX_INLINE_MANIFEST_ENTRIES = 10_000


@dataclass(frozen=True)
class VendedCredential:
    provider: str
    token: str
    expires_at: Optional[datetime.datetime]

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "VendedCredential":
        expires_at = data.get("expires_at")
        return cls(
            provider=data["provider"],
            token=data["token"],
            expires_at=(
                datetime.datetime.fromisoformat(expires_at)
                if expires_at
                else None
            ),
        )


@dataclass(frozen=True)
class BatchLimits:
    max_batch_bytes: int
    max_batch_samples: int


@dataclass(frozen=True)
class UploadSession:
    session_id: str
    dataset_uuid: str
    prefix: str
    store_root: str
    credential: Optional[VendedCredential]
    session_expires_at: Optional[datetime.datetime]
    limits: BatchLimits


@dataclass(frozen=True)
class RejectedSample:
    index: int
    reason: str


@dataclass(frozen=True)
class IngestOutcome:
    accepted: int
    rejected: List[RejectedSample]


@dataclass(frozen=True)
class CloseOutcome:
    dataset: str
    samples: int
    manifest_files: int
    shortfall: int


class OnboardingClient:
    """Speaks the session contract with the onboarding key in hand."""

    def __init__(self, api_url: str, api_key: str, http: Http):
        self.__api_url = api_url.rstrip("/")
        self.__api_key = api_key
        self.__http = http

    def create_session(
        self,
        dataset_name: str,
        manifest: ManifestSummary,
        entries: Optional[List[ManifestEntry]] = None,
        upload_format: UploadFormat = UploadFormat.FIFTYONE_NATIVE,
    ) -> UploadSession:
        body: Dict[str, Any] = {
            "dataset": {"name": dataset_name},
            "format": upload_format.value,
            "manifest_summary": manifest.to_dict(),
        }
        if entries is not None and len(entries) <= MAX_INLINE_MANIFEST_ENTRIES:
            body["manifest_entries"] = [entry.to_dict() for entry in entries]

        reply = self.__request("POST", "/onboarding/sessions", json_body=body)
        if reply.status != 201 or reply.payload is None:
            raise self.__refusal(reply)

        payload = reply.payload
        credential = payload.get("credential")
        expires_at = payload.get("session_expires_at")
        limits = payload.get("limits") or {}
        return UploadSession(
            session_id=payload["session_id"],
            dataset_uuid=payload["dataset_uuid"],
            prefix=payload["prefix"],
            store_root=payload.get("store_root") or "",
            credential=(
                VendedCredential.from_dict(credential) if credential else None
            ),
            session_expires_at=(
                datetime.datetime.fromisoformat(expires_at)
                if expires_at
                else None
            ),
            limits=BatchLimits(
                max_batch_bytes=int(limits["max_batch_bytes"]),
                max_batch_samples=int(limits["max_batch_samples"]),
            ),
        )

    def renew(self, session_id: str) -> VendedCredential:
        reply = self.__request(
            "POST", f"/onboarding/sessions/{session_id}/renew"
        )
        if reply.status != 200 or reply.payload is None:
            raise self.__refusal(reply)
        return VendedCredential.from_dict(reply.payload["credential"])

    def ingest(
        self,
        session_id: str,
        samples: List[Dict[str, Any]],
        filepath_map: Dict[str, str],
        upload_format: UploadFormat = UploadFormat.FIFTYONE_NATIVE,
    ) -> IngestOutcome:
        reply = self.__request(
            "POST",
            "/onboarding/ingest",
            json_body={
                "session_id": session_id,
                "format": upload_format.value,
                "samples": samples,
                "filepath_map": filepath_map,
            },
        )
        if reply.status != 200 or reply.payload is None:
            raise self.__refusal(reply)
        return IngestOutcome(
            accepted=int(reply.payload.get("accepted") or 0),
            rejected=[
                RejectedSample(
                    index=int(item["index"]), reason=str(item["reason"])
                )
                for item in reply.payload.get("rejected") or []
            ],
        )

    def close(self, session_id: str) -> CloseOutcome:
        reply = self.__request(
            "POST", f"/onboarding/sessions/{session_id}/close"
        )
        if reply.status != 200 or reply.payload is None:
            raise self.__refusal(reply)
        payload = reply.payload
        return CloseOutcome(
            dataset=payload["dataset"],
            samples=int(payload["samples"]),
            manifest_files=int(payload["manifest_files"]),
            shortfall=int(payload["shortfall"]),
        )

    def abort(self, session_id: str) -> None:
        reply = self.__request("DELETE", f"/onboarding/sessions/{session_id}")
        if reply.status != 200:
            raise self.__refusal(reply)

    def __request(self, method: str, path: str, json_body=None) -> HttpReply:
        return self.__http.request(
            method,
            f"{self.__api_url}{path}",
            headers={API_KEY_HEADER: self.__api_key},
            json_body=json_body,
        )

    @staticmethod
    def __refusal(reply: HttpReply) -> Exception:
        message = reply.error_message()
        if reply.status == 401:
            return KeyRefusedError(
                f"The cloud refused the stored key: {message}"
            )
        if reply.status == 410:
            return SessionExpiredError(message)
        if reply.status in (400, 402, 403, 404, 409):
            return RefusedError(message)
        return CloudUnavailableError(message)
