"""
FiftyOne annotation unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import date, datetime
import unittest

import fiftyone as fo
from fiftyone.core.annotation.generate_label_schemas import (
    generate_label_schemas,
)

from decorators import drop_datasets


class GenerateLabelSchemaTests(unittest.TestCase):
    @drop_datasets
    def test_generate_date_field_label_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("date_field", fo.DateField)
        dataset.add_sample(
            fo.Sample(filepath="image.png", date_field=date.today())
        )
        self.assertEqual(
            generate_label_schemas(dataset, "date_field"),
            {
                "component": "datepicker",
                "type": "date",
            },
        )

    @drop_datasets
    def test_generate_datetime_field_label_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(filepath="image.png", datetime_field=datetime.now())
        )
        self.assertEqual(
            generate_label_schemas(dataset, "datetime_field"),
            {
                "component": "datepicker",
                "type": "datetime",
            },
        )

    @drop_datasets
    def test_generate_float_field_label_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(filepath="image.png", float_field=0.0))
        self.assertEqual(
            generate_label_schemas(dataset, "float_field"),
            {
                "component": "text",
                "type": "float",
            },
        )

        dataset.add_sample(fo.Sample(filepath="image.png", float_field=1.0))
        self.assertEqual(
            generate_label_schemas(dataset, "float_field"),
            {
                "component": "slider",
                "range": [0.0, 1.0],
                "type": "float",
            },
        )

    @drop_datasets
    def test_generate_int_field_label_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(filepath="image.png", int_field=0))
        self.assertEqual(
            generate_label_schemas(dataset, "int_field"),
            {
                "component": "text",
                "type": "int",
            },
        )

        dataset.add_sample(fo.Sample(filepath="image.png", int_field=1))
        self.assertEqual(
            generate_label_schemas(dataset, "int_field"),
            {
                "component": "slider",
                "range": [0, 1],
                "type": "int",
            },
        )

    @drop_datasets
    def test_generate_str_field_label_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(filepath="image.png", str_field="test"))
        self.assertEqual(
            generate_label_schemas(dataset, "str_field"),
            {
                "component": "radio",
                "type": "str",
                "values": ["test"],
            },
        )

    @drop_datasets
    def test_generate_str_list_field_label_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(filepath="image.png", str_list_field=["test"])
        )
        self.assertEqual(
            generate_label_schemas(dataset, "str_list_field"),
            {
                "component": "checkboxes",
                "type": "list<str>",
                "values": ["test"],
            },
        )

    @drop_datasets
    def test_generate_detection_field_label_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="image.png",
                detection_field=fo.Detection(label="test"),
            )
        )

        self.assertEqual(
            generate_label_schemas(dataset, "detection_field"),
            {
                "attributes": {
                    "id": {
                        "type": "id",
                        "component": "text",
                        "read_only": True,
                    },
                    "tags": {"type": "list<str>", "component": "text"},
                },
                "classes": ["test"],
                "component": "radio",
                "type": "detection",
            },
        )

    @drop_datasets
    def test_generate_detections_field_label_schema(self):
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
            generate_label_schemas(dataset, "detections_field"),
            {
                "attributes": {
                    "id": {
                        "type": "id",
                        "component": "text",
                        "read_only": True,
                    },
                    "tags": {"type": "list<str>", "component": "text"},
                },
                "classes": ["test"],
                "component": "radio",
                "type": "detections",
            },
        )

    @drop_datasets
    def test_generate_group_detections_field_label_schema(self):
        dataset = fo.Dataset()
        dataset.add_group_field("group", default="slice")
        dataset.add_sample(
            fo.Sample(
                filepath="image.png",
                group=fo.Group().element("slice"),
                detections_field=fo.Detections(
                    detections=[fo.Detection(label="test")]
                ),
            )
        )
        self.assertEqual(
            generate_label_schemas(dataset, "detections_field"),
            {
                "attributes": {
                    "id": {
                        "type": "id",
                        "component": "text",
                        "read_only": True,
                    },
                    "tags": {"type": "list<str>", "component": "text"},
                },
                "classes": ["test"],
                "component": "radio",
                "type": "detections",
            },
        )
