"""
FiftyOne utilities unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import time
import unittest
from unittest.mock import MagicMock, patch

import numpy as np

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.utils as fou
from fiftyone.migrations.runner import MigrationRunner

from decorators import drop_datasets


class BatcherTests(unittest.TestCase):
    def test_get_default_batcher(self):
        iterable = list(range(100))

        target_latency = 0.25
        with patch.object(fo.config, "default_batcher", "latency"):
            with patch.object(
                fo.config,
                "batcher_target_latency",
                target_latency,
            ):
                batcher = fou.get_default_batcher(iterable)
                self.assertTrue(isinstance(batcher, fou.DynamicBatcher))
                self.assertEqual(batcher.target_measurement, target_latency)

        static_batch_size = 1000
        with patch.object(fo.config, "default_batcher", "static"):
            with patch.object(
                fo.config,
                "batcher_static_size",
                static_batch_size,
            ):
                batcher = fou.get_default_batcher(iterable)
                self.assertTrue(isinstance(batcher, fou.StaticBatcher))
                self.assertEqual(batcher.batch_size, static_batch_size)

        target_size = 2**16
        with patch.object(fo.config, "default_batcher", "size"):
            with patch.object(
                fo.config,
                "batcher_target_size_bytes",
                target_size,
            ):
                batcher = fou.get_default_batcher(iterable)
                self.assertTrue(
                    isinstance(batcher, fou.BSONSizeDynamicBatcher)
                )
                self.assertEqual(batcher.target_measurement, target_size)

        with patch.object(fo.config, "default_batcher", "invalid"):
            self.assertRaises(ValueError, fou.get_default_batcher, iterable)

    def test_static_batcher(self):
        iterable = list(range(105))
        batcher = fou.StaticBatcher(iterable, batch_size=10, progress=False)
        with batcher:
            batches = [batch for batch in batcher]
            expected = [list(range(i, i + 10)) for i in range(0, 95, 10)] + [
                iterable[100:]
            ]
            self.assertListEqual(batches, expected)

    def test_static_batcher_covered(self):
        iterable = list(range(105))
        batcher = fou.StaticBatcher(iterable, batch_size=200, progress=False)
        with batcher:
            batches = [batch for batch in batcher]
            self.assertListEqual(batches, [iterable])


class CoreUtilsTests(unittest.TestCase):
    def test_validate_hex_color(self):
        # Valid colors
        fou.validate_hex_color("#FF6D04")
        fou.validate_hex_color("#ff6d04")
        fou.validate_hex_color("#000")
        fou.validate_hex_color("#eee")

        # Invalid colors
        with self.assertRaises(ValueError):
            fou.validate_hex_color("aaaaaa")

        with self.assertRaises(ValueError):
            fou.validate_hex_color("#bcedfg")

        with self.assertRaises(ValueError):
            fou.validate_hex_color("#ggg")

        with self.assertRaises(ValueError):
            fou.validate_hex_color("#FFFF")

    def test_validate_color(self):
        # valid
        fou.validate_color("#ff6d04")
        fou.validate_color("#000")
        fou.validate_color("red")
        fou.validate_color("lightpink")

        # invalid
        with self.assertRaises(ValueError):
            fou.validate_color("#bcedfg")

        with self.assertRaises(ValueError):
            fou.validate_color("#ggg")

        with self.assertRaises(ValueError):
            fou.validate_color("yellowred")

    def test_to_slug(self):
        self.assertEqual(fou.to_slug("coco_2017"), "coco-2017")
        self.assertEqual(fou.to_slug("c+o+c+o 2-0-1-7"), "c-o-c-o-2-0-1-7")
        self.assertEqual(fou.to_slug("cat.DOG"), "cat-dog")
        self.assertEqual(fou.to_slug("---z----"), "z")
        self.assertEqual(
            fou.to_slug("Brian's #$&@ [awesome?] dataset!"),
            "brians-awesome-dataset",
        )
        self.assertEqual(
            fou.to_slug("     sPaM     aNd  EgGs    "),
            "spam-and-eggs",
        )

        with self.assertRaises(ValueError):
            fou.to_slug("------")  # too short

        with self.assertRaises(ValueError):
            fou.to_slug("a" * 101)  # too long


class LabelsTests(unittest.TestCase):
    @drop_datasets
    def test_create(self):
        labels = fo.Classification(label="cow", confidence=0.98)
        self.assertIsInstance(labels, fo.Classification)

        with self.assertRaises(Exception):
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


class MediaTypeTests(unittest.TestCase):
    @drop_datasets
    def setUp(self):
        self.img_sample = fo.Sample(filepath="image.png")
        self.img_dataset = fo.Dataset()
        self.img_dataset.add_sample(self.img_sample)

        self.vid_sample = fo.Sample(filepath="video.mp4")
        self.vid_dataset = fo.Dataset()
        self.vid_dataset.add_sample(self.vid_sample)

    def test_img_types(self):
        self.assertEqual(self.img_sample.media_type, fom.IMAGE)
        self.assertEqual(self.img_dataset.media_type, fom.IMAGE)

    def test_vid_types(self):
        self.assertEqual(self.vid_sample.media_type, fom.VIDEO)
        self.assertEqual(self.vid_dataset.media_type, fom.VIDEO)

    def test_img_change_attempts(self):
        with self.assertRaises(fom.MediaTypeError):
            self.img_sample.filepath = "video.mp4"

    def test_vid_change_attempts(self):
        with self.assertRaises(fom.MediaTypeError):
            self.vid_sample.filepath = "image.png"


class MigrationTests(unittest.TestCase):
    def test_runner(self):
        def revs(versions):
            return [(v, v + ".py") for v in versions]

        runner = MigrationRunner(
            "0.0.1",
            "0.3",
            _revisions=revs(["0.1", "0.2", "0.3"]),
        )
        self.assertEqual(runner.revisions, ["0.1", "0.2", "0.3"])

        runner = MigrationRunner(
            "0.1",
            "0.3",
            _revisions=revs(["0.1", "0.2", "0.3"]),
        )
        self.assertEqual(runner.revisions, ["0.2", "0.3"])

        runner = MigrationRunner(
            "0.3",
            "0.1",
            _revisions=revs(["0.1", "0.2", "0.3"]),
        )
        self.assertEqual(runner.revisions, ["0.3", "0.2"])

        runner = MigrationRunner(
            "0.3",
            "0.0.1",
            _revisions=revs(["0.1", "0.2", "0.3"]),
        )
        self.assertEqual(runner.revisions, ["0.3", "0.2", "0.1"])

    def test_future(self):
        pkg_ver = foc.VERSION
        future_ver = str(int(pkg_ver[0]) + 1) + pkg_ver[1:]

        # Uprading to a future version is not allowed

        with self.assertRaises(EnvironmentError):
            MigrationRunner(pkg_ver, future_ver)

        with self.assertRaises(EnvironmentError):
            MigrationRunner("0.1", future_ver)

        # Downgrading from a future version is not allowed

        with self.assertRaises(EnvironmentError):
            MigrationRunner(future_ver, pkg_ver)

        with self.assertRaises(EnvironmentError):
            MigrationRunner(future_ver, "0.1")


class ConfigTests(unittest.TestCase):
    def test_multiple_config_cleanup(self):
        db = foo.get_db_conn()
        orig_config = foo.get_db_config()

        # Add some duplicate documents
        d = dict(orig_config.to_dict())
        for _ in range(2):
            d.pop("_id", None)
            db.config.insert_one(d)

        # Ensure that duplicate documents are automatically cleaned up
        config = foo.get_db_config()

        self.assertEqual(len(list(db.config.aggregate([]))), 1)
        self.assertEqual(config.id, orig_config.id)


from bson import ObjectId
from fiftyone.core.odm.utils import load_dataset


class TestLoadDataset(unittest.TestCase):
    @patch("fiftyone.core.odm.get_db_conn")
    @patch("fiftyone.core.dataset.Dataset")
    def test_load_dataset_by_id(self, mock_dataset, mock_get_db_conn):
        # Setup
        identifier = ObjectId()
        mock_db = MagicMock()
        mock_get_db_conn.return_value = mock_db
        mock_db.datasets.find_one.return_value = {
            "_id": ObjectId(identifier),
            "name": "test_dataset",
        }

        # Test
        result = load_dataset(id=identifier)

        # Assertions
        mock_get_db_conn.assert_called_once()
        mock_db.datasets.find_one.assert_called_once_with(
            {"_id": ObjectId(identifier)}, {"name": True}
        )

        self.assertEqual(result, mock_dataset.return_value)

    @patch("fiftyone.core.odm.get_db_conn")
    @patch("fiftyone.core.dataset.Dataset")
    def test_load_dataset_by_alt_id(self, mock_dataset, mock_get_db_conn):
        # Setup
        identifier = "alt_id"
        mock_db = MagicMock()
        mock_get_db_conn.return_value = mock_db
        mock_db.datasets.find_one.return_value = {
            "_id": "identifier",
            "name": "dataset_name",
        }

        # Test
        result = load_dataset(id=identifier)

        # Assertions
        mock_get_db_conn.assert_called_once()
        mock_db.datasets.find_one.assert_called_once_with(
            {"_id": identifier}, {"name": True}
        )
        self.assertEqual(result, mock_dataset.return_value)

    @patch("fiftyone.core.dataset.Dataset")
    def test_load_dataset_by_name(self, mock_dataset):
        # Setup
        identifier = "test_dataset"
        mock_dataset.return_value = {"_id": ObjectId(), "name": identifier}

        # Test
        result = load_dataset(name=identifier)

        # Assertions
        self.assertEqual(result, mock_dataset.return_value)

    @patch("fiftyone.core.odm.get_db_conn")
    def test_load_dataset_nonexistent(self, mock_get_db_conn):
        # Setup
        identifier = ObjectId()
        mock_db = MagicMock()
        mock_db.datasets.find_one.return_value = None
        mock_get_db_conn.return_value = mock_db

        # Call the function and expect a ValueError
        with self.assertRaises(ValueError) as context:
            load_dataset(id=identifier)

        # Assertions
        mock_get_db_conn.assert_called_once()
        mock_db.datasets.find_one.assert_called_once_with(
            {"_id": identifier}, {"name": True}
        )


class ProgressBarTests(unittest.TestCase):
    def _test_correct_value(self, progress, global_progress, quiet, expected):
        fo.config.show_progress_bars = global_progress
        with fou.ProgressBar([], progress=progress, quiet=quiet) as pb:
            assert pb._progress == expected

    def test_progress_None_uses_global(self):
        self._test_correct_value(
            progress=None, global_progress=True, quiet=None, expected=True
        )
        self._test_correct_value(
            progress=None, global_progress=False, quiet=None, expected=False
        )

    def test_progress_overwrites_global(self):
        self._test_correct_value(
            progress=True, global_progress=True, quiet=None, expected=True
        )
        self._test_correct_value(
            progress=True, global_progress=False, quiet=None, expected=True
        )
        self._test_correct_value(
            progress=False, global_progress=True, quiet=None, expected=False
        )
        self._test_correct_value(
            progress=False, global_progress=False, quiet=None, expected=False
        )

    def test_quiet_overwrites_all(self):
        # Careful, we expect here to have progress the opposite value of quiet
        self._test_correct_value(
            progress=True, global_progress=True, quiet=True, expected=False
        )
        self._test_correct_value(
            progress=False, global_progress=False, quiet=False, expected=True
        )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
