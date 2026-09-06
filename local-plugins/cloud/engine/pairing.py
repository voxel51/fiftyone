"""
RFC 8628 device pairing against CAS. The client shows the user a code and a
verification URL, then polls until the pairing is approved and redeems it
for an onboarding-scoped API key.
"""

import time
from dataclasses import dataclass
from enum import Enum
from typing import Callable, Optional

from .errors import (
    CloudUnavailableError,
    PairingDeniedError,
    PairingExpiredError,
    RefusedError,
)
from .transport import Http

SLOW_DOWN_BACKOFF_SECONDS = 5


class PollError(str, Enum):
    """The RFC 8628 polling error codes CAS answers with."""

    AUTHORIZATION_PENDING = "authorization_pending"
    SLOW_DOWN = "slow_down"
    EXPIRED_TOKEN = "expired_token"
    ACCESS_DENIED = "access_denied"


class PollStatus(str, Enum):
    """The outcome of a single poll, as the caller sees it.

    Split out from ``wait_for_approval`` so a browser-driven pairing can own
    the timing: the App polls at the RFC interval and never holds an HTTP
    stream open for the pairing TTL.
    """

    PENDING = "pending"
    SLOW_DOWN = "slow_down"
    ISSUED = "issued"
    EXPIRED = "expired"
    DENIED = "denied"


@dataclass(frozen=True)
class PollOutcome:
    """``issued`` is set exactly when ``status is PollStatus.ISSUED``."""

    status: PollStatus
    issued: Optional["IssuedKey"] = None


@dataclass(frozen=True)
class DevicePairing:
    """A started pairing: what to show the user and how to poll."""

    device_code: str
    user_code: str
    verification_uri: str
    verification_uri_complete: str
    expires_in: int
    interval: int


@dataclass(frozen=True)
class IssuedKey:
    api_key: str
    scope: Optional[str]
    expires_in: Optional[int]


class PairingClient:
    """Runs the device-authorization flow against the CAS API base."""

    def __init__(
        self,
        auth_url: str,
        http: Http,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.__auth_url = auth_url.rstrip("/")
        self.__http = http
        self.__sleep = sleep

    def start(
        self, client: str, client_version: Optional[str] = None
    ) -> DevicePairing:
        body = {"client": client}
        if client_version:
            body["client_version"] = client_version

        reply = self.__http.request(
            "POST", f"{self.__auth_url}/auth/device/code", json_body=body
        )
        if reply.status != 200 or reply.payload is None:
            raise CloudUnavailableError(
                f"pairing could not start: {reply.error_message()}"
            )

        return DevicePairing(
            device_code=reply.payload["device_code"],
            user_code=reply.payload["user_code"],
            verification_uri=reply.payload["verification_uri"],
            verification_uri_complete=reply.payload[
                "verification_uri_complete"
            ],
            expires_in=int(reply.payload["expires_in"]),
            interval=int(reply.payload["interval"]),
        )

    def poll(self, device_code: str) -> PollOutcome:
        """One ``POST {auth_url}/auth/device/token``.

        Expiry and denial come back as *statuses*, not exceptions, so a
        browser-driven pairing can render them as screens. The blocking
        caller turns them back into ``PairingExpiredError`` /
        ``PairingDeniedError``.
        """
        reply = self.__http.request(
            "POST",
            f"{self.__auth_url}/auth/device/token",
            json_body={"device_code": device_code},
        )

        if reply.status == 200 and reply.payload is not None:
            expires_in = reply.payload.get("expires_in")
            return PollOutcome(
                status=PollStatus.ISSUED,
                issued=IssuedKey(
                    api_key=reply.payload["api_key"],
                    scope=reply.payload.get("scope"),
                    expires_in=(
                        int(expires_in) if expires_in is not None else None
                    ),
                ),
            )

        if reply.status == 400:
            code = reply.field("error")
            if code == PollError.AUTHORIZATION_PENDING:
                return PollOutcome(PollStatus.PENDING)
            if code == PollError.SLOW_DOWN:
                return PollOutcome(PollStatus.SLOW_DOWN)
            if code == PollError.EXPIRED_TOKEN:
                return PollOutcome(PollStatus.EXPIRED)
            if code == PollError.ACCESS_DENIED:
                return PollOutcome(PollStatus.DENIED)
            raise RefusedError(f"pairing was refused: {reply.error_message()}")

        raise CloudUnavailableError(
            f"pairing could not be polled: {reply.error_message()}"
        )

    def wait_for_approval(
        self,
        pairing: DevicePairing,
        on_poll: Optional[Callable[[], None]] = None,
    ) -> IssuedKey:
        """Blocks until approved, honoring the RFC pacing signals. The CLI's
        path; the App polls :meth:`poll` itself.

        The budget is spent time-slept rather than wall-clock, so the loop
        stays deterministic under an injected ``sleep``.
        """
        interval = pairing.interval
        remaining = pairing.expires_in

        while True:
            self.__sleep(interval)
            remaining -= interval

            if on_poll is not None:
                on_poll()

            outcome = self.poll(pairing.device_code)
            if outcome.status is PollStatus.ISSUED:
                return outcome.issued
            if outcome.status is PollStatus.DENIED:
                raise PairingDeniedError(
                    "The pairing was declined on the approval page."
                )
            if outcome.status is PollStatus.EXPIRED:
                raise PairingExpiredError(
                    "The pairing codes expired before approval."
                )
            if outcome.status is PollStatus.SLOW_DOWN:
                interval += SLOW_DOWN_BACKOFF_SECONDS

            if remaining <= 0:
                raise PairingExpiredError(
                    "The pairing codes expired before approval."
                )
