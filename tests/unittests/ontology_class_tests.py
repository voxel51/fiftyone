"""
FiftyOne ontology data class unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.core.ontology import (
    Attribute,
    ConditionalAttributes,
    WhenCondition,
    WhenOperator,
)


class WhenConditionTests(unittest.TestCase):
    def test_create_equals(self):
        wc = WhenCondition(WhenOperator.EQUALS, "damage_present", True)
        self.assertEqual(wc.operator, WhenOperator.EQUALS)
        self.assertEqual(wc.field, "damage_present")
        self.assertEqual(wc.value, True)

    def test_create_in(self):
        wc = WhenCondition(WhenOperator.IN, "car_model", ["camry", "corolla"])
        self.assertEqual(wc.operator, WhenOperator.IN)
        self.assertEqual(wc.field, "car_model")
        self.assertEqual(wc.value, ["camry", "corolla"])

    def test_invalid_operator(self):
        with self.assertRaises(ValueError):
            WhenCondition("not_valid", "field", "value")

    def test_to_dict(self):
        wc = WhenCondition(WhenOperator.EQUALS, "damage_present", True)
        self.assertEqual(
            wc.to_dict(),
            {"equals": {"field": "damage_present", "value": True}},
        )

    def test_from_dict(self):
        wc = WhenCondition.from_dict(
            {"in": {"field": "mode", "value": ["a", "b"]}}
        )
        self.assertEqual(wc.operator, WhenOperator.IN)
        self.assertEqual(wc.field, "mode")
        self.assertEqual(wc.value, ["a", "b"])

    def test_roundtrip(self):
        original = WhenCondition(WhenOperator.EQUALS, "damage_present", True)
        restored = WhenCondition.from_dict(original.to_dict())
        self.assertEqual(restored.operator, original.operator)
        self.assertEqual(restored.field, original.field)
        self.assertEqual(restored.value, original.value)


class AttributeTests(unittest.TestCase):
    def test_create(self):
        when = WhenCondition(WhenOperator.EQUALS, "damage_present", True)
        attr = Attribute(name="damage_location", when=when)
        self.assertEqual(attr.name, "damage_location")
        self.assertEqual(attr.when.operator, WhenOperator.EQUALS)
        self.assertEqual(attr.when.field, "damage_present")

    def test_to_dict(self):
        attr = Attribute(
            name="damage_location",
            when=WhenCondition(WhenOperator.EQUALS, "damage_present", True),
        )
        d = attr.to_dict()
        self.assertEqual(d["name"], "damage_location")
        self.assertEqual(
            d["when"],
            {"equals": {"field": "damage_present", "value": True}},
        )

    def test_from_dict(self):
        d = {
            "name": "damage_location",
            "when": {"in": {"field": "mode", "value": ["a", "b"]}},
        }
        attr = Attribute.from_dict(d)
        self.assertEqual(attr.name, "damage_location")
        self.assertEqual(attr.when.operator, WhenOperator.IN)
        self.assertEqual(attr.when.field, "mode")

    def test_roundtrip(self):
        original = Attribute(
            name="damage_location",
            when=WhenCondition(WhenOperator.EQUALS, "damage_present", True),
        )
        restored = Attribute.from_dict(original.to_dict())
        self.assertEqual(restored.name, original.name)
        self.assertEqual(restored.when.to_dict(), original.when.to_dict())


class ConditionalAttributesTests(unittest.TestCase):
    def test_create_with_attributes(self):
        ca = ConditionalAttributes(
            name="vehicle_damage_attributes",
            description="Vehicle damage condition attributes",
            root=[
                Attribute(
                    name="damage_location",
                    when=WhenCondition(
                        WhenOperator.EQUALS, "damage_present", True
                    ),
                ),
                Attribute(
                    name="damage_severity",
                    when=WhenCondition(
                        WhenOperator.EQUALS, "damage_present", True
                    ),
                ),
                Attribute(
                    name="airbags_deployed",
                    when=WhenCondition(
                        WhenOperator.EQUALS, "damage_location", "front"
                    ),
                ),
            ],
        )
        self.assertEqual(ca.name, "vehicle_damage_attributes")
        self.assertEqual(len(ca.root), 3)
        self.assertEqual(ca.root[0].name, "damage_location")
        self.assertEqual(ca.root[2].name, "airbags_deployed")

    def test_to_dict(self):
        ca = ConditionalAttributes(
            name="test_ca",
            description="A test",
            root=[
                Attribute(
                    name="attr1",
                    when=WhenCondition(WhenOperator.EQUALS, "enabled", True),
                ),
                Attribute(
                    name="attr2",
                    when=WhenCondition(WhenOperator.EQUALS, "attr1", "yes"),
                ),
            ],
        )
        d = ca.to_dict()
        self.assertEqual(d["name"], "test_ca")
        self.assertEqual(d["type"], "conditional_attributes")
        self.assertEqual(d["description"], "A test")
        self.assertEqual(len(d["root"]), 2)
        self.assertIn("when", d["root"][0])
        self.assertIn("when", d["root"][1])
        self.assertIsNone(d.get("version"))
        self.assertIsNone(d.get("created_at"))

    def test_from_dict(self):
        d = {
            "name": "test_ca",
            "type": "conditional_attributes",
            "description": "A test",
            "root": [
                {
                    "name": "attr1",
                    "when": {"equals": {"field": "enabled", "value": True}},
                },
                {
                    "name": "attr2",
                    "when": {"equals": {"field": "attr1", "value": "yes"}},
                },
            ],
        }
        ca = ConditionalAttributes.from_dict(d)
        self.assertEqual(ca.name, "test_ca")
        self.assertEqual(ca.description, "A test")
        self.assertEqual(len(ca.root), 2)
        self.assertEqual(ca.root[0].when.field, "enabled")
        self.assertEqual(ca.root[1].when.field, "attr1")

    def test_roundtrip(self):
        original = ConditionalAttributes(
            name="vehicle_damage_attributes",
            description="Vehicle damage condition attributes",
            root=[
                Attribute(
                    name="damage_location",
                    when=WhenCondition(
                        WhenOperator.EQUALS, "damage_present", True
                    ),
                ),
                Attribute(
                    name="damage_severity",
                    when=WhenCondition(
                        WhenOperator.EQUALS, "damage_present", True
                    ),
                ),
                Attribute(
                    name="airbags_deployed",
                    when=WhenCondition(
                        WhenOperator.EQUALS, "damage_location", "front"
                    ),
                ),
            ],
        )
        restored = ConditionalAttributes.from_dict(original.to_dict())
        self.assertEqual(restored.name, original.name)
        self.assertEqual(restored.description, original.description)
        self.assertEqual(len(restored.root), 3)
        self.assertEqual(restored.root[2].when.field, "damage_location")


if __name__ == "__main__":
    unittest.main()
