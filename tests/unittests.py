"""
Unit tests.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

from mongoengine import IntField

import fiftyone as fo
import fiftyone.core.odm as foo


class TestDataset(unittest.TestCase):
    def test_singleton_same_name(self):
        """
        Test that two datasets with the same name are the same
        """
        self.assertIs(fo.Dataset("my_dataset"), fo.Dataset("my_dataset"))

    def test_singleton_diff_names(self):
        """
        Test that two datasets with the different names are different
        """
        self.assertIsNot(
            fo.Dataset("my_dataset"), fo.Dataset("another_dataset")
        )

    def test_backing_doc_class(self):
        """
        Test that the dataset Doc class is a subclass of ODMDatasetSample
        """
        dataset = fo.Dataset("my_dataset")
        self.assertTrue(issubclass(dataset._Doc, foo.ODMDatasetSample))


class TestSample(unittest.TestCase):
    def test_backing_doc_type(self):
        """
        Test that the initial sample doc type is ODMNoDatasetSample
        """
        sample = fo.Sample(filepath="path/to/file.jpg")
        self.assertIsInstance(sample._doc, foo.ODMNoDatasetSample)

    # GET

    def test_get_field_missing(self):
        sample = fo.Sample(filepath="path/to/file.jpg")
        with self.assertRaises(KeyError):
            sample.get_field("my_int")

    def test_getitem_missing(self):
        sample = fo.Sample(filepath="path/to/file.jpg")
        with self.assertRaises(KeyError):
            sample["my_int"]

    def test_getattr_missing(self):
        sample = fo.Sample(filepath="path/to/file.jpg")
        with self.assertRaises(AttributeError):
            sample.my_int

    # SET

    def test_set_field_create_false(self):
        sample = fo.Sample(filepath="path/to/file.jpg")
        with self.assertRaises(ValueError):
            sample.set_field("my_int", 9, create=False)

    def test_set_field_create_true(self):
        sample = fo.Sample(filepath="path/to/file.jpg")
        value = 51
        sample.set_field(field_name="my_int", value=value, create=True)
        fields = sample.get_field_schema()
        self.assertIsInstance(fields["my_int"], IntField)
        self.assertIsInstance(sample.my_int, int)
        self.assertEqual(sample.my_int, value)
        self.assertEqual(sample["my_int"], value)

    def test_setitem(self):
        sample = fo.Sample(filepath="path/to/file.jpg")
        value = 51
        sample["my_int"] = value
        self.assertEqual(sample.my_int, value)
        self.assertEqual(sample["my_int"], value)

    def test_setattr_without_create(self):
        sample = fo.Sample(filepath="path/to/file.jpg")
        with self.assertWarns(UserWarning):
            sample.my_int = 9

    # UPDATE

    def test_change_value(self):
        sample = fo.Sample(filepath="path/to/file.jpg")

        # init
        value = 51
        sample["my_int"] = value
        self.assertEqual(sample.my_int, value)
        self.assertEqual(sample["my_int"], value)

        # update setitem
        value = 52
        sample["my_int"] = value
        self.assertEqual(sample.my_int, value)
        self.assertEqual(sample["my_int"], value)

        # update setattr
        value = 53
        sample.my_int = value
        self.assertEqual(sample.my_int, value)
        self.assertEqual(sample["my_int"], value)


if __name__ == "__main__":
    unittest.main()
