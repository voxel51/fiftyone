"""
FiftyOne evaluation-related unit tests.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import numpy as np

import fiftyone as fo

from decorators import drop_datasets


class ClassificationTests(unittest.TestCase):
    def _make_classification_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="image1.jpg")
        sample2 = fo.Sample(
            filepath="image2.jpg",
            ground_truth=fo.Classification(label="cat"),
            predictions=None,
        )
        sample3 = fo.Sample(
            filepath="image3.jpg",
            ground_truth=None,
            predictions=fo.Classification(
                label="cat", confidence=0.9, logits=[0.9, 0.1]
            ),
        )
        sample4 = fo.Sample(
            filepath="image4.jpg",
            ground_truth=fo.Classification(label="cat"),
            predictions=fo.Classification(
                label="cat", confidence=0.9, logits=[0.9, 0.1]
            ),
        )
        sample5 = fo.Sample(
            filepath="image5.jpg",
            ground_truth=fo.Classification(label="cat"),
            predictions=fo.Classification(
                label="dog", confidence=0.9, logits=[0.1, 0.9]
            ),
        )

        dataset.add_samples([sample1, sample2, sample3, sample4, sample5])

        return dataset

    @drop_datasets
    def test_evaluate_classifications_simple(self):
        dataset = self._make_classification_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_classifications(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="simple",
        )

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        #
        # Test evaluation (including missing data)
        #

        results = dataset.evaluate_classifications(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="simple",
        )

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        actual = results.confusion_matrix()
        expected = np.array([[1, 1, 1], [0, 0, 0], [1, 0, 1]], dtype=int)

        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

    @drop_datasets
    def test_evaluate_classifications_top_k(self):
        dataset = self._make_classification_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_classifications(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            classes=["cat", "dog"],
            method="top-k",
        )

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[0, 0], [0, 0]], dtype=int)

        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        #
        # Test evaluation (including missing data)
        #

        results = dataset.evaluate_classifications(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            classes=["cat", "dog"],
            method="top-k",
        )

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        actual = results.confusion_matrix()
        expected = np.array([[2, 0, 1], [0, 0, 0], [1, 0, 1]], dtype=int)

        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        results = dataset.evaluate_classifications(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            classes=["cat", "dog"],
            method="top-k",
            k=1,
        )

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        actual = results.confusion_matrix()
        expected = np.array([[1, 1, 1], [0, 0, 0], [1, 0, 1]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

    @drop_datasets
    def test_evaluate_classifications_binary(self):
        dataset = self._make_classification_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_classifications(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            classes=["cat", "dog"],
            method="binary",
        )

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[0, 0], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        #
        # Test evaluation (including missing data)
        #

        results = dataset.evaluate_classifications(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            classes=["cat", "dog"],
            method="binary",
        )

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], len(dataset))

        # rows = GT, cols = predicted, labels = [cat, dog]
        # Missing predictions are assigned the negative label ("cat")
        actual = results.confusion_matrix()
        expected = np.array([[4, 1], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())


class DetectionTests(unittest.TestCase):
    def _make_detection_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="image1.jpg")
        sample2 = fo.Sample(
            filepath="image2.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat", bounding_box=[0.1, 0.1, 0.4, 0.4],
                    )
                ]
            ),
            predictions=None,
        )
        sample3 = fo.Sample(
            filepath="image3.jpg",
            ground_truth=None,
            predictions=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        confidence=0.9,
                    )
                ]
            ),
        )
        sample4 = fo.Sample(
            filepath="image4.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat", bounding_box=[0.1, 0.1, 0.4, 0.4],
                    )
                ]
            ),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        confidence=0.9,
                    )
                ]
            ),
        )
        sample5 = fo.Sample(
            filepath="image5.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat", bounding_box=[0.1, 0.1, 0.4, 0.4],
                    )
                ]
            ),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        confidence=0.9,
                    )
                ]
            ),
        )

        dataset.add_samples([sample1, sample2, sample3, sample4, sample5])

        return dataset

    @drop_datasets
    def test_evaluate_detections_coco(self):
        dataset = self._make_detection_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_detections(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="coco",
            compute_mAP=True,
        )

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        #
        # Test evaluation (including missing data)
        #

        results = dataset.evaluate_detections(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="coco",
            compute_mAP=True,
            classwise=True,  # don't allow matches w/ different classes
        )

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        actual = results.confusion_matrix()
        expected = np.array([[1, 0, 2], [0, 0, 0], [1, 1, 0]], dtype=int)

        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        results = dataset.evaluate_detections(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="coco",
            compute_mAP=True,
            classwise=False,  # allow matches w/ different classes
        )

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        actual = results.confusion_matrix()
        expected = np.array([[1, 1, 1], [0, 0, 0], [1, 0, 0]], dtype=int)

        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

    @drop_datasets
    def test_evaluate_detections_open_images(self):
        dataset = self._make_detection_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_detections(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="open-images",
        )

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        #
        # Test evaluation (including missing data)
        #

        results = dataset.evaluate_detections(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="open-images",
            classwise=True,  # don't allow matches w/ different classes
        )

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        actual = results.confusion_matrix()
        expected = np.array([[1, 0, 2], [0, 0, 0], [1, 1, 0]], dtype=int)

        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        results = dataset.evaluate_detections(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="open-images",
            classwise=False,  # allow matches w/ different classes
        )

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        actual = results.confusion_matrix()
        expected = np.array([[1, 1, 1], [0, 0, 0], [1, 0, 0]], dtype=int)

        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
