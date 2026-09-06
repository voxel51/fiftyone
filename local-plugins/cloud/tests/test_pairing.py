import pytest

from conftest import FakeResponse, FakeSession
from engine import (
    PairingClient,
    PairingDeniedError,
    PairingExpiredError,
    PollStatus,
    CloudUnavailableError,
    RefusedError,
)
from engine.transport import Http

AUTH_URL = "https://auth.example.com/cas/api"

PAIRING_PAYLOAD = {
    "device_code": "dev-1",
    "user_code": "WDJB-MJHT",
    "verification_uri": "https://cloud.example.com/activate",
    "verification_uri_complete": "https://cloud.example.com/activate?code=WDJB-MJHT",
    "expires_in": 600,
    "interval": 5,
}

ISSUED_PAYLOAD = {
    "api_key": "kid|raw",
    "scope": "onboarding",
    "expires_in": 3600,
}


def client_with(replies, sleep=lambda seconds: None):
    session = FakeSession(replies=list(replies))
    return PairingClient(AUTH_URL, Http(session=session), sleep=sleep), session


class TestStart:
    def test_posts_the_client_identity_and_parses_the_pairing(self):
        client, session = client_with([FakeResponse(200, PAIRING_PAYLOAD)])

        pairing = client.start("fiftyone-cloud-push", "1.8.0")

        call = session.calls[0]
        assert call.url == f"{AUTH_URL}/auth/device/code"
        assert call.json == {
            "client": "fiftyone-cloud-push",
            "client_version": "1.8.0",
        }
        assert pairing.user_code == "WDJB-MJHT"
        assert pairing.interval == 5

    def test_a_failed_start_is_unavailability(self):
        client, _ = client_with([FakeResponse(502, None)])
        with pytest.raises(CloudUnavailableError):
            client.start("fiftyone-cloud-push")


class TestPoll:
    """One poll, no pacing. The App owns the timing, so expiry and denial
    have to come back as values rather than exceptions."""

    def test_a_200_yields_the_issued_key(self):
        client, session = client_with([FakeResponse(200, ISSUED_PAYLOAD)])

        outcome = client.poll("dev-1")

        assert outcome.status is PollStatus.ISSUED
        assert outcome.issued.api_key == "kid|raw"
        assert outcome.issued.expires_in == 3600
        assert session.calls[0].url == f"{AUTH_URL}/auth/device/token"
        assert session.calls[0].json == {"device_code": "dev-1"}

    @pytest.mark.parametrize(
        "code,status",
        [
            ("authorization_pending", PollStatus.PENDING),
            ("slow_down", PollStatus.SLOW_DOWN),
            ("expired_token", PollStatus.EXPIRED),
            ("access_denied", PollStatus.DENIED),
        ],
    )
    def test_each_rfc_code_is_a_status(self, code, status):
        client, _ = client_with([FakeResponse(400, {"error": code})])

        assert client.poll("dev-1").status is status

    def test_an_unknown_400_code_is_a_refusal(self):
        client, _ = client_with([FakeResponse(400, {"error": "who_knows"})])

        with pytest.raises(RefusedError):
            client.poll("dev-1")

    def test_any_other_status_is_unavailability(self):
        client, _ = client_with([FakeResponse(503, None)])

        with pytest.raises(CloudUnavailableError):
            client.poll("dev-1")


class TestWaitForApproval:
    def pairing(self, **overrides):
        client, _ = client_with(
            [FakeResponse(200, {**PAIRING_PAYLOAD, **overrides})]
        )
        return client.start("x")

    def test_polls_until_issued(self, no_sleep):
        slept, sleep = no_sleep
        client, session = client_with(
            [
                FakeResponse(200, PAIRING_PAYLOAD),
                FakeResponse(400, {"error": "authorization_pending"}),
                FakeResponse(400, {"error": "authorization_pending"}),
                FakeResponse(200, ISSUED_PAYLOAD),
            ],
            sleep=sleep,
        )
        pairing = client.start("x")

        issued = client.wait_for_approval(pairing)

        assert issued.api_key == "kid|raw"
        assert issued.scope == "onboarding"
        assert slept == [5, 5, 5]
        token_calls = [
            call for call in session.calls if call.url.endswith("/token")
        ]
        assert all(
            call.json == {"device_code": "dev-1"} for call in token_calls
        )

    def test_slow_down_stretches_the_interval(self, no_sleep):
        slept, sleep = no_sleep
        client, _ = client_with(
            [
                FakeResponse(200, PAIRING_PAYLOAD),
                FakeResponse(400, {"error": "slow_down"}),
                FakeResponse(200, ISSUED_PAYLOAD),
            ],
            sleep=sleep,
        )
        pairing = client.start("x")

        client.wait_for_approval(pairing)

        assert slept == [5, 10]

    def test_a_declined_pairing_raises(self):
        client, _ = client_with(
            [
                FakeResponse(200, PAIRING_PAYLOAD),
                FakeResponse(400, {"error": "access_denied"}),
            ]
        )
        with pytest.raises(PairingDeniedError):
            client.wait_for_approval(client.start("x"))

    def test_an_expired_pairing_raises(self):
        client, _ = client_with(
            [
                FakeResponse(200, PAIRING_PAYLOAD),
                FakeResponse(400, {"error": "expired_token"}),
            ]
        )
        with pytest.raises(PairingExpiredError):
            client.wait_for_approval(client.start("x"))

    def test_an_exhausted_budget_expires_without_wall_clock(self):
        client, session = client_with(
            [FakeResponse(200, {**PAIRING_PAYLOAD, "expires_in": 12})]
            + [
                FakeResponse(400, {"error": "authorization_pending"})
                for _ in range(10)
            ]
        )
        pairing = client.start("x")

        with pytest.raises(PairingExpiredError):
            client.wait_for_approval(pairing)

        token_calls = [
            call for call in session.calls if call.url.endswith("/token")
        ]
        assert len(token_calls) == 3
