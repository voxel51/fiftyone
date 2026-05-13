"""
FiftyOne annotation unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os

os.environ.setdefault("VFF_ONTOLOGY_CA", "1")
os.environ.setdefault("VFF_ONTOLOGY_TX", "1")

import unittest
from unittest.mock import MagicMock, patch

from fiftyone.core.annotation.attributes import AttributeSpec
from fiftyone.core.annotation.hydrate_label_schemas import (
    dehydrate_applied_ontology,
    dehydrate_taxonomy,
    hydrate_applied_ontology,
    hydrate_taxonomy,
)
from fiftyone.core.ontology import AnnotationOntology

from decorators import drop_datasets, drop_ontologies
from ontology_fixtures import make_taxonomy


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


class HydrateTaxonomyTests(unittest.TestCase):
    @drop_datasets
    @drop_ontologies
    def test_no_taxonomy_returns_schema_unchanged(self):
        schema = {
            "type": "detections",
            "attributes": [
                {"name": "color", "type": "str", "component": "text"}
            ],
        }
        result = hydrate_taxonomy(schema)
        self.assertEqual(result, schema)

    @drop_datasets
    @drop_ontologies
    def test_string_reference_replaced_with_to_dict(self):
        make_taxonomy("vehicles").save()

        schema = {"type": "detections", "taxonomy": "vehicles"}
        result = hydrate_taxonomy(schema)
        self.assertIsInstance(result["taxonomy"], dict)
        self.assertEqual(result["taxonomy"]["name"], "vehicles")
        self.assertEqual(result["taxonomy"]["root"]["name"], "vehicles")
        self.assertEqual(len(result["taxonomy"]["root"]["values"]), 2)

    @drop_datasets
    @drop_ontologies
    def test_dangling_reference_strips_taxonomy(self):
        schema = {
            "type": "detections",
            "taxonomy": "nonexistent_taxonomy_xyz",
        }
        result = hydrate_taxonomy(schema)
        self.assertNotIn("taxonomy", result)
        # Input not mutated
        self.assertEqual(schema["taxonomy"], "nonexistent_taxonomy_xyz")

    @drop_datasets
    @drop_ontologies
    def test_non_taxonomy_reference_strips_taxonomy(self):
        schema = {"type": "detections", "taxonomy": "some_annotation"}
        non_taxonomy = MagicMock(is_taxonomy=False, name="some_annotation")
        with patch(
            "fiftyone.core.ontology.load_ontology",
            return_value=non_taxonomy,
        ):
            result = hydrate_taxonomy(schema)
        self.assertNotIn("taxonomy", result)
        self.assertEqual(schema["taxonomy"], "some_annotation")

    @drop_datasets
    @drop_ontologies
    def test_already_resolved_dict_passes_through_unchanged(self):
        schema = {
            "type": "detections",
            "taxonomy": {"name": "vehicles", "root": {"name": "vehicles"}},
        }
        result = hydrate_taxonomy(schema)
        self.assertEqual(result, schema)


class DehydrateTaxonomyTests(unittest.TestCase):
    @drop_datasets
    @drop_ontologies
    def test_no_taxonomy_returns_schema_unchanged(self):
        schema = {"type": "detections", "attributes": []}
        result = dehydrate_taxonomy(schema)
        self.assertEqual(result, schema)

    @drop_datasets
    @drop_ontologies
    def test_string_reference_passes_through_unchanged(self):
        schema = {"type": "detections", "taxonomy": "vehicles"}
        result = dehydrate_taxonomy(schema)
        self.assertEqual(result, schema)

    @drop_datasets
    @drop_ontologies
    def test_resolved_dict_reduced_to_name(self):
        schema = {
            "type": "detections",
            "taxonomy": {
                "name": "vehicles",
                "root": {"name": "vehicles", "values": []},
                "version": 3,
            },
        }
        result = dehydrate_taxonomy(schema)
        self.assertEqual(result["taxonomy"], "vehicles")

    @drop_datasets
    @drop_ontologies
    def test_resolved_dict_without_name_drops_key(self):
        schema = {"type": "detections", "taxonomy": {"root": {}}}
        result = dehydrate_taxonomy(schema)
        self.assertNotIn("taxonomy", result)

    @drop_datasets
    @drop_ontologies
    def test_roundtrip_hydrate_then_dehydrate_matches_original(self):
        make_taxonomy("vehicles").save()

        original = {"type": "detections", "taxonomy": "vehicles"}
        hydrated = hydrate_taxonomy(original)
        dehydrated = dehydrate_taxonomy(hydrated)
        self.assertEqual(dehydrated, original)
