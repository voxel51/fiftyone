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

from decorators import drop_datasets  # pylint: disable=import-error


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
                "attributes": [
                    {
                        "name": "id",
                        "type": "id",
                        "component": "text",
                        "read_only": True,
                    },
                    {"name": "tags", "type": "list<str>", "component": "text"},
                ],
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
                    detections=[
                        fo.Detection(
                            label="test",
                            # 'attributes' is ignored
                            attributes={"ignore": fo.Attribute()},
                        )
                    ]
                ),
            )
        )
        self.assertEqual(
            generate_label_schemas(dataset, "detections_field"),
            {
                "attributes": [
                    {
                        "name": "id",
                        "type": "id",
                        "component": "text",
                        "read_only": True,
                    },
                    {"name": "tags", "type": "list<str>", "component": "text"},
                ],
                "classes": ["test"],
                "component": "radio",
                "type": "detections",
            },
        )

    @drop_datasets
    def test_generate_keypoint_point_scoped_attributes(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="image.png",
                kp_field=fo.Keypoint(
                    label="test",
                    points=[(0.1, 0.1), (0.2, 0.2)],
                    confidence=[0.5, 0.9],
                    tags=["a"],
                ),
            )
        )
        # a customer-defined per-point attribute (list parallel to `points`)
        dataset.add_sample_field(
            "kp_field.occluded", fo.ListField, subfield=fo.BooleanField
        )

        schema = generate_label_schemas(dataset, "kp_field")
        attrs = {a["name"]: a for a in schema["attributes"]}

        # per-point parallel lists generate as point-scoped attributes of
        # their ELEMENT type
        self.assertEqual(attrs["confidence"]["type"], "float")
        self.assertEqual(attrs["confidence"]["scope"], "point")
        self.assertEqual(attrs["occluded"]["type"], "bool")
        self.assertEqual(attrs["occluded"]["scope"], "point")
        self.assertEqual(attrs["occluded"]["component"], "toggle")

        # `tags` is the one label-level list every label carries
        self.assertEqual(attrs["tags"]["type"], "list<str>")
        self.assertNotIn("scope", attrs["tags"])

    @drop_datasets
    def test_preserves_applied_ontology_on_regeneration(self):
        dataset = _make_applied_ontology_test_dataset()
        schema = generate_label_schemas(dataset, "detections_field")
        self.assertEqual(schema.get("applied_ontology"), "my_ontology")

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
                "attributes": [
                    {
                        "name": "id",
                        "type": "id",
                        "component": "text",
                        "read_only": True,
                    },
                    {"name": "tags", "type": "list<str>", "component": "text"},
                ],
                "classes": ["test"],
                "component": "radio",
                "type": "detections",
            },
        )


def _make_applied_ontology_test_dataset(ontology_name: str = "my_ontology"):
    """Dataset with a `detections_field` and an `applied_ontology` reference
    stored on its label schema. The stored reference bypasses the validator
    so tests can read it as pre-existing state.
    """
    dataset = fo.Dataset()
    dataset.add_sample(
        fo.Sample(
            filepath="image.png",
            detections_field=fo.Detections(
                detections=[fo.Detection(label="test")]
            ),
        )
    )

    dataset._doc.label_schemas = {
        "detections_field": {
            "type": "detections",
            "applied_ontology": ontology_name,
        }
    }
    dataset._doc.save()

    return dataset
