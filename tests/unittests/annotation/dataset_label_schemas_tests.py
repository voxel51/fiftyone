"""
FiftyOne annotation unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from exceptiongroup import ExceptionGroup

import fiftyone as fo
import fiftyone.core.labels as fol
from fiftyone.core.annotation.attributes import AttributeSpec
from fiftyone.core.ontology import AnnotationOntology, apply_ontology

from decorators import drop_datasets, drop_ontologies


class DatasetAnnotationTests(unittest.TestCase):
    @drop_datasets
    def test_empty_label_schemas(self):
        dataset = fo.Dataset()
        dataset.active_label_schemas = []
        dataset.active_label_schemas = None
        self.assertEqual(dataset.active_label_schemas, [])
        with self.assertRaises(ValueError):
            dataset.active_label_schemas = ["one"]

        self.assertEqual(dataset.label_schemas, {})
        dataset.set_label_schemas(None)
        self.assertEqual(dataset.label_schemas, {})
        dataset.set_label_schemas({})

    @drop_datasets
    def test_active_label_schemas(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("test", fo.IntField)

        with self.assertRaises(ValueError):
            dataset.activate_label_schemas("test")

        with self.assertRaises(ValueError):
            dataset.deactivate_label_schemas("test")

        with self.assertRaises(ValueError):
            dataset.active_label_schemas = ["test"]

        # noop
        dataset.activate_label_schemas()

        # noop
        dataset.deactivate_label_schemas()

        dataset.set_label_schemas(
            {"test": {"type": "int", "component": "text"}}
        )
        dataset.activate_label_schemas()
        self.assertEqual(dataset.active_label_schemas, ["test"])

        dataset.deactivate_label_schemas()
        self.assertEqual(dataset.active_label_schemas, [])

        dataset.active_label_schemas = ["test"]

        dataset.add_sample_field("other", fo.StringField)
        dataset.update_label_schema(
            "other", {"type": "str", "component": "text"}
        )

        dataset.activate_label_schemas("other")
        self.assertEqual(dataset.active_label_schemas, ["test", "other"])

        dataset.deactivate_label_schemas("test")
        dataset.activate_label_schemas("test")
        self.assertEqual(dataset.active_label_schemas, ["other", "test"])

        dataset.active_label_schemas = ["test", "other"]
        self.assertEqual(dataset.active_label_schemas, ["test", "other"])

    @drop_datasets
    def test_delete_sample_field(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("test", fo.IntField)
        dataset.set_label_schemas(
            {"test": {"type": "int", "component": "text"}}
        )
        dataset.activate_label_schemas("test")
        dataset.delete_sample_field("test")

        self.assertNotIn("test", dataset.active_label_schemas)
        self.assertNotIn("test", dataset.label_schemas)

        dataset.add_sample_field(
            "detections",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Detections,
        )
        dataset.add_sample_field("detections.detections.int", fo.IntField)
        dataset.set_label_schemas(
            {
                "detections": {
                    "attributes": [
                        {"name": "int", "component": "text", "type": "int"}
                    ],
                    "type": "detections",
                },
            }
        )

        dataset.delete_sample_field("detections.detections.int")
        self.assertEqual(
            {
                "detections": {
                    "attributes": [],
                    "type": "detections",
                },
            },
            dataset.label_schemas,
        )

        dataset.add_sample_field(
            "doc",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )
        dataset.add_sample_field("doc.int", fo.IntField)
        dataset.set_label_schemas(
            {"doc.int": {"component": "text", "type": "int"}}
        )

        dataset.delete_sample_field("doc")
        self.assertNotIn("doc.int", dataset.label_schemas)

    @drop_datasets
    def test_update_label_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("test", fo.IntField)

        dataset.update_label_schema(
            "test", {"type": "int", "component": "text"}
        )
        self.assertEqual(
            dataset.label_schemas,
            {"test": {"type": "int", "component": "text"}},
        )

        dataset.update_label_schema(
            "test", {"type": "int", "component": "text"}
        )
        self.assertEqual(
            dataset.label_schemas,
            {"test": {"type": "int", "component": "text"}},
        )

        with self.assertRaises(ExceptionGroup):
            dataset.update_label_schema(
                "missing",
                {
                    "type": "int",
                    "component": "text",
                },
            )

    @drop_datasets
    def test_rename_sample_field(self):
        dataset = fo.Dataset()

        dataset.add_sample_field("test", fo.IntField)
        dataset.set_label_schemas(
            {"test": {"type": "int", "component": "text"}}
        )
        dataset.activate_label_schemas()
        dataset.rename_sample_field("test", "renamed")
        self.assertEqual(
            dataset.label_schemas,
            {"renamed": {"type": "int", "component": "text"}},
        )
        self.assertEqual(dataset.active_label_schemas, ["renamed"])

        dataset.add_sample_field(
            "test_label",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classification,
        )
        dataset.add_sample_field("test_label.test", fo.IntField)
        dataset.set_label_schemas(
            {
                "test_label": {
                    "attributes": [
                        {"name": "test", "type": "int", "component": "text"}
                    ],
                    "type": "classification",
                }
            }
        )

        dataset.rename_sample_field("test_label", "renamed_label")
        self.assertEqual(
            dataset.label_schemas,
            {
                "renamed_label": {
                    "attributes": [
                        {"name": "test", "type": "int", "component": "text"}
                    ],
                    "type": "classification",
                }
            },
        )

        dataset.add_sample_field(
            "test_labels",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classifications,
        )
        dataset.add_sample_field(
            "test_labels.classifications.test", fo.IntField
        )
        dataset.set_label_schemas(
            {
                "test_labels": {
                    "attributes": [
                        {"name": "test", "type": "int", "component": "text"}
                    ],
                    "type": "classifications",
                }
            }
        )

        dataset.rename_sample_field("test_labels", "renamed_labels")
        self.assertEqual(
            dataset.label_schemas,
            {
                "renamed_labels": {
                    "attributes": [
                        {"name": "test", "type": "int", "component": "text"}
                    ],
                    "type": "classifications",
                }
            },
        )

        dataset.rename_sample_field(
            "renamed_labels.classifications.test",
            "renamed_labels.classifications.renamed",
        )
        self.assertEqual(
            dataset.label_schemas["renamed_labels"],
            {
                "attributes": [
                    {"name": "renamed", "type": "int", "component": "text"}
                ],
                "type": "classifications",
            },
        )

        dataset.add_sample_field(
            "dynamic",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )
        dataset.add_sample_field("dynamic.subfield", fo.IntField)
        dataset.update_label_schema(
            "dynamic.subfield", {"type": "int", "component": "text"}
        )
        dataset.rename_sample_field("dynamic", "dynamic_renamed")
        self.assertNotIn("dynamic.subfield", dataset.label_schemas)
        self.assertIn("dynamic_renamed.subfield", dataset.label_schemas)

    @drop_datasets
    def test_set_label_schemas(self):
        dataset = fo.Dataset()

        dataset.set_label_schemas(
            {
                "filepath": {"type": "str", "component": "text"},
            }
        )

        dataset.reload()
        self.assertEqual(
            dataset.label_schemas,
            {
                "filepath": {"type": "str", "component": "text"},
            },
        )

        # wrong 'type'
        with self.assertRaises(ExceptionGroup):
            dataset.set_label_schemas(
                {
                    "filepath": {"type": "int", "component": "text"},
                }
            )

        # missing field
        with self.assertRaises(ExceptionGroup):
            dataset.set_label_schemas(
                {
                    "no_field": {"type": "str", "component": "text"},
                }
            )

    @drop_datasets
    def test_unsupported(self):
        dataset = fo.Dataset()
        for label_type in [
            fol.GeoLocation,
            fol.GeoLocations,
            fol.TemporalDetection,
            fol.TemporalDetections,
        ]:
            dataset.add_sample_field(
                "unsupported",
                fo.EmbeddedDocumentField,
                embedded_doc_type=label_type,
            )
            with self.assertRaises(ExceptionGroup):
                dataset.set_label_schemas(
                    {"unsupported": {"type": label_type.__name__.lower()}}
                )
            dataset.delete_sample_field("unsupported")

        # embedded document lists are not supported
        dataset.add_sample_field(
            "unsupported",
            fo.ListField,
            subfield=fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )
        dataset.add_sample_field("unsupported.subfield", fo.IntField)
        with self.assertRaises(ExceptionGroup):
            dataset.set_label_schemas(
                {"unsupported.subfield": {"type": "int", "component": "text"}}
            )
        dataset.delete_sample_field("unsupported")

        # too.much.nesting
        dataset.add_sample_field(
            "unsupported",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )
        dataset.add_sample_field(
            "unsupported.subfield",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )
        dataset.add_sample_field("unsupported.subfield.nesting", fo.IntField)
        with self.assertRaises(ExceptionGroup):
            dataset.set_label_schemas(
                {
                    "unsupported.subfield.nesting": {
                        "type": "int",
                        "component": "text",
                    },
                }
            )
        dataset.delete_sample_field("unsupported.subfield.nesting")

        # labels are not.expanded
        dataset.add_sample_field(
            "labels",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classifications,
        )
        dataset.add_sample_field("labels.subfield", fo.IntField)
        with self.assertRaises(ExceptionGroup):
            dataset.set_label_schemas(
                {
                    "labels.subfield": {
                        "type": "int",
                        "component": "text",
                    },
                }
            )
        dataset.delete_sample_field("labels")

    @drop_datasets
    @drop_ontologies
    def test_apply_ontology_apply(self):
        dataset = _make_applied_ontology_test_dataset()
        dataset.set_label_schemas({"detections": {"type": "detections"}})

        schemas = apply_ontology(
            dataset.label_schemas, "detections", "my_ontology"
        )
        dataset.set_label_schemas(schemas)

        self.assertEqual(
            dataset.label_schemas["detections"].get("applied_ontology"),
            "my_ontology",
        )
        # other keys are preserved
        self.assertEqual(
            dataset.label_schemas["detections"]["type"], "detections"
        )

    @drop_datasets
    @drop_ontologies
    def test_apply_ontology_unset(self):
        dataset = _make_applied_ontology_test_dataset()
        dataset.set_label_schemas({"detections": {"type": "detections"}})

        dataset.set_label_schemas(
            apply_ontology(dataset.label_schemas, "detections", "my_ontology")
        )
        dataset.set_label_schemas(
            apply_ontology(dataset.label_schemas, "detections", None)
        )
        self.assertNotIn(
            "applied_ontology", dataset.label_schemas["detections"]
        )

        # idempotent: unsetting again is a no-op
        dataset.set_label_schemas(
            apply_ontology(dataset.label_schemas, "detections", None)
        )

    @drop_datasets
    @drop_ontologies
    def test_apply_ontology_invalid_reference_raises(self):
        dataset = _make_applied_ontology_test_dataset()
        dataset.set_label_schemas({"detections": {"type": "detections"}})

        schemas = apply_ontology(
            dataset.label_schemas, "detections", "nonexistent_ontology_xyz"
        )
        with self.assertRaises(ExceptionGroup):
            dataset.set_label_schemas(schemas)

    @drop_datasets
    @drop_ontologies
    def test_apply_ontology_does_not_mutate_input(self):
        original = {"detections": {"type": "detections"}}
        result = apply_ontology(original, "detections", "my_ontology")

        self.assertNotIn("applied_ontology", original["detections"])
        self.assertEqual(
            result["detections"]["applied_ontology"], "my_ontology"
        )

    @drop_datasets
    @drop_ontologies
    def test_update_label_schema_dehydrates_before_saving(self):
        AnnotationOntology(
            name="my_ontology",
            attributes=[
                AttributeSpec(name="owned", type="bool", component="checkbox"),
            ],
        ).save()

        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="image.png",
                detections=fo.Detections(
                    detections=[fo.Detection(label="one")]
                ),
            )
        )
        dataset.set_label_schemas({"detections": {"type": "detections"}})

        # simulate the frontend echoing back a hydrated schema: an
        # ontology-owned attribute with a source_ontology marker, plus a local
        # attribute that somehow acquired a forged source_ontology
        hydrated_payload = {
            "type": "detections",
            "applied_ontology": "my_ontology",
            "attributes": [
                {
                    "name": "owned",
                    "type": "bool",
                    "component": "checkbox",
                    "source_ontology": "my_ontology",
                },
                {
                    "name": "local",
                    "type": "str",
                    "component": "text",
                    "source_ontology": "forged",
                },
            ],
        }
        dataset.update_label_schema(
            "detections", hydrated_payload, allow_new_attrs=True
        )

        saved = dataset.label_schemas["detections"]
        names = [a["name"] for a in saved["attributes"]]
        self.assertEqual(names, ["local"])
        self.assertNotIn("source_ontology", saved["attributes"][0])


def _make_applied_ontology_test_dataset(ontology_name: str = "my_ontology"):
    """Dataset with a `detections` label field and a `str_field`, with a real
    `AnnotationOntology` named ``ontology_name`` persisted to the `ontologies`
    collection so the validator can resolve the reference.

    Duplicated from `validate_label_schemas_tests.py`; consolidate later.
    """
    AnnotationOntology(name=ontology_name).save()

    dataset = fo.Dataset()
    dataset.add_sample(
        fo.Sample(
            filepath="image.png",
            detections=fo.Detections(detections=[fo.Detection(label="one")]),
        )
    )
    dataset.add_sample_field("str_field", fo.StringField)

    return dataset
