"""
FiftyOne plugin permissions tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from datetime import datetime
from unittest.mock import patch, AsyncMock, Mock

from fiftyone.plugins import permissions

DEFAULT_DATE = "2025-04-11T12:00:00"
MODIFIED_DATE = "2025-04-12T12:00:00"


class TestRemotePluginDefinition(unittest.TestCase):
    def setUp(self):
        self.plugin_json = {
            "name": "@voxel51/my_plugin",
            "enabled": True,
            "modifiedAt": DEFAULT_DATE,
        }
        self.modified_plugin_json = {
            "name": "@voxel51/my_plugin",
            "enabled": False,
            "modifiedAt": MODIFIED_DATE,
        }

    def test_from_json(self):
        plugin = permissions.RemotePluginDefinition.from_json(self.plugin_json)
        self.assertEqual(plugin.name, "@voxel51/my_plugin")
        self.assertTrue(plugin.enabled)
        self.assertEqual(
            plugin.modified_at, datetime.fromisoformat(DEFAULT_DATE)
        )

    def test_fingerprint_returns_hash(self):
        plugin = permissions.RemotePluginDefinition.from_json(self.plugin_json)
        fingerprint = plugin.fingerprint()
        self.assertIsInstance(fingerprint, str)
        self.assertEqual(len(fingerprint), 64)

    def test_modified_plugin_fingerprint(self):
        original_plugin = permissions.RemotePluginDefinition.from_json(
            self.plugin_json
        )
        plugin = permissions.RemotePluginDefinition.from_json(
            self.modified_plugin_json
        )
        original_fingerprint = original_plugin.fingerprint()
        modified_fingerprint = plugin.fingerprint()
        self.assertNotEqual(original_fingerprint, modified_fingerprint)


class TestRemoteOperatorDefinition(unittest.TestCase):
    def setUp(self):
        self.operator_json = {
            "pluginName": "@voxel51/my_plugin",
            "name": "my_operator",
            "uri": "@voxel51/my_plugin/my_operator",
            "enabled": True,
            "permission": "read",
        }

    def test_from_json(self):
        operator = permissions.RemoteOperatorDefinition.from_json(
            self.operator_json
        )
        self.assertEqual(operator.plugin_name, "@voxel51/my_plugin")
        self.assertEqual(operator.name, "my_operator")
        self.assertEqual(operator.uri, "@voxel51/my_plugin/my_operator")
        self.assertTrue(operator.enabled)


class TestManagedPlugins(unittest.TestCase):
    def setUp(self):
        default_date = datetime.fromisoformat(DEFAULT_DATE)
        modified_date = datetime.fromisoformat(MODIFIED_DATE)
        self.plugins = [
            permissions.RemotePluginDefinition(
                "@voxel51/my_plugin_a", True, default_date
            ),
            permissions.RemotePluginDefinition(
                "@voxel51/my_plugin_b", False, default_date
            ),
        ]
        self.modified_plugins = [
            permissions.RemotePluginDefinition(
                "@voxel51/my_plugin_a", True, default_date
            ),
            permissions.RemotePluginDefinition(
                "@voxel51/my_plugin_b", True, modified_date
            ),
        ]
        self.plugins_minus_b = [
            permissions.RemotePluginDefinition(
                "@voxel51/my_plugin_a", True, default_date
            ),
        ]
        self.managed = permissions.ManagedPlugins(self.plugins)
        self.modified_managed = permissions.ManagedPlugins(
            self.modified_plugins
        )
        self.plugins_minus_b_managed = permissions.ManagedPlugins(
            self.plugins_minus_b
        )
        self.empty_managed = permissions.ManagedPlugins([])

    def test_get_plugin_definition_found(self):
        plugin = self.managed.get_plugin_definition("@voxel51/my_plugin_a")
        self.assertIsNotNone(plugin)
        self.assertEqual(plugin.name, "@voxel51/my_plugin_a")

    def test_get_plugin_definition_not_found(self):
        plugin = self.managed.get_plugin_definition("@voxel51/my_plugin_c")
        self.assertIsNone(plugin)

    def test_has_plugin(self):
        self.assertTrue(self.managed.has_plugin("@voxel51/my_plugin_a"))
        self.assertFalse(self.managed.has_plugin("@voxel51/my_plugin_z"))

    def test_has_enabled_plugin(self):
        self.assertTrue(
            self.managed.has_enabled_plugin("@voxel51/my_plugin_a")
        )
        self.assertFalse(
            self.managed.has_enabled_plugin("@voxel51/my_plugin_b")
        )
        self.assertFalse(
            self.managed.has_enabled_plugin("@voxel51/my_plugin_z")
        )

    def test_fingerprint_is_stable(self):
        fingerprint = self.managed.fingerprint()
        self.assertIsInstance(fingerprint, str)
        self.assertEqual(len(fingerprint), 64)

    def test_fingerprint_changes_on_modification(self):
        original_fingerprint = self.managed.fingerprint()
        modified_fingerprint = self.modified_managed.fingerprint()
        self.assertNotEqual(original_fingerprint, modified_fingerprint)

    def test_fingerprint_changes_on_plugin_deletion(self):
        original_fingerprint = self.managed.fingerprint()
        modified_fingerprint = self.plugins_minus_b_managed.fingerprint()
        self.assertNotEqual(original_fingerprint, modified_fingerprint)

    def test_fingerprint_empty(self):
        empty_fingerprint = self.empty_managed.fingerprint()
        self.assertIsInstance(empty_fingerprint, str)
        self.assertEqual(len(empty_fingerprint), 64)
        self.assertNotEqual(self.managed.fingerprint(), empty_fingerprint)

    def test_fingerprint_empty_is_stable(self):
        empty_fingerprint = self.empty_managed.fingerprint()
        empty_managed2 = permissions.ManagedPlugins([])
        empty_fingerprint2 = empty_managed2.fingerprint()
        self.assertEqual(empty_fingerprint, empty_fingerprint2)
        self.assertEqual(
            empty_fingerprint,
            "2e1cfa82b035c26cbbbdae632cea070514eb8b773f616aaeaf668e2f0be8f10d",
        )


class TestManagedOperators(unittest.TestCase):
    def setUp(self):
        self.operators = [
            permissions.RemoteOperatorDefinition(
                "@voxel51/my_plugin_a", "op1", "@voxel51/my_plugin_a/op1", True
            ),
            permissions.RemoteOperatorDefinition(
                "@voxel51/my_plugin_b",
                "op2",
                "@voxel51/my_plugin_b/op2",
                False,
            ),
        ]
        self.managed = permissions.ManagedOperators(self.operators)

    def test_get_operator_definition_found(self):
        op = self.managed.get_operator_definition("@voxel51/my_plugin_a/op1")
        self.assertIsNotNone(op)
        self.assertEqual(op.uri, "@voxel51/my_plugin_a/op1")

    def test_get_operator_definition_not_found(self):
        op = self.managed.get_operator_definition("@voxel51/my_plugin_x/opX")
        self.assertIsNone(op)

    def test_has_operator(self):
        self.assertTrue(self.managed.has_operator("@voxel51/my_plugin_a/op1"))
        self.assertFalse(self.managed.has_operator("@voxel51/my_plugin_b/opX"))


class TestAsyncPluginAndOperatorFetch(unittest.IsolatedAsyncioTestCase):
    @patch(
        "fiftyone.plugins.permissions.get_token_from_request",
        return_value="fake-token",
    )
    @patch(
        "fiftyone.plugins.permissions.get_available_plugins",
        new_callable=AsyncMock,
    )
    async def test_managed_plugins_for_request(self, mock_get_plugins, _):
        mock_get_plugins.return_value = [
            {
                "name": "@voxel51/my_plugin_x",
                "enabled": True,
                "modifiedAt": DEFAULT_DATE,
            }
        ]
        mock_request = Mock()
        managed = await permissions.ManagedPlugins.for_request(mock_request)
        self.assertTrue(managed.has_plugin("@voxel51/my_plugin_x"))

    @patch(
        "fiftyone.plugins.permissions.get_token_from_request",
        return_value="fake-token",
    )
    @patch(
        "fiftyone.plugins.permissions.get_available_operators",
        new_callable=AsyncMock,
    )
    async def test_managed_operators_for_request(self, mock_get_operators, _):
        mock_get_operators.return_value = [
            {
                "pluginName": "@voxel51/my_plugin_x",
                "name": "opX",
                "uri": "@voxel51/my_plugin_x/opX",
                "enabled": True,
            }
        ]
        mock_request = Mock()
        managed = await permissions.ManagedOperators.for_request(mock_request)
        self.assertTrue(managed.has_operator("@voxel51/my_plugin_x/opX"))
