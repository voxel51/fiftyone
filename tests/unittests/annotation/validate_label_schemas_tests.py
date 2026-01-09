"""
FiftyOne annotation unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from exceptiongroup import ExceptionGroup
import unittest

import fiftyone as fo
import fiftyone.core.fields as fof
from fiftyone.core.annotation import validate_label_schemas

from decorators import drop_datasets


class LabelSchemaValidationTests(unittest.TestCase):
    @drop_datasets
    def test_validate_bool_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("bool_field", fo.BooleanField)

        validate_label_schemas(
            dataset,
            {"type": "bool", "component": "checkbox"},
            fields="bool_field",
        )

        validate_label_schemas(
            dataset,
            {"type": "bool", "component": "toggle"},
            fields="bool_field",
        )

        # wrong 'type'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "str", "component": "checkbox"},
                fields="bool_field",
            )

        # invalid 'component'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "bool", "component": "text"},
                fields="bool_field",
            )

        # 'values' is not applicable
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "bool", "component": "toggle", "values": None},
                fields="bool_field",
            )

    @drop_datasets
    def test_validate_bool_list_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field(
            "bool_list_field", fo.ListField, subfield=fo.BooleanField
        )

        validate_label_schemas(
            dataset,
            {"type": "list<bool>", "component": "dropdown", "values": [False]},
            fields="bool_list_field",
        )

        # wrong 'type'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "bool", "component": "dropdown", "values": [False]},
                fields="bool_list_field",
            )

        # invalid 'component'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "list<bool>", "component": "radio"},
                fields="bool_list_field",
            )

        # 'values' is not applicable
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "list<bool>",
                    "component": "text",
                    "values": None,
                },
                fields="bool_list_field",
            )

    @drop_datasets
    def test_validate_date_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("date_field", fo.DateField)

        validate_label_schemas(
            dataset,
            {"type": "date", "component": "datepicker"},
            fields="date_field",
        )

        # wrong 'type'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "datetime", "component": "datepicker"},
                fields="date_field",
            )

    @drop_datasets
    def test_validate_datetime_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("datetime_field", fo.DateTimeField)

        validate_label_schemas(
            dataset,
            {"type": "datetime", "component": "datepicker"},
            fields="datetime_field",
        )

        # wrong 'type'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "date", "component": "datepicker"},
                fields="datetime_field",
            )

    @drop_datasets
    def test_validate_dict_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("dict_field", fo.DictField)

        validate_label_schemas(
            dataset,
            {"type": "dict", "component": "json"},
            fields="dict_field",
        )

        validate_label_schemas(
            dataset,
            {
                "type": "dict",
                "component": "json",
                "default": {"hello": "world"},
            },
            fields="dict_field",
            _allow_default=True,
        )

        # invalid 'component'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "dict", "component": "text"},
                fields="dict_field",
            )

        # wrong 'type'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "str", "component": "json"},
                fields="dict_field",
            )

        # invalid 'default'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "dict",
                    "component": "json",
                    "default": {"invalid": Exception},
                },
                fields="dict_field",
                _allow_default=True,
            )

    @drop_datasets
    def test_validate_float_int_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("float_field", fo.FloatField)
        dataset.add_sample_field("int_field", fo.IntField)

        ### int

        validate_label_schemas(
            dataset,
            {"type": "int", "component": "text", "default": 1},
            fields="int_field",
            _allow_default=True,
        )

        validate_label_schemas(
            dataset,
            {
                "type": "int",
                "component": "slider",
                "range": [0, 1],
            },
            fields="int_field",
        )

        validate_label_schemas(
            dataset,
            {
                "type": "int",
                "component": "slider",
                "range": [0, 1],
                "default": 0,
            },
            fields="int_field",
            _allow_default=True,
        )

        # 'range' is not provided
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "int",
                    "component": "slider",
                },
                fields="int_field",
            )

        # 'default' is not allowed
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "int",
                    "component": "slider",
                    "range": [0, 1],
                    "default": 0,
                },
                fields="int_field",
            )

        # 'default' is a float
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "int", "component": "text", "default": 1.0},
                fields="int_field",
                _allow_default=True,
            )

        # 'default' is outside 'range'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "int",
                    "component": "slider",
                    "range": [0, 1],
                    "default": 2,
                },
                fields="int_field",
                _allow_default=True,
            )

        # 'range' has a float
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "int",
                    "component": "slider",
                    "range": [0.5, 1],
                },
                fields="int_field",
            )

        # 'range' is invalid
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "int",
                    "component": "slider",
                    "range": [1, 0],
                },
                fields="int_field",
            )

        # 'range' is invalid
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "int",
                    "component": "slider",
                    "range": [1, 1],
                },
                fields="int_field",
            )

        # int does not accept 'precision'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "int", "component": "text", "precision": 1},
                fields="int_field",
            )

        ### float

        validate_label_schemas(
            dataset,
            {
                "type": "float",
                "component": "text",
                "default": 1.1,
                "precision": 1,
            },
            fields="float_field",
            _allow_default=True,
        )

        validate_label_schemas(
            dataset,
            {
                "type": "float",
                "component": "slider",
                "range": [0.5, 1],
                "default": 0.5,
            },
            fields="float_field",
            _allow_default=True,
        )

        # 'range' is not provided
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "float",
                    "component": "slider",
                },
                fields="float_field",
            )

        # 'precision' is negative
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "float", "component": "text", "precision": -1},
                fields="float_field",
            )

        # 'values' is not applicable
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "float",
                    "component": "text",
                    "precision": 1,
                    "values": [1],
                },
                fields="float_field",
            )

        # 'default' not in 'range'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "float",
                    "component": "slider",
                    "range": [0, 1],
                    "default": 2,
                },
                fields="float_field",
                _allow_default=True,
            )

        # 'range' is not valid
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "float",
                    "component": "slider",
                    "range": [1, 0],
                },
                fields="float_field",
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

        validate_label_schemas(
            dataset,
            {"type": "list<int>", "component": "text"},
            fields="int_list_field",
        )

        validate_label_schemas(
            dataset,
            {
                "type": "list<int>",
                "component": "dropdown",
                "values": [1],
            },
            fields="int_list_field",
        )

        # invalid 'component'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "list<int>",
                    "component": "slider",
                    "range": [0, 1],
                    "default": 1,
                },
                fields="int_list_field",
                _allow_default=True,
            )

        # 'values' is not applicable
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "list<int>", "component": "text", "values": [1]},
                fields="int_list_field",
            )

        # 'values' is not provided
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "list<int>",
                    "component": "dropdown",
                },
                fields="int_list_field",
            )

        # incompatible 'default'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "list<int>",
                    "component": "dropdown",
                    "values": [1],
                    "default": [2],
                },
                fields="int_list_field",
                _allow_default=True,
            )

        ### float

        validate_label_schemas(
            dataset,
            {"type": "list<float>", "component": "text", "precision": 1},
            fields="float_list_field",
        )

        # 'precision' is not applicable
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "list<float>",
                    "component": "dropdown",
                    "values": [1.0],
                    "default": [1.0],
                    "precision": 1,
                },
                fields="float_list_field",
                _allow_default=True,
            )

    @drop_datasets
    def test_validate_id_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("uuid_field", fof.UUIDField)

        validate_label_schemas(
            dataset,
            {"type": "id", "component": "text", "read_only": True},
            fields="id",
        )

        validate_label_schemas(
            dataset,
            {"type": "id", "component": "text", "read_only": True},
            fields="uuid_field",
        )

        # id must be read only
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "id",
                    "component": "text",
                },
                fields="id",
            )

        # id must be read only
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "id", "component": "text", "read_only": False},
                fields="id",
            )

        # 'default' is not valid
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "id",
                    "component": "text",
                    "default": "",
                    "read_only": True,
                },
                fields="id",
                _allow_default=True,
            )

    @drop_datasets
    def test_validate_str_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("str_field", fo.StringField)

        validate_label_schemas(
            dataset,
            {"type": "str", "component": "text"},
            fields="str_field",
        )

        validate_label_schemas(
            dataset,
            {"type": "str", "component": "dropdown", "values": ["value"]},
            fields="str_field",
        )

        validate_label_schemas(
            dataset,
            {
                "type": "str",
                "component": "radio",
                "values": ["value"],
                "default": "value",
            },
            fields="str_field",
            _allow_default=True,
        )

        # 'values' is not applicable
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "str", "component": "text", "values": ["value"]},
                fields="str_field",
            )

        # 'values' is required
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {"type": "str", "component": "radio"},
                fields="str_field",
            )

        # 'default' is not in 'values'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "str",
                    "component": "radio",
                    "default": "value",
                    "values": ["other"],
                },
                fields="str_field",
                _allow_default=True,
            )

    @drop_datasets
    def test_validate_str_list_field_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field(
            "str_list_field", fo.ListField, subfield=fo.StringField
        )

        validate_label_schemas(
            dataset,
            {
                "type": "list<str>",
                "component": "checkboxes",
                "values": ["value"],
            },
            fields="str_list_field",
        )

        validate_label_schemas(
            dataset,
            {
                "type": "list<str>",
                "component": "dropdown",
                "values": ["value"],
                "default": ["value"],
            },
            fields="str_list_field",
            _allow_default=True,
        )

        validate_label_schemas(
            dataset,
            {
                "type": "list<str>",
                "component": "text",
            },
            fields="str_list_field",
        )

        # 'values' is not provided
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "list<str>",
                    "component": "checkboxes",
                },
                fields="str_list_field",
            )

        # 'default' has duplicates
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "type": "list<str>",
                    "component": "checkboxes",
                    "values": ["value"],
                    "default": ["value", "value"],
                },
                fields="str_list_field",
                _allow_default=True,
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

        validate_label_schemas(
            dataset,
            {
                "type": "detections",
            },
            fields="detections",
        )

        validate_label_schemas(
            dataset,
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
            fields="detection",
        )

        validate_label_schemas(
            dataset,
            {
                "attributes": {
                    "tags": {
                        "component": "dropdown",
                        "default": ["one"],
                        "type": "list<str>",
                        "values": ["one"],
                    }
                },
                "classes": ["one", "two"],
                "component": "dropdown",
                "default": "one",
                "type": "detections",
            },
            fields="detections",
        )

        validate_label_schemas(
            dataset,
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
            fields="detections",
        )

        # 'classes' is not allowed
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "classes": ["one"],
                    "component": "text",
                    "type": "detections",
                },
                fields="detections",
            )

        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
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
                fields="detections",
            )

        # undefined subfield 'missing'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "attributes": {
                        "missing": {
                            "component": "text",
                            "type": "str",
                        }
                    },
                    "type": "detections",
                },
                fields="detections",
            )

        # reserved attribute 'bounding_box'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
                {
                    "attributes": {
                        "bounding_box": {
                            "component": "text",
                            "type": "list<float>",
                        }
                    },
                    "type": "detections",
                },
                fields="detections",
            )

        # reserved attributes 'bounding_box' and 'label'
        with self.assertRaises(ExceptionGroup):
            validate_label_schemas(
                dataset,
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
                fields="detections",
            )
