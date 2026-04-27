import unittest
from unittest.mock import MagicMock, patch

from fiftyone.operators import Panel
from fiftyone.operators.registry import (
    OperatorRegistry,
    get_current_registry,
    reset_plugin_index_cache,
    set_plugin_index_signature_provider,
    use_registry,
)


def _make_plugin_def(name, operators):
    pd = MagicMock()
    pd.name = name
    pd.operators = list(operators)
    return pd


def _make_operator_instance(uri, builtin=False, panel=False):
    spec = Panel if panel else object
    op = MagicMock(spec=spec)
    op._builtin = builtin
    op.uri = uri
    return op


class TestOperatorRegistry(unittest.TestCase):
    def setUp(self):
        # The plugin index cache is process-wide; clear it so previous
        # tests' mocked listings don't leak in
        reset_plugin_index_cache()
        self.addCleanup(reset_plugin_index_cache)

        # Two plugins, four operators total. The registry will look these up
        # via fop.list_plugins() (cheap metadata) and instantiate plugin
        # contexts lazily through fopc.get_plugin_context(name).
        self.plugin_defs = [
            _make_plugin_def("plugin_a", ["op1", "op2"]),
            _make_plugin_def("plugin_b", ["op3", "op4"]),
        ]

        contexts = {
            "plugin_a": MagicMock(
                instances=[
                    _make_operator_instance(
                        "plugin_a/op1", builtin=True, panel=True
                    ),
                    _make_operator_instance(
                        "plugin_a/op2", builtin=False, panel=False
                    ),
                ],
                errors=[],
            ),
            "plugin_b": MagicMock(
                instances=[
                    _make_operator_instance(
                        "plugin_b/op3", builtin=True, panel=False
                    ),
                    _make_operator_instance(
                        "plugin_b/op4", builtin=False, panel=True
                    ),
                ],
                errors=[],
            ),
        }
        self.contexts = contexts

        list_patch = patch(
            "fiftyone.operators.registry.fop.list_plugins",
            return_value=self.plugin_defs,
        )
        ctx_patch = patch(
            "fiftyone.operators.registry.fopc.get_plugin_context",
            side_effect=lambda name: contexts[name],
        )
        self.list_mock = list_patch.start()
        self.get_ctx_mock = ctx_patch.start()
        self.addCleanup(list_patch.stop)
        self.addCleanup(ctx_patch.stop)

        # Bypass the cache for this construction so each test sees the
        # mocked listing rather than a cached one
        self.registry = OperatorRegistry(index_signature=None)

    def test_construction_does_not_register(self):
        # Constructing a registry must NOT exec any plugin code
        self.assertEqual(self.get_ctx_mock.call_count, 0)

    def test_operator_exists_registers_only_owning_plugin(self):
        self.assertTrue(self.registry.operator_exists("plugin_a/op1"))
        self.get_ctx_mock.assert_called_once_with("plugin_a")

        # A second call for any operator on the same plugin must be a cache
        # hit -- no additional registration
        self.assertTrue(self.registry.operator_exists("plugin_a/op2"))
        self.assertEqual(self.get_ctx_mock.call_count, 1)

        # An operator on the other plugin triggers exactly one more
        self.assertTrue(self.registry.operator_exists("plugin_b/op3"))
        self.assertEqual(self.get_ctx_mock.call_count, 2)

    def test_get_operator_then_exists_no_duplicate_register(self):
        op = self.registry.get_operator("plugin_a/op1")
        self.assertIs(op, self.contexts["plugin_a"].instances[0])
        self.assertEqual(self.get_ctx_mock.call_count, 1)

        # operator_exists for the same plugin reuses the cached context
        self.assertTrue(self.registry.operator_exists("plugin_a/op2"))
        self.assertEqual(self.get_ctx_mock.call_count, 1)

    def test_unknown_operator(self):
        self.assertFalse(self.registry.operator_exists("plugin_a/missing"))
        self.assertIsNone(self.registry.get_operator("plugin_a/missing"))

    def test_list_all_operators(self):
        operators = self.registry.list_operators()
        self.assertEqual(len(operators), 4)
        # list_operators MUST register all plugins, but only once each
        self.assertEqual(self.get_ctx_mock.call_count, 2)

        # A second call is fully cached
        operators = self.registry.list_operators()
        self.assertEqual(len(operators), 4)
        self.assertEqual(self.get_ctx_mock.call_count, 2)

    def test_list_builtin_operators(self):
        operators = self.registry.list_operators(builtin=True)
        self.assertTrue(all(op._builtin for op in operators))
        self.assertEqual(len(operators), 2)

    def test_list_non_builtin_operators(self):
        operators = self.registry.list_operators(builtin=False)
        self.assertTrue(all(not op._builtin for op in operators))
        self.assertEqual(len(operators), 2)

    def test_list_panel_type_operators(self):
        operators = self.registry.list_operators(type="panel")
        self.assertTrue(all(isinstance(op, Panel) for op in operators))
        self.assertEqual(len(operators), 2)

    def test_list_operator_type_operators(self):
        operators = self.registry.list_operators(type="operator")
        self.assertTrue(all(not isinstance(op, Panel) for op in operators))
        self.assertEqual(len(operators), 2)


class TestOperatorRegistryEmpty(unittest.TestCase):
    def setUp(self):
        reset_plugin_index_cache()
        self.addCleanup(reset_plugin_index_cache)

    def test_list_operators_empty(self):
        with patch(
            "fiftyone.operators.registry.fop.list_plugins",
            return_value=[],
        ), patch(
            "fiftyone.operators.registry.fopc.get_plugin_context",
        ) as get_ctx:
            registry = OperatorRegistry(index_signature=None)
            self.assertEqual(registry.list_operators(), [])
            get_ctx.assert_not_called()


class TestRegistryContextVar(unittest.TestCase):
    def setUp(self):
        reset_plugin_index_cache()
        self.addCleanup(reset_plugin_index_cache)

    def test_use_registry_binds_and_resets(self):
        with patch(
            "fiftyone.operators.registry.fop.list_plugins",
            return_value=[],
        ):
            outer = OperatorRegistry(index_signature=None)
            self.assertIsNot(get_current_registry(), outer)

            with use_registry(outer):
                self.assertIs(get_current_registry(), outer)

                inner = OperatorRegistry(index_signature=None)
                with use_registry(inner):
                    self.assertIs(get_current_registry(), inner)

                self.assertIs(get_current_registry(), outer)

            # After the context exits the binding is gone -- a fresh call
            # constructs a brand new registry
            self.assertIsNot(get_current_registry(), outer)


class TestPluginIndexCache(unittest.TestCase):
    """Tests for the process-wide plugin index cache."""

    def setUp(self):
        reset_plugin_index_cache()
        self.addCleanup(reset_plugin_index_cache)

        self.plugin_defs = [
            _make_plugin_def("plugin_a", ["op1"]),
            _make_plugin_def("plugin_b", ["op2"]),
        ]
        list_patch = patch(
            "fiftyone.operators.registry.fop.list_plugins",
            return_value=self.plugin_defs,
        )
        self.list_mock = list_patch.start()
        self.addCleanup(list_patch.stop)

    def test_explicit_signature_is_cached_across_constructions(self):
        OperatorRegistry(index_signature="sig1")
        OperatorRegistry(index_signature="sig1")
        OperatorRegistry(index_signature="sig1")

        # fop.list_plugins should be called exactly once -- subsequent
        # registries hit the cache
        self.assertEqual(self.list_mock.call_count, 1)

    def test_signature_change_invalidates_cache(self):
        OperatorRegistry(index_signature="sig1")
        OperatorRegistry(index_signature="sig1")
        self.assertEqual(self.list_mock.call_count, 1)

        OperatorRegistry(index_signature="sig2")
        self.assertEqual(self.list_mock.call_count, 2)

        # Returning to sig1 still rebuilds because the cache only retains a
        # single entry; this is intentional and matches the existing
        # ``ManagedPluginContextCache`` semantics in fiftyone-teams
        OperatorRegistry(index_signature="sig1")
        self.assertEqual(self.list_mock.call_count, 3)

    def test_none_signature_disables_cache(self):
        OperatorRegistry(index_signature=None)
        OperatorRegistry(index_signature=None)
        OperatorRegistry(index_signature=None)
        self.assertEqual(self.list_mock.call_count, 3)

    def test_enabled_is_part_of_cache_key(self):
        OperatorRegistry(enabled=True, index_signature="sig1")
        OperatorRegistry(enabled=True, index_signature="sig1")
        self.assertEqual(self.list_mock.call_count, 1)

        OperatorRegistry(enabled=False, index_signature="sig1")
        # Different ``enabled`` -> different cache slot
        self.assertEqual(self.list_mock.call_count, 2)

    def test_explicit_signature_skips_default_provider(self):
        provider = MagicMock(return_value="default-sig")
        prev = set_plugin_index_signature_provider(provider)
        self.addCleanup(set_plugin_index_signature_provider, prev)

        OperatorRegistry(index_signature="explicit-sig")
        OperatorRegistry(index_signature="explicit-sig")

        # The default provider must not have been consulted at all
        provider.assert_not_called()
        self.assertEqual(self.list_mock.call_count, 1)

    def test_default_provider_is_used_when_no_signature_passed(self):
        provider = MagicMock(return_value="from-provider")
        prev = set_plugin_index_signature_provider(provider)
        self.addCleanup(set_plugin_index_signature_provider, prev)

        OperatorRegistry()
        OperatorRegistry()

        # Provider is consulted on every construction (it's expected to be
        # cheap), but list_plugins is only called once because the
        # signature is stable
        self.assertGreaterEqual(provider.call_count, 2)
        self.assertEqual(self.list_mock.call_count, 1)

    def test_listing_failure_is_not_cached(self):
        self.list_mock.side_effect = RuntimeError("boom")

        registry = OperatorRegistry(index_signature="sig1")
        self.assertEqual(len(registry.list_errors()), 1)
        self.assertEqual(self.list_mock.call_count, 1)
        # No URIs were indexed because listing failed
        self.assertFalse(registry.operator_exists("plugin_a/op1"))

        # A subsequent construction with the same signature should retry
        # against fop.list_plugins rather than serve the empty failed index
        self.list_mock.side_effect = None
        self.list_mock.return_value = self.plugin_defs

        registry = OperatorRegistry(index_signature="sig1")
        self.assertEqual(self.list_mock.call_count, 2)
        # The fresh listing populates the URI index even though the plugin's
        # actual operators won't load (that is a separate path)
        self.assertIn("plugin_a/op1", registry._plugin_defs_by_uri)


class TestPluginIndexSignatureProvider(unittest.TestCase):
    """Tests for the pluggable signature provider used as the default."""

    def setUp(self):
        reset_plugin_index_cache()
        self.addCleanup(reset_plugin_index_cache)

        list_patch = patch(
            "fiftyone.operators.registry.fop.list_plugins",
            return_value=[_make_plugin_def("p", ["op"])],
        )
        self.list_mock = list_patch.start()
        self.addCleanup(list_patch.stop)

    def test_set_returns_previous_provider(self):
        new_provider = lambda enabled: "x"
        prev = set_plugin_index_signature_provider(new_provider)
        try:
            self.assertIsNotNone(prev)
        finally:
            restored = set_plugin_index_signature_provider(prev)
            self.assertIs(restored, new_provider)

    def test_provider_returning_none_disables_caching(self):
        prev = set_plugin_index_signature_provider(lambda enabled: None)
        self.addCleanup(set_plugin_index_signature_provider, prev)

        OperatorRegistry()
        OperatorRegistry()
        self.assertEqual(self.list_mock.call_count, 2)
