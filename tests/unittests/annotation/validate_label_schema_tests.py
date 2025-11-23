"""
FiftyOne annotation unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone as fo
import fiftyone.core.fields as fof
from fiftyone.core.annotation import validate_field_label_schema

from decorators import drop_datasets


class LabelSchemaValidationTests(unittest.TestCase):
    @drop_datasets
    def test_validate_bool_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("bool_field", fo.BooleanField)

        validate_field_label_schema(
            dataset,
            "bool_field",
            {"type": "bool", "component": "checkbox"},
        )

        validate_field_label_schema(
            dataset,
            "bool_field",
            {"type": "bool", "component": "toggle"},
        )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "bool_field",
                {"type": "str", "component": "checkbox"},
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "bool_field",
                {"type": "bool", "component": "text"},
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "bool_field",
                {"type": "bool", "component": "toggle", "values": None},
            )

    @drop_datasets
    def test_validate_bool_list_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field(
            "bool_list_field", fo.ListField, subfield=fo.BooleanField
        )

        validate_field_label_schema(
            dataset,
            "bool_list_field",
            {"type": "list<bool>", "component": "dropdown"},
        )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "bool_list_field",
                {"type": "bool", "component": "dropdown"},
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "bool_list_field",
                {"type": "list<bool>", "component": "text"},
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "bool_list_field",
                {
                    "type": "list<bool>",
                    "component": "dropdown",
                    "values": None,
                },
            )

    @drop_datasets
    def test_validate_date_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("date_field", fo.DateField)

        validate_field_label_schema(
            dataset,
            "date_field",
            {"type": "date", "component": "datepicker"},
        )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "date_field",
                {"type": "datetime", "component": "datepicker"},
            )

    @drop_datasets
    def test_validate_datetime_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("datetime_field", fo.DateTimeField)

        validate_field_label_schema(
            dataset,
            "datetime_field",
            {"type": "datetime", "component": "datepicker"},
        )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "datetime_field",
                {"type": "date", "component": "datepicker"},
            )

    @drop_datasets
    def test_validate_dict_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("dict_field", fo.DictField)

        validate_field_label_schema(
            dataset,
            "dict_field",
            {"type": "dict", "component": "json"},
        )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "dict_field",
                {"type": "dict", "component": "text"},
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "dict_field",
                {"type": "str", "component": "json"},
            )

    @drop_datasets
    def test_validate_float_int_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("float_field", fo.FloatField)
        dataset.add_sample_field("int_field", fo.IntField)

        ### int

        validate_field_label_schema(
            dataset,
            "int_field",
            {"type": "int", "component": "text", "default": 1},
        )

        validate_field_label_schema(
            dataset,
            "int_field",
            {"type": "int", "component": "slider", "range": [0, 1]},
        )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_field",
                {
                    "type": "int",
                    "component": "slider",
                },
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_field",
                {"type": "int", "component": "text", "default": 1.0},
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_field",
                {
                    "type": "int",
                    "component": "slider",
                },
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_field",
                {
                    "type": "int",
                    "component": "slider",
                    "range": [0, 1],
                    "default": 2,
                },
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_field",
                {
                    "type": "int",
                    "component": "slider",
                    "range": [1, 0],
                },
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_field",
                {"type": "int", "component": "text", "precision": 1},
            )

        ### float

        validate_field_label_schema(
            dataset,
            "float_field",
            {
                "type": "float",
                "component": "text",
                "default": 1.0,
                "precision": 1,
            },
        )

        validate_field_label_schema(
            dataset,
            "float_field",
            {"type": "float", "component": "slider", "range": [0.0, 1.0]},
        )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "float_field",
                {
                    "type": "float",
                    "component": "slider",
                },
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "float_field",
                {"type": "float", "component": "text", "precision": -1},
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "float_field",
                {
                    "type": "float",
                    "component": "text",
                    "precision": 1,
                    "values": [1],
                },
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "float_field",
                {
                    "type": "float",
                    "component": "slider",
                },
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "float_field",
                {
                    "type": "float",
                    "component": "slider",
                    "range": [0.0, 1.0],
                    "default": 2.0,
                },
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "float_field",
                {
                    "type": "float",
                    "component": "slider",
                    "range": [1.0, 0.0],
                },
            )

    @drop_datasets
    def test_validate_float_int_list_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field(
            "float_list_field", fo.ListField, subfield=fo.FloatField
        )
        dataset.add_sample_field(
            "int_list_field", fo.ListField, subfield=fo.IntField
        )

        # todo

    @drop_datasets
    def test_validate_id_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("uuid_field", fof.UUIDField)

        validate_field_label_schema(
            dataset,
            "id",
            {"type": "id", "component": "text", "read_only": True},
        )

        validate_field_label_schema(
            dataset,
            "uuid_field",
            {"type": "id", "component": "text", "read_only": True},
        )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "id",
                {
                    "type": "id",
                    "component": "text",
                },
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "id",
                {"type": "id", "component": "text", "read_only": False},
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "id",
                {"type": "id", "component": "text", "default": ""},
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "id",
                {
                    "type": "str",
                    "component": "text",
                },
            )

    @drop_datasets
    def test_validate_str_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("str_field", fo.StringField)

        validate_field_label_schema(
            dataset, "str_field", {"type": "str", "component": "text"}
        )

        validate_field_label_schema(
            dataset,
            "str_field",
            {"type": "str", "component": "dropdown", "values": ["value"]},
        )

        validate_field_label_schema(
            dataset,
            "str_field",
            {
                "type": "str",
                "component": "radio",
                "values": ["value"],
                "default": "value",
            },
        )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "str_field",
                {"type": "str", "component": "text", "values": ["value"]},
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "str_field",
                {"type": "str", "component": "radio", "values": ["value"]},
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "str_field",
                {"type": "str", "component": "radio", "default": "value"},
            )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "str_field",
                {
                    "type": "str",
                    "component": "radio",
                    "default": "value",
                    "values": ["other"],
                },
            )

    @drop_datasets
    def test_validate_str_list_field_schema(self):
        # todo
        pass

    @drop_datasets
    def test_validate_detections_label_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="image.png",
                detection=fo.Detection(label="one"),
                detections=fo.Detections(
                    detections=[fo.Detection(label="two")]
                ),
            )
        )

        validate_field_label_schema(
            dataset,
            "detection",
            {
                "attributes": {
                    "id": {
                        "component": "text",
                        "read_only": True,
                        "type": "id",
                    }
                },
                "classes": ["one", "two"],
                "component": "dropdown",
                "type": "detection",
            },
        )

        validate_field_label_schema(
            dataset,
            "detections",
            {
                "attributes": {
                    "id": {
                        "component": "text",
                        "read_only": True,
                        "type": "id",
                    }
                },
                "classes": ["one", "two"],
                "component": "dropdown",
                "type": "detections",
            },
        )

        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "detections",
                {
                    "attributes": {
                        "id": {
                            "component": "text",
                            "read_only": True,
                            "type": "id",
                        }
                    },
                    "classes": ["one", "two"],
                    "component": "dropdown",
                    "default": "three",
                    "type": "detections",
                },
            )
