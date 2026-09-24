"""
FiftyOne visual similarity-related unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import numpy as np

import fiftyone as fo
import fiftyone.brain as fob  # pylint: disable=import-error,no-name-in-module
from fiftyone.core.brain import BrainMethod
from fiftyone.core.evaluation import EvaluationMethod

from decorators import drop_datasets


class SimilarityTests(unittest.TestCase):
    def _make_image_dataset(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image1.png"),
                fo.Sample(filepath="image2.png"),
                fo.Sample(filepath="image3.png"),
                fo.Sample(filepath="image4.png"),
                fo.Sample(filepath="image5.png"),
                fo.Sample(filepath="image6.png"),
                fo.Sample(filepath="image7.png"),
                fo.Sample(filepath="image8.png"),
                fo.Sample(filepath="image9.png"),
            ]
        )

        embeddings = np.random.randn(9, 4)

        fob.compute_similarity(
            dataset,
            embeddings=embeddings,
            brain_key="img_sim",
        )

        return dataset

    @drop_datasets
    def test_similarity_api(self):
        dataset = self._make_image_dataset()

        results = dataset.load_brain_results("img_sim")

        self.assertEqual(results.key, "img_sim")

        info = dataset.get_brain_info("img_sim")
        self.assertEqual(info.key, "img_sim")

        brain_keys = dataset.list_brain_runs()
        self.assertEqual(brain_keys, ["img_sim"])

        good_keys = dataset.list_brain_runs(type=BrainMethod)
        self.assertEqual(good_keys, ["img_sim"])

        bad_keys = dataset.list_brain_runs(type=EvaluationMethod)
        self.assertEqual(bad_keys, [])

        dataset.rename_brain_run("img_sim", "still_img_sim")

        also_results = dataset.load_brain_results("still_img_sim", cache=False)

        self.assertFalse(results is also_results)
        self.assertEqual(results.key, "still_img_sim")
        self.assertEqual(also_results.key, "still_img_sim")

        info = dataset.get_brain_info("still_img_sim")
        self.assertEqual(info.key, "still_img_sim")

        brain_keys = dataset.list_brain_runs()
        self.assertEqual(brain_keys, ["still_img_sim"])

        good_keys = dataset.list_brain_runs(type=BrainMethod)
        self.assertEqual(good_keys, ["still_img_sim"])

        bad_keys = dataset.list_brain_runs(type=EvaluationMethod)
        self.assertEqual(bad_keys, [])

        results.save()

        self.assertEqual(dataset.list_brain_runs(), ["still_img_sim"])

        dataset.delete_brain_runs()
        self.assertEqual(dataset.list_brain_runs(), [])
        self.assertIsNone(results.key)

    @drop_datasets
    def test_image_similarity(self):
        dataset = self._make_image_dataset()

        query_id = dataset.first().id

        view1 = dataset.sort_by_similarity(query_id)
        values1 = view1.values("id")

        view2 = dataset.sort_by_similarity(query_id, reverse=True)
        values2 = view2.values("id")

        self.assertListEqual(values2, values1[::-1])

        view3 = dataset.sort_by_similarity(query_id, k=4)
        values3 = view3.values("id")

        self.assertListEqual(values3, values1[:4])

        view4 = dataset.sort_by_similarity(query_id, brain_key="img_sim")
        values4 = view4.values("id")

        self.assertListEqual(values4, values1)

        view5 = view4.limit(2)
        values5 = view5.values("id")

        self.assertListEqual(values5, values1[:2])

        view5.reload()
        values5 = view5.values("id")

        self.assertListEqual(values5, values1[:2])

    @drop_datasets
    def test_object_similarity(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="image1.png",
                    ground_truth=fo.Detections(
                        detections=[
                            fo.Detection(label="cat"),
                            fo.Detection(label="dog"),
                            fo.Detection(label="rabbit"),
                            fo.Detection(label="squirrel"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="image2.png",
                    ground_truth=fo.Detections(
                        detections=[
                            fo.Detection(label="cat"),
                            fo.Detection(label="dog"),
                        ]
                    ),
                ),
            ]
        )

        embeddings = {}
        for sample in dataset:
            embeddings[sample.id] = np.random.randn(
                len(sample.ground_truth.detections), 4
            )

        fob.compute_similarity(
            dataset,
            patches_field="ground_truth",
            embeddings=embeddings,
            brain_key="obj_sim",
        )

        query_id = dataset.first().ground_truth.detections[0].id

        view = dataset.sort_by_similarity(query_id, k=3, brain_key="obj_sim")

        self.assertEqual(view.count("ground_truth.detections"), 3)

        patches = dataset.to_patches("ground_truth")

        view1 = patches.sort_by_similarity(query_id)
        values1 = view1.values("id")

        view2 = patches.sort_by_similarity(query_id, reverse=True)
        values2 = view2.values("id")

        self.assertListEqual(values2, values1[::-1])

        view3 = patches.sort_by_similarity(query_id, k=4)
        values3 = view3.values("id")

        self.assertListEqual(values3, values1[:4])

        view4 = patches.sort_by_similarity(query_id, brain_key="obj_sim")
        values4 = view4.values("id")

        self.assertEqual(values4, values1)

        view5 = view4.limit(2)
        values5 = view5.values("id")

        self.assertListEqual(values5, values1[:2])

        view5.reload()
        values5 = view5.values("id")

        self.assertListEqual(values5, values1[:2])


class FieldDeletionWarningTests(unittest.TestCase):
    @drop_datasets
    def test_sklearn_embeddings_field(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image%d.png" % i, emb=np.random.randn(4))
                for i in range(4)
            ]
        )
        fob.compute_similarity(dataset, embeddings="emb", brain_key="sim")

        with self.assertLogs("fiftyone.core.brain", "WARNING") as logs:
            dataset.delete_sample_field("emb")

        self.assertIn("brain run 'sim'", logs.output[0])

    @drop_datasets
    def test_removing_a_visualization_index_is_silent(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image%d.png" % i, emb=np.random.randn(4))
                for i in range(4)
            ]
        )
        results = fob.compute_visualization(
            dataset,
            points=np.random.randn(4, 2),
            points_field="pts",
            brain_key="viz",
        )

        with self.assertNoLogs("fiftyone.core.brain", "WARNING"):
            results.remove_index()

    @drop_datasets
    def test_patch_embeddings_field(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="image%d.png" % i,
                    gt=fo.Detections(
                        detections=[
                            fo.Detection(label="cat", emb=np.random.randn(4))
                        ]
                    ),
                )
                for i in range(4)
            ]
        )
        fob.compute_similarity(
            dataset, patches_field="gt", embeddings="emb", brain_key="sim"
        )

        with self.assertLogs("fiftyone.core.brain", "WARNING") as logs:
            dataset.delete_sample_field("gt.detections.emb")

        self.assertIn("brain run 'sim'", logs.output[0])


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
