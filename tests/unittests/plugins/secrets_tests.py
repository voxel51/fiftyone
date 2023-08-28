# import unittest
# from unittest.mock import MagicMock, patch
# import asynctest
# import pytest
#
# from fiftyone.internal.secrets import ISecret
# from fiftyone.operators.executor import ExecutionContext
# import fiftyone.plugins as fop
# from fiftyone.operators import Operator
#
# from fiftyone.internal import secrets as fois
# from fiftyone.internal.secrets.secret import _get_secrets_client
#
# SECRET_KEY = "MY_SECRET_KEY"
# SECRET_VALUE = "password123"
#
#
# class TestPluginContextSecrets(unittest.TestCase):
#
#
#     def test_resolve_secret_values():
#         ...
#
#
# class MockSecret(ISecret):
#     def __init__(self, key, value):
#         self.key = key
#         self.value = value
#
#
# class TestExecutionContext:
#
#     @pytest.fixture
#     def mock_secrets_resolver(self, mocker):
#         mock = MagicMock(spec=fop.PluginSecretsResolver)
#         mock.get_secret.side_effect = lambda key, **kwargs: MockSecret(key,
#                                                                        f"{key}_value")
#         return mock
#
#     def test_secret(self):
#         context = ExecutionContext()
#         context._secrets = {"my_secret": "my_secret_value"}
#
#         result = context.secret("my_secret")
#
#         assert result == "my_secret_value"
#
#     def test_secret_non_existing_key(self):
#         context = ExecutionContext()
#         context._secrets = {"my_secret": "my_secret_value"}
#
#         result = context.secret("non_existing_secret")
#
#         assert result is None
#
#     def test_secrets_property(self):
#         context = ExecutionContext()
#         context._secrets = {"secret1": "value1", "secret2": "value2"}
#
#         assert context.secrets == {"secret1": "value1", "secret2": "value2"}
#
#     @pytest.mark.asyncio
#     async def test_resolve_secret_values(self, mocker, mock_secrets_resolver):
#         context = ExecutionContext()
#         context._secrets_client = mock_secrets_resolver
#
#         await context.resolve_secret_values(["key1", "key2"], user="user",
#                                             password="pass")
#
#         assert context.secrets == {"key1": "key1_value", "key2": "key2_value"}
#
#
# if __name__ == '__main__':
#     pytest.main()
#
#
# class PluginContextTests(unittest.TestCase):
#     def test_add_secrets():
#         ...
#
#
# class TestOperatorMethods(unittest.TestCase):
#
#     def test_operator_init(self):
#         operator = Operator()
#
#         self.assertFalse(operator._builtin)
#         self.assertIsNone(operator._plugin_secrets)
#         self.assertIsNone(operator.plugin_name)
#         self.assertIsNotNone(operator.definition)
#         self.assertIsNotNone(operator.definition.inputs)
#         self.assertIsNotNone(operator.definition.outputs)
#
#     def test_operator_add_secrets(self):
#         operator = Operator()
#         secrets = ["secret1", "secret2"]
#
#         operator.add_secrets(secrets)
#
#         self.assertIsNotNone(operator._plugin_secrets)
#         self.assertListEqual(operator._plugin_secrets, secrets)
#
#
# class PluginSecretResolverTests(unittest.TestCase):
#     @pytest.fixture
#     def mock_secrets_client(mocker):
#         # Create a mock for SecretsManager
#         mock_secrets_manager = MagicMock()
#
#         # Create a mock for EnvSecretProvider
#         mock_env_secret_provider = MagicMock()
#
#         # Patch the module to return the appropriate mock based on the
#         # attribute accessed
#         mocker.patch.object(fois, "SecretsManager",
#                             return_value=mock_secrets_manager)
#         mocker.patch.object(fois, "EnvSecretProvider",
#                             return_value=mock_env_secret_provider)
#
#         return mock_secrets_manager, mock_env_secret_provider
#
#     # @patch("fiftyone.internal.secrets.EnvSecretProvider")
#     def test_get_secrets_client_secrets_manager(mock_secrets_client):
#         mock_secrets_manager, _ = mock_secrets_client
#         client = _get_secrets_client()
#
#         assert client == mock_secrets_manager()
#
#     def test_get_secrets_client_env_secret_provider(mock_secrets_client):
#         _, mock_env_secret_provider = mock_secrets_client
#         client = fois._get_secrets_client()
#
#         assert client == mock_env_secret_provider()
#
#     def test_get_secret():
#         ...
#
#
# class TestSecretMethods(asynctest.TestCase):
#     @pytest.fixture(autouse=True)
#     def plugin_secrets_resolver(self, mock_client):
#         self.plugin_secrets_resolver = fop.PluginSecretsResolver()
#         mock_client.get.return_value = "mocked_secret_value"
#
#     async def test_get_secret(self):
#
#         mock_client = MagicMock(spec=fois.ISecretProvider)
#         mock_client.get.return_value = "mocked_secret_value"
#
#         resolver = MagicMock(spec=fop.PluginSecretsResolver)
#         resolver.client.return_value = mock_client
#
#         # Call the method with a key
#         result = await resolver.get_secret("my_secret_key")
#
#         # Assert the result is the mocked secret value
#         self.assertEqual(result, "mocked_secret_value")
#
#         # Assert that the secrets client's get method was called with the
#         # correct arguments
#         mock_client.get.assert_called_once_with("my_secret_key")
#     #
#     # async def test_get_secret_with_additional_kwargs(self):
#     #     # Similar to the previous test, but passing additional keyword
#     #     # arguments
#     #     mock_client = MagicMock()
#     #     mock_client.get.return_value = "mocked_secret_value"
#     #
#     #     secret_instance = YourSecretClass(client=mock_client)
#     #
#     #     result = await secret_instance.get_secret("my_secret_key",
#     #                                               user="username",
#     #                                               password="password")
#     #
#     #     self.assertEqual(result, "mocked_secret_value")
#     #     mock_client.get.assert_called_once_with("my_secret_key",
#     #                                             user="username",
#     #                                             password="password")
#
#
# import os
#
#
# def check_environment_variable(variable_name):
#     return os.environ.get(variable_name)
#
#
# def test_check_environment_variable_with_existing_variable(mocker):
#     # Mock os.environ to return a predefined value
#     mocker.patch.dict(os.environ, {"MY_VARIABLE": "my_value"})
#
#     result = check_environment_variable("MY_VARIABLE")
#
#     assert result == "my_value"
#
#
# def test_check_environment_variable_with_non_existing_variable(mocker):
#     # Mock os.environ to return None for the variable
#     mocker.patch.dict(os.environ, {})
#
#     result = check_environment_variable("NON_EXISTING_VARIABLE")
#
#     assert result is None
