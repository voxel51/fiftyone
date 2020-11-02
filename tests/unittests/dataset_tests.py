"""
FiftyOne dataset related unit tests.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import gc
import unittest

import fiftyone as fo
from fiftyone import ViewField as F
import fiftyone.core.dataset as fod
import fiftyone.core.odm as foo

from decorators import drop_datasets


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

    @drop_datasets
    def test_merge_samples(self):
        dataset1 = fo.Dataset()
        dataset2 = fo.Dataset()

        common_filepath = "/path/to/image.png"
        filepath1 = "/path/to/image1.png"
        filepath2 = "/path/to/image2.png"

        common1 = fo.Sample(filepath=common_filepath, field=1)
        common2 = fo.Sample(filepath=common_filepath, field=2)

        dataset1.add_sample(fo.Sample(filepath=filepath1, field=1))
        dataset1.add_sample(common1)

        dataset2.add_sample(fo.Sample(filepath=filepath2, field=2))
        dataset2.add_sample(common2)

        #
        # Non-overwriting
        #

        dataset12 = dataset1.clone()
        dataset12.merge_samples(dataset2, overwrite=False)
        self.assertEqual(len(dataset12), 3)

        common12_view = dataset12.match(F("filepath") == common1.filepath)
        self.assertEqual(len(common12_view), 1)

        common12 = common12_view.first()
        self.assertEqual(common12.field, common1.field)

        #
        # Overwriting
        #

        dataset21 = dataset1.clone()
        dataset21.merge_samples(dataset2, overwrite=True)
        self.assertEqual(len(dataset21), 3)

        common21_view = dataset21.match(F("filepath") == common1.filepath)
        self.assertEqual(len(common21_view), 1)

        common21 = common21_view.first()
        self.assertEqual(common21.field, common2.field)

    @drop_datasets
    def test_rename_field(self):
        dataset = fo.Dataset()

        value = 1
        sample = fo.Sample(filepath="/path/to/image.jpg", field=value)

        dataset.add_sample(sample)

        dataset.rename_field("field", "new_field")

        self.assertFalse("field" in dataset.get_field_schema())
        self.assertTrue("new_field" in dataset.get_field_schema())

        with self.assertRaises(KeyError):
            sample["field"]

        self.assertEqual(sample["new_field"], value)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
