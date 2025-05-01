"""
FiftyOne plugin managed module tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
from unittest.mock import MagicMock, patch

from fiftyone.plugins.context import PluginContext
from fiftyone.plugins.managed import (
    cache,
    build_managed_plugin_contexts,
)  # your module under test
from fiftyone.plugins.permissions import ManagedPlugins


class MockManagedPlugins:
    def __init__(self, fingerprint_val):
        self._fingerprint = fingerprint_val

    def fingerprint(self):
        return self._fingerprint


class TestBuildManagedPluginContexts(unittest.TestCase):
    def setUp(self):
        # Reset cache before each test
        cache.clear()

    @patch("fiftyone.plugins.managed.build_plugin_contexts")
    def test_cache_miss_first_call(self, mock_build_plugin_contexts):
        self.assertIsNone(cache.fingerprint)
        self.assertIsNone(cache.contexts)

        # Mock fopc.build_plugin_contexts since it is not the focus of these tests
        mock_contexts = [MagicMock(spec=PluginContext)]
        mock_build_plugin_contexts.return_value = mock_contexts

        managed_plugins = MockManagedPlugins(
            fingerprint_val="mock-fingerprint"
        )
        result = build_managed_plugin_contexts(True, managed_plugins)

        self.assertEqual(result, mock_contexts)
        self.assertEqual(cache.fingerprint, "mock-fingerprint")
        mock_build_plugin_contexts.assert_called_once_with(enabled=True)

    @patch("fiftyone.plugins.context.build_plugin_contexts")
    def test_cache_hit_same_fingerprint(self, mock_build_plugin_contexts):
        # Preload cache manually
        cached_contexts = [MagicMock(spec=PluginContext)]
        cache.fingerprint = "mock-fingerprint"
        cache.contexts = cached_contexts

        # Should skip rebuild
        managed_plugins = MockManagedPlugins(
            fingerprint_val="mock-fingerprint"
        )
        result = build_managed_plugin_contexts(False, managed_plugins)

        self.assertEqual(result, cached_contexts)
        mock_build_plugin_contexts.assert_not_called()

    @patch("fiftyone.plugins.managed.build_plugin_contexts")
    def test_cache_miss_different_fingerprint(
        self, mock_build_plugin_contexts
    ):
        # Preload cache with an old fingerprint
        cache.fingerprint = "mock-fingerprint"
        cache.contexts = [MagicMock(spec=PluginContext)]

        # Simulate a new plugin context
        new_contexts = [MagicMock(spec=PluginContext)]
        mock_build_plugin_contexts.return_value = new_contexts

        managed_plugins = MockManagedPlugins(
            fingerprint_val="mock-fingerprint-new"
        )
        result = build_managed_plugin_contexts(True, managed_plugins)

        self.assertEqual(result, new_contexts)
        self.assertEqual(cache.fingerprint, "mock-fingerprint-new")
        mock_build_plugin_contexts.assert_called_once_with(enabled=True)

    @patch("fiftyone.plugins.managed.build_plugin_contexts")
    def test_empty_fingerprint_and_contexts(self, mock_build_plugin_contexts):
        mock_contexts = []
        mock_build_plugin_contexts.return_value = mock_contexts

        managed_plugins = MockManagedPlugins(
            fingerprint_val="mock-fingerprint"
        )
        result = build_managed_plugin_contexts(True, managed_plugins)

        self.assertEqual(result, mock_contexts)
        self.assertEqual(cache.fingerprint, managed_plugins.fingerprint())
        mock_build_plugin_contexts.assert_called_once_with(enabled=True)

    @patch("fiftyone.plugins.managed.build_plugin_contexts")
    def test_integration_with_managed_plugins(
        self, mock_build_plugin_contexts
    ):
        # Simulate a plugin context being built
        mock_contexts = [MagicMock(spec=PluginContext)]
        mock_build_plugin_contexts.return_value = mock_contexts

        managed_plugins = ManagedPlugins.from_json(
            [
                {
                    "name": "@voxel51/my_plugin_x",
                    "enabled": True,
                    "modifiedAt": "2025-04-11T12:00:00",
                },
            ]
        )
        result = build_managed_plugin_contexts(True, managed_plugins)

        self.assertEqual(result, mock_contexts)
        self.assertEqual(cache.fingerprint, managed_plugins.fingerprint())
        self.assertEqual(
            cache.fingerprint,
            "531efa5bddd4d8871423b67aafe99e103bd0aafc513193006875e480d517aa60",
        )
        mock_build_plugin_contexts.assert_called_once_with(enabled=True)
