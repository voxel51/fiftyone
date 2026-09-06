"""
The two end-to-end flows, composed once so the CLI and the operator stay
thin shells over identical behavior.
"""

import datetime
from typing import Any, Callable, Iterable, Optional

from .config import CloudProfile, ProfileStore
from .manifest import PushPlan, build_push_plan
from .pairing import DevicePairing, PairingClient
from .push import ProgressCallback, Pusher, PushOutcome, PushStateStore
from .session import OnboardingClient
from .transport import Http

DEFAULT_CLIENT_NAME = "fiftyone-cloud-push"


def run_login(
    profile: CloudProfile,
    profile_store: ProfileStore,
    http: Http,
    on_pairing: Callable[[DevicePairing], None],
    client_name: str = DEFAULT_CLIENT_NAME,
    client_version: Optional[str] = None,
    on_poll: Optional[Callable[[], None]] = None,
) -> CloudProfile:
    """Pairs this machine with the cloud and persists the issued key."""
    pairing_client = PairingClient(profile.auth_url, http)
    pairing = pairing_client.start(client_name, client_version)
    on_pairing(pairing)

    issued = pairing_client.wait_for_approval(pairing, on_poll=on_poll)
    expires_at = None
    if issued.expires_in is not None:
        expires_at = datetime.datetime.now(
            datetime.timezone.utc
        ) + datetime.timedelta(seconds=issued.expires_in)

    paired = profile.with_key(issued.api_key, issued.scope, expires_at)
    profile_store.save(paired)
    return paired


def run_push(
    profile: CloudProfile,
    dataset_name: str,
    samples: Iterable[Any],
    http: Http,
    on_progress: Optional[ProgressCallback] = None,
    fresh: bool = False,
    plan: Optional[PushPlan] = None,
) -> PushOutcome:
    """Plans and executes a push of the given samples under the profile's key.

    ``plan`` lets a caller that has already scanned the collection — the
    App, which showed the user a preview built from it — reuse that scan.
    When it is ``None`` the plan is built here, which is the CLI's path and
    the fallback when a cached plan has expired. ``samples`` is ignored
    when ``plan`` is supplied.
    """
    if plan is None:
        plan = build_push_plan(samples)

    client = OnboardingClient(profile.api_url, profile.api_key, http)
    state_store = PushStateStore(profile.api_url, dataset_name)
    pusher = Pusher(client, http, state_store, on_progress=on_progress)
    return pusher.push(dataset_name, plan, fresh=fresh)
