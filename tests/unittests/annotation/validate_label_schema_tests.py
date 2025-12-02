"""
FiftyOne annotation unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from exceptiongroup import ExceptionGroup
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

        # wrong 'type'
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "bool_field",
                {"type": "str", "component": "checkbox"},
            )

        # invalid 'component'
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "bool_field",
                {"type": "bool", "component": "text"},
            )

        # 'values' is not applicable
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
            {"type": "list<bool>", "component": "dropdown", "values": [False]},
        )

        # wrong 'type'
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "bool_list_field",
                {"type": "bool", "component": "dropdown", "values": [False]},
            )

        # invalid 'component'
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "bool_list_field",
                {"type": "list<bool>", "component": "radio"},
            )

        # 'values' is not applicable
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "bool_list_field",
                {
                    "type": "list<bool>",
                    "component": "text",
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

        # wrong 'type'
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

        # wrong 'type'
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

        validate_field_label_schema(
            dataset,
            "dict_field",
            {
                "type": "dict",
                "component": "json",
                "default": {"hello": "world"},
            },
        )

        # invalid 'component'
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "dict_field",
                {"type": "dict", "component": "text"},
            )

        # wrong 'type'
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "dict_field",
                {"type": "str", "component": "json"},
            )

        # invalid 'default'
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "dict_field",
                {
                    "type": "dict",
                    "component": "json",
                    "default": {"invalid": Exception},
                },
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
            {
                "type": "int",
                "component": "slider",
                "range": [0, 1],
                "default": 0,
            },
        )

        # 'range' is not provided
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_field",
                {
                    "type": "int",
                    "component": "slider",
                },
            )

        # 'default' is not provided
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_field",
                {
                    "type": "int",
                    "component": "slider",
                    "range": [0, 1],
                },
            )

        # 'default' is not an int
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_field",
                {"type": "int", "component": "text", "default": 1.0},
            )

        # 'default' is outside 'range'
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

        # 'range' has a float
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_field",
                {
                    "type": "int",
                    "component": "slider",
                    "range": [0.5, 1],
                    "default": 1,
                },
            )

        # 'range' is invalid
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_field",
                {
                    "type": "int",
                    "component": "slider",
                    "range": [1, 0],
                    "default": 1,
                },
            )

        # 'range' is invalid
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_field",
                {
                    "type": "int",
                    "component": "slider",
                    "range": [1, 1],
                    "default": 1,
                },
            )

        # int does not accept 'precision'
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
            {
                "type": "float",
                "component": "slider",
                "range": [0.0, 1.0],
                "default": 0.0,
            },
        )

        # 'range' is not provided
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "float_field",
                {
                    "type": "float",
                    "component": "slider",
                },
            )

        # 'default' is not provided
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "float_field",
                {
                    "type": "float",
                    "component": "slider",
                    "range": [0.0, 1.0],
                },
            )

        # 'default' is not a float
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "float_field",
                {"type": "float", "component": "text", "default": 1},
            )

        # 'precision' is negative
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "float_field",
                {"type": "float", "component": "text", "precision": -1},
            )

        # 'values' is not applicable
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

        # 'default' not in 'range'
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

        # 'range' is not valid
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

        ### int

        validate_field_label_schema(
            dataset,
            "int_list_field",
            {"type": "list<int>", "component": "text"},
        )

        validate_field_label_schema(
            dataset,
            "int_list_field",
            {
                "type": "list<int>",
                "component": "dropdown",
                "values": [1],
            },
        )

        # invalid 'component'
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_list_field",
                {
                    "type": "list<int>",
                    "component": "slider",
                    "range": [0, 1],
                    "defailt": 1,
                },
            )

        # 'values' is not applicable
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_list_field",
                {"type": "list<int>", "component": "text", "values": [1]},
            )

        # 'values' is not provided
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_list_field",
                {
                    "type": "list<int>",
                    "component": "dropdown",
                },
            )

        # incompatible 'default'
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "int_list_field",
                {
                    "type": "list<int>",
                    "component": "dropdown",
                    "values": [1],
                    "default": [2],
                },
            )

        ### float

        validate_field_label_schema(
            dataset,
            "float_list_field",
            {"type": "list<float>", "component": "text", "precision": 1},
        )

        # 'precision' is not applicable
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "float_list_field",
                {
                    "type": "list<float>",
                    "component": "dropdown",
                    "values": [1.0],
                    "default": [1.0],
                    "precision": 1,
                },
            )

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

        # id must be read only
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "id",
                {
                    "type": "id",
                    "component": "text",
                },
            )

        # id must be read only
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "id",
                {"type": "id", "component": "text", "read_only": False},
            )

        # 'default' is not valid
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "id",
                {
                    "type": "id",
                    "component": "text",
                    "default": "",
                    "read_only": True,
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

        # 'values' is not applicable
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "str_field",
                {"type": "str", "component": "text", "values": ["value"]},
            )

        # 'default' is required
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "str_field",
                {"type": "str", "component": "radio", "values": ["value"]},
            )

        # 'values' is required
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "str_field",
                {"type": "str", "component": "radio", "default": "value"},
            )

        # 'default' is not in 'values'
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
        dataset = fo.Dataset()
        dataset.add_sample_field(
            "str_list_field", fo.ListField, subfield=fo.StringField
        )

        validate_field_label_schema(
            dataset,
            "str_list_field",
            {
                "type": "list<str>",
                "component": "checkboxes",
                "values": ["value"],
            },
        )

        validate_field_label_schema(
            dataset,
            "str_list_field",
            {
                "type": "list<str>",
                "component": "dropdown",
                "values": ["value"],
                "default": ["value"],
            },
        )

        validate_field_label_schema(
            dataset,
            "str_list_field",
            {
                "type": "list<str>",
                "component": "text",
            },
        )

        # 'values' is not provided
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "str_field",
                {
                    "type": "str",
                    "component": "checkboxes",
                },
            )

        # 'default' has duplicates
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "str_field",
                {
                    "type": "str",
                    "component": "checkboxes",
                    "values": ["value"],
                    "default": ["value", "value"],
                },
            )

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
            "detections",
            {
                "type": "detections",
            },
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

        # undefined subfield 'missing'
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "detections",
                {
                    "attributes": {
                        "missing": {
                            "component": "text",
                            "type": "str",
                        }
                    },
                    "type": "detections",
                },
            )

        # reserved attribute 'bounding_box'
        with self.assertRaises(ValueError):
            validate_field_label_schema(
                dataset,
                "detections",
                {
                    "attributes": {
                        "bounding_box": {
                            "component": "text",
                            "type": "list<float>",
                        }
                    },
                    "type": "detections",
                },
            )

        # reserved attributes 'bounding_box' and 'label'
        with self.assertRaises(ExceptionGroup):
            validate_field_label_schema(
                dataset,
                "detections",
                {
                    "attributes": {
                        "bounding_box": {
                            "component": "text",
                            "type": "list<float>",
                        },
                        "label": {"type": "str", "component": "text"},
                    },
                    "type": "detections",
                },
            )
