"""
FiftyOne unit tests.

To run a single test, modify the main code to::

    singletest = unittest.TestSuite()
    singletest.addTest(TESTCASE("<TEST METHOD NAME>"))
    unittest.TextTestRunner().run(singletest)

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime
from functools import wraps
import gc
import math
import os
import unittest

from mongoengine.errors import (
    FieldDoesNotExist,
    ValidationError,
)
import numpy as np
from pymongo.errors import DuplicateKeyError

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.odm as foo
from fiftyone.core.odm.sample import default_sample_fields
import fiftyone.core.sample as fos
import fiftyone.core.stages as fosg
from fiftyone import ViewField as F


def drop_datasets(func):
    """Decorator that drops all non-persistent datasets from the database
    before running a test.
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        fo.delete_non_persistent_datasets()
        return func(*args, **kwargs)

    return wrapper


class SingleProcessSynchronizationTests(unittest.TestCase):
    """Tests ensuring that when a dataset or samples in a dataset are modified
    all relevant objects are instantly in sync within the same process.
    """

    @drop_datasets
    def test_dataset_singleton(self):
        """Testss that datasets are singletons."""
        dataset1 = fo.Dataset("test_dataset")
        dataset2 = fo.load_dataset("test_dataset")
        dataset3 = fo.Dataset()
        self.assertIs(dataset1, dataset2)
        self.assertIsNot(dataset1, dataset3)

        with self.assertRaises(ValueError):
            fo.Dataset("test_dataset")

    @drop_datasets
    def test_sample_singletons(self):
        """Tests that samples are singletons."""
        dataset = fo.Dataset()

        filepath = "test1.png"
        sample = fo.Sample(filepath=filepath)
        dataset.add_sample(sample)
        sample2 = dataset[sample.id]
        self.assertIs(sample2, sample)

        sample3 = fo.Sample(filepath="test2.png")
        dataset.add_sample(sample3)
        self.assertIsNot(sample3, sample)

        sample4 = dataset.match(
            {"filepath": os.path.abspath(filepath)}
        ).first()
        self.assertIsNot(sample4, sample)

    @drop_datasets
    def test_dataset_add_delete_field(self):
        """Tests that when fields are added or removed from a dataset field
        schema, those changes are reflected on the samples in the dataset.
        """
        dataset = fo.Dataset()

        sample = fo.Sample(filepath="test1.png")
        dataset.add_sample(sample)

        field_name = "field1"
        ftype = fo.IntField

        # Field not in schema
        with self.assertRaises(AttributeError):
            sample.get_field(field_name)
        with self.assertRaises(KeyError):
            sample[field_name]
        with self.assertRaises(AttributeError):
            getattr(sample, field_name)

        # Field added to dataset
        dataset.add_sample_field(field_name, ftype)
        self.assertIsNone(sample.get_field(field_name))
        self.assertIsNone(sample[field_name])
        self.assertIsNone(getattr(sample, field_name))

        # Field removed from dataset
        dataset.delete_sample_field(field_name)
        with self.assertRaises(AttributeError):
            sample.get_field(field_name)
        with self.assertRaises(KeyError):
            sample[field_name]
        with self.assertRaises(AttributeError):
            getattr(sample, field_name)

        # Field added to dataset and sample value set
        value = 51
        dataset.add_sample_field(field_name, ftype)
        sample[field_name] = value
        self.assertEqual(sample.get_field(field_name), value)
        self.assertEqual(sample[field_name], value)
        self.assertEqual(getattr(sample, field_name), value)

        # Field removed from dataset
        dataset.delete_sample_field(field_name)
        with self.assertRaises(AttributeError):
            sample.get_field(field_name)
        with self.assertRaises(KeyError):
            sample[field_name]
        with self.assertRaises(AttributeError):
            getattr(sample, field_name)

    @drop_datasets
    def test_dataset_remove_samples(self):
        """Tests that when a sample is deleted from a dataset, the sample is
        disconnected from the dataset.
        """
        dataset = fo.Dataset()

        # add 1 sample
        sample = fo.Sample(filepath="test1.png")
        dataset.add_sample(sample)
        self.assertTrue(sample.in_dataset)
        self.assertIsNotNone(sample.id)
        self.assertIs(sample.dataset, dataset)

        # delete 1 sample
        dataset.remove_sample(sample)
        self.assertFalse(sample.in_dataset)
        self.assertIsNone(sample.id)
        self.assertIsNone(sample.dataset)

        # add multiple samples
        filepath_template = "test%d.png"
        num_samples = 10
        samples = [
            fo.Sample(filepath=filepath_template % i)
            for i in range(num_samples)
        ]
        dataset.add_samples(samples)
        for sample in samples:
            self.assertTrue(sample.in_dataset)
            self.assertIsNotNone(sample.id)
            self.assertIs(sample.dataset, dataset)

        # delete some
        num_delete = 7
        dataset.remove_samples([sample.id for sample in samples[:num_delete]])
        for i, sample in enumerate(samples):
            if i < num_delete:
                self.assertFalse(sample.in_dataset)
                self.assertIsNone(sample.id)
                self.assertIsNone(sample.dataset)
            else:
                self.assertTrue(sample.in_dataset)
                self.assertIsNotNone(sample.id)
                self.assertIs(sample.dataset, dataset)

        # clear dataset
        dataset.clear()
        for sample in samples:
            self.assertFalse(sample.in_dataset)
            self.assertIsNone(sample.id)
            self.assertIsNone(sample.dataset)

    @drop_datasets
    def test_sample_set_field(self):
        """Tests that when a field is added to the dataset schema via implicit
        adding on a sample, that change is reflected in the dataset.
        """
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="test1.png")
        dataset.add_sample(sample)

        field_name = "field1"
        ftype = fo.IntField
        value = 51

        # field not in schema
        with self.assertRaises(KeyError):
            fields = dataset.get_field_schema()
            fields[field_name]

        # added to sample
        sample[field_name] = value
        fields = dataset.get_field_schema()
        self.assertIsInstance(fields[field_name], ftype)


class ScopedObjectsSynchronizationTests(unittest.TestCase):
    """Tests ensuring that when a dataset or samples in a dataset are modified,
    those changes are passed on the the database and can be seen in different
    scopes (or processes!).
    """

    @drop_datasets
    def test_dataset(self):
        dataset_name = self.test_dataset.__name__

        # Test Create

        def create_dataset():
            with self.assertRaises(fod.DoesNotExistError):
                dataset = fo.load_dataset(dataset_name)

            dataset = fo.Dataset(dataset_name)

        create_dataset()

        def check_create_dataset():
            fo.load_dataset(dataset_name)

        def check_create_dataset_via_load():
            self.assertIn(dataset_name, fo.list_datasets())
            dataset = fo.load_dataset(dataset_name)

        check_create_dataset()
        check_create_dataset_via_load()

        # Test Delete Default Field

        def delete_default_field():
            dataset = fo.load_dataset(dataset_name)
            with self.assertRaises(ValueError):
                dataset.delete_sample_field("tags")

        delete_default_field()

        # Test Add New Field

        field_name = "test_field"
        ftype = fo.IntField

        def add_field():
            dataset = fo.load_dataset(dataset_name)
            dataset.add_sample_field(field_name, ftype)

        def check_add_field():
            dataset = fo.load_dataset(dataset_name)
            fields = dataset.get_field_schema()
            self.assertIn(field_name, fields)
            self.assertIsInstance(fields[field_name], ftype)

        add_field()
        check_add_field()

        # Test Delete Field

        def delete_field():
            dataset = fo.load_dataset(dataset_name)
            dataset.delete_sample_field(field_name)

        def check_delete_field():
            dataset = fo.load_dataset(dataset_name)
            fields = dataset.get_field_schema()
            with self.assertRaises(KeyError):
                fields[field_name]

            # this is checking backend implementation. if it changes this may
            # be N/A
            sample_fields = dataset._doc.sample_fields
            sample_field_names = [sf.name for sf in sample_fields]
            self.assertNotIn(field_name, sample_field_names)

        delete_field()
        check_delete_field()

        # Test Delete Dataset

        def delete_dataset():
            fo.delete_dataset(dataset_name)

        delete_dataset()

        def check_delete_dataset():
            with self.assertRaises(fod.DoesNotExistError):
                fo.load_dataset(dataset_name)

        check_delete_dataset()

    @drop_datasets
    def test_add_remove_sample(self):
        dataset_name = self.test_add_remove_sample.__name__

        def create_dataset():
            dataset = fo.Dataset(dataset_name)

        create_dataset()

        filepath = "test1.png"

        # add sample

        def add_sample():
            dataset = fo.load_dataset(dataset_name)
            sample = fo.Sample(filepath=filepath)
            return dataset.add_sample(sample)

        def check_add_sample(sample_id):
            dataset = fo.load_dataset(dataset_name)
            self.assertEqual(len(dataset), 1)
            sample = dataset[sample_id]
            self.assertTrue(sample.in_dataset)
            self.assertIsNotNone(sample.id)
            self.assertIs(sample.dataset, dataset)

        sample_id = add_sample()
        check_add_sample(sample_id)

        # remove sample

        def remove_sample(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            dataset.remove_sample(sample)

        def check_remove_sample(sample_id):
            dataset = fo.load_dataset(dataset_name)
            self.assertEqual(len(dataset), 0)
            with self.assertRaises(KeyError):
                dataset[sample_id]

        remove_sample(sample_id)
        check_remove_sample(sample_id)

        # add multiple samples

        filepath_template = "test_multi%d.png"
        num_samples = 10

        def add_samples():
            dataset = fo.load_dataset(dataset_name)
            samples = [
                fo.Sample(filepath=filepath_template % i)
                for i in range(num_samples)
            ]
            return dataset.add_samples(samples)

        def check_add_samples(sample_ids):
            dataset = fo.load_dataset(dataset_name)
            self.assertEqual(len(dataset), num_samples)
            for sample_id in sample_ids:
                sample = dataset[sample_id]
                self.assertTrue(sample.in_dataset)
                self.assertIsNotNone(sample.id)
                self.assertIs(sample.dataset, dataset)

        sample_ids = add_samples()
        check_add_samples(sample_ids)

        # delete some

        num_delete = 7

        def remove_samples(sample_ids):
            dataset = fo.load_dataset(dataset_name)
            dataset.remove_samples(sample_ids[:num_delete])

        def check_remove_samples(sample_ids):
            dataset = fo.load_dataset(dataset_name)
            self.assertEqual(len(dataset), num_samples - num_delete)

            for i, sample_id in enumerate(sample_ids):
                if i < num_delete:
                    with self.assertRaises(KeyError):
                        dataset[sample_id]
                else:
                    sample = dataset[sample_id]
                    self.assertTrue(sample.in_dataset)
                    self.assertIsNotNone(sample.id)
                    self.assertIs(sample.dataset, dataset)

        remove_samples(sample_ids)
        check_remove_samples(sample_ids)

        # clear dataset

        def clear_dataset():
            dataset = fo.load_dataset(dataset_name)
            dataset.clear()

        def check_clear_dataset(sample_ids):
            dataset = fo.load_dataset(dataset_name)
            self.assertEqual(len(dataset), 0)

            for sample_id in sample_ids:
                with self.assertRaises(KeyError):
                    dataset[sample_id]

        clear_dataset()
        check_clear_dataset(sample_ids)

    @drop_datasets
    def test_add_sample_expand_schema(self):
        dataset_name = self.test_add_sample_expand_schema.__name__

        def create_dataset():
            dataset = fo.Dataset(dataset_name)

        create_dataset()

        # add sample with custom field

        def add_sample_expand_schema():
            dataset = fo.load_dataset(dataset_name)
            sample = fo.Sample(filepath="test.png", test_field=True)
            return dataset.add_sample(sample)

        def check_add_sample_expand_schema(sample_id):
            dataset = fo.load_dataset(dataset_name)

            fields = dataset.get_field_schema()
            self.assertIn("test_field", fields)
            self.assertIsInstance(fields["test_field"], fo.BooleanField)

            sample = dataset[sample_id]
            self.assertEqual(sample["test_field"], True)

        sample_id = add_sample_expand_schema()
        check_add_sample_expand_schema(sample_id)

        # add multiple samples with custom fields

        def add_samples_expand_schema():
            dataset = fo.load_dataset(dataset_name)
            sample1 = fo.Sample(filepath="test1.png", test_field_1=51)
            sample2 = fo.Sample(filepath="test2.png", test_field_2="fiftyone")
            return dataset.add_samples([sample1, sample2])

        def check_add_samples_expand_schema(sample_ids):
            dataset = fo.load_dataset(dataset_name)

            fields = dataset.get_field_schema()
            self.assertIn("test_field_1", fields)
            self.assertIsInstance(fields["test_field_1"], fo.IntField)
            self.assertIn("test_field_2", fields)
            self.assertIsInstance(fields["test_field_2"], fo.StringField)

            sample1 = dataset[sample_ids[0]]
            self.assertEqual(sample1["test_field_1"], 51)

            sample2 = dataset[sample_ids[1]]
            self.assertEqual(sample2["test_field_2"], "fiftyone")

        sample_ids = add_samples_expand_schema()
        check_add_samples_expand_schema(sample_ids)

    @drop_datasets
    def test_set_field_create(self):
        dataset_name = self.test_set_field_create.__name__

        def create_dataset():
            dataset = fo.Dataset(dataset_name)
            sample = fo.Sample(filepath="/path/to/image.jpg")
            return dataset.add_sample(sample)

        sample_id = create_dataset()

        field_name = "field2"
        value = 51

        def set_field_create(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            sample[field_name] = value
            sample.save()

        def check_set_field_create(sample_id):
            dataset = fo.load_dataset(dataset_name)
            fields = dataset.get_field_schema()
            self.assertIn(field_name, fields)

            sample = dataset[sample_id]
            self.assertEqual(sample[field_name], value)

        set_field_create(sample_id)
        check_set_field_create(sample_id)

    @drop_datasets
    def test_modify_sample(self):
        dataset_name = self.test_set_field_create.__name__

        def create_dataset():
            dataset = fo.Dataset(dataset_name)
            dataset.add_sample_field("bool_field", fo.BooleanField)
            dataset.add_sample_field("list_field", fo.ListField)
            return dataset.add_sample(fo.Sample(filepath="test.png"))

        sample_id = create_dataset()

        # check unset defaults

        def check_field_defaults(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]

            self.assertIs(sample.bool_field, None)
            self.assertIsInstance(sample.list_field, list)
            self.assertListEqual(sample.list_field, [])

        check_field_defaults(sample_id)

        # modify simple field (boolean)

        def modify_simple_field(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            sample.bool_field = True
            sample.save()

        def check_modify_simple_field(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            self.assertIs(sample.bool_field, True)

        modify_simple_field(sample_id)
        check_modify_simple_field(sample_id)

        # clear simple field (boolean)

        def clear_simple_field(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            del sample.bool_field
            sample.save()

        def check_clear_simple_field(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            self.assertIs(sample.bool_field, None)

        clear_simple_field(sample_id)
        check_clear_simple_field(sample_id)

        # modify complex field (list)

        def modify_list_set(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            sample.list_field = [True, False, True]
            sample.save()

        def check_modify_list_set(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            self.assertListEqual(sample.list_field, [True, False, True])

        modify_list_set(sample_id)
        check_modify_list_set(sample_id)

        def clear_complex_field(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            del sample.list_field
            sample.save()

        def check_clear_complex_field(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            self.assertIsInstance(sample.list_field, list)
            self.assertListEqual(sample.list_field, [])

        clear_complex_field(sample_id)
        check_clear_complex_field(sample_id)

        def modify_list_append(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            sample.list_field.append(51)
            sample.save()

        def check_modify_list_append(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            self.assertListEqual(sample.list_field, [51])

        modify_list_append(sample_id)
        check_modify_list_append(sample_id)

        def modify_list_extend(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            sample.list_field.extend(["fiftyone"])
            sample.save()

        def check_modify_list_extend(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            self.assertListEqual(sample.list_field, [51, "fiftyone"])

        modify_list_extend(sample_id)
        check_modify_list_extend(sample_id)

        def modify_list_pop(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            sample.list_field.pop(0)
            sample.save()

        def check_modify_list_pop(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            self.assertListEqual(sample.list_field, ["fiftyone"])

        modify_list_pop(sample_id)
        check_modify_list_pop(sample_id)

        def modify_list_iadd(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            sample.list_field += [52]
            sample.save()

        def check_modify_list_iadd(sample_id):
            dataset = fo.load_dataset(dataset_name)
            sample = dataset[sample_id]
            self.assertListEqual(sample.list_field, ["fiftyone", 52])

        modify_list_iadd(sample_id)
        check_modify_list_iadd(sample_id)


class MultiProcessSynchronizationTests(unittest.TestCase):
    """Tests that ensure that multiple processes can interact with the database
    simultaneously.
    """

    pass


class DatasetTests(unittest.TestCase):
    @drop_datasets
    def test_list_datasets(self):
        self.assertIsInstance(fo.list_datasets(), list)

    @drop_datasets
    def test_delete_dataset(self):
        IGNORED_DATASET_NAMES = fo.list_datasets()

        def list_datasets():
            return [
                name
                for name in fo.list_datasets()
                if name not in IGNORED_DATASET_NAMES
            ]

        dataset_names = ["test_%d" % i for i in range(10)]

        datasets = {name: fo.Dataset(name) for name in dataset_names}
        self.assertListEqual(list_datasets(), dataset_names)

        name = dataset_names.pop(0)
        datasets[name].delete()
        self.assertListEqual(list_datasets(), dataset_names)
        with self.assertRaises(fod.DoesNotExistError):
            len(datasets[name])

        name = dataset_names.pop(0)
        fo.delete_dataset(name)
        self.assertListEqual(list_datasets(), dataset_names)
        with self.assertRaises(fod.DoesNotExistError):
            len(datasets[name])

        new_dataset = fo.Dataset(name)
        self.assertEqual(len(new_dataset), 0)

    @drop_datasets
    def test_backing_doc_class(self):
        dataset_name = self.test_backing_doc_class.__name__
        dataset = fo.Dataset(dataset_name)
        self.assertTrue(
            issubclass(dataset._sample_doc_cls, foo.DatasetSampleDocument)
        )

    @drop_datasets
    def test_dataset_info(self):
        dataset_name = self.test_dataset_info.__name__

        dataset = fo.Dataset(dataset_name)

        self.assertEqual(dataset.info, {})
        self.assertIsInstance(dataset.info, dict)

        classes = ["cat", "dog"]

        dataset.info["classes"] = classes
        dataset.save()

        del dataset
        gc.collect()  # force garbage collection

        dataset2 = fo.load_dataset(dataset_name)

        self.assertTrue("classes" in dataset2.info)
        self.assertEqual(classes, dataset2.info["classes"])

    @drop_datasets
    def test_meta_dataset(self):
        dataset_name = self.test_meta_dataset.__name__
        dataset1 = fo.Dataset(dataset_name)

        field_name = "field1"
        ftype = fo.IntField

        dataset1.add_sample_field(field_name, ftype)
        fields = dataset1.get_field_schema()
        self.assertIsInstance(fields[field_name], ftype)

        dataset1b = fo.load_dataset(dataset_name)
        fields = dataset1b.get_field_schema()
        self.assertIsInstance(fields[field_name], ftype)

        dataset1.delete_sample_field("field1")
        with self.assertRaises(KeyError):
            fields = dataset1.get_field_schema()
            fields[field_name]

        with self.assertRaises(KeyError):
            dataset1b = fo.load_dataset(dataset_name)
            fields = dataset1b.get_field_schema()
            fields[field_name]

        dataset1c = fo.load_dataset(dataset_name)
        self.assertIs(dataset1c, dataset1)
        dataset1c = fo.load_dataset(dataset_name)
        self.assertIs(dataset1c, dataset1)


class SampleTests(unittest.TestCase):
    @drop_datasets
    def test_backing_doc_type(self):
        sample = fo.Sample(filepath="/path/to/image.jpg")
        self.assertIsInstance(sample._doc, foo.NoDatasetSampleDocument)

    @drop_datasets
    def test_abs_filepath(self):
        filepath = "relative/file.jpg"
        abs_filepath = os.path.abspath(filepath)

        sample = fo.Sample(filepath=filepath)
        self.assertEqual(sample.filepath, abs_filepath)

    @drop_datasets
    def test_get_field(self):
        field_value = "custom_value"
        sample = fo.Sample(filepath="/path/to/image.jpg", field1=field_value)

        # get valid
        self.assertEqual(sample.get_field("field1"), field_value)
        self.assertEqual(sample["field1"], field_value)
        self.assertEqual(sample.field1, field_value)

        # get missing
        with self.assertRaises(AttributeError):
            sample.get_field("missing_field")
        with self.assertRaises(KeyError):
            sample["missing_field"]
        with self.assertRaises(AttributeError):
            sample.missing_field

    @drop_datasets
    def test_set_field(self):
        sample = fo.Sample(filepath="/path/to/image.jpg")

        value = 51

        # set_field with create=False
        with self.assertRaises(ValueError):
            sample.set_field("field1", value, create=False)
        with self.assertRaises(AttributeError):
            sample.get_field("field1")
        with self.assertRaises(KeyError):
            sample["field1"]
        with self.assertRaises(AttributeError):
            sample.field1

        # set_field
        sample.set_field("field2", value)
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
        with self.assertRaises(ValueError):
            sample.field4 = value
        with self.assertRaises(AttributeError):
            sample.get_field("field4")
        with self.assertRaises(KeyError):
            sample["field4"]

    @drop_datasets
    def test_change_value(self):
        sample = fo.Sample(filepath="/path/to/image.jpg")

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


class SampleInDatasetTests(unittest.TestCase):
    @drop_datasets
    def test_invalid_sample(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="/path/to/image.jpg", tags=51)

        with self.assertRaises(ValidationError):
            dataset.add_sample(sample)

        self.assertEqual(len(dataset), 0)

    @drop_datasets
    def test_dataset_clear(self):
        dataset = fo.Dataset()

        self.assertEqual(len(dataset), 0)

        # add some samples
        num_samples = 10
        samples = [
            fo.Sample(filepath="/path/to/image_%d.jpg" % i)
            for i in range(num_samples)
        ]
        dataset.add_samples(samples)
        self.assertEqual(len(dataset), num_samples)

        # delete all samples
        dataset.clear()
        self.assertEqual(len(dataset), 0)

        # add some new samples
        num_samples = 5
        samples = [
            fo.Sample(filepath="/path/to/image_%d.jpg" % i)
            for i in range(num_samples)
        ]
        dataset.add_samples(samples)
        self.assertEqual(len(dataset), num_samples)

    @drop_datasets
    def test_dataset_delete_samples(self):
        dataset = fo.Dataset()

        # add some samples
        num_samples = 10
        samples = [
            fo.Sample(filepath="/path/to/image_%d.jpg" % i)
            for i in range(num_samples)
        ]
        ids = dataset.add_samples(samples)
        self.assertEqual(len(dataset), num_samples)

        # delete all samples
        num_delete = 7
        dataset.remove_samples(ids[:num_delete])
        self.assertEqual(len(dataset), num_samples - num_delete)

    @drop_datasets
    def test_getitem(self):
        dataset = fo.Dataset()

        # add some samples
        samples = [
            fo.Sample(filepath="/path/to/image_%d.jpg" % i) for i in range(10)
        ]
        sample_ids = dataset.add_samples(samples)

        sample_id = sample_ids[0]
        self.assertIsInstance(sample_id, str)
        sample = dataset[sample_id]
        self.assertIsInstance(sample, fo.Sample)
        self.assertEqual(sample.id, sample_id)

        with self.assertRaises(ValueError):
            dataset[0]

        with self.assertRaises(KeyError):
            dataset["F" * 24]

    @drop_datasets
    def test_autopopulated_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="/path/to/image.jpg")

        self.assertIsNone(sample.id)
        self.assertIsNone(sample.ingest_time)
        self.assertFalse(sample.in_dataset)
        self.assertIsNone(sample.dataset)

        dataset.add_sample(sample)

        self.assertIsNotNone(sample.id)
        self.assertIsInstance(sample.id, str)
        self.assertIsInstance(sample.ingest_time, datetime.datetime)
        self.assertTrue(sample.in_dataset)
        self.assertIs(sample.dataset, dataset)

    @drop_datasets
    def test_new_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="/path/to/image.jpg")

        field_name = "field1"
        value = 51

        sample[field_name] = value

        with self.assertRaises(FieldDoesNotExist):
            dataset.add_sample(sample, expand_schema=False)

        # ensure sample was not inserted
        self.assertEqual(len(dataset), 0)

        dataset.add_sample(sample)
        fields = dataset.get_field_schema()
        self.assertIsInstance(fields[field_name], fo.IntField)
        self.assertEqual(sample[field_name], value)
        self.assertEqual(dataset[sample.id][field_name], value)

    @drop_datasets
    def test_new_fields_multi(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="/path/to/image.jpg")

        field_name = "field1"
        value = 51

        sample[field_name] = value

        with self.assertRaises(FieldDoesNotExist):
            dataset.add_samples([sample], expand_schema=False)

        dataset.add_samples([sample])
        fields = dataset.get_field_schema()
        self.assertIsInstance(fields[field_name], fo.IntField)
        self.assertEqual(sample[field_name], value)
        self.assertEqual(dataset[sample.id][field_name], value)

    @drop_datasets
    def test_update_sample(self):
        dataset = fo.Dataset()
        filepath = "/path/to/image.jpg"
        sample = fo.Sample(filepath=filepath, tags=["tag1", "tag2"])
        dataset.add_sample(sample)

        # add duplicate filepath
        with self.assertRaises(DuplicateKeyError):
            dataset.add_sample(fo.Sample(filepath=filepath))

        # @todo(Tyler)
        # with self.assertRaises(DuplicateKeyError):
        #     dataset.add_samples([fo.Sample(filepath=filepath)])

        self.assertEqual(len(dataset), 1)

        # update assign
        tag = "tag3"
        sample.tags = [tag]
        self.assertEqual(len(sample.tags), 1)
        self.assertEqual(sample.tags[0], tag)
        sample2 = dataset[sample.id]
        self.assertEqual(len(sample2.tags), 1)
        self.assertEqual(sample2.tags[0], tag)

        # update append
        tag = "tag4"
        sample.tags.append(tag)
        self.assertEqual(len(sample.tags), 2)
        self.assertEqual(sample.tags[-1], tag)
        sample2 = dataset[sample.id]
        self.assertEqual(len(sample2.tags), 2)
        self.assertEqual(sample2.tags[-1], tag)

        # update add new field
        dataset.add_sample_field(
            "test_label",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classification,
        )
        sample.test_label = fo.Classification(label="cow")
        self.assertEqual(sample.test_label.label, "cow")
        self.assertEqual(sample.test_label.label, "cow")
        sample2 = dataset[sample.id]
        self.assertEqual(sample2.test_label.label, "cow")

        # update modify embedded document
        sample.test_label.label = "chicken"
        self.assertEqual(sample.test_label.label, "chicken")
        self.assertEqual(sample.test_label.label, "chicken")
        sample2 = dataset[sample.id]
        self.assertEqual(sample2.test_label.label, "chicken")

    @drop_datasets
    def test_add_from_another_dataset(self):
        dataset1 = fo.Dataset()
        dataset2 = fo.Dataset()

        sample = fo.Sample(filepath="test.png")

        sample_id = dataset1.add_sample(sample)
        self.assertIs(dataset1[sample_id], sample)
        self.assertIs(sample.dataset, dataset1)

        sample_id2 = dataset2.add_sample(sample)
        self.assertNotEqual(sample_id2, sample_id)

        sample2 = dataset2[sample_id2]
        self.assertIs(dataset1[sample.id], sample)
        self.assertIsNot(dataset2[sample_id2], sample)
        self.assertIs(sample2.dataset, dataset2)

        # Dataset.add_samples()

        sample = fo.Sample(filepath="test2.png")

        sample_id = dataset1.add_samples([sample])[0]
        self.assertIs(dataset1[sample_id], sample)
        self.assertIs(sample.dataset, dataset1)

        sample_id2 = dataset2.add_samples([sample])[0]
        self.assertNotEqual(sample_id2, sample_id)

        sample2 = dataset2[sample_id2]
        self.assertIs(dataset1[sample.id], sample)
        self.assertIsNot(dataset2[sample_id2], sample)
        self.assertIs(sample2.dataset, dataset2)

    @drop_datasets
    def test_copy_sample(self):
        dataset = fo.Dataset()

        sample = fo.Sample(filepath="test.png")

        sample_copy = sample.copy()
        self.assertIsNot(sample_copy, sample)
        self.assertIsNone(sample_copy.id)
        self.assertIsNone(sample_copy.dataset)

        dataset.add_sample(sample)

        sample_copy = sample.copy()
        self.assertIsNot(sample_copy, sample)
        self.assertIsNone(sample_copy.id)
        self.assertIsNone(sample_copy.dataset)

    @drop_datasets
    def test_in_memory_sample_fields(self):
        """Ensures that in-memory samples have their field values purged when
        a field is deleted.
        """
        dataset = fo.Dataset()

        s1 = fo.Sample("s1.png")
        s2 = fo.Sample("s2.png")

        dataset.add_samples([s1, s2])

        s1["new_field"] = 51
        dataset.delete_sample_field("new_field")
        s2["new_field"] = "fiftyone"

        self.assertIsNone(s1.new_field)
        self.assertEqual(s2.new_field, "fiftyone")


class LabelsTests(unittest.TestCase):
    @drop_datasets
    def test_create(self):
        labels = fo.Classification(label="cow", confidence=0.98)
        self.assertIsInstance(labels, fo.Classification)

        with self.assertRaises(ValidationError):
            fo.Classification(label=100)

    @drop_datasets
    def test_copy(self):
        dataset = fo.Dataset()

        dataset.add_sample(
            fo.Sample(
                filepath="filepath1.jpg",
                test_dets=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="friend",
                            confidence=0.9,
                            bounding_box=[0, 0, 0.5, 0.5],
                        )
                    ]
                ),
            )
        )

        sample = dataset.first()
        sample2 = sample.copy()

        self.assertIsNot(sample2, sample)
        self.assertNotEqual(sample2.id, sample.id)
        self.assertIsNot(sample2.test_dets, sample.test_dets)
        det = sample.test_dets.detections[0]
        det2 = sample2.test_dets.detections[0]
        self.assertIsNot(det2, det)
        self.assertNotEqual(det2.id, det.id)


class DatasetViewTests(unittest.TestCase):
    @drop_datasets
    def test_view(self):
        dataset = fo.Dataset()
        dataset.add_sample_field(
            "labels",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classification,
        )

        sample = fo.Sample(
            "1.jpg", tags=["train"], labels=fo.Classification(label="label1")
        )
        dataset.add_sample(sample)

        sample = fo.Sample(
            "2.jpg", tags=["test"], labels=fo.Classification(label="label2")
        )
        dataset.add_sample(sample)

        view = dataset.view()

        self.assertEqual(len(view), len(dataset))
        self.assertIsInstance(view.first(), fos.SampleView)

        # tags
        for sample in view.match({"tags": "train"}):
            self.assertIn("train", sample.tags)
        for sample in view.match({"tags": "test"}):
            self.assertIn("test", sample.tags)

        # labels
        for sample in view.match({"labels.label": "label1"}):
            self.assertEqual(sample.labels.label, "label1")

    @drop_datasets
    def test_sample_view_with_filtered_fields(self):
        dataset = fo.Dataset()

        dataset.add_sample(
            fo.Sample(
                filepath="filepath1.jpg",
                tags=["test"],
                test_dets=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="friend",
                            confidence=0.9,
                            bounding_box=[0, 0, 0.5, 0.5],
                        ),
                        fo.Detection(
                            label="friend",
                            confidence=0.3,
                            bounding_box=[0.25, 0, 0.5, 0.1],
                        ),
                        fo.Detection(
                            label="stopper",
                            confidence=0.1,
                            bounding_box=[0, 0, 0.5, 0.5],
                        ),
                        fo.Detection(
                            label="big bro",
                            confidence=0.6,
                            bounding_box=[0, 0, 0.1, 0.5],
                        ),
                    ]
                ),
                another_field=51,
            )
        )

        view = (
            dataset.view()
            .exclude_fields(["another_field"])
            .filter_detections("test_dets", F("confidence") > 0.5)
        )

        # modify element
        sample_view = view.first()
        sample_view.test_dets.detections[1].label = "MODIFIED"
        sample_view.save()
        # check that correct element is modified
        detections = dataset[sample_view.id].test_dets.detections
        self.assertEqual(detections[1].label, "friend")
        self.assertEqual(detections[-1].label, "MODIFIED")

        # complex modify
        sample_view = view.first()
        sample_view.test_dets.detections[0].label = "COMPLEX"
        sample_view.test_dets.detections[1].confidence = 0.51
        sample_view.save()
        # check that correct elements are modified
        detections = dataset[sample_view.id].test_dets.detections
        self.assertEqual(detections[0].label, "COMPLEX")
        self.assertEqual(detections[-1].confidence, 0.51)

        # add element
        with self.assertRaises(ValueError):
            sample_view = view.first()
            sample_view.test_dets.detections.append(
                fo.Detection(label="NEW DET")
            )
            sample_view.save()

        # remove element
        with self.assertRaises(ValueError):
            sample_view = view.first()
            sample_view.test_dets.detections.pop()
            sample_view.save()

        # remove all elements
        with self.assertRaises(ValueError):
            sample_view = view.first()
            sample_view.test_dets.detections.pop()
            sample_view.test_dets.detections.pop()
            sample_view.save()

        # replace element
        with self.assertRaises(ValueError):
            sample_view = view.first()
            sample_view.test_dets.detections[1] = fo.Detection()
            sample_view.save()

        # overwrite Detections.detections
        with self.assertRaises(ValueError):
            sample_view = view.first()
            sample_view.test_dets.detections = []
            sample_view.save()

        # overwrite Detections
        sample_view = view.first()
        sample_view.test_dets = fo.Detections()
        sample_view.save()
        detections = dataset[sample_view.id].test_dets.detections
        self.assertListEqual(detections, [])


class ViewFieldTests(unittest.TestCase):
    def test_field_names(self):
        self.assertEqual(
            F.ground_truth.to_mongo(), F("ground_truth").to_mongo()
        )
        self.assertEqual(
            F.ground_truth.label.to_mongo(), F("ground_truth.label").to_mongo()
        )
        self.assertEqual(
            F.ground_truth.label.to_mongo(), F("ground_truth.label").to_mongo()
        )
        self.assertEqual(
            F.ground_truth.label.to_mongo(), F("ground_truth").label.to_mongo()
        )


class ViewExpressionTests(unittest.TestCase):
    @drop_datasets
    def test_comparison(self):
        dataset = fo.Dataset()

        dataset.add_samples(
            [
                fo.Sample(filepath="filepath1.jpg", my_int=5),
                fo.Sample(filepath="filepath2.jpg", my_int=7),
                fo.Sample(filepath="filepath3.jpg", my_int=1),
                fo.Sample(filepath="filepath4.jpg", my_int=9),
            ]
        )

        field = "my_int"
        value = 5
        values = [1, 5]

        dataset_values = [s[field] for s in dataset]

        # test `==`
        filtered_values = [v for v in dataset_values if v == value]
        view = dataset.match(F(field) == value)
        view_values = [s[field] for s in view]
        self.assertListEqual(view_values, filtered_values)

        # test `!=`
        filtered_values = [v for v in dataset_values if v != value]
        view = dataset.match(F(field) != value)
        view_values = [s[field] for s in view]
        self.assertListEqual(view_values, filtered_values)

        # test `>`
        filtered_values = [v for v in dataset_values if v > value]
        view = dataset.match(F(field) > value)
        view_values = [s[field] for s in view]
        self.assertListEqual(view_values, filtered_values)

        # test `>=`
        filtered_values = [v for v in dataset_values if v >= value]
        view = dataset.match(F(field) >= value)
        view_values = [s[field] for s in view]
        self.assertListEqual(view_values, filtered_values)

        # test `<`
        filtered_values = [v for v in dataset_values if v < value]
        view = dataset.match(F(field) < value)
        view_values = [s[field] for s in view]
        self.assertListEqual(view_values, filtered_values)

        # test `<=`
        filtered_values = [v for v in dataset_values if v <= value]
        view = dataset.match(F(field) <= value)
        view_values = [s[field] for s in view]
        self.assertListEqual(view_values, filtered_values)

        # test `is_in`
        view = dataset.match(F(field).is_in(values))
        for sample in view:
            self.assertIn(sample[field], values)

        # test `NOT is_in`
        view = dataset.match(~(F(field).is_in(values)))
        for sample in view:
            self.assertNotIn(sample[field], values)

    @drop_datasets
    def test_logic(self):
        dataset = fo.Dataset()

        dataset.add_samples(
            [
                fo.Sample(filepath="filepath1.jpg", my_int=5),
                fo.Sample(filepath="filepath2.jpg", my_int=7),
                fo.Sample(filepath="filepath3.jpg", my_int=1),
                fo.Sample(filepath="filepath4.jpg", my_int=9),
            ]
        )

        field = "my_int"
        value = 5

        # test logical not
        view = dataset.match(~(F(field) == value))
        for sample in view:
            self.assertNotEqual(sample[field], value)

        # test logical and
        bounds = [3, 6]
        view = dataset.match((F(field) > bounds[0]) & (F(field) < bounds[1]))
        for sample in view:
            self.assertGreater(sample[field], bounds[0])
            self.assertLess(sample[field], bounds[1])

        # test logical or
        view = dataset.match((F(field) < bounds[0]) | (F(field) > bounds[1]))
        for sample in view:
            my_int = sample[field]
            self.assertTrue(my_int < bounds[0] or my_int > bounds[1])

    @drop_datasets
    def test_arithmetic(self):
        dataset = fo.Dataset()

        dataset.add_samples(
            [
                fo.Sample(filepath="filepath1.jpg", my_int=5, my_float=0.51),
                fo.Sample(
                    filepath="filepath2.jpg", my_int=-6, my_float=-0.965
                ),
            ]
        )

        # test __abs__
        manual_ids = [
            sample.id for sample in dataset if abs(sample.my_int) == 6
        ]
        view = dataset.match(abs(F("my_int")) == 6)
        self.assertListEqual([sample.id for sample in view], manual_ids)

        # test __add__
        manual_ids = [
            sample.id for sample in dataset if sample.my_int + 0.5 == -5.5
        ]
        view = dataset.match(F("my_int") + 0.5 == -5.5)
        self.assertListEqual([sample.id for sample in view], manual_ids)

        # test __ceil__
        manual_ids = [
            sample.id for sample in dataset if math.ceil(sample.my_float) == 1
        ]
        view = dataset.match(math.ceil(F("my_float")) == 1)
        self.assertListEqual([sample.id for sample in view], manual_ids)

        # test __floor__
        manual_ids = [
            sample.id
            for sample in dataset
            if math.floor(sample.my_float) == -1
        ]
        view = dataset.match(math.floor(F("my_float")) == -1)
        self.assertListEqual([sample.id for sample in view], manual_ids)

        # test __round__
        manual_ids = [
            sample.id for sample in dataset if round(sample.my_float) == -1
        ]
        view = dataset.match(round(F("my_float")) == -1)
        self.assertListEqual([sample.id for sample in view], manual_ids)

    @drop_datasets
    def test_array(self):
        dataset_name = self.test_array.__name__
        dataset = fo.Dataset()

        dataset.add_samples(
            [
                fo.Sample(
                    filepath="filepath1.jpg",
                    tags=["train"],
                    my_int=5,
                    my_list=["a", "b"],
                ),
                fo.Sample(
                    filepath="filepath2.jpg",
                    tags=["train"],
                    my_int=6,
                    my_list=["b", "c"],
                ),
                fo.Sample(
                    filepath="filepath3.jpg",
                    tags=["test"],
                    my_int=7,
                    my_list=["c", "d"],
                ),
            ]
        )

        # test contains
        tag = "train"
        manual_ids = [sample.id for sample in dataset if tag in sample.tags]
        view = dataset.match(F("tags").contains(tag))
        self.assertListEqual([sample.id for sample in view], manual_ids)

        # test is_in
        my_ints = [6, 7, 8]
        manual_ids = [
            sample.id for sample in dataset if sample.my_int in my_ints
        ]
        view = dataset.match(F("my_int").is_in(my_ints))
        self.assertListEqual([sample.id for sample in view], manual_ids)

        # test __getitem__
        idx = 1
        value = "c"
        manual_ids = [
            sample.id for sample in dataset if sample.my_list[idx] == value
        ]
        view = dataset.match(F("my_list")[idx] == value)
        self.assertListEqual([sample.id for sample in view], manual_ids)

    @drop_datasets
    def test_str(self):
        special_chars = r"[]{}()*+-?.,\\^$|#"
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [
                fo.Sample(filepath="test1.jpg", test="test1.jpg"),
                fo.Sample(filepath="test2.jpg", test="test2.jpg"),
                fo.Sample(
                    filepath="test3.jpg",
                    test="test3.jpg",
                    special_chars=special_chars,
                ),
            ]
        )

        # test starts_with
        self.assertEqual(
            len(self.dataset.match(F("test").starts_with("test"))), 3
        )
        self.assertEqual(
            len(self.dataset.match(F("test").starts_with("TEST"))), 0
        )
        self.assertEqual(
            len(
                self.dataset.match(
                    F("test").starts_with("TEST", case_sensitive=False)
                )
            ),
            3,
        )

        # test ends_with
        self.assertEqual(
            len(self.dataset.match(F("test").ends_with("1.jpg"))), 1
        )
        self.assertEqual(
            len(self.dataset.match(F("test").ends_with("1.JPG"))), 0
        )
        self.assertEqual(
            len(
                self.dataset.match(
                    F("test").ends_with("1.JPG", case_sensitive=False)
                )
            ),
            1,
        )

        # test contains_str
        self.assertEqual(
            len(self.dataset.match(F("test").contains_str("1.j"))), 1
        )
        self.assertEqual(
            len(self.dataset.match(F("test").contains_str("1.J"))), 0
        )
        self.assertEqual(
            len(
                self.dataset.match(
                    F("test").contains_str("1.J", case_sensitive=False)
                )
            ),
            1,
        )

        # test matches_str
        self.assertEqual(
            len(self.dataset.match(F("test").matches_str("test1.jpg"))), 1
        )
        self.assertEqual(
            len(self.dataset.match(F("test").matches_str("TEST1.JPG"))), 0
        )
        self.assertEqual(
            len(
                self.dataset.match(
                    F("test").matches_str("TEST1.JPG", case_sensitive=False)
                )
            ),
            1,
        )

        # test escaping
        self.assertEqual(
            len(
                self.dataset.match(
                    F("special_chars").matches_str(special_chars)
                )
            ),
            1,
        )


class SampleFieldTests(unittest.TestCase):
    @drop_datasets
    def test_field_add_delete_in_dataset(self):
        dataset = fo.Dataset()
        id1 = dataset.add_sample(fo.Sample("1.jpg"))
        id2 = dataset.add_sample(fo.Sample("2.jpg"))
        sample1 = dataset[id1]
        sample2 = dataset[id2]

        # add field (default duplicate)
        with self.assertRaises(ValueError):
            dataset.add_sample_field("filepath", fo.StringField)

        # delete default field
        with self.assertRaises(ValueError):
            dataset.delete_sample_field("filepath")

        field_name = "field1"
        ftype = fo.StringField
        field_test_value = "test_field_value"

        # access non-existent field
        with self.assertRaises(KeyError):
            dataset.get_field_schema()[field_name]
        for sample in [sample1, sample2, dataset[id1], dataset[id2]]:
            with self.assertRaises(AttributeError):
                sample.get_field(field_name)
            with self.assertRaises(KeyError):
                sample[field_name]
            with self.assertRaises(AttributeError):
                getattr(sample, field_name)
            with self.assertRaises(KeyError):
                sample.to_dict()[field_name]

        # add field (new)
        dataset.add_sample_field(field_name, ftype)
        setattr(sample1, field_name, field_test_value)

        # check field exists and is of correct type
        field = dataset.get_field_schema()[field_name]
        self.assertIsInstance(field, ftype)
        for sample in [sample1, dataset[id1]]:
            # check field exists on sample and is set correctly
            self.assertEqual(sample.get_field(field_name), field_test_value)
            self.assertEqual(sample[field_name], field_test_value)
            self.assertEqual(getattr(sample, field_name), field_test_value)
            self.assertEqual(sample.to_dict()[field_name], field_test_value)
        for sample in [sample2, dataset[id2]]:
            self.assertIsInstance(field, ftype)
            # check field exists on sample and is None
            self.assertIsNone(sample.get_field(field_name))
            self.assertIsNone(sample[field_name])
            self.assertIsNone(getattr(sample, field_name))
            self.assertIsNone(sample.to_dict()[field_name])

        # add field (duplicate)
        with self.assertRaises(ValueError):
            dataset.add_sample_field(field_name, ftype)

        # delete field
        dataset.delete_sample_field(field_name)

        # access non-existent field
        with self.assertRaises(KeyError):
            dataset.get_field_schema()[field_name]
        for sample in [sample1, sample2, dataset[id1], dataset[id2]]:
            with self.assertRaises(AttributeError):
                sample.get_field(field_name)
            with self.assertRaises(KeyError):
                sample[field_name]
            with self.assertRaises(AttributeError):
                getattr(sample, field_name)
            with self.assertRaises(KeyError):
                sample.to_dict()[field_name]

        # add deleted field with new type
        ftype = fo.IntField
        field_test_value = 51
        dataset.add_sample_field(field_name, ftype)
        setattr(sample1, field_name, field_test_value)

        # check field exists and is of correct type
        field = dataset.get_field_schema()[field_name]
        self.assertIsInstance(field, ftype)
        for sample in [sample1, dataset[id1]]:
            self.assertIsInstance(field, ftype)
            # check field exists on sample and is set correctly
            self.assertEqual(sample.get_field(field_name), field_test_value)
            self.assertEqual(sample[field_name], field_test_value)
            self.assertEqual(getattr(sample, field_name), field_test_value)
            self.assertEqual(sample.to_dict()[field_name], field_test_value)
        for sample in [sample2, dataset[id2]]:
            self.assertIsInstance(field, ftype)
            # check field exists on sample and is None
            self.assertIsNone(sample.get_field(field_name))
            self.assertIsNone(sample[field_name])
            self.assertIsNone(getattr(sample, field_name))
            self.assertIsNone(sample.to_dict()[field_name])

    @drop_datasets
    def test_field_get_set_clear_no_dataset(self):
        filename = "1.jpg"
        tags = ["tag1", "tag2"]
        sample = fo.Sample(filepath=filename, tags=tags)

        # get field (default)
        self.assertEqual(sample.filename, filename)
        self.assertListEqual(sample.tags, tags)
        self.assertIsNone(sample.metadata)

        # get field (invalid)
        with self.assertRaises(AttributeError):
            sample.get_field("invalid_field")
        with self.assertRaises(KeyError):
            sample["invalid_field"]
        with self.assertRaises(AttributeError):
            sample.invalid_field

        # set field (default)
        sample.filepath = ["invalid", "type"]
        sample.filepath = None
        sample.tags = "invalid type"
        sample.tags = None

        # clear field (default)
        with self.assertRaises(ValueError):
            sample.clear_field("filepath")
        sample.clear_field("tags")
        self.assertListEqual(sample.tags, [])
        sample.clear_field("metadata")
        self.assertIsNone(sample.metadata)

        # set field (new)
        with self.assertRaises(ValueError):
            sample.set_field("field_1", 51, create=False)

        sample.set_field("field_1", 51)
        self.assertIn("field_1", sample.field_names)
        self.assertEqual(sample.get_field("field_1"), 51)
        self.assertEqual(sample["field_1"], 51)
        self.assertEqual(sample.field_1, 51)

        sample["field_2"] = "fiftyone"
        self.assertIn("field_2", sample.field_names)
        self.assertEqual(sample.get_field("field_2"), "fiftyone")
        self.assertEqual(sample["field_2"], "fiftyone")
        self.assertEqual(sample.field_2, "fiftyone")

        # clear field (new)
        sample.clear_field("field_1")
        self.assertNotIn("field_1", sample.field_names)
        with self.assertRaises(AttributeError):
            sample.get_field("field_1")
        with self.assertRaises(KeyError):
            sample["field_1"]
        with self.assertRaises(AttributeError):
            sample.field_1

    @drop_datasets
    def test_field_get_set_clear_in_dataset(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample("1.jpg"))
        dataset.add_sample(fo.Sample("2.jpg"))

        # @todo(Tyler)
        # get field (default)

        # get field (invalid)

        # set field (default)

        # clear field (default)

        # set field (new)

        # clear field (new)

    @drop_datasets
    def test_vector_array_fields(self):
        dataset1 = fo.Dataset()
        dataset2 = fo.Dataset()

        sample1 = fo.Sample(
            filepath="img.png",
            vector_field=np.arange(5),
            array_field=np.ones((2, 3)),
        )
        dataset1.add_sample(sample1)

        sample2 = fo.Sample(filepath="img.png")
        dataset2.add_sample(sample2)
        sample2["vector_field"] = np.arange(5)
        sample2["array_field"] = np.ones((2, 3))
        sample2.save()

        for dataset in [dataset1, dataset2]:
            fields = dataset.get_field_schema()
            self.assertIsInstance(fields["vector_field"], fo.VectorField)
            self.assertIsInstance(fields["array_field"], fo.ArrayField)


class SerializationTests(unittest.TestCase):
    def test_embedded_document(self):
        label1 = fo.Classification(label="cat", logits=np.arange(4))

        label2 = fo.Classification(label="cat", logits=np.arange(4))

        d1 = label1.to_dict()
        d2 = label2.to_dict()
        d1.pop("_id")
        d2.pop("_id")
        self.assertDictEqual(d1, d2)

        d = label1.to_dict()
        self.assertEqual(fo.Classification.from_dict(d), label1)

        s = label1.to_json(pretty_print=False)
        self.assertEqual(fo.Classification.from_json(s), label1)

        s = label1.to_json(pretty_print=True)
        self.assertEqual(fo.Classification.from_json(s), label1)

    def test_sample_no_dataset(self):
        """This test only works if the samples do not have Classification or
        Detection fields because of the autogenerated ObjectIDs.
        """
        sample1 = fo.Sample(
            filepath="~/Desktop/test.png",
            tags=["test"],
            vector=np.arange(5),
            array=np.ones((2, 3)),
            float=5.1,
            bool=True,
            int=51,
        )

        sample2 = fo.Sample(
            filepath="~/Desktop/test.png",
            tags=["test"],
            vector=np.arange(5),
            array=np.ones((2, 3)),
            float=5.1,
            bool=True,
            int=51,
        )
        self.assertDictEqual(sample1.to_dict(), sample2.to_dict())

        self.assertEqual(
            fo.Sample.from_dict(sample1.to_dict()).to_dict(), sample1.to_dict()
        )

    @drop_datasets
    def test_sample_in_dataset(self):
        """This test only works if the samples do not have Classification or
        Detection fields because of the autogenerated ObjectIDs.
        """
        dataset1 = fo.Dataset()
        dataset2 = fo.Dataset()

        sample1 = fo.Sample(
            filepath="~/Desktop/test.png",
            tags=["test"],
            vector=np.arange(5),
            array=np.ones((2, 3)),
            float=5.1,
            bool=True,
            int=51,
        )

        sample2 = fo.Sample(
            filepath="~/Desktop/test.png",
            tags=["test"],
            vector=np.arange(5),
            array=np.ones((2, 3)),
            float=5.1,
            bool=True,
            int=51,
        )

        self.assertDictEqual(sample1.to_dict(), sample2.to_dict())

        dataset1.add_sample(sample1)
        dataset2.add_sample(sample2)

        self.assertNotEqual(sample1, sample2)

        s1 = fo.Sample.from_dict(sample1.to_dict())
        s2 = fo.Sample.from_dict(sample2.to_dict())

        self.assertFalse(s1.in_dataset)
        self.assertNotEqual(s1, sample1)

        self.assertDictEqual(s1.to_dict(), s2.to_dict())


class SampleCollectionTests(unittest.TestCase):
    @drop_datasets
    def test_first_last(self):
        dataset = fo.Dataset()
        dataset.add_samples([fo.Sample("test_%d.png" % i) for i in range(3)])

        self.assertIsInstance(dataset.first(), fo.Sample)
        self.assertIsInstance(dataset.last(), fo.Sample)
        self.assertIsInstance(dataset.view().first(), fos.SampleView)
        self.assertIsInstance(dataset.view().last(), fos.SampleView)


class AggregationTests(unittest.TestCase):
    @drop_datasets
    def test_aggregate(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample("1.jpg", tags=["tag1"]),
                fo.Sample("2.jpg", tags=["tag1", "tag2"]),
                fo.Sample("3.jpg", tags=["tag2", "tag3"]),
            ]
        )

        counts = {
            "tag1": 2,
            "tag2": 2,
            "tag3": 1,
        }

        pipeline = [
            {"$unwind": "$tags"},
            {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
        ]

        for ds in dataset, dataset.view():
            for d in ds.aggregate(pipeline):
                tag = d["_id"]
                count = d["count"]
                self.assertEqual(count, counts[tag])


class SliceTests(unittest.TestCase):
    @drop_datasets
    def test_slice(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample("1.jpg", tags=["tag1"]),
                fo.Sample("2.jpg", tags=["tag1", "tag2"]),
                fo.Sample("3.jpg", tags=["tag2", "tag3"]),
            ]
        )

        view = dataset[0:2]
        self.assertEqual(len(view), 2)

        view = dataset[1:3]
        self.assertEqual(len(view), 2)

        view = dataset[0:0]
        self.assertEqual(len(view), 0)

        view = dataset[3:3]
        self.assertEqual(len(view), 0)


class ViewStageTests(unittest.TestCase):
    @drop_datasets
    def setUp(self):
        self.dataset = fo.Dataset()
        self.sample1 = fo.Sample(filepath="test_one.png")
        self.sample2 = fo.Sample(filepath="test_two.png")
        self.dataset.add_sample(self.sample1)
        self.dataset.add_sample(self.sample2)

    def test_exclude(self):
        result = list(self.dataset.exclude([self.sample1.id]))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample2.id)

    def test_exclude_fields(self):
        self.dataset.add_sample_field("exclude_fields_field1", fo.IntField)
        self.dataset.add_sample_field("exclude_fields_field2", fo.IntField)

        for sample in self.dataset.exclude_fields(["exclude_fields_field1"]):
            self.assertIsNone(sample.selected_field_names)
            self.assertSetEqual(
                sample.excluded_field_names, {"exclude_fields_field1"}
            )
            with self.assertRaises(AttributeError):
                sample.exclude_fields_field1

            self.assertIsNone(sample.exclude_fields_field2)

    def test_exists(self):
        self.sample1["exists"] = True
        self.sample1.save()
        result = list(self.dataset.exists("exists"))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_filter_field(self):
        self.sample1["test_class"] = fo.Classification(label="friend")
        self.sample1.save()

        self.sample2["test_class"] = fo.Classification(label="enemy")
        self.sample2.save()

        view = self.dataset.filter_field("test_class", F("label") == "friend")

        self.assertEqual(len(view.exists("test_class")), 1)
        for sample in view:
            if sample.test_class is not None:
                self.assertEqual(sample.test_class.label, "friend")

    def test_filter_classifications(self):
        self.sample1["test_clfs"] = fo.Classifications(
            classifications=[
                fo.Classification(label="friend", confidence=0.9),
                fo.Classification(label="friend", confidence=0.3),
                fo.Classification(label="stopper", confidence=0.1),
                fo.Classification(label="big bro", confidence=0.6),
            ]
        )
        self.sample1.save()
        self.sample2["test_clfs"] = fo.Classifications(
            classifications=[
                fo.Classification(label="friend", confidence=0.99),
                fo.Classification(label="tricam", confidence=0.2),
                fo.Classification(label="hex", confidence=0.8),
            ]
        )
        self.sample2.save()

        view = self.dataset.filter_classifications(
            "test_clfs", (F("confidence") > 0.5) & (F("label") == "friend")
        )

        for sample in view:
            for clf in sample.test_clfs.classifications:
                self.assertGreater(clf.confidence, 0.5)
                self.assertEqual(clf.label, "friend")

    def test_filter_detections(self):
        self.sample1["test_dets"] = fo.Detections(
            detections=[
                fo.Detection(
                    label="friend",
                    confidence=0.9,
                    bounding_box=[0, 0, 0.5, 0.5],
                ),
                fo.Detection(
                    label="friend",
                    confidence=0.3,
                    bounding_box=[0.25, 0, 0.5, 0.1],
                ),
                fo.Detection(
                    label="stopper",
                    confidence=0.1,
                    bounding_box=[0, 0, 0.5, 0.5],
                ),
                fo.Detection(
                    label="big bro",
                    confidence=0.6,
                    bounding_box=[0, 0, 0.1, 0.5],
                ),
            ]
        )
        self.sample1.save()
        self.sample2["test_dets"] = fo.Detections(
            detections=[
                fo.Detection(
                    label="friend", confidence=0.99, bounding_box=[0, 0, 1, 1],
                ),
                fo.Detection(
                    label="tricam",
                    confidence=0.2,
                    bounding_box=[0, 0, 0.5, 0.5],
                ),
                fo.Detection(
                    label="hex",
                    confidence=0.8,
                    bounding_box=[0.35, 0, 0.2, 0.25],
                ),
            ]
        )
        self.sample2.save()

        view = self.dataset.filter_detections(
            "test_dets", (F("confidence") > 0.5) & (F("label") == "friend")
        )

        for sample in view:
            for det in sample.test_dets.detections:
                self.assertGreater(det.confidence, 0.5)
                self.assertEqual(det.label, "friend")

    def test_limit(self):
        result = list(self.dataset.limit(1))
        self.assertIs(len(result), 1)

    def test_match(self):
        self.sample1["value"] = "value"
        self.sample1.save()
        result = list(self.dataset.match({"value": "value"}))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_match_tag(self):
        self.sample1.tags.append("test")
        self.sample1.save()
        result = list(self.dataset.match_tag("test"))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_match_tags(self):
        self.sample1.tags.append("test")
        self.sample1.save()
        result = list(self.dataset.match_tags(["test"]))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_re_match(self):
        result = list(self.dataset.match(F("filepath").re_match(r"two\.png$")))
        self.assertIs(len(result), 1)
        self.assertTrue(result[0].filepath.endswith("two.png"))

        # case-insentive match
        result = list(
            self.dataset.match(
                F("filepath").re_match(r"TWO\.PNG$", options="i")
            )
        )
        self.assertIs(len(result), 1)
        self.assertTrue(result[0].filepath.endswith("two.png"))

    def test_mongo(self):
        result = list(self.dataset.mongo([{"$limit": 1}]))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_select(self):
        result = list(self.dataset.select([self.sample1.id]))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_select_fields(self):
        self.dataset.add_sample_field("select_fields_field", fo.IntField)

        for sample in self.dataset.select_fields():
            self.assertSetEqual(
                sample.selected_field_names, set(default_sample_fields())
            )
            self.assertIsNone(sample.excluded_field_names)
            sample.filepath
            sample.metadata
            sample.tags
            with self.assertRaises(AttributeError):
                sample.select_fields_field

    def test_skip(self):
        result = list(self.dataset.sort_by("filepath").skip(1))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample2.id)

    def test_sort_by(self):
        result = list(self.dataset.sort_by("filepath"))
        self.assertIs(len(result), 2)
        self.assertEqual(result[0].id, self.sample1.id)
        result = list(self.dataset.sort_by("filepath", reverse=True))
        self.assertIs(len(result), 2)
        self.assertEqual(result[0].id, self.sample2.id)

    def test_take(self):
        result = list(self.dataset.take(1))
        self.assertIs(len(result), 1)

    def test_uuids(self):
        stage = fosg.Take(1)
        stage_dict = stage._serialize()
        self.assertEqual(stage._uuid, stage_dict["_uuid"])
        self.assertEqual(
            stage_dict["_uuid"], fosg.ViewStage._from_dict(stage_dict)._uuid
        )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
