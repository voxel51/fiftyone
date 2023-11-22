"""
FiftyOne plugin secrets unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import pytest
import unittest
from unittest.mock import MagicMock, patch

from fiftyone.internal.secrets import UnencryptedSecret, EnvSecretProvider
from fiftyone.operators import Operator, OperatorConfig
from fiftyone.operators.executor import ExecutionContext
from fiftyone.plugins.secrets import PluginSecretsResolver


SECRET_KEY1 = "MY_SECRET_KEY1"
SECRET_KEY2 = "MY_SECRET_KEY2"
SECRET_VALUE1 = "password123"
SECRET_VALUE2 = "another password123"


class MockSecret(UnencryptedSecret):
    pass


class MockOperator(Operator):
    @property
    def config(self):
        return OperatorConfig(name="mock_operator")


class TestExecutionContext:
    @pytest.fixture
    def secrets(self):
        return {SECRET_KEY1: SECRET_VALUE1, SECRET_KEY2: SECRET_VALUE2}

    @pytest.fixture
    def operator(self):
        operator = MockOperator()
        operator.register_secrets([SECRET_KEY1, SECRET_KEY2])
        return operator

    @pytest.fixture
    def secrets_resolver(self, secrets, operator):
        mock = MagicMock(spec=PluginSecretsResolver)
        mock.get_secret.side_effect = lambda key, operator: MockSecret(
            key, secrets.get(key)
        )
        mock.config_cache = {operator.uri: operator.secrets}
        return mock

    def test_secret(self, operator):
        context = ExecutionContext(operator=operator)
        context._secrets_dict = {SECRET_KEY1: SECRET_VALUE1}

        result = context.secrets[SECRET_KEY1]

        assert result == SECRET_VALUE1

    def test_secret_non_existing_key(self, operator):
        context = ExecutionContext(operator=operator)
        context._secrets_dict = {SECRET_KEY1: SECRET_VALUE1}

        result = context.secrets["NON_EXISTENT_SECRET"]

        assert result is None

    def test_secrets_property(self, operator):
        context = ExecutionContext(operator=operator)
        context._secrets_dict = {
            SECRET_KEY1: SECRET_VALUE1,
            SECRET_KEY2: SECRET_VALUE2,
        }

        assert dict(context.secrets) == context._secrets_dict

    @pytest.mark.asyncio
    async def test_resolve_secret_values(self, operator, secrets_resolver):
        context = ExecutionContext(operator=operator)
        context._secrets_client = secrets_resolver

        await context.resolve_secret_values()

        assert dict(context.secrets) == context._secrets_dict


class TestOperatorSecrets:
    def test_operator_register_secrets(self):
        op = MockOperator()
        secrets = [SECRET_KEY1, SECRET_KEY2]

        assert not op.has_secrets
        assert op.secrets is None

        op.register_secrets(secrets)

        assert op.has_secrets
        assert op.secrets == secrets


class TestPluginSecretResolver:
    @pytest.fixture
    def plugin_secrets_resolver(self, mocker):
        resolver = PluginSecretsResolver()
        resolver._registered_secrets = {"operator": ["MY_SECRET_KEY"]}
        return resolver

    @patch(
        "fiftyone.plugins.secrets._get_secrets_client",
        return_value=EnvSecretProvider(),
    )
    def test_get_secrets_provider_client(self, _):
        resolver = PluginSecretsResolver()
        assert isinstance(resolver.client, EnvSecretProvider)

    @pytest.mark.asyncio
    async def test_get_secret(self, mocker, plugin_secrets_resolver):
        mocker.patch.dict(os.environ, {"MY_SECRET_KEY": "mocked_secret_value"})

        result = await plugin_secrets_resolver.get_secret(
            key="MY_SECRET_KEY", operator_uri="operator"
        )

        assert result == "mocked_secret_value"

        result = await plugin_secrets_resolver.get_secret(
            key="SOME_OTHER_SECRET_KEY", operator_uri="operator"
        )

        assert result is None

    def test_get_secret_sync(self, mocker, plugin_secrets_resolver):
        mocker.patch.dict(os.environ, {"MY_SECRET_KEY": "mocked_secret_value"})

        result = plugin_secrets_resolver.get_secret_sync(
            key="MY_SECRET_KEY", operator_uri="operator"
        )

        assert result == "mocked_secret_value"

        result = plugin_secrets_resolver.get_secret_sync(
            key="SOME_OTHER_SECRET_KEY", operator_uri="operator"
        )

        assert result is None
