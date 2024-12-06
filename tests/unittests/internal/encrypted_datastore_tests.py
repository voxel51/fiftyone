"""
FiftyOne Teams internal encrypted datastore tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import cryptography.exceptions
import cryptography.fernet
import pytest
from unittest import mock

import fiftyone.core.odm as foo
from fiftyone.internal import encrypted_datastore

ENCRYPTION_KEY = "Ra_32QZcYDKDd75a56lUy5rNffhvbjps36gPdHOqMjE="
ENCRYPTION_KEY2 = "WIHh3V73R5Vc2AJKb3tJnqyQv1QARITz20w_PWnIBTk="


class TestEncryptedDatastore:
    def test_roundtrip(self):
        coll = foo.get_db_conn()["encryption_test"]
        datastore = encrypted_datastore.EncryptedDatastore(
            coll, ENCRYPTION_KEY
        )

        test_str = "madam im adam"

        key = datastore.put(test_str)
        result_str = datastore.get(key)
        assert test_str == result_str

        datastore.delete(key)

        with pytest.raises(KeyError):
            datastore.get(key)

    def test_scoped_apikey_store(self):
        with mock.patch.object(
            encrypted_datastore.foiu,
            "get_encryption_key",
            return_value=ENCRYPTION_KEY,
        ):
            coll = foo.get_db_conn()["apikeys.scoped"]
            datastore1 = encrypted_datastore.EncryptedDatastore(
                coll, ENCRYPTION_KEY
            )

            test_str = "madam im adam"
            key = datastore1.put(test_str)

            datastore2 = encrypted_datastore.get_scoped_key_store()
            result_str = datastore2.get(key)
            assert result_str == test_str

    def test_failed_decryption(self):
        coll = foo.get_db_conn()["encryption_test"]
        write_datastore = encrypted_datastore.EncryptedDatastore(
            coll, ENCRYPTION_KEY
        )
        read_datastore = encrypted_datastore.EncryptedDatastore(
            coll, ENCRYPTION_KEY2
        )

        test_str = "madam im adam"
        key = write_datastore.put(test_str)

        # some time later...
        with pytest.raises(
            (
                cryptography.exceptions.InvalidSignature,
                cryptography.fernet.InvalidToken,
            )
        ):
            read_datastore.get(key)
