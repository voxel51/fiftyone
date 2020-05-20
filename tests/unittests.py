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
import unittest

from mongoengine import IntField, StringField, EmbeddedDocumentField
from mongoengine.errors import (
    FieldDoesNotExist,
    NotUniqueError,
    ValidationError,
)

import fiftyone as fo
import fiftyone.core.odm as foo


class DatasetTest(unittest.TestCase):
    def test_list_dataset_names(self):
        self.assertIsInstance(fo.list_dataset_names(), list)

    def test_pername_singleton(self):
        dataset1 = fo.Dataset("test_dataset")
        dataset2 = fo.Dataset("test_dataset")
        dataset3 = fo.Dataset("another_dataset")
        self.assertIs(dataset1, dataset2)
        self.assertIsNot(dataset1, dataset3)

    def test_backing_doc_class(self):
        dataset_name = self.test_backing_doc_class.__name__
        dataset = fo.Dataset(dataset_name)
        self.assertTrue(issubclass(dataset._sample_doc, foo.ODMDatasetSample))

    def test_meta_dataset(self):
        dataset_name = self.test_meta_dataset.__name__
        dataset1 = fo.Dataset(name=dataset_name)

        field_name = "field1"
        ftype = IntField

        dataset1.add_sample_field(field_name, ftype)
        fields = dataset1.get_sample_fields()
        self.assertIsInstance(fields[field_name], ftype)
        dataset_copy = fo.load_dataset(name=dataset_name)
        fields = dataset_copy.get_sample_fields()
        self.assertIsInstance(fields[field_name], ftype)

        dataset1.delete_sample_field("field1")
        with self.assertRaises(KeyError):
            fields = dataset1.get_sample_fields()
            fields[field_name]
        with self.assertRaises(KeyError):
            dataset_copy = fo.load_dataset(name=dataset_name)
            fields = dataset_copy.get_sample_fields()
            fields[field_name]

        dataset2 = fo.Dataset(name=dataset_name)
        self.assertIs(dataset2, dataset1)
        dataset2 = fo.load_dataset(name=dataset_name)
        self.assertIs(dataset2, dataset1)


class SampleTest(unittest.TestCase):
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
        with self.assertRaises(AttributeError):
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
        with self.assertRaises(AttributeError):
            sample.get_field("field1")
        with self.assertRaises(KeyError):
            sample["field1"]
        with self.assertRaises(AttributeError):
            sample.field1

        # set_field create=True
        sample.set_field("field2", value, create=True)
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
        with self.assertRaises(ValueError):
            sample.field4 = value
        with self.assertRaises(AttributeError):
            sample.get_field("field4")
        with self.assertRaises(KeyError):
            sample["field4"]

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
    def test_dataset_clear(self):
        dataset_name = self.test_dataset_clear.__name__
        dataset = fo.Dataset(name=dataset_name)

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

    def test_dataset_delete_samples(self):
        dataset_name = self.test_dataset_delete_samples.__name__
        dataset = fo.Dataset(name=dataset_name)

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
        dataset.delete_samples(ids[:num_delete])
        self.assertEqual(len(dataset), num_samples - num_delete)

    def test_getitem(self):
        dataset_name = self.test_getitem.__name__
        dataset = fo.Dataset(name=dataset_name)

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

    def test_autopopulated_fields(self):
        dataset_name = self.test_autopopulated_fields.__name__
        dataset = fo.Dataset(name=dataset_name)
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

    def test_new_fields(self):
        dataset_name = self.test_new_fields.__name__
        dataset = fo.Dataset(name=dataset_name)
        sample = fo.Sample(filepath="path/to/file.jpg")

        field_name = "field1"
        value = 51

        sample[field_name] = value

        with self.assertRaises(FieldDoesNotExist):
            dataset.add_sample(sample, expand_schema=False)

        dataset.add_sample(sample)
        fields = dataset.get_sample_fields()
        self.assertIsInstance(fields[field_name], IntField)
        self.assertEqual(sample[field_name], value)
        self.assertEqual(dataset[sample.id][field_name], value)

    def test_new_fields_multi(self):
        dataset_name = self.test_new_fields_multi.__name__
        dataset = fo.Dataset(name=dataset_name)
        sample = fo.Sample(filepath="path/to/file.jpg")

        field_name = "field1"
        value = 51

        sample[field_name] = value

        with self.assertRaises(FieldDoesNotExist):
            dataset.add_samples([sample], expand_schema=False)

        dataset.add_samples([sample])
        fields = dataset.get_sample_fields()
        self.assertIsInstance(fields[field_name], IntField)
        self.assertEqual(sample[field_name], value)
        self.assertEqual(dataset[sample.id][field_name], value)


class LabelsTest(unittest.TestCase):
    def test_create(self):
        labels = fo.Classification(label="cow", confidence=0.98)
        self.assertIsInstance(labels, fo.Classification)

        with self.assertRaises(FieldDoesNotExist):
            fo.Classification(made_up_field=100)

        with self.assertRaises(ValidationError):
            fo.Classification(label=100)


class CRUDTest(unittest.TestCase):
    """Create, Read, Update, Delete (CRUD)"""

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
        sample.save()
        self.assertEqual(len(sample.tags), 1)
        self.assertEqual(sample.tags[0], tag)
        sample2 = dataset[sample.id]
        self.assertEqual(len(sample2.tags), 1)
        self.assertEqual(sample2.tags[0], tag)

        # update append
        tag = "tag4"
        sample.tags.append(tag)
        sample.save()
        self.assertEqual(len(sample.tags), 2)
        self.assertEqual(sample.tags[-1], tag)
        sample2 = dataset[sample.id]
        self.assertEqual(len(sample2.tags), 2)
        self.assertEqual(sample2.tags[-1], tag)

        # update add new field
        dataset.add_sample_field(
            "test_label",
            EmbeddedDocumentField,
            embedded_doc_type=fo.Classification,
        )
        sample.test_label = fo.Classification(label="cow")
        self.assertEqual(sample.test_label.label, "cow")
        sample.save()
        self.assertEqual(sample.test_label.label, "cow")
        sample2 = dataset[sample.id]
        self.assertEqual(sample2.test_label.label, "cow")

        # update modify embedded document
        sample.test_label.label = "chicken"
        self.assertEqual(sample.test_label.label, "chicken")
        sample.save()
        self.assertEqual(sample.test_label.label, "chicken")
        sample2 = dataset[sample.id]
        self.assertEqual(sample2.test_label.label, "chicken")

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
    def test_view(self):
        dataset_name = self.test_view.__name__
        dataset = fo.Dataset(dataset_name)
        dataset.add_sample_field(
            "labels",
            EmbeddedDocumentField,
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
    def test_field_AddDelete_in_dataset(self):
        dataset_name = self.test_field_AddDelete_in_dataset.__name__
        dataset = fo.Dataset(name=dataset_name)
        id1 = dataset.add_sample(fo.Sample("1.jpg"))
        id2 = dataset.add_sample(fo.Sample("2.jpg"))
        sample1 = dataset[id1]
        sample2 = dataset[id2]

        # add field (default duplicate)
        with self.assertRaises(ValueError):
            dataset.add_sample_field("filepath", StringField)

        # delete default field
        # @todo(Tyler) should the user just be allowed to do this?

        field_name = "field1"
        ftype = StringField
        field_test_value = "test_field_value"

        # access non-existent field
        with self.assertRaises(KeyError):
            dataset.get_sample_fields()[field_name]
        for sample in [sample1, sample2, dataset[id1], dataset[id2]]:
            with self.assertRaises(KeyError):
                sample.get_field_schema()[field_name]
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
        sample1.save()

        # check field exists and is of correct type
        field = dataset.get_sample_fields()[field_name]
        self.assertIsInstance(field, ftype)
        for sample in [sample1, dataset[id1]]:
            # check field exists and is of correct type
            field = sample.get_field_schema()[field_name]
            self.assertIsInstance(field, ftype)
            # check field exists on sample and is set correctly
            self.assertEqual(sample.get_field(field_name), field_test_value)
            self.assertEqual(sample[field_name], field_test_value)
            self.assertEqual(getattr(sample, field_name), field_test_value)
            self.assertEqual(sample.to_dict()[field_name], field_test_value)
        for sample in [sample2, dataset[id2]]:
            # check field exists and is of correct type
            field = sample.get_field_schema()[field_name]
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
            dataset.get_sample_fields()[field_name]
        for sample in [sample1, sample2, dataset[id1], dataset[id2]]:
            with self.assertRaises(KeyError):
                sample.get_field_schema()[field_name]
            with self.assertRaises(AttributeError):
                sample.get_field(field_name)
            with self.assertRaises(KeyError):
                sample[field_name]
            with self.assertRaises(AttributeError):
                getattr(sample, field_name)
            with self.assertRaises(KeyError):
                sample.to_dict()[field_name]

        # add deleted field with new type
        ftype = IntField
        field_test_value = 51
        dataset.add_sample_field(field_name, ftype)
        setattr(sample1, field_name, field_test_value)
        sample1.save()

        # check field exists and is of correct type
        field = dataset.get_sample_fields()[field_name]
        self.assertIsInstance(field, ftype)
        for sample in [sample1, dataset[id1]]:
            # check field exists and is of correct type
            field = sample.get_field_schema()[field_name]
            self.assertIsInstance(field, ftype)
            # check field exists on sample and is set correctly
            self.assertEqual(sample.get_field(field_name), field_test_value)
            self.assertEqual(sample[field_name], field_test_value)
            self.assertEqual(getattr(sample, field_name), field_test_value)
            self.assertEqual(sample.to_dict()[field_name], field_test_value)
        for sample in [sample2, dataset[id2]]:
            # check field exists and is of correct type
            field = sample.get_field_schema()[field_name]
            self.assertIsInstance(field, ftype)
            # check field exists on sample and is None
            self.assertIsNone(sample.get_field(field_name))
            self.assertIsNone(sample[field_name])
            self.assertIsNone(getattr(sample, field_name))
            self.assertIsNone(sample.to_dict()[field_name])

    def test_field_GetSetClear_no_dataset(self):
        sample = fo.Sample("1.jpg")

        # set field (default duplicate)

        # add field (new)

        # add field (duplicate)

        # delete field

        # add deleted field

    def test_field_GetSetClear_in_dataset(self):
        dataset_name = self.test_field_GetSetClear_in_dataset.__name__
        dataset = fo.Dataset(name=dataset_name)
        dataset.add_sample(fo.Sample("1.jpg"))
        dataset.add_sample(fo.Sample("2.jpg"))

        # add field (default duplicate)

        # add field (new)

        # add field (duplicate)

        # delete field

        # add deleted field


if __name__ == "__main__":
    unittest.main()
