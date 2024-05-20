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
        "prefixes": [
            "hello",
            "hallo",
            "weird[bucket*",
            "he?llo",
            "*secretphrase*",
        ],
        "provider": "AWS",
    },
    {
        "creds": {"access-key-id": "scoop", "secret-access-key": "doop"},
        "prefixes": ["s3://hello-there"],
        "provider": "AWS",
    },
    {
        "creds": {"access-key-id": "bloop", "secret-access-key": "blip"},
        "prefixes": ["hello-*"],
        "provider": "AWS",
    },
    {
        "creds": {"account-name": "azure-me", "aliases": ["az"]},
        "prefixes": ["http://foo.azure.com/container*"],
        "provider": "AZURE",
    },
    {
        "creds": {"account-name": "azure-me", "aliases": ["az"]},
        "prefixes": ["http://bar.azure.com/container*"],
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


def _test_creds_path(manager, fs, bucket, expected_cred_idx):
    creds_path = manager.get_credentials(fs, bucket)
    assert creds_path == manager._make_creds_path(
        CREDENTIAL_DATA[expected_cred_idx]
    )


def _test_default_creds(manager, fs, provider, bucket):
    creds_path = manager.get_credentials(fs, bucket)
    assert creds_path == _make_default_creds_path(manager, provider)


class TestCredentialsManager:
    def test_has_default(self, manager):
        assert manager.has_default_credentials(FileSystem.S3)
        assert not manager.has_default_credentials(FileSystem.AZURE)

    def test_has_bucket_credentials(self, manager):
        assert manager.has_bucket_credentials(FileSystem.S3, "hello")
        assert manager.has_bucket_credentials(FileSystem.S3, "hallo")
        assert manager.has_bucket_credentials(FileSystem.S3, "heyllo")
        assert manager.has_bucket_credentials(FileSystem.S3, "weird[bucket")
        assert manager.has_bucket_credentials(
            FileSystem.S3, "innocuous-secretphrase-bucket"
        )
        assert manager.has_bucket_credentials(FileSystem.S3, "hello-world")
        assert manager.has_bucket_credentials(FileSystem.S3, "hello--")
        assert manager.has_bucket_credentials(
            FileSystem.S3, "s3://hello-there"
        )
        assert not manager.has_bucket_credentials(FileSystem.S3, "s3://hello")
        assert manager.has_bucket_credentials(
            FileSystem.AZURE, "http://foo.azure.com/container"
        )
        assert manager.has_bucket_credentials(
            FileSystem.AZURE, "http://foo.azure.com/container1"
        )
        assert manager.has_bucket_credentials(
            FileSystem.AZURE, "http://bar.azure.com/container"
        )
        assert manager.has_bucket_credentials(
            FileSystem.AZURE, "http://bar.azure.com/container1"
        )

    def test_get_file_systems_with_credentials(self, manager):
        assert set(manager.get_file_systems_with_credentials()) == {
            "s3",
            "azure",
        }

    def test_get_buckets_with_credentials(self, manager):
        assert set(manager.get_buckets_with_credentials(FileSystem.S3)) == {
            "hello",
            "hallo",
            "s3://hello-there",
        }
        assert manager.get_buckets_with_credentials(FileSystem.AZURE) == []

    def test_get_credentials(self, manager):
        # Exact match
        _test_creds_path(manager, FileSystem.S3, "hello", 0)
        _test_creds_path(manager, FileSystem.S3, "hallo", 0)
        _test_creds_path(manager, FileSystem.S3, "heyllo", 0)
        _test_creds_path(manager, FileSystem.S3, "weird[bucket", 0)
        _test_creds_path(
            manager, FileSystem.S3, "innocuous-secretphrase-bucket", 0
        )
        _test_creds_path(manager, FileSystem.S3, "s3://hello-there", 1)

        # Regex match
        _test_creds_path(manager, FileSystem.S3, "hello-blah", 2)
        _test_creds_path(manager, FileSystem.S3, "hello--", 2)

        # No match
        _test_default_creds(manager, FileSystem.S3, "AWS", "not-matching")

        creds_path = manager.get_credentials(FileSystem.AZURE, "not-matching")
        assert creds_path is None

        # Default case
        _test_default_creds(manager, FileSystem.S3, "AWS", None)

        # Azure match
        _test_creds_path(
            manager, FileSystem.AZURE, "http://foo.azure.com/container1", 3
        )
        _test_creds_path(
            manager, FileSystem.AZURE, "http://bar.azure.com/container1", 4
        )

    def test_get_all_credentials_for_file_system(self, manager):
        assert set(
            manager.get_all_credentials_for_file_system(FileSystem.S3)
        ) == set(
            [manager._make_creds_path(c) for c in CREDENTIAL_DATA[:3]]
            + [_make_default_creds_path(manager, "AWS")]
        )

        assert set(
            manager.get_all_credentials_for_file_system(FileSystem.AZURE)
        ) == set([manager._make_creds_path(c) for c in CREDENTIAL_DATA[3:]])
