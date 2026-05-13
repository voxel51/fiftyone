"""
FiftyOne ontology data class unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import unittest

# Ontology SDK is gated by VFF_ONTOLOGY_CA / VFF_ONTOLOGY_TX; enable both
# for the whole module so SDK integration tests can exercise save/load.
os.environ.setdefault("VFF_ONTOLOGY_CA", "1")
os.environ.setdefault("VFF_ONTOLOGY_TX", "1")

from fiftyone.core.annotation.attributes import (
    MAX_CONDITION_DEPTH,
    AttributeSpec,
    When,
    WhenAnd,
    WhenCondition,
    WhenEquals,
    WhenIn,
    WhenOperator,
    WhenOr,
    collect_leaf_conditions,
)
from fiftyone.core.annotation.nodes import Node
from fiftyone.core.ontology import AnnotationOntology, Taxonomy, load_ontology
from fiftyone.core.ontology_validation import validate_taxonomy

from ontology_fixtures import make_taxonomy


class WhenTests(unittest.TestCase):
    def test_create_equals(self):
        w = When(WhenOperator.EQUALS, field="damage_present", value=True)
        self.assertEqual(w.operator, WhenOperator.EQUALS)
        self.assertEqual(w.field, "damage_present")
        self.assertEqual(w.value, True)
        self.assertIsNone(w.then)

    def test_create_in(self):
        w = When(
            WhenOperator.IN, field="car_model", value=["camry", "corolla"]
        )
        self.assertEqual(w.operator, WhenOperator.IN)
        self.assertEqual(w.field, "car_model")
        self.assertEqual(w.value, ["camry", "corolla"])

    def test_create_with_string_operator(self):
        w = When("equals", field="flag", value=True)
        self.assertEqual(w.operator, WhenOperator.EQUALS)

    def test_invalid_operator(self):
        with self.assertRaises(ValueError):
            When("not_valid", field="f", value="v")

    def test_empty_field_raises(self):
        with self.assertRaises(ValueError):
            When(WhenOperator.EQUALS, field="", value=True)

    def test_non_string_field_raises(self):
        with self.assertRaises(ValueError):
            When(WhenOperator.EQUALS, field=42, value=True)

    def test_from_dict_missing_keys(self):
        with self.assertRaises(ValueError):
            When.from_dict({"operator": "equals", "field": "f"})
        with self.assertRaises(ValueError):
            When.from_dict({"field": "f", "value": 1})
        with self.assertRaises(ValueError):
            When.from_dict({"operator": "equals", "value": 1})

    def test_from_dict_bad_then(self):
        with self.assertRaises(ValueError):
            When.from_dict(
                {
                    "operator": "equals",
                    "field": "f",
                    "value": 1,
                    "then": "not a dict",
                }
            )

    def test_with_then(self):
        w = When(
            WhenOperator.EQUALS,
            field="vehicle_type",
            value="car",
            then={"values": ["sedan", "suv", "coupe"]},
        )
        self.assertEqual(w.then, {"values": ["sedan", "suv", "coupe"]})

    def test_to_dict_with_then(self):
        w = When(
            WhenOperator.EQUALS,
            field="vehicle_type",
            value="car",
            then={"values": ["sedan", "suv"]},
        )
        self.assertEqual(
            w.to_dict(),
            {
                "operator": "equals",
                "field": "vehicle_type",
                "value": "car",
                "then": {"values": ["sedan", "suv"]},
            },
        )

    def test_from_dict_with_then(self):
        w = When.from_dict(
            {
                "operator": "equals",
                "field": "type",
                "value": "car",
                "then": {"values": ["sedan"]},
            }
        )
        self.assertEqual(w.operator, WhenOperator.EQUALS)
        self.assertEqual(w.then, {"values": ["sedan"]})

    def test_roundtrip(self):
        original = When(
            WhenOperator.EQUALS,
            field="damage_present",
            value=True,
            then={"values": ["minor", "major"]},
        )
        restored = When.from_dict(original.to_dict())
        self.assertEqual(restored.operator, original.operator)
        self.assertEqual(restored.field, original.field)
        self.assertEqual(restored.value, original.value)
        self.assertEqual(restored.then, original.then)


class WhenEqualsTests(unittest.TestCase):
    def test_pre_fills_operator(self):
        w = WhenEquals(field="damage_present", value=True)
        self.assertEqual(w.operator, WhenOperator.EQUALS)
        self.assertEqual(w.field, "damage_present")
        self.assertEqual(w.value, True)
        self.assertIsNone(w.then)

    def test_isinstance_of_when(self):
        # Existing CA-2 validators / dispatchers branch on
        # ``isinstance(x, When)``; subclasses must satisfy that.
        self.assertIsInstance(WhenEquals(field="f", value=1), When)

    def test_to_dict_matches_when(self):
        # Wire format and MongoDB storage are unchanged — the
        # subclass should produce the same dict as a hand-rolled When.
        sub = WhenEquals(field="f", value=1)
        base = When(WhenOperator.EQUALS, field="f", value=1)
        self.assertEqual(sub.to_dict(), base.to_dict())

    def test_with_then(self):
        w = WhenEquals(
            field="vehicle_type",
            value="car",
            then={"values": ["sedan", "suv"]},
        )
        self.assertEqual(w.then, {"values": ["sedan", "suv"]})


class WhenInTests(unittest.TestCase):
    def test_pre_fills_operator(self):
        w = WhenIn(field="car_model", value=["camry", "corolla"])
        self.assertEqual(w.operator, WhenOperator.IN)
        self.assertEqual(w.field, "car_model")
        self.assertEqual(w.value, ["camry", "corolla"])
        self.assertIsNone(w.then)

    def test_isinstance_of_when(self):
        self.assertIsInstance(WhenIn(field="f", value=[1]), When)

    def test_to_dict_matches_when(self):
        sub = WhenIn(field="f", value=[1, 2])
        base = When(WhenOperator.IN, field="f", value=[1, 2])
        self.assertEqual(sub.to_dict(), base.to_dict())


class WhenAndTests(unittest.TestCase):
    def test_create(self):
        wa = WhenAnd(
            [
                WhenEquals(field="damage_present", value=True),
                WhenIn(field="vehicle_type", value=["car", "truck"]),
            ]
        )
        self.assertEqual(len(wa.conditions), 2)

    def test_empty_conditions_raises(self):
        with self.assertRaises(ValueError):
            WhenAnd([])

    def test_non_list_conditions_raises(self):
        with self.assertRaises(ValueError):
            WhenAnd("not a list")

    def test_non_when_condition_element_raises(self):
        with self.assertRaises(ValueError):
            WhenAnd([WhenEquals(field="f", value=1), "not a condition"])

    def test_to_dict(self):
        wa = WhenAnd(
            [
                WhenEquals(field="a", value=1),
                WhenIn(field="b", value=[2, 3]),
            ]
        )
        d = wa.to_dict()
        self.assertEqual(d["operator"], "and")
        self.assertIsInstance(d["conditions"], list)
        self.assertEqual(len(d["conditions"]), 2)
        self.assertEqual(d["conditions"][0]["operator"], "equals")
        self.assertEqual(d["conditions"][1]["operator"], "in")

    def test_from_dict(self):
        d = {
            "operator": "and",
            "conditions": [
                {"operator": "equals", "field": "a", "value": 1},
                {"operator": "in", "field": "b", "value": [2, 3]},
            ],
        }
        wa = WhenAnd.from_dict(d)
        self.assertIsInstance(wa, WhenAnd)
        self.assertEqual(len(wa.conditions), 2)
        # from_dict always deserializes leaf conditions as When, not subclasses
        self.assertIsInstance(wa.conditions[0], When)
        self.assertIsInstance(wa.conditions[1], When)

    def test_from_dict_missing_conditions_raises(self):
        with self.assertRaises(ValueError):
            WhenAnd.from_dict({"operator": "and"})

    def test_roundtrip(self):
        original = WhenAnd(
            [
                WhenEquals(field="flag", value=True),
                WhenIn(field="type", value=["a", "b"]),
            ]
        )
        restored = WhenAnd.from_dict(original.to_dict())
        self.assertIsInstance(restored, WhenAnd)
        self.assertEqual(len(restored.conditions), 2)
        self.assertEqual(
            restored.conditions[0].to_dict(),
            original.conditions[0].to_dict(),
        )


class WhenOrTests(unittest.TestCase):
    def test_create(self):
        wo = WhenOr(
            [
                WhenEquals(field="category", value="mammal"),
                WhenEquals(field="category", value="bird"),
            ]
        )
        self.assertEqual(len(wo.conditions), 2)

    def test_empty_conditions_raises(self):
        with self.assertRaises(ValueError):
            WhenOr([])

    def test_non_list_conditions_raises(self):
        with self.assertRaises(ValueError):
            WhenOr("not a list")

    def test_non_when_condition_element_raises(self):
        with self.assertRaises(ValueError):
            WhenOr([WhenEquals(field="f", value=1), 42])

    def test_to_dict(self):
        wo = WhenOr(
            [
                WhenEquals(field="a", value=1),
                WhenEquals(field="a", value=2),
            ]
        )
        d = wo.to_dict()
        self.assertEqual(d["operator"], "or")
        self.assertIsInstance(d["conditions"], list)
        self.assertEqual(len(d["conditions"]), 2)

    def test_from_dict(self):
        d = {
            "operator": "or",
            "conditions": [
                {"operator": "equals", "field": "a", "value": 1},
                {"operator": "equals", "field": "a", "value": 2},
            ],
        }
        wo = WhenOr.from_dict(d)
        self.assertIsInstance(wo, WhenOr)
        self.assertEqual(len(wo.conditions), 2)

    def test_roundtrip(self):
        original = WhenOr(
            [
                WhenEquals(field="x", value="yes"),
                WhenIn(field="y", value=["p", "q"]),
            ]
        )
        restored = WhenOr.from_dict(original.to_dict())
        self.assertIsInstance(restored, WhenOr)
        self.assertEqual(
            restored.conditions[1].to_dict(),
            original.conditions[1].to_dict(),
        )

    def test_nested_and_inside_or(self):
        """WhenOr may contain WhenAnd children."""
        wo = WhenOr(
            [
                WhenEquals(field="priority", value="urgent"),
                WhenAnd(
                    [
                        WhenEquals(field="category", value="mammal"),
                        WhenEquals(field="size", value="large"),
                    ]
                ),
            ]
        )
        d = wo.to_dict()
        restored = WhenOr.from_dict(d)
        self.assertIsInstance(restored.conditions[1], WhenAnd)


class WhenConditionDispatchTests(unittest.TestCase):
    """WhenCondition.from_dict must dispatch to the correct concrete class."""

    def test_dispatch_equals(self):
        d = {"operator": "equals", "field": "f", "value": 1}
        cond = WhenCondition.from_dict(d)
        # Deserialized leaves are When instances (not WhenEquals subclass)
        self.assertIsInstance(cond, When)
        self.assertEqual(cond.operator, WhenOperator.EQUALS)

    def test_dispatch_in(self):
        d = {"operator": "in", "field": "f", "value": [1, 2]}
        cond = WhenCondition.from_dict(d)
        # Deserialized leaves are When instances (not WhenIn subclass)
        self.assertIsInstance(cond, When)
        self.assertEqual(cond.operator, WhenOperator.IN)

    def test_dispatch_and(self):
        d = {
            "operator": "and",
            "conditions": [
                {"operator": "equals", "field": "a", "value": 1},
            ],
        }
        cond = WhenCondition.from_dict(d)
        self.assertIsInstance(cond, WhenAnd)

    def test_dispatch_or(self):
        d = {
            "operator": "or",
            "conditions": [
                {"operator": "equals", "field": "a", "value": 1},
            ],
        }
        cond = WhenCondition.from_dict(d)
        self.assertIsInstance(cond, WhenOr)

    def test_dispatch_unknown_operator_raises(self):
        with self.assertRaises(ValueError):
            WhenCondition.from_dict(
                {"operator": "contains", "field": "f", "value": 1}
            )

    def test_dispatch_not_a_dict_raises(self):
        with self.assertRaises(ValueError):
            WhenCondition.from_dict("not a dict")

    def test_dispatch_missing_operator_raises(self):
        with self.assertRaises((ValueError, KeyError)):
            WhenCondition.from_dict({"field": "f", "value": 1})

    def test_deeply_nested_roundtrip(self):
        """AND(OR(leaf, AND(leaf, leaf)), leaf) survives a full to/from dict cycle."""
        original = WhenAnd(
            [
                WhenOr(
                    [
                        WhenEquals(field="a", value=1),
                        WhenAnd(
                            [
                                WhenEquals(field="b", value=2),
                                WhenEquals(field="c", value=3),
                            ]
                        ),
                    ]
                ),
                WhenEquals(field="d", value=4),
            ]
        )
        restored = WhenCondition.from_dict(original.to_dict())
        self.assertIsInstance(restored, WhenAnd)
        self.assertIsInstance(restored.conditions[0], WhenOr)
        self.assertIsInstance(restored.conditions[0].conditions[1], WhenAnd)
        self.assertEqual(restored.to_dict(), original.to_dict())

    def test_dispatch_exceeds_max_depth_raises(self):
        # Build a dict chain MAX_CONDITION_DEPTH + 1 levels deep.  Each wrap
        # adds one "and" node; the innermost child is the leaf.  When
        # WhenCondition.from_dict recurses into the leaf it reaches
        # _depth = MAX_CONDITION_DEPTH + 1, satisfying _depth > MAX_CONDITION_DEPTH.
        d = {"operator": "equals", "field": "f", "value": 1}
        for _ in range(MAX_CONDITION_DEPTH + 1):
            d = {"operator": "and", "conditions": [d]}

        with self.assertRaises(ValueError) as ctx:
            WhenCondition.from_dict(d)

        self.assertIn("maximum nesting depth", str(ctx.exception))


class CollectLeafConditionsTests(unittest.TestCase):
    """collect_leaf_conditions must yield exactly the When leaves of any tree."""

    def test_single_leaf(self):
        w = WhenEquals(field="f", value=1)
        leaves = list(collect_leaf_conditions(w))
        self.assertEqual(leaves, [w])

    def test_and_group_yields_all_leaves(self):
        a = WhenEquals(field="a", value=1)
        b = WhenIn(field="b", value=[2, 3])
        leaves = list(collect_leaf_conditions(WhenAnd([a, b])))
        self.assertEqual(leaves, [a, b])

    def test_or_group_yields_all_leaves(self):
        a = WhenEquals(field="a", value=1)
        b = WhenEquals(field="a", value=2)
        leaves = list(collect_leaf_conditions(WhenOr([a, b])))
        self.assertEqual(leaves, [a, b])

    def test_nested_tree_yields_all_leaves(self):
        a = WhenEquals(field="a", value=1)
        b = WhenEquals(field="b", value=2)
        c = WhenEquals(field="c", value=3)
        d = WhenEquals(field="d", value=4)
        tree = WhenAnd(
            [
                WhenOr([a, WhenAnd([b, c])]),
                d,
            ]
        )
        self.assertEqual(list(collect_leaf_conditions(tree)), [a, b, c, d])

    def test_leaf_objects_are_when_instances(self):
        tree = WhenAnd(
            [
                WhenEquals(field="x", value=True),
                WhenIn(field="y", value=["p", "q"]),
            ]
        )
        for leaf in collect_leaf_conditions(tree):
            self.assertIsInstance(leaf, When)

    def test_exceeds_max_depth_raises(self):
        # Build a tree that is MAX_CONDITION_DEPTH + 1 levels deep by wrapping
        # a leaf in WhenAnd MAX_CONDITION_DEPTH + 1 times.  The leaf ends up at
        # depth MAX_CONDITION_DEPTH + 1, which exceeds the guard threshold.
        tree: WhenCondition = WhenEquals(field="x", value=1)
        for _ in range(MAX_CONDITION_DEPTH + 1):
            tree = WhenAnd([tree])

        with self.assertRaises(ValueError) as ctx:
            list(collect_leaf_conditions(tree))

        self.assertIn("maximum nesting depth", str(ctx.exception))


class AttributeSpecTests(unittest.TestCase):
    def test_create_full(self):
        attr = AttributeSpec(
            name="damage_location",
            type="str",
            component="dropdown",
            values=["front", "rear"],
            when=WhenEquals(field="damage_present", value=True),
        )
        self.assertEqual(attr.name, "damage_location")
        self.assertEqual(attr.type, "str")
        self.assertEqual(attr.component, "dropdown")
        self.assertEqual(attr.values, ["front", "rear"])
        self.assertIsInstance(attr.when, WhenEquals)

    def test_create_unconditional(self):
        attr = AttributeSpec(
            name="damage_present",
            type="bool",
            component="checkbox",
        )
        self.assertEqual(attr.name, "damage_present")
        self.assertIsNone(attr.values)
        self.assertIsNone(attr.when)

    def test_missing_name_raises(self):
        with self.assertRaises(ValueError):
            AttributeSpec(name="", type="str", component="dropdown")

    def test_missing_type_raises(self):
        with self.assertRaises(ValueError):
            AttributeSpec(name="attr", type="", component="dropdown")

    def test_missing_component_raises(self):
        with self.assertRaises(ValueError):
            AttributeSpec(name="attr", type="str", component="")

    def test_non_string_fields_raise(self):
        with self.assertRaises(ValueError):
            AttributeSpec(name=42, type="str", component="dropdown")
        with self.assertRaises(ValueError):
            AttributeSpec(name="attr", type=42, component="dropdown")
        with self.assertRaises(ValueError):
            AttributeSpec(name="attr", type="str", component=42)

    def test_from_dict_missing_keys(self):
        with self.assertRaises(ValueError):
            AttributeSpec.from_dict({"name": "a", "type": "str"})
        with self.assertRaises(ValueError):
            AttributeSpec.from_dict({"type": "str", "component": "dropdown"})
        with self.assertRaises(ValueError):
            AttributeSpec.from_dict({"name": "a", "component": "dropdown"})

    def test_from_dict_bad_values(self):
        with self.assertRaises(ValueError):
            AttributeSpec.from_dict(
                {
                    "name": "a",
                    "type": "str",
                    "component": "dropdown",
                    "values": "not a list",
                }
            )

    def test_from_dict_bad_when(self):
        with self.assertRaises(ValueError):
            AttributeSpec.from_dict(
                {
                    "name": "a",
                    "type": "str",
                    "component": "dropdown",
                    "when": "not a list",
                }
            )

    def test_to_dict_unconditional(self):
        attr = AttributeSpec(name="flag", type="bool", component="checkbox")
        d = attr.to_dict()
        self.assertEqual(
            d, {"name": "flag", "type": "bool", "component": "checkbox"}
        )
        self.assertNotIn("values", d)
        self.assertNotIn("when", d)

    def test_to_dict_conditional(self):
        attr = AttributeSpec(
            name="severity",
            type="str",
            component="radio",
            values=["minor", "moderate", "severe"],
            when=WhenEquals(field="damage_present", value=True),
        )
        d = attr.to_dict()
        self.assertEqual(d["name"], "severity")
        self.assertEqual(d["type"], "str")
        self.assertEqual(d["component"], "radio")
        self.assertEqual(d["values"], ["minor", "moderate", "severe"])
        self.assertIsInstance(d["when"], dict)
        self.assertEqual(d["when"]["operator"], "equals")

    def test_from_dict(self):
        d = {
            "name": "damage_location",
            "type": "str",
            "component": "dropdown",
            "values": ["front", "rear"],
            "when": {
                "operator": "equals",
                "field": "damage_present",
                "value": True,
            },
        }
        attr = AttributeSpec.from_dict(d)
        self.assertEqual(attr.name, "damage_location")
        self.assertEqual(attr.type, "str")
        self.assertEqual(attr.component, "dropdown")
        self.assertEqual(attr.values, ["front", "rear"])
        # from_dict deserializes leaves as When (not WhenEquals subclass)
        self.assertIsInstance(attr.when, When)
        self.assertEqual(attr.when.operator, WhenOperator.EQUALS)

    def test_roundtrip(self):
        original = AttributeSpec(
            name="damage_location",
            type="str",
            component="dropdown",
            values=["front", "rear"],
            when=WhenEquals(field="damage_present", value=True),
        )
        restored = AttributeSpec.from_dict(original.to_dict())
        self.assertEqual(restored.name, original.name)
        self.assertEqual(restored.type, original.type)
        self.assertEqual(restored.component, original.component)
        self.assertEqual(restored.values, original.values)
        self.assertEqual(restored.when.to_dict(), original.when.to_dict())

    def test_create_with_extended_fields(self):
        attr = AttributeSpec(
            name="severity",
            type="float",
            component="slider",
            read_only=True,
            default=0.5,
            range=[0.0, 1.0],
            precision=2,
        )
        self.assertEqual(attr.read_only, True)
        self.assertEqual(attr.default, 0.5)
        self.assertEqual(attr.range, [0.0, 1.0])
        self.assertEqual(attr.precision, 2)

    def test_to_dict_omits_unset_extended_fields(self):
        attr = AttributeSpec(name="flag", type="bool", component="checkbox")
        d = attr.to_dict()
        self.assertNotIn("read_only", d)
        self.assertNotIn("default", d)
        self.assertNotIn("range", d)
        self.assertNotIn("precision", d)

    def test_to_dict_emits_falsy_extended_fields(self):
        attr = AttributeSpec(
            name="flag",
            type="bool",
            component="checkbox",
            read_only=False,
            default=False,
        )
        d = attr.to_dict()
        self.assertEqual(d["read_only"], False)
        self.assertEqual(d["default"], False)

    def test_to_dict_emits_extended_fields(self):
        attr = AttributeSpec(
            name="severity",
            type="float",
            component="slider",
            read_only=True,
            default=0.5,
            range=[0.0, 1.0],
            precision=2,
        )
        d = attr.to_dict()
        self.assertEqual(d["read_only"], True)
        self.assertEqual(d["default"], 0.5)
        self.assertEqual(d["range"], [0.0, 1.0])
        self.assertEqual(d["precision"], 2)

    def test_from_dict_reads_extended_fields(self):
        attr = AttributeSpec.from_dict(
            {
                "name": "severity",
                "type": "float",
                "component": "slider",
                "read_only": True,
                "default": 0.5,
                "range": [0.0, 1.0],
                "precision": 2,
            }
        )
        self.assertEqual(attr.read_only, True)
        self.assertEqual(attr.default, 0.5)
        self.assertEqual(attr.range, [0.0, 1.0])
        self.assertEqual(attr.precision, 2)

    def test_from_dict_handles_missing_extended_fields(self):
        attr = AttributeSpec.from_dict(
            {"name": "flag", "type": "bool", "component": "checkbox"}
        )
        self.assertIsNone(attr.read_only)
        self.assertIsNone(attr.default)
        self.assertIsNone(attr.range)
        self.assertIsNone(attr.precision)

    def test_roundtrip_with_extended_fields(self):
        original = AttributeSpec(
            name="severity",
            type="float",
            component="slider",
            read_only=True,
            default=0.5,
            range=[0.0, 1.0],
            precision=2,
        )
        restored = AttributeSpec.from_dict(original.to_dict())
        self.assertEqual(restored.read_only, original.read_only)
        self.assertEqual(restored.default, original.default)
        self.assertEqual(restored.range, original.range)
        self.assertEqual(restored.precision, original.precision)


class AnnotationOntologyTests(unittest.TestCase):
    def test_create(self):
        ao = AnnotationOntology(
            name="vehicle_damage_ontology",
            description="Vehicle damage annotation",
            taxonomies=["vehicle_classes"],
            attributes=[
                AttributeSpec(
                    name="damage_present",
                    type="bool",
                    component="checkbox",
                ),
                AttributeSpec(
                    name="damage_location",
                    type="str",
                    component="dropdown",
                    values=["front", "rear", "driver_side", "passenger_side"],
                    when=WhenEquals(field="damage_present", value=True),
                ),
            ],
        )
        self.assertEqual(ao.name, "vehicle_damage_ontology")
        self.assertEqual(ao.description, "Vehicle damage annotation")
        self.assertEqual(ao.taxonomies, ["vehicle_classes"])
        self.assertEqual(len(ao.attributes), 2)
        self.assertEqual(ao._TYPE, "annotation_ontology")

    def test_create_empty(self):
        ao = AnnotationOntology(name="empty")
        self.assertEqual(ao.taxonomies, [])
        self.assertEqual(ao.attributes, [])

    def test_none_name_raises(self):
        with self.assertRaises(ValueError):
            AnnotationOntology(name=None)

    def test_empty_name_raises(self):
        with self.assertRaises(ValueError):
            AnnotationOntology(name="")

    def test_whitespace_name_raises(self):
        with self.assertRaises(ValueError):
            AnnotationOntology(name="   ")

    def test_name_is_stripped(self):
        ao = AnnotationOntology(name="  padded  ")
        self.assertEqual(ao.name, "padded")

    def test_to_dict(self):
        ao = AnnotationOntology(
            name="test_ao",
            description="A test",
            taxonomies=["tax1"],
            attributes=[
                AttributeSpec(
                    name="attr1",
                    type="bool",
                    component="checkbox",
                ),
            ],
        )
        d = ao.to_dict()
        self.assertEqual(d["name"], "test_ao")
        self.assertEqual(d["type"], "annotation_ontology")
        self.assertEqual(d["description"], "A test")
        self.assertEqual(d["root"]["taxonomies"], ["tax1"])
        self.assertEqual(len(d["root"]["attributes"]), 1)
        self.assertEqual(d["root"]["attributes"][0]["name"], "attr1")

    def test_from_dict(self):
        d = {
            "name": "test_ao",
            "type": "annotation_ontology",
            "description": "A test",
            "root": {
                "taxonomies": ["tax1", "tax2"],
                "attributes": [
                    {
                        "name": "attr1",
                        "type": "bool",
                        "component": "checkbox",
                    },
                    {
                        "name": "attr2",
                        "type": "str",
                        "component": "dropdown",
                        "values": ["a", "b"],
                        "when": {
                            "operator": "equals",
                            "field": "attr1",
                            "value": True,
                        },
                    },
                ],
            },
        }
        ao = AnnotationOntology.from_dict(d)
        self.assertEqual(ao.name, "test_ao")
        self.assertEqual(ao.description, "A test")
        self.assertEqual(ao.taxonomies, ["tax1", "tax2"])
        self.assertEqual(len(ao.attributes), 2)
        self.assertEqual(ao.attributes[1].when.field, "attr1")

    def test_from_dict_with_none_root(self):
        ao = AnnotationOntology.from_dict(
            {"name": "test_ao", "type": "annotation_ontology", "root": None}
        )
        self.assertEqual(ao.taxonomies, [])
        self.assertEqual(ao.attributes, [])

    def test_from_dict_with_missing_root(self):
        ao = AnnotationOntology.from_dict(
            {"name": "test_ao", "type": "annotation_ontology"}
        )
        self.assertEqual(ao.taxonomies, [])
        self.assertEqual(ao.attributes, [])

    def test_roundtrip(self):
        original = AnnotationOntology(
            name="vehicle_damage_ontology",
            description="Vehicle damage annotation",
            taxonomies=["vehicle_classes"],
            attributes=[
                AttributeSpec(
                    name="damage_present",
                    type="bool",
                    component="checkbox",
                ),
                AttributeSpec(
                    name="damage_location",
                    type="str",
                    component="dropdown",
                    values=["front", "rear"],
                    when=WhenEquals(field="damage_present", value=True),
                ),
                AttributeSpec(
                    name="airbags_deployed",
                    type="bool",
                    component="checkbox",
                    when=WhenEquals(field="damage_location", value="front"),
                ),
            ],
        )
        restored = AnnotationOntology.from_dict(original.to_dict())
        self.assertEqual(restored.name, original.name)
        self.assertEqual(restored.description, original.description)
        self.assertEqual(restored.taxonomies, original.taxonomies)
        self.assertEqual(len(restored.attributes), 3)
        self.assertEqual(restored.attributes[2].when.field, "damage_location")


class OntologySDKTests(unittest.TestCase):
    """Integration tests that hit MongoDB."""

    def setUp(self):
        import fiftyone.core.odm as foo

        db = foo.get_db_conn()
        db.drop_collection("ontologies")

        from fiftyone.core.odm.ontology import OntologyDocument

        OntologyDocument.ensure_indexes()

    def tearDown(self):
        import fiftyone.core.odm as foo

        db = foo.get_db_conn()
        db.drop_collection("ontologies")

    def _make_ontology(
        self, name: str = "test_ontology"
    ) -> AnnotationOntology:
        return AnnotationOntology(
            name=name,
            description="Test annotation ontology",
            taxonomies=["vehicle_classes"],
            attributes=[
                AttributeSpec(
                    name="damage_present",
                    type="bool",
                    component="checkbox",
                ),
                AttributeSpec(
                    name="damage_location",
                    type="str",
                    component="dropdown",
                    values=["front", "rear"],
                    when=WhenEquals(field="damage_present", value=True),
                ),
            ],
        )

    def test_save_and_load(self):
        from fiftyone.core.ontology import load_ontology

        ao = self._make_ontology()
        ao.save()

        self.assertIsNotNone(ao.version)
        self.assertIsNotNone(ao.created_at)

        loaded = load_ontology("test_ontology")
        self.assertEqual(loaded.name, "test_ontology")
        self.assertEqual(loaded.description, "Test annotation ontology")
        self.assertEqual(loaded.taxonomies, ["vehicle_classes"])
        self.assertEqual(len(loaded.attributes), 2)
        self.assertEqual(loaded.attributes[0].name, "damage_present")
        self.assertEqual(loaded.attributes[1].when.field, "damage_present")

    def test_save_and_reload(self):
        ao = self._make_ontology()
        ao.save()

        ao.description = "updated"
        ao.reload()

        self.assertEqual(ao.description, "Test annotation ontology")

    def test_delete(self):
        from fiftyone.core.ontology import delete_ontology, load_ontology

        ao = self._make_ontology()
        ao.save()

        ao.delete()
        self.assertIsNone(ao._doc)

        with self.assertRaises(ValueError):
            load_ontology("test_ontology")

    def test_delete_via_function(self):
        from fiftyone.core.ontology import delete_ontology, ontology_exists

        ao = self._make_ontology()
        ao.save()

        delete_ontology("test_ontology")
        self.assertFalse(ontology_exists("test_ontology"))

    def test_delete_nonexistent_raises(self):
        from fiftyone.core.ontology import delete_ontology

        with self.assertRaises(ValueError):
            delete_ontology("nonexistent")

    def test_list_ontologies(self):
        from fiftyone.core.ontology import list_ontologies

        self._make_ontology("alpha").save()
        self._make_ontology("beta").save()
        self._make_ontology("gamma").save()

        names = list_ontologies()
        self.assertEqual(names, ["alpha", "beta", "gamma"])

    def test_list_ontologies_glob(self):
        from fiftyone.core.ontology import list_ontologies

        self._make_ontology("vehicle_damage").save()
        self._make_ontology("vehicle_classes").save()
        self._make_ontology("person_attributes").save()

        names = list_ontologies("vehicle_*")
        self.assertEqual(names, ["vehicle_classes", "vehicle_damage"])

    def test_ontology_exists(self):
        from fiftyone.core.ontology import ontology_exists

        self.assertFalse(ontology_exists("test_ontology"))

        self._make_ontology().save()
        self.assertTrue(ontology_exists("test_ontology"))

    def test_load_nonexistent_raises(self):
        from fiftyone.core.ontology import load_ontology

        with self.assertRaises(ValueError):
            load_ontology("nonexistent")

    def test_clone(self):
        from fiftyone.core.ontology import load_ontology, ontology_exists

        ao = self._make_ontology("original")
        ao.save()

        cloned = ao.clone("cloned")

        self.assertTrue(ontology_exists("original"))
        self.assertTrue(ontology_exists("cloned"))
        self.assertEqual(cloned.name, "cloned")
        self.assertEqual(len(cloned.attributes), 2)

        original = load_ontology("original")
        self.assertEqual(original.name, "original")


class NodeTests(unittest.TestCase):
    def test_create_leaf(self):
        n = Node(name="car")
        self.assertEqual(n.name, "car")
        self.assertIsNone(n.description)
        self.assertTrue(n.can_select)
        self.assertFalse(n.deprecated)
        self.assertIsNone(n.values)

    def test_create_with_children(self):
        n = Node(
            name="vehicles",
            description="any vehicle",
            can_select=False,
            values=[Node(name="car"), Node(name="truck")],
        )
        self.assertEqual(len(n.values), 2)
        self.assertFalse(n.can_select)

    def test_empty_name_raises(self):
        with self.assertRaises(ValueError):
            Node(name="")

    def test_round_trip_leaf(self):
        n = Node(name="car")
        round_tripped = Node.from_dict(n.to_dict())
        self.assertEqual(round_tripped.to_dict(), n.to_dict())
        self.assertNotIn("values", n.to_dict())

    def test_round_trip_nested(self):
        n = Node(
            name="vehicles",
            description="anything that moves",
            can_select=False,
            values=[
                Node(name="car"),
                Node(
                    name="truck",
                    values=[
                        Node(name="pickup"),
                        Node(name="semi", deprecated=True),
                    ],
                ),
            ],
        )
        d = n.to_dict()
        round_tripped = Node.from_dict(d)
        self.assertEqual(round_tripped.to_dict(), d)

    def test_default_flags_omitted_from_dict(self):
        d = Node(name="car").to_dict()
        self.assertNotIn("can_select", d)
        self.assertNotIn("deprecated", d)
        self.assertNotIn("description", d)


class TaxonomyTests(unittest.TestCase):
    def _tree(self):
        return Node(
            name="vehicles",
            can_select=False,
            values=[Node(name="car"), Node(name="truck")],
        )

    def test_create(self):
        t = Taxonomy(name="vehicle_classes", root=self._tree())
        self.assertEqual(t.name, "vehicle_classes")
        self.assertEqual(t.root.name, "vehicles")
        self.assertTrue(t.is_taxonomy)
        self.assertFalse(t.is_annotation_ontology)

    def test_root_must_be_node(self):
        with self.assertRaises(ValueError):
            Taxonomy(name="x", root={"name": "vehicles"})

    def test_round_trip(self):
        t = Taxonomy(
            name="vehicle_classes",
            description="cars and trucks",
            root=self._tree(),
        )
        d = t.to_dict()
        round_tripped = Taxonomy.from_dict(d)
        self.assertEqual(round_tripped.to_dict(), d)


class TaxonomySDKTests(unittest.TestCase):
    """Integration tests for Taxonomy CRUD against MongoDB."""

    def setUp(self):
        import fiftyone.core.odm as foo

        db = foo.get_db_conn()
        db.drop_collection("ontologies")

        from fiftyone.core.odm.ontology import OntologyDocument

        OntologyDocument.ensure_indexes()

    def tearDown(self):
        import fiftyone.core.odm as foo

        db = foo.get_db_conn()
        db.drop_collection("ontologies")

    def test_save_and_load(self):
        t = make_taxonomy()
        t.save()

        self.assertIsNotNone(t.version)
        self.assertIsNotNone(t.created_at)

        loaded = load_ontology("test_taxonomy")
        self.assertIsInstance(loaded, Taxonomy)
        self.assertEqual(loaded.name, "test_taxonomy")
        self.assertEqual(loaded.root.name, "vehicles")
        self.assertEqual(loaded.root.values[1].values[0].name, "pickup")

    def test_save_and_reload(self):
        t = make_taxonomy()
        t.save()

        t.description = "updated"
        t.reload()
        self.assertEqual(t.description, "Test taxonomy")

    def test_delete(self):
        from fiftyone.core.ontology import ontology_exists

        t = make_taxonomy()
        t.save()
        t.delete()

        self.assertIsNone(t._doc)
        self.assertFalse(ontology_exists("test_taxonomy"))

    def test_clone(self):
        from fiftyone.core.ontology import ontology_exists

        t = make_taxonomy("original")
        t.save()

        cloned = t.clone("cloned")
        self.assertIsInstance(cloned, Taxonomy)
        self.assertTrue(ontology_exists("original"))
        self.assertTrue(ontology_exists("cloned"))
        self.assertEqual(cloned.root.name, "vehicles")


class ValidateTaxonomyTests(unittest.TestCase):
    def test_valid_passes(self):
        t = Taxonomy(
            name="vehicles",
            root=Node(
                name="root",
                values=[Node(name="car"), Node(name="truck")],
            ),
        )
        validate_taxonomy(t)

    def test_single_node_passes(self):
        t = Taxonomy(name="solo", root=Node(name="only_node"))
        validate_taxonomy(t)

    def test_deeply_nested_passes(self):
        t = Taxonomy(
            name="deep",
            root=Node(
                name="root",
                values=[
                    Node(
                        name="vehicles",
                        values=[
                            Node(
                                name="cars",
                                values=[
                                    Node(name="sedan"),
                                    Node(name="coupe"),
                                ],
                            ),
                        ],
                    ),
                ],
            ),
        )
        validate_taxonomy(t)

    def test_duplicate_sibling_names_fail(self):
        t = Taxonomy(
            name="dup",
            root=Node(
                name="root",
                values=[Node(name="car"), Node(name="car")],
            ),
        )
        with self.assertRaises(ValueError) as ctx:
            validate_taxonomy(t)
        self.assertIn("duplicate node name(s)", str(ctx.exception))
        self.assertIn("car", str(ctx.exception))

    def test_duplicate_across_subtrees_fail(self):
        t = Taxonomy(
            name="dup_across",
            root=Node(
                name="root",
                values=[
                    Node(name="vehicles", values=[Node(name="x")]),
                    Node(name="animals", values=[Node(name="x")]),
                ],
            ),
        )
        with self.assertRaises(ValueError) as ctx:
            validate_taxonomy(t)
        self.assertIn("x", str(ctx.exception))

    def test_root_name_collides_with_descendant_fails(self):
        t = Taxonomy(
            name="root_collides",
            root=Node(
                name="root",
                values=[Node(name="root")],
            ),
        )
        with self.assertRaises(ValueError) as ctx:
            validate_taxonomy(t)
        self.assertIn("root", str(ctx.exception))

    def test_cycle_detected(self):
        a = Node(name="a")
        b = Node(name="b", values=[a])
        a.values = [b]
        t = Taxonomy(name="cyclic", root=a)
        with self.assertRaises(ValueError) as ctx:
            validate_taxonomy(t)
        self.assertIn("cycle detected", str(ctx.exception))

    def test_save_invokes_validation(self):
        # Auto-validate hook in Ontology.save() — invalid taxonomies
        # raise before any DB interaction.
        t = Taxonomy(
            name="bad",
            root=Node(
                name="root",
                values=[Node(name="dup"), Node(name="dup")],
            ),
        )
        with self.assertRaises(ValueError):
            t.save()


if __name__ == "__main__":
    unittest.main()
