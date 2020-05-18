"""
Unit tests.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

from mongoengine import IntField
from mongoengine.errors import FieldDoesNotExist, ValidationError

import fiftyone as fo
import fiftyone.core.odm as foo


class TestDataset(unittest.TestCase):
    def test_pername_singleton(self):
        dataset1 = fo.Dataset("test_dataset")
        dataset2 = fo.Dataset("test_dataset")
        dataset3 = fo.Dataset("another_dataset")
        self.assertIs(dataset1, dataset2)
        self.assertIsNot(dataset1, dataset3)

    def test_backing_doc_class(self):
        dataset = fo.Dataset("test_dataset")
        self.assertTrue(issubclass(dataset._Doc, foo.ODMDatasetSample))


class TestSample(unittest.TestCase):
    def test_backing_doc_type(self):
        sample = fo.Sample(filepath="path/to/file.jpg")
        self.assertIsInstance(sample._doc, foo.ODMNoDatasetSample)

    def test_get_field(self):
        filepath = "path/to/file.jpg"

        sample = fo.Sample(filepath=filepath)

        # get valid
        self.assertEqual(sample.get_field("filepath"), filepath)
        self.assertEqual(sample["filepath"], filepath)
        self.assertEqual(sample.filepath, filepath)

        # get missing
        with self.assertRaises(KeyError):
            sample.get_field("missing_field")
        with self.assertRaises(KeyError):
            sample["missing_field"]
        with self.assertRaises(AttributeError):
            sample.missing_field

    def test_set_field(self):
        sample = fo.Sample(filepath="path/to/file.jpg")

        value = 51

        # set_field create=False
        with self.assertRaises(ValueError):
            sample.set_field("field1", value, create=False)
        with self.assertRaises(KeyError):
            sample.get_field("field1")
        with self.assertRaises(KeyError):
            sample["field1"]
        with self.assertRaises(AttributeError):
            sample.field1

        # set_field create=True
        sample.set_field(field_name="field2", value=value, create=True)
        fields = sample.get_field_schema()
        self.assertIsInstance(fields["field2"], IntField)
        self.assertIsInstance(sample.field2, int)
        self.assertEqual(sample.get_field("field2"), value)
        self.assertEqual(sample["field2"], value)
        self.assertEqual(sample.field2, value)

        # __setitem__
        sample["field3"] = value
        self.assertEqual(sample.get_field("field3"), value)
        self.assertEqual(sample["field3"], value)
        self.assertEqual(sample.field3, value)

        # __setattr__
        with self.assertWarns(UserWarning):
            sample.field4 = value
        with self.assertRaises(KeyError):
            sample.get_field("field4")
        with self.assertRaises(KeyError):
            sample["field4"]
        self.assertEqual(sample.field4, value)

    def test_change_value(self):
        sample = fo.Sample(filepath="path/to/file.jpg")

        # init
        value = 51
        sample["test_field"] = value
        self.assertEqual(sample.test_field, value)

        # update setitem
        value = 52
        sample["test_field"] = value
        self.assertEqual(sample.test_field, value)

        # update setattr
        value = 53
        sample.test_field = value
        self.assertEqual(sample.test_field, value)


class TestSampleInDataset(unittest.TestCase):
    def test_id(self):
        dataset = fo.Dataset(name="test_dataset")
        sample = fo.Sample(filepath="path/to/file.jpg")
        self.assertIsNone(sample.id)

        dataset.add_sample(sample)
        self.assertIsNotNone(sample.id)
        self.assertIsInstance(sample.id, str)


class TestLabels(unittest.TestCase):
    def test_create(self):
        labels = fo.Classification(label="cow", confidence=0.98)
        self.assertIsInstance(labels, fo.Classification)

        with self.assertRaises(FieldDoesNotExist):
            fo.Classification(made_up_field=100)

        with self.assertRaises(ValidationError):
            fo.Classification(label=100)


if __name__ == "__main__":
    unittest.main()
