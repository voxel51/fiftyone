import pytest

from conftest import FakeResponse, FakeSession
from engine import (
    CloudUnavailableError,
    KeyRefusedError,
    ManifestEntry,
    ManifestSummary,
    OnboardingClient,
    RefusedError,
    SessionExpiredError,
)
from engine.session import MAX_INLINE_MANIFEST_ENTRIES
from engine.transport import Http

API_URL = "https://api.example.com"
SUMMARY = ManifestSummary(file_count=2, total_bytes=1000)

CREATED_PAYLOAD = {
    "session_id": "sess-1",
    "dataset_uuid": "uuid-1",
    "prefix": "org-1/dataset-uuid-1/",
    "store_root": "gs://media-bucket",
    "credential": {"provider": "gcs", "token": "narrow", "expires_at": None},
    "session_expires_at": "2026-08-11T00:00:00+00:00",
    "limits": {"max_batch_bytes": 52428800, "max_batch_samples": 1000},
}


def client_with(replies):
    session = FakeSession(replies=list(replies))
    return OnboardingClient(API_URL, "kid|raw", Http(session=session)), session


class TestCreateSession:
    def test_sends_the_contract_shape_under_the_key_header(self):
        client, session = client_with([FakeResponse(201, CREATED_PAYLOAD)])

        created = client.create_session("quickstart", SUMMARY)

        call = session.calls[0]
        assert call.url == f"{API_URL}/onboarding/sessions"
        assert call.headers == {"X-API-Key": "kid|raw"}
        assert call.json == {
            "dataset": {"name": "quickstart"},
            "format": "fiftyone-native",
            "manifest_summary": {"file_count": 2, "total_bytes": 1000},
        }
        assert created.session_id == "sess-1"
        assert created.prefix == "org-1/dataset-uuid-1/"
        assert created.credential.token == "narrow"
        assert created.limits.max_batch_samples == 1000

    def test_declared_entries_itemize_the_summary_on_the_wire(self):
        client, session = client_with([FakeResponse(201, CREATED_PAYLOAD)])

        client.create_session(
            "quickstart",
            SUMMARY,
            [
                ManifestEntry(dest_key="media/a.jpg", size_bytes=400),
                ManifestEntry(dest_key="media/b.jpg", size_bytes=600),
            ],
        )

        assert session.calls[0].json["manifest_entries"] == [
            {"dest_key": "media/a.jpg", "size_bytes": 400},
            {"dest_key": "media/b.jpg", "size_bytes": 600},
        ]

    def test_a_manifest_past_the_inline_cap_declares_only_its_totals(self):
        client, session = client_with([FakeResponse(201, CREATED_PAYLOAD)])
        entries = [
            ManifestEntry(dest_key=f"media/{index}.jpg", size_bytes=1)
            for index in range(MAX_INLINE_MANIFEST_ENTRIES + 1)
        ]

        client.create_session("quickstart", SUMMARY, entries)

        assert "manifest_entries" not in session.calls[0].json
        assert session.calls[0].json["manifest_summary"] == {
            "file_count": 2,
            "total_bytes": 1000,
        }

    def test_a_credential_less_session_parses(self):
        payload = {**CREATED_PAYLOAD, "credential": None, "store_root": ""}
        client, _ = client_with([FakeResponse(201, payload)])

        created = client.create_session("quickstart", SUMMARY)

        assert created.credential is None
        assert created.store_root == ""


class TestRefusalMapping:
    def refusal(self, status, message="nope"):
        client, _ = client_with([FakeResponse(status, {"error": message})])
        with pytest.raises(Exception) as excinfo:
            client.create_session("quickstart", SUMMARY)
        return excinfo.value

    def test_401_means_the_key_was_refused(self):
        assert isinstance(self.refusal(401), KeyRefusedError)

    def test_409_is_a_refusal_carrying_the_server_message(self):
        err = self.refusal(409, "too many open upload sessions")
        assert isinstance(err, RefusedError)
        assert "too many open upload sessions" in str(err)

    def test_410_means_the_session_expired(self):
        assert isinstance(self.refusal(410), SessionExpiredError)

    def test_503_is_unavailability(self):
        assert isinstance(self.refusal(503), CloudUnavailableError)


class TestIngest:
    def test_parses_per_sample_outcomes(self):
        client, session = client_with(
            [
                FakeResponse(
                    200,
                    {
                        "accepted": 2,
                        "rejected": [{"index": 1, "reason": "bad"}],
                    },
                )
            ]
        )

        outcome = client.ingest(
            "sess-1",
            [{"filepath": "/a.jpg"}],
            {"/a.jpg": "org-1/dataset-uuid-1/media/a.jpg"},
        )

        call = session.calls[0]
        assert call.url == f"{API_URL}/onboarding/ingest"
        assert call.json["session_id"] == "sess-1"
        assert call.json["format"] == "fiftyone-native"
        assert outcome.accepted == 2
        assert outcome.rejected[0].reason == "bad"


class TestCloseAndRenew:
    def test_close_parses_the_reconciliation(self):
        client, session = client_with(
            [
                FakeResponse(
                    200,
                    {
                        "dataset": "quickstart",
                        "samples": 4,
                        "manifest_files": 5,
                        "shortfall": 1,
                    },
                )
            ]
        )

        closed = client.close("sess-1")

        assert (
            session.calls[0].url
            == f"{API_URL}/onboarding/sessions/sess-1/close"
        )
        assert closed.shortfall == 1

    def test_renew_parses_the_fresh_credential(self):
        client, session = client_with(
            [
                FakeResponse(
                    200,
                    {
                        "session_id": "sess-1",
                        "credential": {
                            "provider": "gcs",
                            "token": "fresh",
                            "expires_at": None,
                        },
                    },
                )
            ]
        )

        credential = client.renew("sess-1")

        assert (
            session.calls[0].url
            == f"{API_URL}/onboarding/sessions/sess-1/renew"
        )
        assert credential.token == "fresh"

    def test_abort_hits_the_delete_route(self):
        client, session = client_with(
            [FakeResponse(200, {"status": "aborted"})]
        )

        client.abort("sess-1")

        call = session.calls[0]
        assert call.method == "DELETE"
        assert call.url == f"{API_URL}/onboarding/sessions/sess-1"
