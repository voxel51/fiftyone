import os
import unittest
from unittest.mock import MagicMock, Mock, patch

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
    operator_uri = "operator"
    plugin_secrets = [k for k, v in secrets.items()]

    @pytest.fixture(autouse=False)
    def mock_secrets_resolver(self, mocker):
        mock = MagicMock(spec=fop.PluginSecretsResolver)
        mock.get_secret.side_effect = lambda key, operator: MockSecret(
            key, self.secrets.get(key)
        )
        mock.config_cache = {self.operator_uri: self.plugin_secrets}
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

        assert context.secrets == context._secrets

    def test_secret_property_on_demand_resolve(self, mocker):
        mocker.patch.dict(
            os.environ, {"MY_SECRET_KEY": "mocked_sync_secret_value"}
        )
        context = ExecutionContext(
            operator_uri="operator", required_secrets=["MY_SECRET_KEY"]
        )
        context._secrets = {}
        assert "MY_SECRET_KEY" not in context.secrets.keys()
        secret_val = context.secrets["MY_SECRET_KEY"]
        assert "MY_SECRET_KEY" in context.secrets.keys()
        assert context.secrets["MY_SECRET_KEY"] == "mocked_sync_secret_value"
        assert context.secrets == context._secrets

    @pytest.mark.asyncio
    async def test_resolve_secret_values(self, mocker, mock_secrets_resolver):
        context = ExecutionContext()
        context._secrets_client = mock_secrets_resolver

        await context.resolve_secret_values(keys=[SECRET_KEY, SECRET_KEY2])
        assert context.secrets == context._secrets


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
    @pytest.fixture(autouse=False)
    def secrets_client(self):
        mock_client = MagicMock(spec=fois.EnvSecretProvider)
        mock_client.get.return_value = "mocked_secret_value"
        mock_client.get_sync.return_value = "mocked_sync_secret_value"
        return mock_client

    @pytest.fixture(autouse=False)
    def plugin_secrets_resolver(self):
        resolver = fop.PluginSecretsResolver()
        resolver._registered_secrets = {"operator": ["MY_SECRET_KEY"]}
        return resolver

    @patch(
        "fiftyone.plugins.secrets._get_secrets_client",
        return_value=fois.EnvSecretProvider(),
    )
    @pytest.mark.asyncio
    async def test_get_secret(
        self, secrets_client, plugin_secrets_resolver, patched_get_client
    ):
        result = await plugin_secrets_resolver.get_secret(
            key="MY_SECRET_KEY", operator_uri="operator"
        )

        assert result == "mocked_secret_value"
        secrets_client.get.assert_called_once_with(
            key="MY_SECRET_KEY", operator_uri="operator"
        )


class TestGetSecretSync:
    def test_get_secret_sync(self, mocker):
        mocker.patch.dict(
            os.environ, {"MY_SECRET_KEY": "mocked_sync_secret_value"}
        )

        resolver = fop.PluginSecretsResolver()
        resolver._registered_secrets = {"operator": ["MY_SECRET_KEY"]}

        result = resolver.get_secret_sync(
            key="MY_SECRET_KEY", operator_uri="operator"
        )

        assert "mocked_sync_secret_value" == result

    def test_get_secret_sync_not_in_pd(self, mocker):
        mocker.patch.dict(
            os.environ, {"MY_SECRET_KEY": "mocked_sync_secret_value"}
        )

        resolver = fop.PluginSecretsResolver()
        resolver._registered_secrets = {"operator": ["SOME_OTHER_SECRET_KEY"]}

        result = resolver.get_secret_sync(
            key="MY_SECRET_KEY", operator_uri="operator"
        )

        assert result is None
