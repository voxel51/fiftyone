"""
FiftyOne ontology data class unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.core.annotation.attributes import (
    AttributeSpec,
    When,
    WhenOperator,
)
from fiftyone.core.ontology import AnnotationOntology


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


class AttributeSpecTests(unittest.TestCase):
    def test_create_full(self):
        attr = AttributeSpec(
            name="damage_location",
            type="str",
            component="dropdown",
            values=["front", "rear"],
            when=[
                When(WhenOperator.EQUALS, field="damage_present", value=True)
            ],
        )
        self.assertEqual(attr.name, "damage_location")
        self.assertEqual(attr.type, "str")
        self.assertEqual(attr.component, "dropdown")
        self.assertEqual(attr.values, ["front", "rear"])
        self.assertEqual(len(attr.when), 1)

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
            when=[
                When(WhenOperator.EQUALS, field="damage_present", value=True)
            ],
        )
        d = attr.to_dict()
        self.assertEqual(d["name"], "severity")
        self.assertEqual(d["type"], "str")
        self.assertEqual(d["component"], "radio")
        self.assertEqual(d["values"], ["minor", "moderate", "severe"])
        self.assertEqual(len(d["when"]), 1)
        self.assertEqual(d["when"][0]["operator"], "equals")

    def test_from_dict(self):
        d = {
            "name": "damage_location",
            "type": "str",
            "component": "dropdown",
            "values": ["front", "rear"],
            "when": [
                {
                    "operator": "equals",
                    "field": "damage_present",
                    "value": True,
                },
            ],
        }
        attr = AttributeSpec.from_dict(d)
        self.assertEqual(attr.name, "damage_location")
        self.assertEqual(attr.type, "str")
        self.assertEqual(attr.component, "dropdown")
        self.assertEqual(attr.values, ["front", "rear"])
        self.assertEqual(len(attr.when), 1)
        self.assertEqual(attr.when[0].operator, WhenOperator.EQUALS)

    def test_roundtrip(self):
        original = AttributeSpec(
            name="damage_location",
            type="str",
            component="dropdown",
            values=["front", "rear"],
            when=[
                When(WhenOperator.EQUALS, field="damage_present", value=True)
            ],
        )
        restored = AttributeSpec.from_dict(original.to_dict())
        self.assertEqual(restored.name, original.name)
        self.assertEqual(restored.type, original.type)
        self.assertEqual(restored.component, original.component)
        self.assertEqual(restored.values, original.values)
        self.assertEqual(len(restored.when), len(original.when))
        self.assertEqual(
            restored.when[0].to_dict(), original.when[0].to_dict()
        )


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
                    when=[
                        When(
                            WhenOperator.EQUALS,
                            field="damage_present",
                            value=True,
                        )
                    ],
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
                        "when": [
                            {
                                "operator": "equals",
                                "field": "attr1",
                                "value": True,
                            }
                        ],
                    },
                ],
            },
        }
        ao = AnnotationOntology.from_dict(d)
        self.assertEqual(ao.name, "test_ao")
        self.assertEqual(ao.description, "A test")
        self.assertEqual(ao.taxonomies, ["tax1", "tax2"])
        self.assertEqual(len(ao.attributes), 2)
        self.assertEqual(ao.attributes[1].when[0].field, "attr1")

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
                    when=[
                        When(
                            WhenOperator.EQUALS,
                            field="damage_present",
                            value=True,
                        )
                    ],
                ),
                AttributeSpec(
                    name="airbags_deployed",
                    type="bool",
                    component="checkbox",
                    when=[
                        When(
                            WhenOperator.EQUALS,
                            field="damage_location",
                            value="front",
                        )
                    ],
                ),
            ],
        )
        restored = AnnotationOntology.from_dict(original.to_dict())
        self.assertEqual(restored.name, original.name)
        self.assertEqual(restored.description, original.description)
        self.assertEqual(restored.taxonomies, original.taxonomies)
        self.assertEqual(len(restored.attributes), 3)
        self.assertEqual(
            restored.attributes[2].when[0].field, "damage_location"
        )


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
                    when=[
                        When(
                            WhenOperator.EQUALS,
                            field="damage_present",
                            value=True,
                        )
                    ],
                ),
            ],
        )

    def test_save_and_load(self):
        from fiftyone.core.ontology import create_ontology, load_ontology

        ao = self._make_ontology()
        create_ontology(ao)

        self.assertIsNotNone(ao.version)
        self.assertIsNotNone(ao.created_at)

        loaded = load_ontology("test_ontology")
        self.assertEqual(loaded.name, "test_ontology")
        self.assertEqual(loaded.description, "Test annotation ontology")
        self.assertEqual(loaded.taxonomies, ["vehicle_classes"])
        self.assertEqual(len(loaded.attributes), 2)
        self.assertEqual(loaded.attributes[0].name, "damage_present")
        self.assertEqual(loaded.attributes[1].when[0].field, "damage_present")

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

    def test_rename_ontology(self):
        from fiftyone.core.ontology import (
            load_ontology,
            ontology_exists,
            rename_ontology,
        )

        self._make_ontology("old_name").save()

        rename_ontology("old_name", "new_name")

        self.assertFalse(ontology_exists("old_name"))
        loaded = load_ontology("new_name")
        self.assertEqual(loaded.name, "new_name")
        self.assertEqual(len(loaded.attributes), 2)

    def test_rename_nonexistent_raises(self):
        from fiftyone.core.ontology import rename_ontology

        with self.assertRaises(ValueError):
            rename_ontology("nonexistent", "new_name")

    def test_clone_ontology(self):
        from fiftyone.core.ontology import (
            clone_ontology,
            load_ontology,
            ontology_exists,
        )

        self._make_ontology("original").save()

        cloned = clone_ontology("original", "cloned")

        self.assertTrue(ontology_exists("original"))
        self.assertTrue(ontology_exists("cloned"))
        self.assertEqual(cloned.name, "cloned")
        self.assertEqual(len(cloned.attributes), 2)

        original = load_ontology("original")
        self.assertEqual(original.name, "original")


if __name__ == "__main__":
    unittest.main()
