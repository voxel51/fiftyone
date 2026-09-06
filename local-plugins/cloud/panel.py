"""
The App-side shell: a hybrid panel whose Python half holds only sub-second
work.

Everything that scans a dataset lives in ``push_to_cloud`` instead, because
a panel method's return value reaches the browser only when it returns —
a long method is a frozen panel. Pairing is likewise non-blocking: this
class hands the codes back immediately and the browser polls, rather than
holding one HTTP stream open for the pairing TTL.

``device_code`` is never written into panel data. Panel state is
workspace-persisted and panel data is echoed on every event; the secret
half of the pairing lives only in a module-private atom in the browser and
comes back as a parameter on each poll.
"""

import datetime
from typing import Any, Dict, Optional

import fiftyone.constants as foc
import fiftyone.operators as foo
import fiftyone.operators.types as types

from .constants import (
    PANEL_COMPONENT,
    PANEL_LABEL,
    PANEL_NAME,
    PUSH_KEY,
    STORE_NAME,
    ConnectionStatus,
    ErrorKind,
    PanelDataKey,
    ParamKey,
    PollStatusValue,
)
from .engine import (
    DEFAULT_CLIENT_NAME,
    CloudError,
    CloudProfile,
    CloudUnavailableError,
    Http,
    PairingClient,
    PollStatus,
    ProfileStore,
    RefusedError,
)
from .models import (
    ConnectionData,
    ErrorInfo,
    PairingDisplay,
    connection_from_profile,
    error_from,
    idle_push,
    push_from_store,
    resolve_urls,
    to_payload,
    utc_now,
)

#: The two poll outcomes that end a pairing without a key.
_TERMINAL_POLL_KINDS = {
    PollStatus.EXPIRED: ErrorKind.PAIRING_EXPIRED,
    PollStatus.DENIED: ErrorKind.PAIRING_DENIED,
}

_POLL_STATUS_VALUES = {
    PollStatus.PENDING: PollStatusValue.PENDING,
    PollStatus.SLOW_DOWN: PollStatusValue.SLOW_DOWN,
    PollStatus.ISSUED: PollStatusValue.ISSUED,
    PollStatus.EXPIRED: PollStatusValue.EXPIRED,
    PollStatus.DENIED: PollStatusValue.DENIED,
}


class CloudPanel(foo.Panel):
    """``@voxel51/cloud/cloud_panel`` — "FiftyOne Cloud", grid surface.

    Renders a single React component and exposes its methods on the view;
    the browser reads their URIs off ``props.schema.view`` and calls them
    through ``useTriggerPanelEvent``, whose callback receives the return
    value as ``result.result``.
    """

    def __init__(self, _builtin=False):
        super().__init__(_builtin=_builtin)
        # The registry holds one instance, so this cache is shared across
        # sessions. That is fine: it is keyed on the selection it describes,
        # and a miss costs exactly what not caching would.
        self.__counts_key: Any = None
        self.__counts_value: "tuple[int, int]" = (0, 0)

    @property
    def config(self) -> foo.PanelConfig:
        return foo.PanelConfig(
            name=PANEL_NAME,
            label=PANEL_LABEL,
            icon="cloud_upload",
            surfaces="grid",
        )

    def store(self, ctx) -> Any:
        """``ctx.store(STORE_NAME)`` — dataset-scoped by construction, which
        is why there is no cross-dataset view of running uploads."""
        return ctx.store(STORE_NAME)

    # --- lifecycle --------------------------------------------------------

    def on_load(self, ctx) -> None:
        """Seeds both halves of panel data.

        Never reads panel data back (``PanelRefData.get`` raises
        ``WriteOnlyError``).
        """
        # Opening the panel is the one moment worth paying for fresh counts:
        # the cache is otherwise only invalidated by a view change, so
        # samples added since it was last computed would show stale.
        self.__counts_key = None

        profile = ProfileStore().load()
        api_url, auth_url = resolve_urls(profile)
        self.__write_connection(
            ctx, connection_from_profile(profile, api_url, auth_url)
        )

        stored = self.store(ctx).get(PUSH_KEY)
        self.__write_push(ctx, push_from_store(stored, _local_dataset(ctx)))

    # --- pairing ----------------------------------------------------------

    def start_pairing(self, ctx) -> Dict[str, Any]:
        """params: ``api_url``, ``auth_url`` (both optional; fall back to
        ``resolve_urls``). Returns the full ``DevicePairing`` as a dict,
        ``device_code`` included — the return value goes to the caller, not
        into panel data.
        """
        profile_store = ProfileStore()
        api_url, auth_url = self.__requested_urls(ctx, profile_store.load())

        # Saved before the request so a pairing the user cancels — or one
        # that never starts — still leaves the form prefilled.
        keyless = CloudProfile(api_url=api_url, auth_url=auth_url)
        profile_store.save(keyless)

        try:
            pairing = PairingClient(auth_url, Http()).start(
                DEFAULT_CLIENT_NAME, foc.VERSION
            )
        except CloudError as error:
            self.__write_connection(
                ctx,
                connection_from_profile(
                    keyless, api_url, auth_url, error=error_from(error)
                ),
            )
            return {}

        self.__write_connection(
            ctx,
            ConnectionData(
                status=ConnectionStatus.PAIRING,
                api_url=api_url,
                auth_url=auth_url,
                pairing=PairingDisplay(
                    user_code=pairing.user_code,
                    verification_uri=pairing.verification_uri,
                    verification_uri_complete=(
                        pairing.verification_uri_complete
                    ),
                    expires_at=utc_now()
                    + datetime.timedelta(seconds=pairing.expires_in),
                    interval=pairing.interval,
                ),
            ),
        )
        return to_payload(pairing)

    def poll_pairing(self, ctx) -> Dict[str, Any]:
        """params: ``device_code``, ``api_url``, ``auth_url``. Returns
        ``{"status": PollStatusValue, "message"?: str}``.

        ``RefusedError`` and ``CloudUnavailableError`` are caught and
        reported as statuses rather than raised — a poll that throws would
        strand the browser's interval.
        """
        device_code = ctx.params.get(ParamKey.DEVICE_CODE.value)
        profile_store = ProfileStore()
        profile = profile_store.load()
        api_url, auth_url = self.__requested_urls(ctx, profile)

        try:
            outcome = PairingClient(auth_url, Http()).poll(device_code)
        except (RefusedError, CloudUnavailableError) as error:
            info = error_from(error)
            self.__write_connection(
                ctx,
                connection_from_profile(
                    profile, api_url, auth_url, error=info
                ),
            )
            return {
                "status": (
                    PollStatusValue.REFUSED.value
                    if isinstance(error, RefusedError)
                    else PollStatusValue.UNAVAILABLE.value
                ),
                "message": info.message,
            }

        if outcome.status is PollStatus.ISSUED:
            paired = _base_profile(profile, api_url, auth_url).with_key(
                outcome.issued.api_key,
                outcome.issued.scope,
                _expiry(outcome.issued.expires_in),
            )
            profile_store.save(paired)
            self.__write_connection(
                ctx, connection_from_profile(paired, api_url, auth_url)
            )
            return {"status": PollStatusValue.ISSUED.value}

        kind = _TERMINAL_POLL_KINDS.get(outcome.status)
        if kind is not None:
            self.__write_connection(
                ctx,
                connection_from_profile(
                    profile,
                    api_url,
                    auth_url,
                    error=ErrorInfo(kind=kind, message=""),
                ),
            )

        return {"status": _POLL_STATUS_VALUES[outcome.status].value}

    def cancel_pairing(self, ctx) -> Dict[str, Any]:
        """No params. Connection back to DISCONNECTED with the URLs kept —
        the keyless profile ``start_pairing`` saved is already correct, so
        this only rewrites panel data."""
        profile = ProfileStore().load()
        api_url, auth_url = resolve_urls(profile)
        self.__write_connection(
            ctx, connection_from_profile(profile, api_url, auth_url)
        )
        return {}

    # --- connection -------------------------------------------------------

    def disconnect(self, ctx) -> Dict[str, Any]:
        """No params. Saves the profile ``without_key()`` — never
        ``clear()``, which would take the URLs with it.

        There is no server-side key revocation: connected means "a key is
        present and unexpired", so dropping the key is the whole operation.
        """
        profile_store = ProfileStore()
        profile = profile_store.load()
        if profile is not None:
            profile = profile.without_key()
            profile_store.save(profile)

        api_url, auth_url = resolve_urls(profile)
        self.__write_connection(
            ctx, connection_from_profile(profile, api_url, auth_url)
        )
        self.__write_push(ctx, idle_push(_local_dataset(ctx)))
        return {}

    # --- push -------------------------------------------------------------

    def reset_push(self, ctx) -> Dict[str, Any]:
        """No params. Backs "Upload another" and "Try again", so a stale
        terminal snapshot cannot reappear on the next ``on_load``."""
        self.store(ctx).delete(PUSH_KEY)
        self.__write_push(ctx, idle_push(_local_dataset(ctx)))
        return {}

    # --- render -----------------------------------------------------------

    def render(self, ctx) -> types.Property:
        """A single composite view.

        Carries the dataset context the React side cannot derive — the local
        name, both sample counts, and whether a view is active — so the
        Upload form can offer the view/dataset choice without a round trip.
        ``render`` runs after every panel method, so nothing here may cost
        more than a count.
        """
        has_view = bool(ctx.has_custom_view)
        dataset_count, view_count = self.__counts(ctx, has_view)
        return types.Property(
            types.Object(),
            view=types.View(
                component=PANEL_COMPONENT,
                composite_view=True,
                start_pairing=self.start_pairing,
                poll_pairing=self.poll_pairing,
                cancel_pairing=self.cancel_pairing,
                disconnect=self.disconnect,
                reset_push=self.reset_push,
                local_dataset=_local_dataset(ctx),
                dataset_count=dataset_count,
                view_count=view_count,
                has_view=has_view,
            ),
        )

    # --- internals --------------------------------------------------------

    def __counts(self, ctx, has_view: bool) -> "tuple[int, int]":
        """``(dataset_count, view_count)``, memoized on the selection.

        ``render`` runs after *every* panel method, including each pairing
        poll at the RFC interval, and a count over a filtered or generated
        view is a full aggregation. The counts only change when the dataset
        or the view stages do, so key the cache on exactly that.
        """
        key = (
            _local_dataset(ctx),
            _view_signature(ctx) if has_view else None,
        )
        if self.__counts_key != key:
            dataset_count = _count(ctx.dataset)
            self.__counts_key = key
            self.__counts_value = (
                dataset_count,
                _count(ctx.view) if has_view else dataset_count,
            )
        return self.__counts_value

    def __requested_urls(self, ctx, profile) -> "tuple[str, str]":
        """The URLs the browser sent, falling back to the resolution chain
        for whichever half it left blank."""
        api_url, auth_url = resolve_urls(profile)
        requested_api = ctx.params.get(ParamKey.API_URL.value)
        requested_auth = ctx.params.get(ParamKey.AUTH_URL.value)
        return (
            (requested_api or api_url).rstrip("/"),
            (requested_auth or auth_url).rstrip("/"),
        )

    def __write_connection(self, ctx, connection: ConnectionData) -> None:
        ctx.panel.set_data(
            PanelDataKey.CONNECTION.value, to_payload(connection)
        )

    def __write_push(self, ctx, push) -> None:
        ctx.panel.set_data(PanelDataKey.PUSH.value, to_payload(push))


def _base_profile(
    profile: Optional[CloudProfile], api_url: str, auth_url: str
) -> CloudProfile:
    """The profile a newly issued key attaches to. A stored profile whose
    URLs the user has since changed is not it."""
    if (
        profile is not None
        and profile.api_url == api_url
        and profile.auth_url == auth_url
    ):
        return profile
    return CloudProfile(api_url=api_url, auth_url=auth_url)


def _expiry(expires_in: Optional[int]) -> Optional[datetime.datetime]:
    if expires_in is None:
        return None
    return utc_now() + datetime.timedelta(seconds=expires_in)


def _view_signature(ctx) -> str:
    """A cheap identity for the active view.

    The four request params ``has_custom_view`` reads *are* the view — the
    stages, filters, extended selection and saved-view name the App sent —
    so hashing them needs no database round trip.
    """
    params = getattr(ctx, "request_params", None) or {}
    return repr(
        [
            params.get("view"),
            params.get("filters"),
            params.get("extended"),
            params.get("view_name"),
        ]
    )


def _local_dataset(ctx) -> str:
    return getattr(ctx.dataset, "name", "") or ""


def _count(collection) -> int:
    if collection is None:
        return 0
    return len(collection)
