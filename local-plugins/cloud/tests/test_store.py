import pytest

from conftest import FakeResponse, FakeSession
from engine import (
    CloudError,
    CredentialExpiredError,
    NullStoreClient,
    UploadSession,
    VendedCredential,
    store_client_for,
)
from engine.session import BatchLimits
from engine.store import GcsStoreClient
from engine.transport import Http

LIMITS = BatchLimits(max_batch_bytes=1000, max_batch_samples=10)


def session_with(credential, store_root):
    return UploadSession(
        session_id="sess-1",
        dataset_uuid="uuid-1",
        prefix="org-1/dataset-uuid-1/",
        store_root=store_root,
        credential=credential,
        session_expires_at=None,
        limits=LIMITS,
    )


def gcs_credential(token="narrow"):
    return VendedCredential(provider="gcs", token=token, expires_at=None)


class TestGcsStoreClient:
    def test_uploads_under_the_supplied_bearer_token(self, tmp_path):
        path = tmp_path / "img.jpg"
        path.write_bytes(b"123")
        fake = FakeSession(replies=[FakeResponse(200, {})])
        client = GcsStoreClient(
            "media-bucket", lambda: "narrow", Http(session=fake)
        )

        client.put(str(path), "org-1/dataset-uuid-1/media/img.jpg")

        call = fake.calls[0]
        assert (
            call.url
            == "https://storage.googleapis.com/upload/storage/v1/b/media-bucket/o"
        )
        assert call.params == {
            "uploadType": "media",
            "name": "org-1/dataset-uuid-1/media/img.jpg",
        }
        assert call.headers == {"Authorization": "Bearer narrow"}

    def test_rereads_the_token_supplier_per_request(self, tmp_path):
        path = tmp_path / "img.jpg"
        path.write_bytes(b"123")
        tokens = iter(["first", "second"])
        fake = FakeSession(
            replies=[FakeResponse(200, {}), FakeResponse(200, {})]
        )
        client = GcsStoreClient(
            "media-bucket", lambda: next(tokens), Http(session=fake)
        )

        client.put(str(path), "k1")
        client.put(str(path), "k2")

        assert fake.calls[0].headers == {"Authorization": "Bearer first"}
        assert fake.calls[1].headers == {"Authorization": "Bearer second"}

    def test_a_401_signals_credential_expiry(self, tmp_path):
        path = tmp_path / "img.jpg"
        path.write_bytes(b"123")
        fake = FakeSession(replies=[FakeResponse(401, {"error": "expired"})])
        client = GcsStoreClient(
            "media-bucket", lambda: "stale", Http(session=fake)
        )

        with pytest.raises(CredentialExpiredError):
            client.put(str(path), "k1")


class TestStoreClientSelection:
    def test_no_credential_selects_the_null_store(self):
        client = store_client_for(session_with(None, ""), lambda: "", Http())
        assert isinstance(client, NullStoreClient)

    def test_gcs_store_root_selects_gcs(self):
        client = store_client_for(
            session_with(gcs_credential(), "gs://media-bucket"),
            lambda: "t",
            Http(),
        )
        assert isinstance(client, GcsStoreClient)

    def test_an_unknown_provider_is_an_error(self):
        credential = VendedCredential(
            provider="s3", token="t", expires_at=None
        )
        with pytest.raises(CloudError):
            store_client_for(
                session_with(credential, "s3://bucket"), lambda: "t", Http()
            )
