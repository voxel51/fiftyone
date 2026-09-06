import os
from dataclasses import dataclass, field
from typing import Any, List, Optional

import pytest
from conftest import FakeResponse, FakeSession
from engine import (
    BatchLimits,
    CloudProfile,
    CloseOutcome,
    IngestOutcome,
    ManifestSummary,
    PushStateStore,
    Pusher,
    RefusedError,
    UploadSession,
    VendedCredential,
)
from engine import flows
from engine.manifest import MediaEntry, PushPlan
from engine.push import PushState, _batch
from engine.transport import Http

API_URL = "https://api.example.com"
PREFIX = "org-1/dataset-uuid-1/"
LIMITS = BatchLimits(max_batch_bytes=10_000_000, max_batch_samples=1000)


def upload_session(store_root="", token=None):
    credential = (
        VendedCredential(provider="gcs", token=token, expires_at=None)
        if token
        else None
    )
    return UploadSession(
        session_id="sess-1",
        dataset_uuid="uuid-1",
        prefix=PREFIX,
        store_root=store_root,
        credential=credential,
        session_expires_at=None,
        limits=LIMITS,
    )


@dataclass
class FakeOnboardingClient:
    session: UploadSession
    renew_token: str = "fresh"
    renew_error: Optional[Exception] = None
    close_outcome: CloseOutcome = CloseOutcome(
        dataset="quickstart", samples=2, manifest_files=2, shortfall=0
    )
    created: List[str] = field(default_factory=list)
    declared_entries: List[Any] = field(default_factory=list)
    ingest_calls: List[dict] = field(default_factory=list)
    renew_count: int = 0

    def create_session(
        self, dataset_name, manifest: ManifestSummary, entries=None, **kwargs
    ):
        self.created.append(dataset_name)
        self.declared_entries = list(entries or [])
        return self.session

    def renew(self, session_id):
        self.renew_count += 1
        if self.renew_error is not None:
            raise self.renew_error
        return VendedCredential(
            provider="gcs", token=self.renew_token, expires_at=None
        )

    def ingest(self, session_id, samples, filepath_map, **kwargs):
        self.ingest_calls.append(
            {
                "session_id": session_id,
                "samples": samples,
                "filepath_map": filepath_map,
            }
        )
        return IngestOutcome(accepted=len(samples), rejected=[])

    def close(self, session_id):
        return self.close_outcome


def plan_for(tmp_path, count=2):
    media = []
    docs = []
    for index in range(count):
        path = os.path.join(str(tmp_path), f"img{index}.jpg")
        with open(path, "wb") as handle:
            handle.write(b"123")
        media.append(
            MediaEntry(
                local_path=path, dest_key=f"media/img{index}.jpg", size_bytes=3
            )
        )
        docs.append({"filepath": path})
    return PushPlan(sample_docs=docs, media=media)


def state_store(tmp_path):
    return PushStateStore(
        API_URL, "quickstart", state_dir=str(tmp_path / "state")
    )


class TestPush:
    def test_a_fresh_no_store_push_runs_the_full_sequence(self, tmp_path):
        client = FakeOnboardingClient(upload_session())
        store = state_store(tmp_path)
        plan = plan_for(tmp_path)

        outcome = Pusher(client, Http(), store).push("quickstart", plan)

        assert client.created == ["quickstart"]
        assert len(client.ingest_calls) == 1
        ingest = client.ingest_calls[0]
        assert ingest["session_id"] == "sess-1"
        assert all(
            destination.startswith(PREFIX)
            for destination in ingest["filepath_map"].values()
        )
        assert outcome.samples == 2
        assert outcome.uploaded == 2
        assert store.load() is None

    def test_batches_respect_the_sample_cap(self, tmp_path):
        client = FakeOnboardingClient(
            UploadSession(
                session_id="sess-1",
                dataset_uuid="uuid-1",
                prefix=PREFIX,
                store_root="",
                credential=None,
                session_expires_at=None,
                limits=BatchLimits(
                    max_batch_bytes=10_000_000, max_batch_samples=2
                ),
            )
        )
        store = state_store(tmp_path)
        plan = plan_for(tmp_path, count=5)

        Pusher(client, Http(), store).push("quickstart", plan)

        sizes = [len(call["samples"]) for call in client.ingest_calls]
        assert sizes == [2, 2, 1]
        for call in client.ingest_calls:
            assert set(call["filepath_map"].keys()) == {
                doc["filepath"] for doc in call["samples"]
            }

    def test_resume_skips_media_that_already_landed(self, tmp_path):
        client = FakeOnboardingClient(upload_session())
        store = state_store(tmp_path)
        plan = plan_for(tmp_path)
        store.save(
            PushState(
                session_id="sess-1",
                prefix=PREFIX,
                store_root="",
                limits=LIMITS,
                uploaded_keys=[plan.media[0].dest_key],
            )
        )

        outcome = Pusher(client, Http(), store).push("quickstart", plan)

        assert client.created == []
        assert outcome.skipped_uploads == 1
        assert outcome.uploaded == 1

    def test_a_refused_renewal_discards_the_stale_session(self, tmp_path):
        client = FakeOnboardingClient(
            upload_session(store_root="gs://media-bucket", token="narrow"),
            renew_error=RefusedError("The session is closed."),
        )
        gcs = FakeSession(handler=lambda call: FakeResponse(200, {}))
        store = state_store(tmp_path)
        plan = plan_for(tmp_path)
        store.save(
            PushState(
                session_id="sess-stale",
                prefix=PREFIX,
                store_root="gs://media-bucket",
                limits=LIMITS,
                uploaded_keys=[],
            )
        )

        Pusher(client, Http(session=gcs), store).push("quickstart", plan)

        assert client.renew_count == 1
        assert client.created == ["quickstart"]

    def test_an_expired_credential_renews_once_and_retries(self, tmp_path):
        def gcs_handler(call):
            if call.headers == {"Authorization": "Bearer stale"}:
                return FakeResponse(401, {"error": "expired"})
            return FakeResponse(200, {})

        client = FakeOnboardingClient(
            upload_session(store_root="gs://media-bucket", token="stale")
        )
        gcs = FakeSession(handler=gcs_handler)
        store = state_store(tmp_path)
        plan = plan_for(tmp_path, count=1)

        outcome = Pusher(client, Http(session=gcs), store).push(
            "quickstart", plan
        )

        assert client.renew_count == 1
        assert [call.headers["Authorization"] for call in gcs.calls] == [
            "Bearer stale",
            "Bearer fresh",
        ]
        assert outcome.uploaded == 1

    def test_the_close_reconciliation_reaches_the_outcome(self, tmp_path):
        client = FakeOnboardingClient(upload_session())
        client.close_outcome = CloseOutcome(
            dataset="quickstart", samples=1, manifest_files=2, shortfall=1
        )
        store = state_store(tmp_path)

        outcome = Pusher(client, Http(), store).push(
            "quickstart", plan_for(tmp_path)
        )

        assert outcome.shortfall == 1
        assert outcome.samples == 1


class TestBatching:
    def test_the_byte_cap_splits_batches(self):
        limits = BatchLimits(max_batch_bytes=60, max_batch_samples=100)
        docs = [{"filepath": f"/img{index}.jpg"} for index in range(4)]

        batches = _batch(docs, limits)

        assert all(len(batch) >= 1 for batch in batches)
        assert sum(len(batch) for batch in batches) == 4
        assert len(batches) > 1

    def test_an_oversized_single_doc_still_ships(self):
        limits = BatchLimits(max_batch_bytes=10, max_batch_samples=100)
        docs = [{"filepath": "/a-very-long-filepath-over-the-cap.jpg"}]

        assert _batch(docs, limits) == [docs]


class TestRunPush:
    """``run_push(plan=...)`` — the seam that lets the App show a preview
    built from a scan and then upload without scanning again."""

    def profile(self):
        return CloudProfile(
            api_url=API_URL, auth_url="https://auth", api_key="kid|raw"
        )

    def test_a_supplied_plan_is_used_verbatim(self, tmp_path, monkeypatch):
        plan = plan_for(tmp_path)
        monkeypatch.setattr(
            flows,
            "build_push_plan",
            lambda samples: pytest.fail("the supplied plan must be reused"),
        )
        monkeypatch.setattr(
            flows,
            "OnboardingClient",
            lambda *a, **k: FakeOnboardingClient(upload_session()),
        )
        monkeypatch.setattr(
            flows, "PushStateStore", lambda *a, **k: state_store(tmp_path)
        )

        outcome = flows.run_push(
            self.profile(), "quickstart", [], Http(), plan=plan
        )

        assert outcome.uploaded == 2

    def test_without_a_plan_it_scans_the_samples(self, tmp_path, monkeypatch):
        plan = plan_for(tmp_path)
        scanned = []
        monkeypatch.setattr(
            flows,
            "build_push_plan",
            lambda samples: (scanned.append(samples), plan)[1],
        )
        monkeypatch.setattr(
            flows,
            "OnboardingClient",
            lambda *a, **k: FakeOnboardingClient(upload_session()),
        )
        monkeypatch.setattr(
            flows, "PushStateStore", lambda *a, **k: state_store(tmp_path)
        )
        samples = [object()]

        flows.run_push(self.profile(), "quickstart", samples, Http())

        assert scanned == [samples]
