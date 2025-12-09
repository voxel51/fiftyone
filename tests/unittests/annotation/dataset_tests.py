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

    @drop_datasets
    def test_delete_sample_field(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("test", fo.IntField)
        dataset.set_label_schema(
            {"test": {"type": "int", "component": "text"}}
        )
        dataset.activate_label_schemas("test")

        dataset.delete_sample_field("test")
        self.assertNotIn("test", dataset.active_label_schemas)
        self.assertNotIn("test", dataset.label_schema)

    @drop_datasets
    def test_update_label_schema(self):
        dataset = fo.Dataset()
        dataset.update_label_schema("test", fo.IntField)

    @drop_datasets
    def test_rename_sample_field(self):
        dataset = fo.Dataset()

        dataset.add_sample_field("test", fo.IntField)
        dataset.set_label_schema(
            {"test": {"type": "int", "component": "text"}}
        )
        dataset.rename_sample_field("test", "renamed")
        self.assertEqual(
            dataset.label_schema,
            {"renamed": {"type": "int", "component": "text"}},
        )

        dataset.add_sample_field(
            "test_label",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classification,
        )
        dataset.add_sample_field("test_label.test", fo.IntField)
        dataset.label_schema = {
            "test_label": {
                "attributes": {"test": {"type": "int", "component": "text"}},
                "type": "classification",
            }
        }

        dataset.rename_sample_field("test_label", "renamed_label")
        self.assertEqual(
            dataset.label_schema,
            {
                "renamed_label": {
                    "attributes": {
                        "test": {"type": "int", "component": "text"}
                    },
                    "type": "classification",
                }
            },
        )

        dataset.rename_sample_field(
            "renamed_label.test", "renamed_label.renamed"
        )
        self.assertEqual(
            dataset.label_schema,
            {
                "renamed_label": {
                    "attributes": {
                        "renamed": {"type": "int", "component": "text"}
                    },
                    "type": "classification",
                }
            },
        )

    @drop_datasets
    def test_set_label_schema(self):
        dataset = fo.Dataset()
        dataset.label_schema = {}

        dataset.set_label_schema(
            {
                "filepath": {"type": "str", "component": "text"},
            }
        )

        dataset.reload()
        self.assertEqual(
            dataset.label_schema,
            {
                "filepath": {"type": "str", "component": "text"},
            },
        )

        with self.assertRaises(ValueError):
            self.assertEqual(
                dataset.label_schema,
                {
                    "filepath": {"type": "int", "component": "text"},
                },
            )

        with self.assertRaises(ValueError):
            self.assertEqual(
                dataset.label_schema,
                {
                    "no_field": {"type": "str", "component": "text"},
                },
            )

    @drop_datasets
    def test_unsupported(self):
        dataset = fo.Dataset()
        for label_type in [
            fol.GeoLocation,
            fol.GeoLocations,
            fol.Heatmap,
            fol.Keypoint,
            fol.Keypoints,
            fol.Polyline,
            fol.Polylines,
            fol.Regression,
            fol.Segmentation,
        ]:
            dataset.add_sample_field(
                "unsupported",
                fo.EmbeddedDocumentField,
                embedded_doc_type=label_type,
            )
            with self.assertRaises(ExceptionGroup):
                dataset.set_label_schema(
                    {"unsupported": {"type": label_type.__name__.lower()}}
                )

            dataset.delete_sample_field("unsupported")

        video = fo.Dataset()
        video.add_sample(fo.Sample(filepath="video.mp4"))
        video.label_schema = {}
