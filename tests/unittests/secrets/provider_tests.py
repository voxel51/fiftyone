import os

import pytest

from fiftyone.internal.secrets import (
    EnvSecretProvider,
    UnencryptedSecret,
    ISecret,
)


class MockUnencryptedSecret(UnencryptedSecret):
    def __init__(self, key, value):
        super().__init__(key, value)


class TestEnvSecretProvider:
    @pytest.mark.asyncio
    async def test_get_existing_secret(self, mocker):
        mocker.patch.dict(os.environ, {"SECRET_KEY": "my_secret_value"})
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
            os.environ, {"KEY1": "value1", "KEY2": "value2", "KEY3": "value3"}
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
        mocker.patch.dict(os.environ, {"KEY1": "value1", "KEY2": "value2"})
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
