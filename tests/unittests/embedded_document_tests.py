"""
FiftyOne embedded document unit tests.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import unittest

import mongoengine
import numpy as np

import eta.core.utils as etau
import eta.core.image as etai

import fiftyone as fo
from fiftyone.core.fields import DictField, EmbeddedDocumentField, ListField
from fiftyone.core.data import DynamicEmbeddedDocument

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
        dataset = fo.Dataset()
        dataset.add_sample(sample)

        # init
        value = 51
        sample.field["int"] = value
        self.assertEqual(sample.field.int, value)
        self.assertIsInstance(dataset.get_field("field.int"), fo.IntField)

        sample["after"] = DynamicEmbeddedDocument(int=value)
        self.assertIsInstance(dataset.get_field("after.int"), fo.IntField)
        self.assertIsInstance(
            dataset.get_field("after"),
            EmbeddedDocumentField,
        )
        self.assertEqual(
            dataset.get_field("after").document_type, DynamicEmbeddedDocument
        )

        sample.after["after"] = value
        self.assertIsInstance(dataset.get_field("after.after"), fo.IntField)

        # update setitem
        value = 52
        sample.field["int"] = value
        self.assertEqual(sample.field.int, value)

        # update setattr
        value = 53
        sample.field.int = value
        self.assertEqual(sample.field.int, value)

        # attempt type change
        with self.assertRaises(mongoengine.errors.ValidationError):
            sample.field.int = "string"

    @drop_datasets
    def test_lists(self):
        test = fo.Detections(
            detections=[fo.Detection(label="cat", bounding_box=[0, 0, 1, 1])]
        )
        sample = fo.Sample(filepath="/path/to/image.jpg", test=test)
        dataset = fo.Dataset()
        dataset.add_sample(sample)

        # pylint: disable=no-member
        sample.test.detections[0]["tp"] = True
        self.assertIsInstance(
            dataset.get_field("test.detections.tp"), fo.BooleanField
        )

        # pylint: disable=no-member
        sample.test.detections = [
            fo.Detection(label="dog", bounding_box=[0, 0, 1, 1], attr="woof")
        ]
        self.assertIsInstance(
            dataset.get_field("test.detections.attr"), fo.StringField
        )

        sample.test.detections[0]["ints"] = [1, 2, 3]
        test_ints = dataset.get_field("test.detections.ints")
        self.assertIsInstance(test_ints, fo.ListField)
        self.assertIsInstance(test_ints.field, fo.IntField)

    @drop_datasets
    def test_expansion(self):
        sample = fo.Sample(filepath="/path/to/image.jpg")
        dataset = fo.Dataset()
        dataset.add_sample(sample)

        sample["test"] = fo.Label()
        sample.test = fo.Label(attr="value")
        sample.save()

        self.assertIsInstance(dataset.get_field("test.attr"), fo.StringField)

    @drop_datasets
    def test_default_fields(self):
        dataset = fo.Dataset()

        # singles
        dataset.add_sample_field(
            "test_default",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classification,
        )
        self.assertIsInstance(
            dataset.get_field("test_default.confidence"), fo.FloatField
        )

        sample = fo.Sample(
            filepath="/path/to/image.jpg",
            test_catch_default=fo.Classification(),
        )
        dataset.add_sample(sample)
        self.assertIsInstance(
            dataset.get_field("test_catch_default.confidence"), fo.FloatField
        )

        sample["test_set_default"] = fo.Classification()
        self.assertIsInstance(
            dataset.get_field("test_set_default.confidence"), fo.FloatField
        )

        # lists
        dataset.add_sample_field(
            "test_list_default",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classifications,
        )
        self.assertIsInstance(
            dataset.get_field("test_list_default.classifications.confidence"),
            fo.FloatField,
        )

        sample = fo.Sample(
            filepath="/path/to/image.jpg",
            test_catch_list_default=fo.Classifications(),
        )
        dataset.add_sample(sample)
        self.assertIsInstance(
            dataset.get_field(
                "test_catch_list_default.classifications.confidence"
            ),
            fo.FloatField,
        )

        sample["test_set_list_default"] = fo.Classifications()
        self.assertIsInstance(
            dataset.get_field(
                "test_set_list_default.classifications.confidence"
            ),
            fo.FloatField,
        )

    @drop_datasets
    def test_metadata_fields(self):
        dataset = fo.Dataset()
        self.assertIsInstance(
            dataset.get_field("metadata.size_bytes"), fo.IntField
        )
        self.assertIsInstance(
            dataset.get_field("metadata.mime_type"), fo.StringField
        )

        with etau.TempDir() as tmp_dir:
            image_path = os.path.join(tmp_dir, "image.jpg")
            img = np.random.randint(255, size=(480, 640, 3), dtype=np.uint8)
            etai.write(img, image_path)
            dataset.add_sample(fo.Sample(filepath=image_path))
            dataset.compute_metadata(num_workers=1, skip_failures=False)

        self.assertIsInstance(
            dataset.get_field("metadata.num_channels"), fo.IntField
        )
        self.assertIsInstance(dataset.get_field("metadata.width"), fo.IntField)
        self.assertIsInstance(
            dataset.get_field("metadata.height"), fo.IntField
        )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
