"""
FiftyOne operator config tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.operators.operator import OperatorConfig
from fiftyone.operators.types import RiskLevel


class TestOperatorConfigDefaults(unittest.TestCase):
    def test_name_only_defaults(self):
        config = OperatorConfig("my_op")

        self.assertEqual(config.name, "my_op")
        self.assertEqual(config.label, "my_op")
        self.assertIsNone(config.description)
        self.assertFalse(config.dynamic)
        self.assertFalse(config.execute_as_generator)
        self.assertFalse(config.unlisted)
        self.assertFalse(config.on_startup)
        self.assertFalse(config.on_dataset_open)
        self.assertFalse(config.disable_schema_validation)
        self.assertIsNone(config.delegation_target)
        self.assertIsNone(config.icon)
        self.assertIsNone(config.light_icon)
        self.assertIsNone(config.dark_icon)
        self.assertTrue(config.allow_immediate_execution)
        self.assertFalse(config.allow_delegated_execution)
        self.assertFalse(config.default_choice_to_delegated)
        self.assertFalse(config.allow_distributed_execution)
        self.assertTrue(config.rerunnable)
        self.assertEqual(config.risk_level, RiskLevel.DANGEROUS)
        self.assertFalse(config.resolve_execution_options_on_change)
        self.assertEqual(config.kwargs, {})

    def test_label_defaults_to_name(self):
        config = OperatorConfig("my_op")
        self.assertEqual(config.label, "my_op")

    def test_label_override(self):
        config = OperatorConfig("my_op", label="My Op")
        self.assertEqual(config.label, "My Op")

    def test_all_overrides(self):
        config = OperatorConfig(
            "my_op",
            label="My Op",
            description="desc",
            dynamic=True,
            execute_as_generator=True,
            unlisted=True,
            on_startup=True,
            on_dataset_open=True,
            disable_schema_validation=True,
            delegation_target="target",
            icon="icon.svg",
            light_icon="light.svg",
            dark_icon="dark.svg",
            allow_immediate_execution=False,
            allow_delegated_execution=True,
            default_choice_to_delegated=True,
            resolve_execution_options_on_change=True,
            rerunnable=False,
            risk_level=RiskLevel.LOW,
        )

        self.assertEqual(config.name, "my_op")
        self.assertEqual(config.label, "My Op")
        self.assertEqual(config.description, "desc")
        self.assertTrue(config.dynamic)
        self.assertTrue(config.execute_as_generator)
        self.assertTrue(config.unlisted)
        self.assertTrue(config.on_startup)
        self.assertTrue(config.on_dataset_open)
        self.assertTrue(config.disable_schema_validation)
        self.assertEqual(config.delegation_target, "target")
        self.assertEqual(config.icon, "icon.svg")
        self.assertEqual(config.light_icon, "light.svg")
        self.assertEqual(config.dark_icon, "dark.svg")
        self.assertFalse(config.allow_immediate_execution)
        self.assertTrue(config.allow_delegated_execution)
        self.assertTrue(config.default_choice_to_delegated)
        self.assertTrue(config.resolve_execution_options_on_change)
        self.assertFalse(config.rerunnable)
        self.assertEqual(config.risk_level, RiskLevel.LOW)


class TestOperatorConfigDistributedExecution(unittest.TestCase):
    def test_distributed_execution_forced_false_when_passed_true(self):
        config = OperatorConfig("my_op", allow_distributed_execution=True)
        self.assertFalse(config.allow_distributed_execution)

    def test_distributed_execution_default_false(self):
        config = OperatorConfig("my_op")
        self.assertFalse(config.allow_distributed_execution)


class TestOperatorConfigResolveExecutionOptionsOnChange(unittest.TestCase):
    def test_defaults_to_dynamic_false(self):
        config = OperatorConfig("my_op", dynamic=False)
        self.assertFalse(config.resolve_execution_options_on_change)

    def test_defaults_to_dynamic_true(self):
        config = OperatorConfig("my_op", dynamic=True)
        self.assertTrue(config.resolve_execution_options_on_change)

    def test_explicit_overrides_dynamic(self):
        config = OperatorConfig(
            "my_op",
            dynamic=True,
            resolve_execution_options_on_change=False,
        )
        self.assertFalse(config.resolve_execution_options_on_change)

        config = OperatorConfig(
            "my_op",
            dynamic=False,
            resolve_execution_options_on_change=True,
        )
        self.assertTrue(config.resolve_execution_options_on_change)


class TestOperatorConfigRiskLevel(unittest.TestCase):
    def test_default_risk_level_is_dangerous(self):
        config = OperatorConfig("my_op")
        self.assertEqual(config.risk_level, RiskLevel.DANGEROUS)

    def test_none_risk_level_normalized_to_dangerous(self):
        config = OperatorConfig("my_op", risk_level=None)
        self.assertEqual(config.risk_level, RiskLevel.DANGEROUS)

    def test_risk_level_enum(self):
        for level in RiskLevel:
            config = OperatorConfig("my_op", risk_level=level)
            self.assertEqual(config.risk_level, level)

    def test_risk_level_from_string_lowercase(self):
        config = OperatorConfig("my_op", risk_level="low")
        self.assertEqual(config.risk_level, RiskLevel.LOW)

    def test_risk_level_from_string_uppercase(self):
        config = OperatorConfig("my_op", risk_level="HIGH")
        self.assertEqual(config.risk_level, RiskLevel.HIGH)

    def test_risk_level_from_string_mixed_case(self):
        config = OperatorConfig("my_op", risk_level="Medium")
        self.assertEqual(config.risk_level, RiskLevel.MEDIUM)

    def test_invalid_risk_level_string_raises(self):
        with self.assertRaises(ValueError):
            OperatorConfig("my_op", risk_level="bogus")

    def test_invalid_risk_level_type_raises(self):
        with self.assertRaises(ValueError):
            OperatorConfig("my_op", risk_level=123)

    def test_risk_level_property_is_read_only(self):
        config = OperatorConfig("my_op", risk_level=RiskLevel.LOW)
        with self.assertRaises(AttributeError):
            config.risk_level = RiskLevel.HIGH


class TestOperatorConfigKwargs(unittest.TestCase):
    def test_extra_kwargs_stored(self):
        config = OperatorConfig("my_op", foo="bar", baz=42)
        self.assertEqual(config.kwargs, {"foo": "bar", "baz": 42})

    def test_no_kwargs_is_empty_dict(self):
        config = OperatorConfig("my_op")
        self.assertEqual(config.kwargs, {})


class TestOperatorConfigToJson(unittest.TestCase):
    def test_to_json_defaults(self):
        config = OperatorConfig("my_op")
        expected = {
            "name": "my_op",
            "label": "my_op",
            "description": None,
            "execute_as_generator": False,
            "unlisted": False,
            "dynamic": False,
            "on_startup": False,
            "on_dataset_open": False,
            "disable_schema_validation": False,
            "delegation_target": None,
            "icon": None,
            "light_icon": None,
            "dark_icon": None,
            "allow_immediate_execution": True,
            "allow_delegated_execution": False,
            "rerunnable": True,
            "default_choice_to_delegated": False,
            "resolve_execution_options_on_change": False,
            "allow_distributed_execution": False,
            "risk_level": "dangerous",
        }
        self.assertEqual(config.to_json(), expected)

    def test_to_json_with_overrides(self):
        config = OperatorConfig(
            "my_op",
            label="My Op",
            description="desc",
            dynamic=True,
            risk_level=RiskLevel.LOW,
            allow_delegated_execution=True,
        )
        result = config.to_json()

        self.assertEqual(result["name"], "my_op")
        self.assertEqual(result["label"], "My Op")
        self.assertEqual(result["description"], "desc")
        self.assertTrue(result["dynamic"])
        self.assertTrue(result["resolve_execution_options_on_change"])
        self.assertEqual(result["risk_level"], "low")
        self.assertTrue(result["allow_delegated_execution"])

    def test_to_json_risk_level_is_string_value(self):
        for level in RiskLevel:
            config = OperatorConfig("my_op", risk_level=level)
            self.assertEqual(config.to_json()["risk_level"], level.value)

    def test_to_json_distributed_execution_always_false(self):
        config = OperatorConfig("my_op", allow_distributed_execution=True)
        self.assertFalse(config.to_json()["allow_distributed_execution"])


if __name__ == "__main__":
    unittest.main()
