import unittest
from unittest.mock import MagicMock, patch
from fiftyone.operators.registry import OperatorRegistry
from fiftyone.operators import Panel


class TestOperatorRegistry(unittest.TestCase):
    @patch("fiftyone.plugins.context.build_plugin_contexts")
    def setUp(self, mock_build_plugin_contexts):
        # Mocking plugin contexts and operators
        self.mock_contexts = [
            MagicMock(
                instances=[
                    MagicMock(_builtin=True, spec=Panel),
                    MagicMock(_builtin=False, spec=object),
                ]
            ),
            MagicMock(
                instances=[
                    MagicMock(_builtin=True, spec=object),
                    MagicMock(_builtin=False, spec=Panel),
                ]
            ),
        ]
        mock_build_plugin_contexts.return_value = self.mock_contexts

        self.registry = OperatorRegistry()

    def test_list_all_operators(self):
        operators = self.registry.list_operators()
        self.assertEqual(len(operators), 4)

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

    def test_list_operators_empty_contexts(self):
        with patch(
            "fiftyone.plugins.context.build_plugin_contexts"
        ) as mock_build:
            mock_build.return_value = []
            registry = OperatorRegistry()
            operators = registry.list_operators()
            self.assertEqual(len(operators), 0)
