"""
The panel-data contract, typed.

Panel ``data`` is write-only from Python and every ``patch_panel_data``
replaces a whole top-level key, so each patch has to carry a complete
object. These dataclasses are that object; ``asdict``-style serialization
happens once, at the boundary, via :func:`to_payload`. Nothing outside this
module should hand-build one of these dicts.

The same ``push`` payload is what goes into the execution store, so the
browser sees one shape whether it arrived over panel data or over SSE.
"""

import datetime
import logging
import os
from dataclasses import dataclass, field, fields, is_dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

from .constants import (
    API_URL_ENV_VAR,
    AUTH_URL_ENV_VAR,
    DEFAULT_API_URL,
    DEFAULT_AUTH_URL,
    HEARTBEAT_STALE_S,
    REJECTED_PREVIEW_LIMIT,
    RUNNING_GUARD_S,
    STALLED_MESSAGE,
    TERMINAL_SURFACE_S,
    ConnectionStatus,
    ErrorKind,
    PushStatus,
)
from .engine import (
    CloudUnavailableError,
    KeyRefusedError,
    NotPairedError,
    PairingDeniedError,
    PairingExpiredError,
    PushStage,
    RefusedError,
    SessionExpiredError,
)

logger = logging.getLogger(__name__)

#: One entry per engine error class. ``CredentialExpiredError`` is
#: deliberately absent: it is an internal retry signal, and if it ever
#: escapes the pusher the user has nothing to do about it beyond re-running,
#: which is what UNKNOWN already says.
_ERROR_KINDS = (
    (CloudUnavailableError, ErrorKind.UNAVAILABLE),
    (SessionExpiredError, ErrorKind.SESSION_EXPIRED),
    (KeyRefusedError, ErrorKind.KEY_REFUSED),
    (NotPairedError, ErrorKind.NOT_PAIRED),
    (PairingExpiredError, ErrorKind.PAIRING_EXPIRED),
    (PairingDeniedError, ErrorKind.PAIRING_DENIED),
    (RefusedError, ErrorKind.REFUSED),
)


def utc_now() -> datetime.datetime:
    """The one clock. Tests substitute by monkeypatching this symbol."""
    return datetime.datetime.now(datetime.timezone.utc)


def to_payload(model: Any) -> Dict[str, Any]:
    """Serializes a model to the App's wire shape.

    Drops ``None`` fields (the contract marks them optional rather than
    nullable), renders ``datetime`` as ISO 8601, and unwraps ``str`` enums
    to their values. Must be applied to every object handed to
    ``patch_panel_data`` or ``store.set``.
    """
    payload = _encode(model)
    if not isinstance(payload, dict):
        raise TypeError(f"{type(model).__name__} is not a payload model")
    return payload


def _encode(value: Any) -> Any:
    if is_dataclass(value) and not isinstance(value, type):
        encoded = {}
        for spec in fields(value):
            item = getattr(value, spec.name)
            if item is None:
                continue
            encoded[spec.name] = _encode(item)
        return encoded
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [_encode(item) for item in value]
    if isinstance(value, dict):
        return {key: _encode(item) for key, item in value.items()}
    return value


def iso(value: Optional[datetime.datetime]) -> Optional[str]:
    """ISO 8601, or ``None`` passthrough."""
    if value is None:
        return None
    return value.isoformat()


def parse_iso(value: Optional[str]) -> Optional[datetime.datetime]:
    """Reads an ISO 8601 string back off a store snapshot. Returns ``None``
    on absent or unparseable input rather than raising — a corrupt store
    value must not break ``on_load``."""
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed


def age_seconds(
    value: Optional[str], now: Optional[datetime.datetime] = None
) -> Optional[float]:
    """Seconds since an ISO 8601 timestamp; ``None`` when unparseable.

    Drives every staleness rule (``HEARTBEAT_STALE_S``, ``RUNNING_GUARD_S``,
    ``TERMINAL_SURFACE_S``).
    """
    stamped = parse_iso(value)
    if stamped is None:
        return None
    return ((now or utc_now()) - stamped).total_seconds()


# --- Errors ---------------------------------------------------------------


@dataclass(frozen=True)
class ErrorInfo:
    kind: ErrorKind
    message: str


def error_from(exception: BaseException) -> ErrorInfo:
    """Maps an engine exception onto the App's error taxonomy.

    The message is ``str(exception)``; the App supplies the user-facing copy
    for every kind except REFUSED, which it renders verbatim.
    """
    for error_class, kind in _ERROR_KINDS:
        if isinstance(exception, error_class):
            return ErrorInfo(kind=kind, message=str(exception))
    return ErrorInfo(kind=ErrorKind.UNKNOWN, message=str(exception))


# --- Connection -----------------------------------------------------------


@dataclass(frozen=True)
class PairingDisplay:
    """Everything the Pairing screen shows. Deliberately without
    ``device_code``: panel data is workspace-persisted and echoed on every
    event, so the secret half of the pairing lives only in a module-private
    jotai atom in the browser."""

    user_code: str
    verification_uri: str
    verification_uri_complete: str
    expires_at: datetime.datetime
    interval: int


def resolve_urls(profile: Optional[Any]) -> "tuple[str, str]":
    """``(api_url, auth_url)`` by precedence: environment
    (``FIFTYONE_CLOUD_API_URL`` / ``FIFTYONE_CLOUD_AUTH_URL``), then the
    stored profile, then ``DEFAULT_API_URL`` / ``DEFAULT_AUTH_URL``.

    Runs against a keyless profile too, which is the whole point of keeping
    one after Disconnect: the URLs survive and the form stays prefilled.
    Both are returned right-stripped of "/".
    """
    api_url = (
        os.environ.get(API_URL_ENV_VAR)
        or (profile.api_url if profile is not None else "")
        or DEFAULT_API_URL
    )
    auth_url = (
        os.environ.get(AUTH_URL_ENV_VAR)
        or (profile.auth_url if profile is not None else "")
        or DEFAULT_AUTH_URL
    )
    return api_url.rstrip("/"), auth_url.rstrip("/")


@dataclass(frozen=True)
class ConnectionData:
    """``data.connection``.

    Connected means a stored profile that carries an ``api_key``. A keyless
    profile is disconnected-with-known-URLs, which is what makes Disconnect
    non-destructive to the prefill chain.
    """

    status: ConnectionStatus
    api_url: str
    auth_url: str
    key_scope: Optional[str] = None
    key_expires_at: Optional[datetime.datetime] = None
    pairing: Optional[PairingDisplay] = None
    error: Optional[ErrorInfo] = None


def connection_from_profile(
    profile: Optional[Any],
    api_url: str,
    auth_url: str,
    error: Optional[ErrorInfo] = None,
) -> ConnectionData:
    """Builds ``ConnectionData`` from a (possibly absent, possibly keyless)
    ``CloudProfile`` plus the resolved URLs. Status is CONNECTED iff the
    profile exists and has an ``api_key``."""
    connected = profile is not None and bool(profile.api_key)
    return ConnectionData(
        status=(
            ConnectionStatus.CONNECTED
            if connected
            else ConnectionStatus.DISCONNECTED
        ),
        api_url=api_url,
        auth_url=auth_url,
        key_scope=profile.key_scope if connected else None,
        key_expires_at=profile.key_expires_at if connected else None,
        error=error,
    )


# --- Push -----------------------------------------------------------------


@dataclass(frozen=True)
class PreviewInfo:
    samples: int
    files: int
    total_bytes: int
    missing: int


@dataclass(frozen=True)
class ResumableInfo:
    """Present only when a push-state file exists for
    ``(api_url, cloud dataset_name)``."""

    uploaded: int
    total: int


@dataclass(frozen=True)
class RejectionInfo:
    index: int
    reason: str


@dataclass(frozen=True)
class OutcomeInfo:
    dataset: str
    samples: int
    uploaded: int
    skipped_uploads: int
    missing_files: int
    accepted: int
    rejected_count: int
    shortfall: int
    rejected: List[RejectionInfo] = field(default_factory=list)


@dataclass(frozen=True)
class PushData:
    """``data.push`` and the execution-store value, one shape.

    Every patch carries the whole object — there is no partial update — so
    builders below always start from a complete prior snapshot or from
    :func:`idle_push`.
    """

    status: PushStatus
    updated_at: datetime.datetime
    local_dataset: str
    done: int = 0
    total: int = 0
    dataset_name: Optional[str] = None
    stage: Optional[PushStage] = None
    detail: Optional[str] = None
    plan_token: Optional[str] = None
    preview: Optional[PreviewInfo] = None
    resumable: Optional[ResumableInfo] = None
    outcome: Optional[OutcomeInfo] = None
    error: Optional[ErrorInfo] = None


def idle_push(local_dataset: str) -> PushData:
    """The zero value: status IDLE, counters at 0, stamped now."""
    return PushData(
        status=PushStatus.IDLE,
        updated_at=utc_now(),
        local_dataset=local_dataset,
    )


def planning_push(local_dataset: str, total: int) -> PushData:
    """Emitted first in both operator modes so the App shows a spinner
    before the (potentially minutes-long) dataset scan starts. ``total`` is
    the sample count, used only for the "scanning N samples" line."""
    return PushData(
        status=PushStatus.PLANNING,
        updated_at=utc_now(),
        local_dataset=local_dataset,
        total=total,
    )


def preview_push(
    local_dataset: str,
    dataset_name: str,
    plan_token: str,
    preview: PreviewInfo,
    resumable: Optional[ResumableInfo],
) -> PushData:
    """The end of ``mode="preview"``: the plan is parked under
    ``plan_token`` and these are the numbers the App decides on."""
    return PushData(
        status=PushStatus.PREVIEW,
        updated_at=utc_now(),
        local_dataset=local_dataset,
        dataset_name=dataset_name,
        total=preview.files,
        plan_token=plan_token,
        preview=preview,
        resumable=resumable,
    )


def running_push(
    local_dataset: str,
    dataset_name: str,
    stage: PushStage,
    done: int,
    total: int,
    detail: str = "",
) -> PushData:
    """One progress tick. Built from a ``PushEvent`` by
    :func:`push_from_event`, and directly for the initial 0-of-N snapshot
    the operator emits right after the worker starts (``Pusher`` is silent
    until the first file completes, so without it the bar has no zero)."""
    return PushData(
        status=PushStatus.RUNNING,
        updated_at=utc_now(),
        local_dataset=local_dataset,
        dataset_name=dataset_name,
        stage=stage,
        done=done,
        total=total,
        detail=detail or None,
    )


def push_from_event(
    event: Any, local_dataset: str, dataset_name: str
) -> PushData:
    """``PushEvent`` -> running snapshot. Used by both sinks so the live and
    durable channels never disagree about a tick."""
    return running_push(
        local_dataset=local_dataset,
        dataset_name=dataset_name,
        stage=event.stage,
        done=event.done,
        total=event.total,
        detail=event.detail,
    )


def done_push(local_dataset: str, dataset_name: str, outcome: Any) -> PushData:
    """Terminal success. Caps ``rejected`` at ``REJECTED_PREVIEW_LIMIT``
    while keeping the true ``rejected_count`` — the store value has a 16 MB
    cap and a large push can reject thousands."""
    rejected = list(outcome.rejected)
    return PushData(
        status=PushStatus.DONE,
        updated_at=utc_now(),
        local_dataset=local_dataset,
        dataset_name=dataset_name,
        done=outcome.accepted,
        total=outcome.samples,
        outcome=OutcomeInfo(
            dataset=outcome.dataset,
            samples=outcome.samples,
            uploaded=outcome.uploaded,
            skipped_uploads=outcome.skipped_uploads,
            missing_files=outcome.missing_files,
            accepted=outcome.accepted,
            rejected_count=len(rejected),
            shortfall=outcome.shortfall,
            rejected=[
                RejectionInfo(index=item.index, reason=item.reason)
                for item in rejected[:REJECTED_PREVIEW_LIMIT]
            ],
        ),
    )


def failed_push(
    local_dataset: str,
    dataset_name: Optional[str],
    error: ErrorInfo,
) -> PushData:
    """Terminal failure."""
    return PushData(
        status=PushStatus.FAILED,
        updated_at=utc_now(),
        local_dataset=local_dataset,
        dataset_name=dataset_name,
        error=error,
    )


def push_from_store(
    value: Optional[Dict[str, Any]], local_dataset: str
) -> PushData:
    """What a reopened panel lands on, per the ``on_load`` staleness rules.

    - no value, or a shape that will not parse -> :func:`idle_push`
    - RUNNING and older than ``HEARTBEAT_STALE_S`` -> FAILED with
      ``ErrorKind.UNKNOWN`` and ``STALLED_MESSAGE``
    - RUNNING and fresh -> as-is (the panel lands on Running)
    - DONE/FAILED within ``TERMINAL_SURFACE_S`` -> as-is
    - any older terminal, or a non-terminal leftover -> :func:`idle_push`
    """
    status = _stored_status(value)
    if status is None:
        return idle_push(local_dataset)

    age = age_seconds(value.get("updated_at"))
    if age is None:
        return idle_push(local_dataset)

    if status is PushStatus.RUNNING:
        if age > HEARTBEAT_STALE_S:
            return failed_push(
                local_dataset=value.get("local_dataset") or local_dataset,
                dataset_name=value.get("dataset_name"),
                error=ErrorInfo(
                    kind=ErrorKind.UNKNOWN, message=STALLED_MESSAGE
                ),
            )
        return _safe_rehydrate(value, local_dataset)

    if status.is_terminal and age <= TERMINAL_SURFACE_S:
        return _safe_rehydrate(value, local_dataset)

    return idle_push(local_dataset)


def _safe_rehydrate(value: Dict[str, Any], local_dataset: str) -> PushData:
    """:func:`_rehydrate`, degrading to idle on anything it cannot read.

    Only this plugin writes the store, so a snapshot that will not rebuild
    means version drift — a nested object short a field, or a counter that
    stopped being a number. Either way the panel opens on the upload form
    rather than breaking ``on_load``.
    """
    try:
        return _rehydrate(value, local_dataset)
    except (TypeError, ValueError, KeyError):
        logger.warning(
            "cloud push: discarding an unreadable stored snapshot",
            exc_info=True,
        )
        return idle_push(local_dataset)


def is_running_guarded(value: Optional[Dict[str, Any]]) -> bool:
    """True when the stored snapshot says RUNNING and is younger than
    ``RUNNING_GUARD_S`` — the condition under which ``mode="push"`` refuses
    with ``ALREADY_RUNNING_MESSAGE``."""
    if _stored_status(value) is not PushStatus.RUNNING:
        return False
    age = age_seconds(value.get("updated_at"))
    return age is not None and age <= RUNNING_GUARD_S


def _stored_status(value: Optional[Dict[str, Any]]) -> Optional[PushStatus]:
    """The status of a store snapshot, or ``None`` when there isn't one that
    parses. Every caller treats an unreadable value as no value at all."""
    if not isinstance(value, dict):
        return None
    try:
        return PushStatus(value.get("status"))
    except ValueError:
        return None


def _rehydrate(value: Dict[str, Any], local_dataset: str) -> PushData:
    """Rebuilds a ``PushData`` from a stored payload.

    Panel data is handed the typed model rather than the raw dict so a
    snapshot written by an older plugin version cannot smuggle unknown keys
    into the App's state machine.
    """
    return PushData(
        status=PushStatus(value["status"]),
        updated_at=parse_iso(value.get("updated_at")) or utc_now(),
        local_dataset=value.get("local_dataset") or local_dataset,
        done=int(value.get("done") or 0),
        total=int(value.get("total") or 0),
        dataset_name=value.get("dataset_name"),
        stage=_optional(PushStage, value.get("stage")),
        detail=value.get("detail"),
        plan_token=value.get("plan_token"),
        preview=_nested(PreviewInfo, value.get("preview")),
        resumable=_nested(ResumableInfo, value.get("resumable")),
        outcome=_outcome(value.get("outcome")),
        error=_error(value.get("error")),
    )


def _optional(enum_class: Any, value: Any) -> Any:
    if value is None:
        return None
    try:
        return enum_class(value)
    except ValueError:
        return None


def _nested(model_class: Any, value: Any) -> Any:
    if not isinstance(value, dict):
        return None
    names = {spec.name for spec in fields(model_class)}
    return model_class(**{k: v for k, v in value.items() if k in names})


def _outcome(value: Any) -> Optional[OutcomeInfo]:
    if not isinstance(value, dict):
        return None
    rejected = value.get("rejected") or []
    return OutcomeInfo(
        dataset=value.get("dataset", ""),
        samples=int(value.get("samples") or 0),
        uploaded=int(value.get("uploaded") or 0),
        skipped_uploads=int(value.get("skipped_uploads") or 0),
        missing_files=int(value.get("missing_files") or 0),
        accepted=int(value.get("accepted") or 0),
        rejected_count=int(value.get("rejected_count") or 0),
        shortfall=int(value.get("shortfall") or 0),
        rejected=[
            RejectionInfo(
                index=int(item.get("index", 0)), reason=item.get("reason", "")
            )
            for item in rejected
            if isinstance(item, dict)
        ],
    )


def _error(value: Any) -> Optional[ErrorInfo]:
    if not isinstance(value, dict):
        return None
    kind = _optional(ErrorKind, value.get("kind")) or ErrorKind.UNKNOWN
    return ErrorInfo(kind=kind, message=value.get("message", ""))
