"""
FiftyOne annotation unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import date, datetime
import unittest

import fiftyone as fo
from fiftyone.core.annotation.generate_label_schema import (
    generate_label_schema,
)

from decorators import drop_datasets


class LabelSchemaValidationTests(unittest.TestCase):
    @drop_datasets
    def test_validate_date_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("date_field", fo.DateField)
        dataset.add_sample(
            fo.Sample(filepath="image.png", date_field=date.today())
        )
        self.assertEqual(
            generate_label_schema(dataset, "date_field"),
            {
                "default": None,
                "type": "input",
            },
        )

    @drop_datasets
    def test_datetime(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(filepath="image.png", datetime_field=datetime.now())
        )
        self.assertEqual(
            generate_label_schema(dataset, "datetime_field"),
            {
                "default": None,
                "type": "input",
            },
        )

    @drop_datasets
    def test_float(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(filepath="image.png", float_field=0.0))
        self.assertEqual(
            generate_label_schema(dataset, "float_field"),
            {
                "default": None,
                "type": "input",
            },
        )

    @drop_datasets
    def test_int(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(filepath="image.png", int_field=0))
        self.assertEqual(
            generate_label_schema(dataset, "int_field"),
            {
                "default": None,
                "type": "input",
            },
        )

    @drop_datasets
    def test_string(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(filepath="image.png", string_field="test")
        )
        self.assertEqual(
            generate_label_schema(dataset, "string_field"),
            {"default": None, "type": "select", "values": ["test"]},
        )

    @drop_datasets
    def test_string_list(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(filepath="image.png", string_list_field=["test"])
        )
        self.assertEqual(
            generate_label_schema(dataset, "string_list_field"),
            {"default": [], "type": "tags", "values": ["test"]},
        )

    @drop_datasets
    def test_classification(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="image.png",
                classification_field=fo.Classification(label="test"),
            )
        )
        self.assertEqual(
            generate_label_schema(dataset, "classification_field"),
            {
                "classes": ["test"],
                "attributes": {
                    "tags": {
                        "default": [],
                        "type": "tags",
                        "values": [],
                    },
                },
            },
        )

    @drop_datasets
    def test_classifications(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="image.png",
                classifications_field=fo.Classifications(
                    classifications=[fo.Classification(label="test")]
                ),
            )
        )
        self.assertEqual(
            generate_label_schema(dataset, "classifications_field"),
            {
                "classes": ["test"],
                "attributes": {
                    "tags": {
                        "default": [],
                        "type": "tags",
                        "values": [],
                    },
                },
            },
        )

    @drop_datasets
    def test_detection(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="image.png",
                detection_field=fo.Detection(label="test"),
            )
        )
        self.assertEqual(
            generate_label_schema(dataset, "detection_field"),
            {
                "classes": ["test"],
                "attributes": {
                    "tags": {
                        "default": [],
                        "type": "tags",
                        "values": [],
                    },
                },
            },
        )

    @drop_datasets
    def test_detections(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="image.png",
                detections_field=fo.Detections(
                    detections=[fo.Detection(label="test")]
                ),
            )
        )
        self.assertEqual(
            generate_label_schema(dataset, "detections_field"),
            {
                "classes": ["test"],
                "attributes": {
                    "tags": {
                        "default": [],
                        "type": "tags",
                        "values": [],
                    },
                },
            },
        )
