"""
FiftyOne visual similarity-related unit tests.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import numpy as np

import fiftyone as fo
import fiftyone.brain as fob

from decorators import drop_datasets


class SimilarityTests(unittest.TestCase):
    @drop_datasets
    def test_image_similarity(self):
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
            dataset, embeddings=embeddings, brain_key="image_similarity",
        )

        query_id = dataset.first().id

        view1 = dataset.sort_by_similarity(query_id)
        view2 = dataset.sort_by_similarity(query_id, reverse=True)

        self.assertEqual(
            view1.values("id"), list(reversed(view2.values("id")))
        )

        view3 = dataset.sort_by_similarity(query_id, k=4)

        self.assertEqual(len(view3), 4)

        view4 = dataset.sort_by_similarity(
            query_id, brain_key="image_similarity"
        )

        self.assertEqual(view1.values("id"), view4.values("id"))

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
            brain_key="object_similarity",
        )

        query_id = dataset.first().ground_truth.detections[0].id

        view = dataset.sort_by_similarity(
            query_id, k=3, brain_key="object_similarity"
        )

        self.assertEqual(view.count("ground_truth.detections"), 3)

        patches = dataset.to_patches("ground_truth")

        view1 = patches.sort_by_similarity(query_id)
        view2 = patches.sort_by_similarity(query_id, reverse=True)

        self.assertEqual(
            view1.values("id"), list(reversed(view2.values("id")))
        )

        view3 = patches.sort_by_similarity(query_id, k=4)

        self.assertEqual(len(view3), 4)

        view4 = patches.sort_by_similarity(
            query_id, brain_key="object_similarity"
        )

        self.assertEqual(view1.values("id"), view4.values("id"))


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
