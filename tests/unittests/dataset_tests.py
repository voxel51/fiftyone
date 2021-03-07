"""
FiftyOne dataset-related unit tests.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import gc
import unittest
import os

import eta.core.utils as etau

import fiftyone as fo
from fiftyone import ViewField as F
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
        with self.assertRaises(ValueError):
            len(datasets[name])

        name = dataset_names.pop(0)
        fo.delete_dataset(name)
        self.assertListEqual(list_datasets(), dataset_names)
        with self.assertRaises(ValueError):
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
    def test_merge_samples1(self):
        # Windows compatibility
        def expand_path(path):
            return os.path.abspath(os.path.expanduser(path))

        dataset1 = fo.Dataset()
        dataset2 = fo.Dataset()

        common_filepath = expand_path("/path/to/image.png")
        filepath1 = expand_path("/path/to/image1.png")
        filepath2 = expand_path("/path/to/image2.png")

        common1 = fo.Sample(filepath=common_filepath, field=1)
        common2 = fo.Sample(filepath=common_filepath, field=2)

        dataset1.add_sample(fo.Sample(filepath=filepath1, field=1))
        dataset1.add_sample(common1)

        dataset2.add_sample(fo.Sample(filepath=filepath2, field=2))
        dataset2.add_sample(common2)

        # Standard merge

        dataset12 = dataset1.clone()
        dataset12.merge_samples(dataset2)
        self.assertEqual(len(dataset12), 3)
        common12_view = dataset12.match(F("filepath") == common_filepath)
        self.assertEqual(len(common12_view), 1)

        common12 = common12_view.first()
        self.assertEqual(common12.field, common2.field)

        # Merge a view with excluded fields

        dataset21 = dataset1.clone()
        dataset21.merge_samples(dataset2.exclude_fields("field"))
        self.assertEqual(len(dataset21), 3)

        common21_view = dataset21.match(F("filepath") == common_filepath)
        self.assertEqual(len(common21_view), 1)

        common21 = common21_view.first()
        self.assertEqual(common21.field, common1.field)

        # Merge with custom key

        dataset22 = dataset1.clone()
        key_fcn = lambda sample: os.path.basename(sample.filepath)
        dataset22.merge_samples(dataset2, key_fcn=key_fcn)

        self.assertEqual(len(dataset22), 3)

        common22_view = dataset22.match(F("filepath") == common_filepath)
        self.assertEqual(len(common22_view), 1)

        common22 = common22_view.first()
        self.assertEqual(common22.field, common2.field)

    @drop_datasets
    def test_merge_samples2(self):
        dataset1 = fo.Dataset()
        dataset2 = fo.Dataset()

        sample11 = fo.Sample(filepath="image1.jpg", field=1)
        sample12 = fo.Sample(
            filepath="image2.jpg", field=1, gt=fo.Classification(label="cat"),
        )

        sample21 = fo.Sample(filepath="image1.jpg", field=2, new_field=3)
        sample22 = fo.Sample(
            filepath="image2.jpg",
            gt=fo.Classification(label="dog"),
            new_gt=fo.Classification(label="dog"),
        )

        dataset1.add_samples([sample11, sample12])
        dataset2.add_samples([sample21, sample22])

        sample1 = dataset2.first()
        sample1.gt = None
        sample1.save()

        sample2 = dataset2.last()
        sample2.field = None
        sample2.save()

        dataset1.merge_samples(dataset2.select_fields("field"))

        self.assertEqual(sample11.field, 2)
        self.assertEqual(sample12.field, 1)
        self.assertIsNone(sample11.gt)
        self.assertIsNotNone(sample12.gt)
        with self.assertRaises(AttributeError):
            sample11.new_field

        with self.assertRaises(AttributeError):
            sample12.new_gt

        dataset1.merge_samples(dataset2)

        self.assertEqual(sample11.field, 2)
        self.assertEqual(sample11.new_field, 3)
        self.assertEqual(sample12.field, 1)
        self.assertIsNone(sample12.new_field)
        self.assertIsNone(sample11.gt)
        self.assertIsNone(sample11.new_gt)
        self.assertIsNotNone(sample12.gt)
        self.assertIsNotNone(sample12.new_gt)

    @drop_datasets
    def test_rename_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="/path/to/image.jpg", field=1)
        dataset.add_sample(sample)

        dataset.rename_sample_field("field", "new_field")
        self.assertFalse("field" in dataset.get_field_schema())
        self.assertTrue("new_field" in dataset.get_field_schema())
        self.assertEqual(sample["new_field"], 1)
        with self.assertRaises(KeyError):
            sample["field"]

    @drop_datasets
    @unittest.skip("TODO: Fix workflow errors. Must be run manually")
    def test_rename_embedded_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(
            filepath="image.jpg",
            predictions=fo.Classification(label="friend", field=1),
        )
        dataset.add_sample(sample)

        dataset.rename_sample_field(
            "predictions.field", "predictions.new_field"
        )
        self.assertIsNotNone(sample.predictions.new_field)

        dataset.clear_sample_field("predictions.field")
        self.assertIsNone(sample.predictions.field)

        dataset.delete_sample_field("predictions.field")
        self.assertIsNotNone(sample.predictions.new_field)
        with self.assertRaises(AttributeError):
            sample.predictions.field

        dataset.rename_sample_field(
            "predictions.new_field", "predictions.field"
        )
        self.assertIsNotNone(sample.predictions.field)
        with self.assertRaises(AttributeError):
            sample.predictions.new_field

    @drop_datasets
    @unittest.skip("TODO: Fix workflow errors. Must be run manually")
    def test_clone_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(
            filepath="image.jpg", predictions=fo.Classification(label="friend")
        )
        dataset.add_sample(sample)

        dataset.clone_sample_field("predictions", "predictions_copy")
        schema = dataset.get_field_schema()
        self.assertIn("predictions", schema)
        self.assertIn("predictions_copy", schema)
        self.assertIsNotNone(sample.predictions)
        self.assertIsNotNone(sample.predictions_copy)

        dataset.clear_sample_field("predictions")
        schema = dataset.get_field_schema()
        self.assertIn("predictions", schema)
        self.assertIsNone(sample.predictions)
        self.assertIsNotNone(sample.predictions_copy)

        dataset.delete_sample_field("predictions")
        self.assertIsNotNone(sample.predictions_copy)
        with self.assertRaises(AttributeError):
            sample.predictions

        dataset.rename_sample_field("predictions_copy", "predictions")
        self.assertIsNotNone(sample.predictions)
        with self.assertRaises(AttributeError):
            sample.predictions_copy

    @drop_datasets
    @unittest.skip("TODO: Fix workflow errors. Must be run manually")
    def test_clone_embedded_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(
            filepath="image.jpg",
            predictions=fo.Classification(label="friend", field=1),
        )
        dataset.add_sample(sample)

        dataset.clone_sample_field(
            "predictions.field", "predictions.new_field"
        )
        self.assertIsNotNone(sample.predictions.new_field)

        dataset.clear_sample_field("predictions.field")
        self.assertIsNone(sample.predictions.field)

        dataset.delete_sample_field("predictions.field")
        self.assertIsNotNone(sample.predictions.new_field)
        with self.assertRaises(AttributeError):
            sample.predictions.field

        dataset.rename_sample_field(
            "predictions.new_field", "predictions.field"
        )
        self.assertIsNotNone(sample.predictions.field)
        with self.assertRaises(AttributeError):
            sample.predictions.new_field

    @drop_datasets
    def test_classes(self):
        dataset = fo.Dataset()

        default_classes = ["cat", "dog"]

        dataset.default_classes = default_classes
        self.assertListEqual(dataset.default_classes, default_classes)

        with self.assertRaises(Exception):
            dataset.default_classes.append(1)
            dataset.save()  # error

        dataset.default_classes.pop()
        dataset.save()  # success

        classes = {"ground_truth": ["cat", "dog"]}

        dataset.classes = classes
        self.assertDictEqual(dataset.classes, classes)

        with self.assertRaises(Exception):
            dataset.classes["other"] = {"hi": "there"}
            dataset.save()  # error

        dataset.classes.pop("other")

        with self.assertRaises(Exception):
            dataset.classes["ground_truth"].append(1)
            dataset.save()  # error

        dataset.classes["ground_truth"].pop()

        dataset.save()  # success

    @drop_datasets
    def test_mask_targets(self):
        dataset = fo.Dataset()

        default_mask_targets = {1: "cat", 2: "dog"}

        dataset.default_mask_targets = default_mask_targets
        self.assertDictEqual(
            dataset.default_mask_targets, default_mask_targets
        )

        with self.assertRaises(Exception):
            dataset.default_mask_targets["hi"] = "there"
            dataset.save()  # error

        dataset.default_mask_targets.pop("hi")
        dataset.save()  # success

        mask_targets = {"ground_truth": {1: "cat", 2: "dog"}}

        dataset.mask_targets = mask_targets
        self.assertDictEqual(dataset.mask_targets, mask_targets)

        with self.assertRaises(Exception):
            dataset.mask_targets["hi"] = "there"
            dataset.save()  # error

        dataset.mask_targets.pop("hi")

        with self.assertRaises(Exception):
            dataset.mask_targets[1] = {1: "cat", 2: "dog"}
            dataset.save()  # error

        dataset.mask_targets.pop(1)

        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.mask_targets["ground_truth"]["hi"] = "there"
            dataset.save()  # error

        dataset.mask_targets["ground_truth"].pop("hi")
        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.mask_targets["predictions"] = {1: {"too": "many"}}
            dataset.save()  # error

        dataset.mask_targets.pop("predictions")
        dataset.save()  # success

    @drop_datasets
    def test_dataset_info_import_export(self):
        dataset = fo.Dataset()

        dataset.info = {"hi": "there"}

        dataset.classes = {"ground_truth": ["cat", "dog"]}
        dataset.default_classes = ["cat", "dog"]

        dataset.mask_targets = {"ground_truth": {1: "cat", 2: "dog"}}
        dataset.default_mask_targets = {1: "cat", 2: "dog"}

        with etau.TempDir() as tmp_dir:
            json_path = os.path.join(tmp_dir, "dataset.json")

            dataset.write_json(json_path)
            dataset2 = fo.Dataset.from_json(json_path)

            self.assertDictEqual(dataset2.info, dataset.info)

            self.assertDictEqual(dataset2.classes, dataset.classes)
            self.assertListEqual(
                dataset2.default_classes, dataset.default_classes
            )

            self.assertDictEqual(dataset2.mask_targets, dataset.mask_targets)
            self.assertDictEqual(
                dataset2.default_mask_targets, dataset.default_mask_targets
            )

        with etau.TempDir() as tmp_dir:
            dataset_dir = os.path.join(tmp_dir, "dataset")

            dataset.export(dataset_dir, fo.types.FiftyOneDataset)
            dataset3 = fo.Dataset.from_dir(
                dataset_dir, fo.types.FiftyOneDataset
            )

            self.assertDictEqual(dataset3.info, dataset.info)

            self.assertDictEqual(dataset3.classes, dataset.classes)
            self.assertListEqual(
                dataset3.default_classes, dataset.default_classes
            )

            self.assertDictEqual(dataset3.mask_targets, dataset.mask_targets)
            self.assertDictEqual(
                dataset3.default_mask_targets, dataset.default_mask_targets
            )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
