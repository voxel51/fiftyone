import unittest
from unittest.mock import MagicMock, patch

from fiftyone.operators import Panel
from fiftyone.operators.registry import (
    OperatorRegistry,
    get_current_registry,
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

        self.registry = OperatorRegistry()

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
    def test_list_operators_empty(self):
        with patch(
            "fiftyone.operators.registry.fop.list_plugins",
            return_value=[],
        ), patch(
            "fiftyone.operators.registry.fopc.get_plugin_context",
        ) as get_ctx:
            registry = OperatorRegistry()
            self.assertEqual(registry.list_operators(), [])
            get_ctx.assert_not_called()


class TestRegistryContextVar(unittest.TestCase):
    def test_use_registry_binds_and_resets(self):
        with patch(
            "fiftyone.operators.registry.fop.list_plugins",
            return_value=[],
        ):
            outer = OperatorRegistry()
            self.assertIsNot(get_current_registry(), outer)

            with use_registry(outer):
                self.assertIs(get_current_registry(), outer)

                inner = OperatorRegistry()
                with use_registry(inner):
                    self.assertIs(get_current_registry(), inner)

                self.assertIs(get_current_registry(), outer)

            # After the context exits the binding is gone -- a fresh call
            # constructs a brand new registry
            self.assertIsNot(get_current_registry(), outer)
