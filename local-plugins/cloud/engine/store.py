"""
Direct-to-store media upload under the session's vended credential. Media
never proxies through the API. Providers hide behind ``StoreClient`` so a
second cloud is a new implementation, not a mode flag.
"""

import abc
import urllib.parse
from enum import Enum
from typing import Callable

from .errors import CloudError, CloudUnavailableError, CredentialExpiredError
from .session import UploadSession
from .transport import Http

UPLOAD_TIMEOUT_SECONDS = 600.0


class StoreProvider(str, Enum):
    GCS = "gcs"


class StoreClient(abc.ABC):
    """Puts one local file at one object key under the session prefix."""

    @abc.abstractmethod
    def put(self, local_path: str, object_key: str) -> None:
        """Uploads the file, raising ``CredentialExpiredError`` when the
        vended credential has lapsed so the caller can renew and retry."""


class NullStoreClient(StoreClient):
    """The no-store dev posture: the session vended no credential, so media
    bytes stay local and only metadata moves."""

    def put(self, local_path: str, object_key: str) -> None:
        return None


class GcsStoreClient(StoreClient):
    """Uploads via the GCS JSON API under the downscoped bearer token.

    The token is read through a supplier on every request, so a mid-push
    renewal takes effect without rebuilding the client.
    """

    def __init__(
        self, bucket: str, token_supplier: Callable[[], str], http: Http
    ):
        self.__bucket = bucket
        self.__token_supplier = token_supplier
        self.__http = http

    def put(self, local_path: str, object_key: str) -> None:
        url = (
            "https://storage.googleapis.com/upload/storage/v1/b/"
            f"{urllib.parse.quote(self.__bucket, safe='')}/o"
        )
        with open(local_path, "rb") as handle:
            reply = self.__http.request(
                "POST",
                url,
                headers={"Authorization": f"Bearer {self.__token_supplier()}"},
                params={"uploadType": "media", "name": object_key},
                data=handle,
                timeout=UPLOAD_TIMEOUT_SECONDS,
            )

        if reply.status in (200, 201):
            return
        if reply.status == 401:
            raise CredentialExpiredError("The store credential has expired.")
        if reply.status == 403:
            raise CloudError(
                f"The store refused the upload of {object_key!r}: "
                f"{reply.error_message()}"
            )
        raise CloudUnavailableError(
            f"upload of {object_key!r} failed: {reply.error_message()}"
        )


def store_client_for(
    session: UploadSession, token_supplier: Callable[[], str], http: Http
) -> StoreClient:
    """Selects the store implementation the session's credential calls for."""
    if session.credential is None or not session.store_root:
        return NullStoreClient()

    if session.credential.provider == StoreProvider.GCS:
        bucket = session.store_root.removeprefix("gs://").strip("/")
        if not bucket:
            raise CloudError(f"unusable store root {session.store_root!r}")
        return GcsStoreClient(bucket, token_supplier, http)

    raise CloudError(
        f"unsupported store provider {session.credential.provider!r}"
    )
