"""
Unit tests.

To run a single test, modify the main code to:

```
singletest = unittest.TestSuite()
singletest.addTest(TESTCASE("<TEST METHOD NAME>"))
unittest.TextTestRunner().run(singletest)
```

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime
from functools import wraps
import unittest

from mongoengine.errors import (
    FieldDoesNotExist,
    NotUniqueError,
    ValidationError,
)
import numpy as np

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.odm as foo


def drop_datasets(func):
    """Decorator to drop the database before running a test"""

    @wraps(func)
    def wrapper(*args, **kwargs):
        fo.delete_non_persistent_datasets()
        return func(*args, **kwargs)

    return wrapper


class SingleProcessSynchronizationTest(unittest.TestCase):
    """Tests ensuring that when a dataset or samples in a dataset are modified
    all relevant objects are instantly in sync within the same process.
    """

    @drop_datasets
    def test_pername_singleton(self):
        """Test datasets are always in sync with themselves"""
        dataset1 = fo.Dataset("test_dataset")
        dataset2 = fo.load_dataset("test_dataset")
        dataset3 = fo.Dataset("another_dataset")
        self.assertIs(dataset1, dataset2)
        self.assertIsNot(dataset1, dataset3)

        with self.assertRaises(ValueError):
            fo.Dataset("test_dataset")

    @drop_datasets
    def test_sample_singletons(self):
        """Test samples are always in sync with themselves"""
        dataset_name = self.test_sample_singletons.__name__
        dataset = fo.Dataset(dataset_name)

        filepath = "test1.png"
        sample = fo.Sample(filepath=filepath)
        dataset.add_sample(sample)
        sample2 = dataset[sample.id]
        self.assertIs(sample2, sample)

        sample3 = fo.Sample(filepath="test2.png")
        dataset.add_sample(sample3)
        self.assertIsNot(sample3, sample)

        sample4 = dataset.view().match({"filepath": filepath}).first()
        self.assertIs(sample4, sample)

    @drop_datasets
    def test_dataset_add_delete_field(self):
        """Test when fields are added or removed from a dataset field schema,
        those changes are reflected on the samples in the dataset.
        """
        dataset_name = self.test_dataset_add_delete_field.__name__
        dataset = fo.Dataset(dataset_name)

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
        dataset.add_sample_field(field_name, ftype=ftype)
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
        dataset.add_sample_field(field_name, ftype=ftype)
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
        """Test when a sample is deleted from a dataset, the sample is
        disconnected from the dataset.
        """
        dataset_name = self.test_dataset_remove_samples.__name__
        dataset = fo.Dataset(dataset_name)

        # add 1 sample
        sample = fo.Sample(filepath="test1.png")
        dataset.add_sample(sample)
        self.assertTrue(sample.in_dataset)
        self.assertIsNotNone(sample.id)
        self.assertEqual(sample.dataset_name, dataset.name)

        # delete 1 sample
        dataset.remove_sample(sample)
        self.assertFalse(sample.in_dataset)
        self.assertIsNone(sample.id)
        self.assertIsNone(sample.dataset_name)

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
            self.assertEqual(sample.dataset_name, dataset.name)

        # delete some
        num_delete = 7
        dataset.remove_samples([sample.id for sample in samples[:num_delete]])
        for i, sample in enumerate(samples):
            if i < num_delete:
                self.assertFalse(sample.in_dataset)
                self.assertIsNone(sample.id)
                self.assertIsNone(sample.dataset_name)
            else:
                self.assertTrue(sample.in_dataset)
                self.assertIsNotNone(sample.id)
                self.assertEqual(sample.dataset_name, dataset.name)

        # clear dataset
        dataset.clear()
        for sample in samples:
            self.assertFalse(sample.in_dataset)
            self.assertIsNone(sample.id)
            self.assertIsNone(sample.dataset_name)

    @drop_datasets
    def test_sample_set_field(self):
        """Test when a field is added to the dataset schema via implicit adding
        on a sample, that change is reflected in the dataset.
        """
        dataset_name = self.test_sample_set_field.__name__
        dataset = fo.Dataset(dataset_name)
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


class ScopedObjectsSynchronizationTest(unittest.TestCase):
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
            self.assertIn(dataset_name, fo.list_dataset_names())
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
            sample_fields = dataset._meta.sample_fields
            sample_field_names = [sf.name for sf in sample_fields]
            self.assertNotIn(field_name, sample_field_names)

        delete_field()
        check_delete_field()

        # Test Delete Dataset

        # @todo(Tyler) test delete dataset

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
            self.assertEqual(sample.dataset_name, dataset.name)

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
                self.assertEqual(sample.dataset_name, dataset.name)

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
                    self.assertEqual(sample.dataset_name, dataset.name)

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
            sample = fo.Sample(filepath="path/to/file.jpg")
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


class MultiProcessSynchronizationTest(unittest.TestCase):
    """What happens when multiple processes (users) are modifying the same
    dataset?
    """


class DatasetTest(unittest.TestCase):
    @drop_datasets
    def test_list_dataset_names(self):
        self.assertIsInstance(fo.list_dataset_names(), list)

    @drop_datasets
    def test_delete_dataset(self):
        IGNORED_DATASET_NAMES = fo.list_dataset_names()

        def list_dataset_names():
            return [
                name
                for name in fo.list_dataset_names()
                if name not in IGNORED_DATASET_NAMES
            ]

        dataset_names = ["test_%d" % i for i in range(10)]

        datasets = {name: fo.Dataset(name) for name in dataset_names}
        self.assertListEqual(list_dataset_names(), dataset_names)

        name = dataset_names.pop(0)
        datasets[name].delete()
        self.assertListEqual(list_dataset_names(), dataset_names)
        with self.assertRaises(fod.DoesNotExistError):
            len(datasets[name])

        name = dataset_names.pop(0)
        fo.delete_dataset(name)
        self.assertListEqual(list_dataset_names(), dataset_names)
        with self.assertRaises(fod.DoesNotExistError):
            len(datasets[name])

        new_dataset = fo.Dataset(name)
        self.assertEqual(len(new_dataset), 0)

    @drop_datasets
    def test_backing_doc_class(self):
        dataset_name = self.test_backing_doc_class.__name__
        dataset = fo.Dataset(dataset_name)
        self.assertTrue(
            issubclass(dataset._sample_doc_cls, foo.ODMDatasetSample)
        )

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


class SampleTest(unittest.TestCase):
    @drop_datasets
    def test_backing_doc_type(self):
        sample = fo.Sample(filepath="path/to/file.jpg")
        self.assertIsInstance(sample._doc, foo.ODMNoDatasetSample)

    @drop_datasets
    def test_get_field(self):
        filepath = "path/to/file.jpg"

        sample = fo.Sample(filepath=filepath)

        # get valid
        self.assertEqual(sample.get_field("filepath"), filepath)
        self.assertEqual(sample["filepath"], filepath)
        self.assertEqual(sample.filepath, filepath)

        # get missing
        with self.assertRaises(AttributeError):
            sample.get_field("missing_field")
        with self.assertRaises(KeyError):
            sample["missing_field"]
        with self.assertRaises(AttributeError):
            sample.missing_field

    @drop_datasets
    def test_set_field(self):
        sample = fo.Sample(filepath="path/to/file.jpg")

        value = 51

        # set_field create=False
        with self.assertRaises(ValueError):
            sample.set_field("field1", value, create=False)
        with self.assertRaises(AttributeError):
            sample.get_field("field1")
        with self.assertRaises(KeyError):
            sample["field1"]
        with self.assertRaises(AttributeError):
            sample.field1

        # set_field create=True
        sample.set_field("field2", value, create=True)
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


class SampleInDatasetTest(unittest.TestCase):
    @drop_datasets
    def test_dataset_clear(self):
        dataset_name = self.test_dataset_clear.__name__
        dataset = fo.Dataset(dataset_name)

        # add some samples
        num_samples = 10
        samples = [
            fo.Sample(filepath="path/to/file_%d.jpg" % i)
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
            fo.Sample(filepath="path/to/file_%d.jpg" % i)
            for i in range(num_samples)
        ]
        dataset.add_samples(samples)
        self.assertEqual(len(dataset), num_samples)

    @drop_datasets
    def test_dataset_delete_samples(self):
        dataset_name = self.test_dataset_delete_samples.__name__
        dataset = fo.Dataset(dataset_name)

        # add some samples
        num_samples = 10
        samples = [
            fo.Sample(filepath="path/to/file_%d.jpg" % i)
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
        dataset_name = self.test_getitem.__name__
        dataset = fo.Dataset(dataset_name)

        # add some samples
        samples = [
            fo.Sample(filepath="path/to/file_%d.jpg" % i) for i in range(10)
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
        dataset_name = self.test_autopopulated_fields.__name__
        dataset = fo.Dataset(dataset_name)
        sample = fo.Sample(filepath="path/to/file.jpg")

        self.assertIsNone(sample.id)
        self.assertIsNone(sample.ingest_time)
        self.assertFalse(sample.in_dataset)
        self.assertIsNone(sample.dataset_name)

        dataset.add_sample(sample)

        self.assertIsNotNone(sample.id)
        self.assertIsInstance(sample.id, str)
        self.assertIsInstance(sample.ingest_time, datetime.datetime)
        self.assertTrue(sample.in_dataset)
        self.assertEqual(sample.dataset_name, dataset_name)

    @drop_datasets
    def test_new_fields(self):
        dataset_name = self.test_new_fields.__name__
        dataset = fo.Dataset(dataset_name)
        sample = fo.Sample(filepath="path/to/file.jpg")

        field_name = "field1"
        value = 51

        sample[field_name] = value

        with self.assertRaises(FieldDoesNotExist):
            dataset.add_sample(sample, expand_schema=False)

        dataset.add_sample(sample)
        fields = dataset.get_field_schema()
        self.assertIsInstance(fields[field_name], fo.IntField)
        self.assertEqual(sample[field_name], value)
        self.assertEqual(dataset[sample.id][field_name], value)

    @drop_datasets
    def test_new_fields_multi(self):
        dataset_name = self.test_new_fields_multi.__name__
        dataset = fo.Dataset(dataset_name)
        sample = fo.Sample(filepath="path/to/file.jpg")

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
    def test_add_from_another_dataset(self):
        dataset_name = self.test_add_from_another_dataset.__name__ + "_%d"
        dataset1 = fo.Dataset(dataset_name % 1)
        dataset2 = fo.Dataset(dataset_name % 2)

        sample = fo.Sample(filepath="test.png")

        sample_id = dataset1.add_sample(sample)
        self.assertIs(dataset1[sample_id], sample)
        self.assertEqual(sample.dataset_name, dataset1.name)

        sample_id = dataset2.add_sample(sample)
        sample2 = dataset2[sample_id]
        self.assertIs(dataset1[sample.id], sample)
        self.assertIsNot(dataset2[sample_id], sample)
        self.assertEqual(sample2.dataset_name, dataset2.name)

    @drop_datasets
    def test_copy_sample(self):
        dataset_name = self.test_copy_sample.__name__
        dataset = fo.Dataset(dataset_name)

        sample = fo.Sample(filepath="test.png")

        sample_copy = sample.copy()
        self.assertIsNot(sample_copy, sample)
        self.assertIsNone(sample_copy.id)
        self.assertIsNone(sample_copy.dataset_name)

        dataset.add_sample(sample)

        sample_copy = sample.copy()
        self.assertIsNot(sample_copy, sample)
        self.assertIsNone(sample_copy.id)
        self.assertIsNone(sample_copy.dataset_name)


class LabelsTest(unittest.TestCase):
    @drop_datasets
    def test_create(self):
        labels = fo.Classification(label="cow", confidence=0.98)
        self.assertIsInstance(labels, fo.Classification)

        with self.assertRaises(FieldDoesNotExist):
            fo.Classification(made_up_field=100)

        with self.assertRaises(ValidationError):
            fo.Classification(label=100)


class CRUDTest(unittest.TestCase):
    """Create, Read, Update, Delete (CRUD)"""

    @drop_datasets
    def test_create_sample(self):
        dataset_name = self.test_create_sample.__name__
        dataset = fo.Dataset(dataset_name)
        filepath = "path/to/file.txt"
        sample = fo.Sample(filepath=filepath, tags=["tag1", "tag2"])
        self.assertEqual(len(dataset), 0)

        dataset.add_sample(sample)
        self.assertEqual(len(dataset), 1)

        # add duplicate filepath
        with self.assertRaises(NotUniqueError):
            dataset.add_sample(fo.Sample(filepath=filepath))
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

        # @todo(Tyler)
        # print("Removing tag 'tag1'")
        # sample.remove_tag("tag1")
        # print("Num samples: %d" % len(dataset))
        # for sample in dataset.iter_samples():
        #     print(sample)
        # print()
        #
        #
        # print("Adding new tag: 'tag2'")
        # sample.add_tag("tag2")
        # print("Num samples: %d" % len(dataset))
        # for sample in dataset.iter_samples():
        #     print(sample)
        # print()
        #
        # print("Deleting sample")
        # del dataset[sample.id]
        # print("Num samples: %d" % len(dataset))
        # for sample in dataset.iter_samples():
        #     print(sample)
        # print()


class ViewTest(unittest.TestCase):
    @drop_datasets
    def test_view(self):
        dataset_name = self.test_view.__name__
        dataset = fo.Dataset(dataset_name)
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
        self.assertIsInstance(view.first(), fo.Sample)

        # tags
        for sample in view.match({"tags": "train"}):
            self.assertIn("train", sample.tags)
        for sample in view.match({"tags": "test"}):
            self.assertIn("test", sample.tags)

        # labels
        for sample in view.match({"labels.label": "label1"}):
            self.assertEqual(sample.labels.label, "label1")


class FieldTest(unittest.TestCase):
    @drop_datasets
    def test_field_AddDelete_in_dataset(self):
        dataset_name = self.test_field_AddDelete_in_dataset.__name__
        dataset = fo.Dataset(dataset_name)
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
    def test_field_GetSetClear_no_dataset(self):
        # @todo(Tyler) IMPLEMENT THIS
        sample = fo.Sample("1.jpg")

        # set field (default duplicate)

        # add field (new)

        # add field (duplicate)

        # delete field

        # add deleted field

    @drop_datasets
    def test_field_GetSetClear_in_dataset(self):
        dataset_name = self.test_field_GetSetClear_in_dataset.__name__
        dataset = fo.Dataset(dataset_name)
        dataset.add_sample(fo.Sample("1.jpg"))
        dataset.add_sample(fo.Sample("2.jpg"))

        # @todo(Tyler)
        # add field (default duplicate)

        # add field (new)

        # add field (duplicate)

        # delete field

        # add deleted field

    @drop_datasets
    def test_vector_array_fields(self):
        dataset1 = fo.Dataset("test_one")
        dataset2 = fo.Dataset("test_two")

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
