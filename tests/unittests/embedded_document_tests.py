"""
FiftyOne patches-related unit tests.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import mongoengine

import fiftyone as fo
from fiftyone.core.odm import DynamicEmbeddedDocument

from decorators import drop_datasets


class EmbeddedDocumentTests(unittest.TestCase):
    @drop_datasets
    def test_get_field(self):
        field_value = "custom_value"
        sample = fo.Sample(
            filepath="/path/to/image.jpg",
            field=DynamicEmbeddedDocument(field=field_value),
        )

        # get valid
        self.assertEqual(sample.field.get_field("field"), field_value)
        self.assertEqual(sample.field["field"], field_value)
        self.assertEqual(sample.field.field, field_value)

        # get missing
        with self.assertRaises(AttributeError):
            sample.get_field("missing_field")

        with self.assertRaises(KeyError):
            sample["missing_field"]

        with self.assertRaises(AttributeError):
            sample.missing_field

    @drop_datasets
    def test_set_field(self):
        sample = fo.Sample(
            filepath="/path/to/image.jpg", field=DynamicEmbeddedDocument()
        )

        field = sample.field
        value = 51

        # set_field with create=False
        with self.assertRaises(ValueError):
            field.set_field("field", value, create=False)

        with self.assertRaises(AttributeError):
            field.get_field("field")

        with self.assertRaises(KeyError):
            field["field"]

        with self.assertRaises(AttributeError):
            field.field

        # set_field
        field.set_field("field", value, create=True)
        self.assertIsInstance(field.field, int)
        self.assertEqual(field.get_field("field"), value)
        self.assertEqual(field["field"], value)
        self.assertEqual(field.field, value)

        # __setitem__
        field["another_field"] = value
        self.assertEqual(field.get_field("another_field"), value)
        self.assertEqual(field["another_field"], value)
        self.assertEqual(field.another_field, value)

    @drop_datasets
    def test_change_value(self):
        sample = fo.Sample(
            filepath="/path/to/image.jpg", field=DynamicEmbeddedDocument()
        )
        fo.Dataset().add_sample(sample)
        field = sample.field

        # init
        value = 51
        field["field"] = value
        self.assertEqual(field.field, value)

        # update setitem
        value = 52
        field["field"] = value
        self.assertEqual(field.field, value)

        # update setattr
        value = 53
        field.field = value
        self.assertEqual(field.field, value)

        # attempt type change
        with self.assertRaises(mongoengine.errors.ValidationError):
            field.field = "string"

    @drop_datasets
    def test_lists(self):
        sample = fo.Sample(
            filepath="/path/to/image.jpg",
            detections=fo.Detections(
                detections=[
                    fo.Detection(label="cat", bounding_box=[0, 0, 1, 1])
                ]
            ),
        )
        dataset = fo.Dataset()
        dataset.add_sample(sample)
        doc = sample.detections.detections[0]
        doc["tp"] = True

        self.assertIn(
            "tp",
            dataset.get_field_schema()["detections"]
            .fields["detections"]
            .field.fields,
        )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
