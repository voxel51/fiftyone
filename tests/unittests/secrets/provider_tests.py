import os
from unittest.mock import MagicMock

import pytest

from fiftyone.internal.secrets import (
    EnvSecretProvider,
    FiftyoneDatabaseSecretProvider,
    UnencryptedSecret,
    EncryptedSecret,
    ISecret,
)


class MockUnencryptedSecret(UnencryptedSecret):
    def __init__(self, key, value):
        super().__init__(key, value)


class MockEncryptedSecret(EncryptedSecret):
    def __init__(self, key, value):
        super().__init__(key, value)


class TestEnvSecretProvider:
    @pytest.mark.asyncio
    async def test_get_existing_secret(self, mocker):
        mocker.patch.dict(
            os.environ, {"SECRET_KEY": "my_secret_value"}, clear=True
        )
        provider = EnvSecretProvider()

        secret = await provider.get("SECRET_KEY")

        assert isinstance(secret, ISecret)
        assert secret.key == "SECRET_KEY"
        assert secret.value == "my_secret_value"

    @pytest.mark.asyncio
    async def test_get_non_existing_secret(self):
        provider = EnvSecretProvider()

        secret = await provider.get("NON_EXISTING_KEY")

        assert secret is None

    @pytest.mark.asyncio
    async def test_get_multiple_secrets_all_existing(self, mocker):
        mocker.patch.dict(
            os.environ,
            {"KEY1": "value1", "KEY2": "value2", "KEY3": "value3"},
            clear=True,
        )
        provider = EnvSecretProvider()

        secrets = await provider.get_multiple(["KEY1", "KEY2", "KEY3"])

        assert "KEY1" in secrets
        assert isinstance(secrets["KEY1"], UnencryptedSecret)
        assert secrets["KEY1"].key == "KEY1"
        assert secrets["KEY1"].value == "value1"

        assert "KEY2" in secrets
        assert isinstance(secrets["KEY2"], UnencryptedSecret)
        assert secrets["KEY2"].key == "KEY2"
        assert secrets["KEY2"].value == "value2"

        assert "KEY3" in secrets
        assert isinstance(secrets["KEY3"], UnencryptedSecret)
        assert secrets["KEY3"].key == "KEY3"
        assert secrets["KEY3"].value == "value3"

    @pytest.mark.asyncio
    async def test_get_multiple_secrets_some_existing(self, mocker):
        mocker.patch.dict(
            os.environ, {"KEY1": "value1", "KEY2": "value2"}, clear=True
        )
        provider = EnvSecretProvider()

        secrets = await provider.get_multiple(["KEY1", "KEY2", "KEY3"])

        assert "KEY1" in secrets
        assert isinstance(secrets["KEY1"], UnencryptedSecret)
        assert secrets["KEY1"].key == "KEY1"
        assert secrets["KEY1"].value == "value1"

        assert "KEY2" in secrets
        assert isinstance(secrets["KEY2"], UnencryptedSecret)
        assert secrets["KEY2"].key == "KEY2"
        assert secrets["KEY2"].value == "value2"

        assert "KEY3" not in secrets

    @pytest.mark.asyncio
    async def test_get_multiple_secrets_empty_list(self):
        provider = EnvSecretProvider()

        secrets = await provider.get_multiple([])

        assert not secrets

    def test_get_sync(self, mocker):
        mocker.patch.dict(os.environ, {"KEY1": "value1"})
        provider = EnvSecretProvider()

        secret = provider.get_sync("KEY1")

        assert secret is not None
        assert secret.value == "value1"

    def test_get_sync_none(self, mocker):
        mocker.patch.dict(os.environ, {"KEY1": "value1"})
        provider = EnvSecretProvider()

        try:
            secret = provider.get_sync("KEY2")
        except:
            pytest.fail("Unresolved secrets should not throw an error")

        assert secret is None

    @pytest.mark.asyncio
    async def test_search(self, mocker):
        mocker.patch.dict(
            os.environ, {"KEY1": "value1", "KEY2": "value2"}, clear=True
        )
        provider = EnvSecretProvider()

        try:
            secrets = await provider.search("KEY")
        except:
            pytest.fail("Unresolved secrets should not throw an error")
        assert set(secrets.keys()) == {"KEY1", "KEY2"}
        assert secrets["KEY1"].value == "value1"
        assert secrets["KEY2"].value == "value2"


class TestFiftyoneDatabaseSecretProvider:
    SECRET_KEY = "SECRET_KEY"
    SECRET_VALUE = SECRET_KEY + "-value"

    SECRET_KEYS = ["KEY" + str(i) for i in range(0, 5, 2)]

    @pytest.fixture
    def mock_provider(self):
        mock = MagicMock(spec=FiftyoneDatabaseSecretProvider)
        mock.get.side_effect = (
            lambda key, **kwargs: MockUnencryptedSecret(
                self.SECRET_KEY, self.SECRET_VALUE
            )
            if key == self.SECRET_KEY
            else None
        )
        mock.get_sync.side_effect = (
            lambda key, **kwargs: MockUnencryptedSecret(
                self.SECRET_KEY, self.SECRET_VALUE
            )
            if key == self.SECRET_KEY
            else None
        )
        mock.get_multiple.side_effect = lambda keys, **kwargs: {
            key: MockUnencryptedSecret(key, "value" + key[-1])
            for key in keys
            if key in self.SECRET_KEYS
        }
        return mock

    @pytest.mark.asyncio
    async def test_get_existing_secret(self, mock_provider):
        secret = await mock_provider.get("SECRET_KEY")

        assert isinstance(secret, ISecret)
        assert secret.key == self.SECRET_KEY
        assert secret.value == self.SECRET_VALUE

    @pytest.mark.asyncio
    async def test_get_non_existing_secret(self, mock_provider):

        secret = await mock_provider.get("NON_EXISTING_KEY")

        assert secret is None

    @pytest.mark.asyncio
    async def test_get_multiple_secrets_all_existing(
        self, mocker, mock_provider
    ):

        secrets = await mock_provider.get_multiple(["KEY0", "KEY2", "KEY4"])

        assert "KEY0" in secrets
        assert isinstance(secrets["KEY0"], UnencryptedSecret)
        assert secrets["KEY0"].key == "KEY0"
        assert secrets["KEY0"].value == "value0"

        assert "KEY2" in secrets
        assert isinstance(secrets["KEY2"], UnencryptedSecret)
        assert secrets["KEY2"].key == "KEY2"
        assert secrets["KEY2"].value == "value2"

        assert "KEY4" in secrets
        assert isinstance(secrets["KEY4"], UnencryptedSecret)
        assert secrets["KEY4"].key == "KEY4"
        assert secrets["KEY4"].value == "value4"

    @pytest.mark.asyncio
    async def test_get_multiple_secrets_some_existing(self, mock_provider):
        secrets = await mock_provider.get_multiple(["KEY1", "KEY2", "KEY3"])

        assert "KEY1" not in secrets

        assert "KEY2" in secrets
        assert isinstance(secrets["KEY2"], UnencryptedSecret)
        assert secrets["KEY2"].key == "KEY2"
        assert secrets["KEY2"].value == "value2"

        assert "KEY3" not in secrets

    @pytest.mark.asyncio
    async def test_get_multiple_secrets_empty_list(self, mock_provider):
        secrets = await mock_provider.get_multiple([])

        assert not secrets

    def test_get_sync(self, mock_provider):
        secret = mock_provider.get_sync("SECRET_KEY")

        assert isinstance(secret, ISecret)
        assert secret.key == self.SECRET_KEY
        assert secret.value == self.SECRET_VALUE

    def test_get_sync_non_existing_secret(self, mock_provider):
        secret = mock_provider.get_sync("UNSET_SECRET_KEY")

        assert secret is None
