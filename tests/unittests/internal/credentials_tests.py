"""
FiftyOne Teams internal cloud credential management tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import pytest
from unittest import mock

from cryptography.fernet import Fernet

from fiftyone.core.storage import FileSystem
from fiftyone.internal import credentials

CREDENTIAL_DATA = [
    {
        "creds": {"access-key-id": "blah", "secret-access-key": "bloh"},
        "prefixes": ["hello"],
        "provider": "AWS",
    },
    {
        "creds": {"access-key-id": "scoop", "secret-access-key": "doop"},
        "prefixes": ["s3://hello-there"],
        "provider": "AWS",
    },
    {
        "creds": {"access-key-id": "bloop", "secret-access-key": "blip"},
        "prefixes": ["r'hello-.*"],
        "provider": "AWS",
    },
    {
        "creds": {"account-name": "azure-me", "aliases": ["az"]},
        "prefixes": ["r'az://\\w+"],
        "provider": "AZURE",
    },
]
DEFAULT_CREDENTIAL_DATA = {
    "AWS": {"access-key-id": "blap", "secret-access-key": "zorp"}
}
ENCRYPTION_KEY = "'Ra_32QZcYDKDd75a56lUy5rNffhvbjps36gPdHOqMjE='"


@pytest.fixture(name="manager", scope="module")
def manager_fixture():
    with mock.patch.object(
        credentials.foo, "get_cloud_credentials"
    ) as get_cloud_credentials_mock:
        fernet = Fernet(ENCRYPTION_KEY)
        creds = [
            {
                "provider": c["provider"],
                "prefixes": c["prefixes"],
                "credentials": fernet.encrypt(json.dumps(c["creds"]).encode()),
            }
            for c in CREDENTIAL_DATA
        ]
        creds += [
            {
                "provider": key,
                "prefixes": [],
                "credentials": fernet.encrypt(json.dumps(c).encode()),
            }
            for key, c in DEFAULT_CREDENTIAL_DATA.items()
        ]
        get_cloud_credentials_mock.return_value = creds
        return credentials.CloudCredentialsManager(ENCRYPTION_KEY)


def _make_default_creds_path(manager, provider):
    return manager._make_creds_path(
        {
            "provider": provider,
            "prefixes": [],
            "creds": DEFAULT_CREDENTIAL_DATA[provider],
        }
    )


class TestCredentialsManager:
    def test_has_default(self, manager):
        assert manager.has_default_credentials(FileSystem.S3)
        assert not manager.has_default_credentials(FileSystem.AZURE)

    def test_has_bucket_credentials(self, manager):
        assert manager.has_bucket_credentials(FileSystem.S3, "hello")
        assert manager.has_bucket_credentials(FileSystem.S3, "hello-world")
        assert manager.has_bucket_credentials(FileSystem.S3, "hello--")
        assert manager.has_bucket_credentials(
            FileSystem.S3, "s3://hello-there"
        )
        assert not manager.has_bucket_credentials(FileSystem.S3, "s3://hello")
        assert manager.has_bucket_credentials(
            FileSystem.AZURE, "az://container1"
        )
        assert not manager.has_bucket_credentials(
            FileSystem.AZURE, "az://container@1"
        )

    def test_get_file_systems_with_credentials(self, manager):
        assert set(manager.get_file_systems_with_credentials()) == {
            "s3",
            "azure",
        }

    def test_get_buckets_with_credentials(self, manager):
        assert set(manager.get_buckets_with_credentials(FileSystem.S3)) == {
            "hello",
            "s3://hello-there",
        }
        assert manager.get_buckets_with_credentials(FileSystem.AZURE) == []

    def test_get_credentials(self, manager):
        # Exact match
        creds_path = manager.get_credentials(FileSystem.S3, "hello")
        assert creds_path == manager._make_creds_path(CREDENTIAL_DATA[0])

        creds_path = manager.get_credentials(FileSystem.S3, "s3://hello-there")
        assert creds_path == manager._make_creds_path(CREDENTIAL_DATA[1])

        # Regex match
        creds_path = manager.get_credentials(FileSystem.S3, "hello-blah")
        assert creds_path == manager._make_creds_path(CREDENTIAL_DATA[2])

        creds_path = manager.get_credentials(FileSystem.S3, "hello--")
        assert creds_path == manager._make_creds_path(CREDENTIAL_DATA[2])

        # No match
        creds_path = manager.get_credentials(FileSystem.S3, "not-matching")
        assert creds_path == _make_default_creds_path(manager, "AWS")

        creds_path = manager.get_credentials(FileSystem.AZURE, "not-matching")
        assert creds_path is None

        # Default case
        creds_path = manager.get_credentials(FileSystem.S3)
        assert creds_path == _make_default_creds_path(manager, "AWS")

        # Azure match
        creds_path = manager.get_credentials(
            FileSystem.AZURE, "az://container1"
        )
        assert creds_path == manager._make_creds_path(CREDENTIAL_DATA[3])

    def test_get_all_credentials_for_file_system(self, manager):
        assert set(
            manager.get_all_credentials_for_file_system(FileSystem.S3)
        ) == set(
            [manager._make_creds_path(c) for c in CREDENTIAL_DATA[:3]]
            + [_make_default_creds_path(manager, "AWS")]
        )

        assert manager.get_all_credentials_for_file_system(
            FileSystem.AZURE
        ) == [manager._make_creds_path(CREDENTIAL_DATA[3])]
