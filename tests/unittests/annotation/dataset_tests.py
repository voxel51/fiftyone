"""
FiftyOne annotation unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from exceptiongroup import ExceptionGroup

import fiftyone as fo
import fiftyone.core.labels as fol

from decorators import drop_datasets


class DatasetAnnotationTests(unittest.TestCase):
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
        dataset.rename_sample_field("test", "renamed")
        self.assertEqual(
            dataset.label_schemas,
            {"renamed": {"type": "int", "component": "text"}},
        )

        dataset.add_sample_field(
            "test_label",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classification,
        )
        dataset.add_sample_field("test_label.test", fo.IntField)
        dataset.set_label_schemas(
            {
                "test_label": {
                    "attributes": {
                        "test": {"type": "int", "component": "text"}
                    },
                    "type": "classification",
                }
            }
        )

        dataset.rename_sample_field("test_label", "renamed_label")
        self.assertEqual(
            dataset.label_schemas,
            {
                "renamed_label": {
                    "attributes": {
                        "test": {"type": "int", "component": "text"}
                    },
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
                    "attributes": {
                        "test": {"type": "int", "component": "text"}
                    },
                    "type": "classifications",
                }
            }
        )

        dataset.rename_sample_field("test_labels", "renamed_labels")
        self.assertEqual(
            dataset.label_schemas,
            {
                "renamed_labels": {
                    "attributes": {
                        "test": {"type": "int", "component": "text"}
                    },
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
                "attributes": {
                    "renamed": {"type": "int", "component": "text"}
                },
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
