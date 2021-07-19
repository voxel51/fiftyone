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

        self.assertIn("eval", dataset.list_evaluations())
        self.assertIn("eval", dataset.get_field_schema())
        self.assertListEqual(
            dataset.values("eval"), [True, False, False, True, False],
        )

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())

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

        self.assertIn("eval", dataset.list_evaluations())
        self.assertIn("eval", dataset.get_field_schema())
        self.assertListEqual(
            dataset.values("eval"), [False, False, False, True, True],
        )

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

        self.assertIn("eval", dataset.list_evaluations())
        self.assertIn("eval", dataset.get_field_schema())
        self.assertListEqual(
            dataset.values("eval"), [False, False, False, True, False],
        )

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())

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

        self.assertIn("eval", dataset.list_evaluations())
        self.assertIn("eval", dataset.get_field_schema())
        self.assertListEqual(
            dataset.values("eval"), ["TN", "TN", "TN", "TN", "FP"],
        )

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())


class DetectionsTests(unittest.TestCase):
    def _make_detections_dataset(self):
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
        dataset = self._make_detections_dataset()

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
        # Test classwise evaluation (including missing data)
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

        self.assertIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("ground_truth.detections.eval"),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values("predictions.detections.eval"),
            [None, None, ["fp"], ["tp"], ["fp"]],
        )
        self.assertIn("eval_tp", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_tp"), [0, 0, 0, 1, 0])
        self.assertIn("eval_fp", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_fp"), [0, 0, 1, 0, 1])
        self.assertIn("eval_fn", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_fn"), [0, 1, 0, 0, 1])

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("ground_truth.detections.eval"),
            [None, [None], None, [None], [None]],
        )
        self.assertListEqual(
            dataset.values("predictions.detections.eval"),
            [None, None, [None], [None], [None]],
        )
        self.assertNotIn("eval_tp", dataset.get_field_schema())
        self.assertNotIn("eval_fp", dataset.get_field_schema())
        self.assertNotIn("eval_fn", dataset.get_field_schema())

        #
        # Test non-classwise evaluation (including missing data)
        #

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

        self.assertIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("ground_truth.detections.eval"),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values("predictions.detections.eval"),
            [None, None, ["fp"], ["tp"], ["fp"]],
        )
        self.assertIn("eval_tp", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_tp"), [0, 0, 0, 1, 0])
        self.assertIn("eval_fp", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_fp"), [0, 0, 1, 0, 1])
        self.assertIn("eval_fn", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_fn"), [0, 1, 0, 0, 1])

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("ground_truth.detections.eval"),
            [None, [None], None, [None], [None]],
        )
        self.assertListEqual(
            dataset.values("predictions.detections.eval"),
            [None, None, [None], [None], [None]],
        )
        self.assertNotIn("eval_tp", dataset.get_field_schema())
        self.assertNotIn("eval_fp", dataset.get_field_schema())
        self.assertNotIn("eval_fn", dataset.get_field_schema())

    @drop_datasets
    def test_evaluate_detections_open_images(self):
        dataset = self._make_detections_dataset()

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
        # Test classwise evaluation (including missing data)
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

        self.assertIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("ground_truth.detections.eval"),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values("predictions.detections.eval"),
            [None, None, ["fp"], ["tp"], ["fp"]],
        )
        self.assertIn("eval_tp", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_tp"), [0, 0, 0, 1, 0])
        self.assertIn("eval_fp", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_fp"), [0, 0, 1, 0, 1])
        self.assertIn("eval_fn", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_fn"), [0, 1, 0, 0, 1])

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("ground_truth.detections.eval"),
            [None, [None], None, [None], [None]],
        )
        self.assertListEqual(
            dataset.values("predictions.detections.eval"),
            [None, None, [None], [None], [None]],
        )
        self.assertNotIn("eval_tp", dataset.get_field_schema())
        self.assertNotIn("eval_fp", dataset.get_field_schema())
        self.assertNotIn("eval_fn", dataset.get_field_schema())

        #
        # Test non-classwise evaluation
        #

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

        self.assertIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("ground_truth.detections.eval"),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values("predictions.detections.eval"),
            [None, None, ["fp"], ["tp"], ["fp"]],
        )
        self.assertIn("eval_tp", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_tp"), [0, 0, 0, 1, 0])
        self.assertIn("eval_fp", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_fp"), [0, 0, 1, 0, 1])
        self.assertIn("eval_fn", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_fn"), [0, 1, 0, 0, 1])

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("ground_truth.detections.eval"),
            [None, [None], None, [None], [None]],
        )
        self.assertListEqual(
            dataset.values("predictions.detections.eval"),
            [None, None, [None], [None], [None]],
        )
        self.assertNotIn("eval_tp", dataset.get_field_schema())
        self.assertNotIn("eval_fp", dataset.get_field_schema())
        self.assertNotIn("eval_fn", dataset.get_field_schema())


class InstancesTests(unittest.TestCase):
    def _make_instances_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="image1.jpg")
        sample2 = fo.Sample(
            filepath="image2.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        mask=np.full((8, 8), True),
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
                        mask=np.full((8, 8), True),
                    )
                ]
            ),
        )
        sample4 = fo.Sample(
            filepath="image4.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        mask=np.full((8, 8), True),
                    )
                ]
            ),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        confidence=0.9,
                        mask=np.full((8, 8), True),
                    ),
                ]
            ),
        )
        sample5 = fo.Sample(
            filepath="image5.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        mask=np.full((8, 8), True),
                    )
                ]
            ),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        confidence=0.9,
                        mask=np.full((8, 8), True),
                    )
                ]
            ),
        )

        dataset.add_samples([sample1, sample2, sample3, sample4, sample5])

        return dataset

    @drop_datasets
    def test_evaluate_instances_coco(self):
        dataset = self._make_instances_dataset()

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
            use_masks=True,
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
            use_masks=True,
            classwise=True,  # don't allow matches w/ different classes
            compute_mAP=True,
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
            use_masks=True,
            classwise=False,  # allow matches w/ different classes
            compute_mAP=True,
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
    def test_evaluate_instances_open_images(self):
        dataset = self._make_instances_dataset()

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
            use_masks=True,
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
            use_masks=True,
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
            use_masks=True,
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


class PolylineTests(unittest.TestCase):
    def _make_polylines_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="image1.jpg")
        sample2 = fo.Sample(
            filepath="image2.jpg",
            ground_truth=fo.Polylines(
                polylines=[
                    fo.Polyline(
                        label="cat",
                        points=[
                            [(0.1, 0.1), (0.1, 0.4), (0.4, 0.4), (0.4, 0.1)]
                        ],
                        filled=True,
                    )
                ]
            ),
            predictions=None,
        )
        sample3 = fo.Sample(
            filepath="image3.jpg",
            ground_truth=None,
            predictions=fo.Polylines(
                polylines=[
                    fo.Polyline(
                        label="cat",
                        points=[
                            [(0.1, 0.1), (0.1, 0.4), (0.4, 0.4), (0.4, 0.1)]
                        ],
                        filled=True,
                        confidence=0.9,
                    )
                ]
            ),
        )
        sample4 = fo.Sample(
            filepath="image4.jpg",
            ground_truth=fo.Polylines(
                polylines=[
                    fo.Polyline(
                        label="cat",
                        points=[
                            [(0.1, 0.1), (0.1, 0.4), (0.4, 0.4), (0.4, 0.1)]
                        ],
                        filled=True,
                    )
                ]
            ),
            predictions=fo.Polylines(
                polylines=[
                    fo.Polyline(
                        label="cat",
                        points=[
                            [(0.1, 0.1), (0.1, 0.4), (0.4, 0.4), (0.4, 0.1)]
                        ],
                        filled=True,
                        confidence=0.9,
                    )
                ]
            ),
        )
        sample5 = fo.Sample(
            filepath="image5.jpg",
            ground_truth=fo.Polylines(
                polylines=[
                    fo.Polyline(
                        label="cat",
                        points=[
                            [(0.1, 0.1), (0.1, 0.4), (0.4, 0.4), (0.4, 0.1)]
                        ],
                        filled=True,
                    )
                ]
            ),
            predictions=fo.Polylines(
                polylines=[
                    fo.Polyline(
                        label="dog",
                        points=[
                            [(0.1, 0.1), (0.1, 0.4), (0.4, 0.4), (0.4, 0.1)]
                        ],
                        filled=True,
                        confidence=0.9,
                    )
                ]
            ),
        )

        dataset.add_samples([sample1, sample2, sample3, sample4, sample5])

        return dataset

    @drop_datasets
    def test_evaluate_polylines_coco(self):
        dataset = self._make_polylines_dataset()

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
        # Test classwise evaluation (including missing data)
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

        #
        # Test non-classwise evaluation (including missing data)
        #

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
    def test_evaluate_polylines_open_images(self):
        dataset = self._make_polylines_dataset()

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
        # Test classwise evaluation (including missing data)
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

        #
        # Test non-classwise evaluation (including missing data)
        #

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


class SegmentationTests(unittest.TestCase):
    def _make_segmentation_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="image1.jpg")
        sample2 = fo.Sample(
            filepath="image2.jpg",
            ground_truth=fo.Segmentation(mask=np.array([[0, 0], [1, 2]])),
            predictions=None,
        )
        sample3 = fo.Sample(
            filepath="image3.jpg",
            ground_truth=None,
            predictions=fo.Segmentation(mask=np.array([[0, 0], [1, 2]])),
        )
        sample4 = fo.Sample(
            filepath="image4.jpg",
            ground_truth=fo.Segmentation(mask=np.array([[0, 0], [1, 2]])),
            predictions=fo.Segmentation(mask=np.array([[0, 0], [1, 2]])),
        )
        sample5 = fo.Sample(
            filepath="image5.jpg",
            ground_truth=fo.Segmentation(mask=np.array([[0, 0], [1, 2]])),
            predictions=fo.Segmentation(mask=np.array([[1, 2], [0, 0]])),
        )

        dataset.add_samples([sample1, sample2, sample3, sample4, sample5])

        return dataset

    @drop_datasets
    def test_evaluate_segmentations_simple(self):
        dataset = self._make_segmentation_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_segmentations(
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

        results = dataset.evaluate_segmentations(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="simple",
            mask_targets={0: "background", 1: "cat", 2: "dog"},
        )

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 4)

        # rows = GT, cols = predicted, labels = [background, cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[2, 1, 1], [1, 1, 0], [1, 0, 1]], dtype=int)

        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertIn("eval_accuracy", dataset.get_field_schema())
        self.assertTrue(
            np.allclose(
                dataset.values("eval_accuracy"), [0.0, 0.0, 0.0, 1.0, 0.0]
            )
        )
        self.assertIn("eval_precision", dataset.get_field_schema())
        self.assertTrue(
            np.allclose(
                dataset.values("eval_precision"), [0.0, 0.0, 0.0, 1.0, 0.0]
            )
        )
        self.assertIn("eval_recall", dataset.get_field_schema())
        self.assertTrue(
            np.allclose(
                dataset.values("eval_recall"), [0.0, 0.0, 0.0, 1.0, 0.0]
            )
        )

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval_accuracy", dataset.get_field_schema())
        self.assertNotIn("eval_precision", dataset.get_field_schema())
        self.assertNotIn("eval_recall", dataset.get_field_schema())


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
