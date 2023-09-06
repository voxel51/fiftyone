import unittest
from unittest.mock import MagicMock, patch

import pytest

import fiftyone.plugins as fop
from fiftyone.internal import secrets as fois
from fiftyone.internal.secrets import UnencryptedSecret
from fiftyone.operators import Operator
from fiftyone.operators.executor import ExecutionContext

SECRET_KEY = "MY_SECRET_KEY"
SECRET_KEY2 = "MY_SECRET_KEY2"
SECRET_VALUE = "password123"
SECRET_VALUE2 = "another password123"


class MockSecret(UnencryptedSecret):
    def __init__(self, key, value):
        super().__init__(key, value)


class TestExecutionContext:

    secrets = {SECRET_KEY: SECRET_VALUE, SECRET_KEY2: SECRET_VALUE2}

    @pytest.fixture
    def mock_secrets_resolver(self, mocker):
        mock = MagicMock(spec=fop.PluginSecretsResolver)
        mock.get_secret.side_effect = lambda key, **kwargs: MockSecret(
            key, self.secrets.get(key)
        )
        return mock

    def test_secret(self):
        context = ExecutionContext()
        context._secrets = {SECRET_KEY: SECRET_VALUE}

        result = context.secret(SECRET_KEY)

        assert result == SECRET_VALUE

    def test_secret_non_existing_key(self):
        context = ExecutionContext()
        context._secrets = {SECRET_KEY: SECRET_VALUE}

        result = context.secret("NON_EXISTING_SECRET")

        assert result is None

    def test_secrets_property(self):
        context = ExecutionContext()
        context._secrets = {
            SECRET_KEY: SECRET_VALUE,
            SECRET_KEY2: SECRET_VALUE2,
        }

        assert context.secrets == {
            SECRET_KEY: SECRET_VALUE,
            SECRET_KEY2: SECRET_VALUE2,
        }

    @pytest.mark.asyncio
    async def test_resolve_secret_values(self, mocker, mock_secrets_resolver):
        context = ExecutionContext()
        context._secrets_client = mock_secrets_resolver

        await context.resolve_secret_values([SECRET_KEY, SECRET_KEY2])

        assert context.secrets == {
            SECRET_KEY: SECRET_VALUE,
            SECRET_KEY2: SECRET_VALUE2,
        }


class TestOperatorSecrets(unittest.TestCase):
    def test_operator_add_secrets(self):
        operator = Operator()
        secrets = [SECRET_KEY, SECRET_KEY2]

        operator.add_secrets(secrets)

        self.assertIsNotNone(operator._plugin_secrets)
        self.assertListEqual(operator._plugin_secrets, secrets)


class PluginSecretResolverClientTests(unittest.TestCase):
    @patch(
        "fiftyone.plugins.secrets._get_secrets_client",
        return_value=fois.EnvSecretProvider(),
    )
    def test_get_secrets_client_env_secret_provider(self, mocker):
        resolver = fop.PluginSecretsResolver()
        assert isinstance(resolver.client, fois.EnvSecretProvider)


class TestGetSecret(unittest.TestCase):
    @pytest.fixture(autouse=True)
    def plugin_secrets_resolver(self):
        mock_client = MagicMock(spec=fois.ISecretProvider)
        self.plugin_secrets_resolver = fop.PluginSecretsResolver()
        mock_client.get.return_value = "mocked_secret_value"

    @pytest.mark.asyncio
    async def test_get_secret(self):
        mock_client = MagicMock(spec=fois.ISecretProvider)
        mock_client.get.return_value = "mocked_secret_value"

        resolver = MagicMock(spec=fop.PluginSecretsResolver)
        resolver.client.return_value = mock_client

        result = await resolver.get_secret("my_secret_key")

        self.assertEqual(result, "mocked_secret_value")
        mock_client.get.assert_called_once_with("my_secret_key")
