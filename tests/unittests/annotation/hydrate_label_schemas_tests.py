"""
FiftyOne annotation unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest.mock import MagicMock, patch

from fiftyone.core.annotation.attributes import AttributeSpec
from fiftyone.core.annotation.hydrate_label_schemas import (
    dehydrate_applied_ontology,
    hydrate_applied_ontology,
)
from fiftyone.core.ontology import AnnotationOntology

from decorators import drop_datasets, drop_ontologies


class HydrateLabelSchemasTests(unittest.TestCase):
    @drop_datasets
    @drop_ontologies
    def test_no_applied_ontology_returns_schema_unchanged(self):
        schema = {
            "type": "detections",
            "attributes": [
                {"name": "color", "type": "str", "component": "text"}
            ],
        }
        result = hydrate_applied_ontology(schema)
        self.assertEqual(result, schema)

    @drop_datasets
    @drop_ontologies
    def test_ontology_attributes_merged_into_empty_attributes(self):
        AnnotationOntology(
            name="my_ontology",
            attributes=[
                AttributeSpec(
                    name="damage_location",
                    type="str",
                    component="dropdown",
                    values=["front", "rear"],
                ),
            ],
        ).save()

        schema = {
            "type": "detections",
            "applied_ontology": "my_ontology",
            "attributes": [],
        }
        result = hydrate_applied_ontology(schema)
        self.assertEqual(len(result["attributes"]), 1)
        self.assertEqual(result["attributes"][0]["name"], "damage_location")
        self.assertEqual(result["attributes"][0]["_source"], "my_ontology")

    @drop_datasets
    @drop_ontologies
    def test_ontology_wins_on_name_collision(self):
        AnnotationOntology(
            name="my_ontology",
            attributes=[
                AttributeSpec(
                    name="color",
                    type="str",
                    component="dropdown",
                    values=["red", "blue"],
                ),
            ],
        ).save()

        schema = {
            "type": "detections",
            "applied_ontology": "my_ontology",
            "attributes": [
                {"name": "color", "type": "str", "component": "text"},
            ],
        }
        result = hydrate_applied_ontology(schema)
        self.assertEqual(len(result["attributes"]), 1)
        color = result["attributes"][0]
        self.assertEqual(color["component"], "dropdown")
        self.assertEqual(color["values"], ["red", "blue"])
        self.assertEqual(color["_source"], "my_ontology")

    @drop_datasets
    @drop_ontologies
    def test_ontology_and_local_attrs_both_preserved(self):
        AnnotationOntology(
            name="my_ontology",
            attributes=[
                AttributeSpec(
                    name="damage", type="bool", component="checkbox"
                ),
            ],
        ).save()

        schema = {
            "type": "detections",
            "applied_ontology": "my_ontology",
            "attributes": [
                {"name": "local_note", "type": "str", "component": "text"},
            ],
        }
        result = hydrate_applied_ontology(schema)
        names = [a["name"] for a in result["attributes"]]
        self.assertEqual(names, ["local_note", "damage"])

        local = next(
            a for a in result["attributes"] if a["name"] == "local_note"
        )
        ontology_attr = next(
            a for a in result["attributes"] if a["name"] == "damage"
        )
        self.assertNotIn("_source", local)
        self.assertEqual(ontology_attr["_source"], "my_ontology")

    @drop_datasets
    @drop_ontologies
    def test_dangling_reference_strips_applied_ontology(self):
        schema = {
            "type": "detections",
            "applied_ontology": "nonexistent_ontology_xyz",
            "attributes": [
                {"name": "color", "type": "str", "component": "text"},
            ],
        }
        result = hydrate_applied_ontology(schema)
        self.assertNotIn("applied_ontology", result)
        self.assertEqual(result["attributes"], schema["attributes"])
        # Input not mutated
        self.assertEqual(
            schema["applied_ontology"], "nonexistent_ontology_xyz"
        )

    @drop_datasets
    @drop_ontologies
    def test_non_annotation_ontology_strips_applied_ontology(self):
        schema = {
            "type": "detections",
            "applied_ontology": "some_taxonomy",
            "attributes": [],
        }
        non_annotation = MagicMock(
            is_annotation_ontology=False, name="some_taxonomy"
        )
        with patch(
            "fiftyone.core.ontology.load_ontology",
            return_value=non_annotation,
        ):
            result = hydrate_applied_ontology(schema)
        self.assertNotIn("applied_ontology", result)
        self.assertEqual(schema["applied_ontology"], "some_taxonomy")

    @drop_datasets
    @drop_ontologies
    def test_applied_taxonomy_surfaces_when_ao_bundles_taxonomy(self):
        from fiftyone.core.annotation.nodes import Node
        from fiftyone.core.ontology import Taxonomy

        tax = Taxonomy(
            name="vehicle_classes",
            root=Node(name="root", values=[Node(name="car")]),
        )
        tax.save()
        AnnotationOntology(name="my_ontology", taxonomy=tax).save()

        schema = {
            "type": "detections",
            "applied_ontology": "my_ontology",
            "attributes": [],
        }
        result = hydrate_applied_ontology(schema)
        # Surfaced as the taxonomy's slug.
        self.assertEqual(result["applied_taxonomy"], "vehicle-classes")
        # Not persisted on the input.
        self.assertNotIn("applied_taxonomy", schema)

    @drop_datasets
    @drop_ontologies
    def test_applied_taxonomy_omitted_when_ao_has_no_taxonomy(self):
        AnnotationOntology(name="my_ontology").save()

        schema = {
            "type": "detections",
            "applied_ontology": "my_ontology",
            "attributes": [],
        }
        result = hydrate_applied_ontology(schema)
        self.assertNotIn("applied_taxonomy", result)


class DehydrateLabelSchemasTests(unittest.TestCase):
    @drop_datasets
    @drop_ontologies
    def test_no_applied_ontology_returns_schema_unchanged(self):
        schema = {
            "type": "detections",
            "attributes": [
                {
                    "name": "color",
                    "type": "str",
                    "component": "text",
                    "_source": "stray",
                }
            ],
        }
        result = dehydrate_applied_ontology(schema)
        self.assertEqual(result, schema)

    @drop_datasets
    @drop_ontologies
    def test_ontology_owned_attributes_dropped(self):
        AnnotationOntology(
            name="my_ontology",
            attributes=[
                AttributeSpec(name="owned", type="bool", component="checkbox"),
            ],
        ).save()

        schema = {
            "type": "detections",
            "applied_ontology": "my_ontology",
            "attributes": [
                {
                    "name": "owned",
                    "type": "bool",
                    "component": "checkbox",
                    "_source": "my_ontology",
                },
                {"name": "local", "type": "str", "component": "text"},
            ],
        }
        result = dehydrate_applied_ontology(schema)
        names = [a["name"] for a in result["attributes"]]
        self.assertEqual(names, ["local"])

    @drop_datasets
    @drop_ontologies
    def test_source_stripped_from_local_attributes(self):
        AnnotationOntology(
            name="my_ontology",
            attributes=[
                AttributeSpec(name="owned", type="bool", component="checkbox"),
            ],
        ).save()

        schema = {
            "type": "detections",
            "applied_ontology": "my_ontology",
            "attributes": [
                {
                    "name": "local",
                    "type": "str",
                    "component": "text",
                    "_source": "forged",
                },
            ],
        }
        result = dehydrate_applied_ontology(schema)
        self.assertNotIn("_source", result["attributes"][0])

    @drop_datasets
    @drop_ontologies
    def test_dangling_reference_returns_schema_unchanged(self):
        schema = {
            "type": "detections",
            "applied_ontology": "nonexistent_ontology_xyz",
            "attributes": [
                {
                    "name": "local",
                    "type": "str",
                    "component": "text",
                    "_source": "stray",
                }
            ],
        }
        result = dehydrate_applied_ontology(schema)
        self.assertEqual(result, schema)

    @drop_datasets
    @drop_ontologies
    def test_applied_taxonomy_stripped_on_dehydrate(self):
        AnnotationOntology(name="my_ontology").save()

        schema = {
            "type": "detections",
            "applied_ontology": "my_ontology",
            "applied_taxonomy": "vehicle_classes",
            "attributes": [
                {"name": "local", "type": "str", "component": "text"},
            ],
        }
        result = dehydrate_applied_ontology(schema)
        self.assertNotIn("applied_taxonomy", result)

    @drop_datasets
    @drop_ontologies
    def test_roundtrip_hydrate_then_dehydrate_matches_original(self):
        AnnotationOntology(
            name="my_ontology",
            attributes=[
                AttributeSpec(name="owned", type="bool", component="checkbox"),
            ],
        ).save()

        original = {
            "type": "detections",
            "applied_ontology": "my_ontology",
            "attributes": [
                {"name": "local", "type": "str", "component": "text"},
            ],
        }
        hydrated = hydrate_applied_ontology(original)
        dehydrated = dehydrate_applied_ontology(hydrated)
        self.assertEqual(dehydrated["attributes"], original["attributes"])
