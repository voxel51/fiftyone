"""
FiftyOne ontology data class unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.core.ontology import Attribute, ConditionalAttributes


class AttributeTests(unittest.TestCase):
    def test_basic_attribute(self):
        attr = Attribute(name="color", type="str", component="dropdown")
        self.assertEqual(attr.name, "color")
        self.assertEqual(attr.type, "str")
        self.assertEqual(attr.component, "dropdown")
        self.assertIsNone(attr.values)
        self.assertIsNone(attr.when)
        self.assertEqual(attr.children, [])

    def test_attribute_with_values(self):
        attr = Attribute(
            name="color",
            type="str",
            component="dropdown",
            values=["red", "green", "blue"],
        )
        self.assertEqual(attr.values, ["red", "green", "blue"])

    def test_attribute_with_when(self):
        attr = Attribute(
            name="damage_location",
            when={"equals": {"field": "damage_present", "value": True}},
        )
        self.assertEqual(
            attr.when,
            {"equals": {"field": "damage_present", "value": True}},
        )

    def test_attribute_with_children(self):
        parent = Attribute(
            name="damage_present",
            type="bool",
            component="checkbox",
            children=[
                Attribute(
                    name="damage_location",
                    type="str",
                    when={
                        "equals": {
                            "field": "damage_present",
                            "value": True,
                        }
                    },
                ),
            ],
        )
        self.assertEqual(len(parent.children), 1)
        self.assertEqual(parent.children[0].name, "damage_location")

    def test_attribute_to_dict_minimal(self):
        attr = Attribute(name="color")
        d = attr.to_dict()
        self.assertEqual(d, {"name": "color"})

    def test_attribute_to_dict_full(self):
        attr = Attribute(
            name="color",
            type="str",
            component="dropdown",
            values=["red", "blue"],
            when={"equals": {"field": "visible", "value": True}},
            children=[Attribute(name="shade")],
        )
        d = attr.to_dict()
        self.assertEqual(d["name"], "color")
        self.assertEqual(d["type"], "str")
        self.assertEqual(d["component"], "dropdown")
        self.assertEqual(d["values"], ["red", "blue"])
        self.assertEqual(
            d["when"],
            {"equals": {"field": "visible", "value": True}},
        )
        self.assertEqual(len(d["children"]), 1)
        self.assertEqual(d["children"][0], {"name": "shade"})

    def test_attribute_from_dict_minimal(self):
        attr = Attribute.from_dict({"name": "color"})
        self.assertEqual(attr.name, "color")
        self.assertIsNone(attr.type)
        self.assertEqual(attr.children, [])

    def test_attribute_from_dict_full(self):
        d = {
            "name": "color",
            "type": "str",
            "component": "dropdown",
            "values": ["red"],
            "when": {"in": {"field": "mode", "value": ["a", "b"]}},
            "children": [{"name": "shade", "type": "str"}],
        }
        attr = Attribute.from_dict(d)
        self.assertEqual(attr.name, "color")
        self.assertEqual(attr.type, "str")
        self.assertEqual(attr.component, "dropdown")
        self.assertEqual(attr.values, ["red"])
        self.assertEqual(len(attr.children), 1)
        self.assertEqual(attr.children[0].name, "shade")
        self.assertEqual(attr.children[0].type, "str")

    def test_attribute_roundtrip(self):
        original = Attribute(
            name="damage_present",
            type="bool",
            component="checkbox",
            children=[
                Attribute(
                    name="location",
                    type="str",
                    component="dropdown",
                    values=["front", "rear"],
                    when={
                        "equals": {
                            "field": "damage_present",
                            "value": True,
                        }
                    },
                    children=[
                        Attribute(
                            name="airbags_deployed",
                            type="bool",
                            when={
                                "equals": {
                                    "field": "location",
                                    "value": "front",
                                }
                            },
                        ),
                    ],
                ),
            ],
        )
        restored = Attribute.from_dict(original.to_dict())
        self.assertEqual(restored.name, original.name)
        self.assertEqual(restored.type, original.type)
        self.assertEqual(len(restored.children), 1)
        self.assertEqual(len(restored.children[0].children), 1)
        self.assertEqual(
            restored.children[0].children[0].name, "airbags_deployed"
        )

    def test_attribute_repr(self):
        attr = Attribute(name="color")
        self.assertEqual(repr(attr), "Attribute(name='color')")


class ConditionalAttributesTests(unittest.TestCase):
    def test_create_empty(self):
        ca = ConditionalAttributes(name="test")
        self.assertEqual(ca.name, "test")
        self.assertIsNone(ca.description)
        self.assertEqual(ca.root, [])
        self.assertIsNone(ca.version)
        self.assertIsNone(ca.created_at)
        self.assertEqual(ca._TYPE, "conditional_attributes")

    def test_create_with_attributes(self):
        ca = ConditionalAttributes(
            name="vehicle_damage_attributes",
            description="Vehicle damage condition attributes",
            root=[
                Attribute(
                    name="damage_location",
                    type="str",
                    component="dropdown",
                    values=["front", "rear"],
                    when={
                        "equals": {
                            "field": "damage_present",
                            "value": True,
                        }
                    },
                ),
                Attribute(
                    name="damage_severity",
                    type="str",
                    component="radio",
                    values=["minor", "moderate", "severe"],
                    when={
                        "equals": {
                            "field": "damage_present",
                            "value": True,
                        }
                    },
                ),
            ],
        )
        self.assertEqual(ca.name, "vehicle_damage_attributes")
        self.assertEqual(len(ca.root), 2)
        self.assertEqual(ca.root[0].name, "damage_location")
        self.assertEqual(ca.root[1].name, "damage_severity")

    def test_to_dict(self):
        ca = ConditionalAttributes(
            name="test_ca",
            description="A test",
            root=[
                Attribute(name="attr1", type="str"),
                Attribute(name="attr2", type="bool"),
            ],
        )
        d = ca.to_dict()
        self.assertEqual(d["name"], "test_ca")
        self.assertEqual(d["type"], "conditional_attributes")
        self.assertEqual(d["description"], "A test")
        self.assertEqual(len(d["root"]), 2)
        self.assertEqual(d["root"][0]["name"], "attr1")
        self.assertIsNone(d.get("version"))
        self.assertIsNone(d.get("created_at"))

    def test_from_dict(self):
        d = {
            "name": "test_ca",
            "type": "conditional_attributes",
            "description": "A test",
            "root": [
                {"name": "attr1", "type": "str"},
                {
                    "name": "attr2",
                    "type": "bool",
                    "children": [{"name": "child1"}],
                },
            ],
        }
        ca = ConditionalAttributes.from_dict(d)
        self.assertEqual(ca.name, "test_ca")
        self.assertEqual(ca.description, "A test")
        self.assertEqual(len(ca.root), 2)
        self.assertEqual(ca.root[1].children[0].name, "child1")

    def test_roundtrip(self):
        original = ConditionalAttributes(
            name="vehicle_damage_attributes",
            description="Vehicle damage condition attributes",
            root=[
                Attribute(
                    name="damage_present",
                    type="bool",
                    component="checkbox",
                    children=[
                        Attribute(
                            name="damage_location",
                            type="str",
                            component="dropdown",
                            values=["front", "rear"],
                            when={
                                "equals": {
                                    "field": "damage_present",
                                    "value": True,
                                }
                            },
                        ),
                    ],
                ),
            ],
        )
        restored = ConditionalAttributes.from_dict(original.to_dict())
        self.assertEqual(restored.name, original.name)
        self.assertEqual(restored.description, original.description)
        self.assertEqual(len(restored.root), 1)
        self.assertEqual(len(restored.root[0].children), 1)
        self.assertEqual(restored.root[0].children[0].name, "damage_location")

    def test_repr(self):
        ca = ConditionalAttributes(name="test")
        self.assertIn("ConditionalAttributes", repr(ca))
        self.assertIn("test", repr(ca))


if __name__ == "__main__":
    unittest.main()
