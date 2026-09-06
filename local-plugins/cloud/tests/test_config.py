import datetime
import os
import stat

import pytest

from engine import CloudProfile, NotPairedError, ProfileStore

EXPIRES = datetime.datetime(2026, 8, 11, tzinfo=datetime.timezone.utc)


def profile():
    return CloudProfile(
        api_url="https://api.example.com",
        auth_url="https://auth.example.com/cas/api",
        api_key="kid|raw",
        key_scope="onboarding",
        key_expires_at=EXPIRES,
    )


class TestProfileStore:
    def test_round_trips_the_profile(self, tmp_path):
        store = ProfileStore(path=str(tmp_path / "cloud.json"))

        store.save(profile())

        assert store.load() == profile()

    def test_the_credential_file_is_owner_only(self, tmp_path):
        store = ProfileStore(path=str(tmp_path / "cloud.json"))

        store.save(profile())

        mode = stat.S_IMODE(os.stat(store.path).st_mode)
        assert mode == 0o600

    def test_require_paired_refuses_without_a_key(self, tmp_path):
        store = ProfileStore(path=str(tmp_path / "cloud.json"))
        with pytest.raises(NotPairedError):
            store.require_paired()

        store.save(profile().without_key())
        with pytest.raises(NotPairedError):
            store.require_paired()

    def test_clear_removes_the_file(self, tmp_path):
        store = ProfileStore(path=str(tmp_path / "cloud.json"))
        store.save(profile())

        store.clear()

        assert store.load() is None
