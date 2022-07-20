"""
FiftyOne evaluation-related unit tests.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
import warnings

import numpy as np

import fiftyone as fo

from decorators import drop_datasets


class RegressionTests(unittest.TestCase):
    def _make_regression_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="image1.jpg")
        sample2 = fo.Sample(
            filepath="image2.jpg",
            ground_truth=fo.Regression(value=1.0),
            predictions=None,
        )
        sample3 = fo.Sample(
            filepath="image3.jpg",
            ground_truth=None,
            predictions=fo.Regression(value=1.0, confidence=0.9),
        )
        sample4 = fo.Sample(
            filepath="image4.jpg",
            ground_truth=fo.Regression(value=2.0),
            predictions=fo.Regression(value=1.9, confidence=0.9),
        )
        sample5 = fo.Sample(
            filepath="image5.jpg",
            ground_truth=fo.Regression(value=2.8),
            predictions=fo.Regression(value=3.0, confidence=0.9),
        )

        dataset.add_samples([sample1, sample2, sample3, sample4, sample5])

        return dataset

    @drop_datasets
    def test_evaluate_regressions_simple(self):
        dataset = self._make_regression_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_regressions(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="simple",
        )

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.print_metrics()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        #
        # Test evaluation (including missing data)
        #

        results = dataset.evaluate_regressions(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="simple",
        )

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

        results.print_metrics()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 2)

        actual = dataset.values("eval")
        expected = [None, None, None, 0.01, 0.04]

        for a, e in zip(actual, expected):
            if e is None:
                self.assertIsNone(a)
            else:
                self.assertAlmostEqual(a, e)

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())


class VideoRegressionTests(unittest.TestCase):
    def _make_video_regression_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="video1.mp4")
        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame()
        sample3 = fo.Sample(filepath="video3.mp4")
        sample3.frames[1] = fo.Frame(
            ground_truth=fo.Regression(value=1.0),
            predictions=None,
        )
        sample3.frames[2] = fo.Frame(
            ground_truth=None,
            predictions=fo.Regression(value=1.0, confidence=0.9),
        )
        sample4 = fo.Sample(filepath="video4.mp4")
        sample4.frames[1] = fo.Frame(
            ground_truth=fo.Regression(value=2.0),
            predictions=fo.Regression(value=1.9, confidence=0.9),
        )
        sample4.frames[2] = fo.Frame(
            ground_truth=fo.Regression(value=2.8),
            predictions=fo.Regression(value=3.0, confidence=0.9),
        )

        dataset.add_samples([sample1, sample2, sample3, sample4])

        return dataset

    @drop_datasets
    def test_evaluate_video_regressions_simple(self):
        dataset = self._make_video_regression_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_regressions(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="simple",
        )

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.print_metrics()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        #
        # Test evaluation (including missing data)
        #

        results = dataset.evaluate_regressions(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="simple",
        )

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

        results.print_metrics()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 2)

        actual = dataset.values("eval")
        expected = [None, None, None, 0.025]

        for a, e in zip(actual, expected):
            if e is None:
                self.assertIsNone(a)
            else:
                self.assertAlmostEqual(a, e)

        actual = dataset.values("frames.eval", unwind=True)
        expected = [None, None, None, 0.01, 0.04]

        for a, e in zip(actual, expected):
            if e is None:
                self.assertIsNone(a)
            else:
                self.assertAlmostEqual(a, e)

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())
        self.assertNotIn("eval", dataset.get_frame_field_schema())


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

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

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

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[1, 1], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[1, 1, 1], [0, 0, 0], [1, 0, 1]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertIn("eval", dataset.get_field_schema())
        self.assertListEqual(
            dataset.values("eval"),
            [True, False, False, True, False],
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

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

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

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # suppress missing logits warning

            results = dataset.evaluate_classifications(
                "predictions",
                gt_field="ground_truth",
                eval_key="eval",
                classes=["cat", "dog"],
                method="top-k",
            )

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[2, 0], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[2, 0, 1], [0, 0, 0], [1, 0, 1]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertIn("eval", dataset.get_field_schema())
        self.assertListEqual(
            dataset.values("eval"),
            [False, False, False, True, True],
        )

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # suppress missing logits warning

            results = dataset.evaluate_classifications(
                "predictions",
                gt_field="ground_truth",
                eval_key="eval",
                classes=["cat", "dog"],
                method="top-k",
                k=1,
            )

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[1, 1], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[1, 1, 1], [0, 0, 0], [1, 0, 1]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertListEqual(
            dataset.values("eval"),
            [False, False, False, True, False],
        )

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

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

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

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 5)

        # rows = GT, cols = predicted, labels = [cat, dog]
        # Missing predictions are assigned the negative label ("cat")
        actual = results.confusion_matrix()
        expected = np.array([[4, 1], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertIn("eval", dataset.get_field_schema())
        self.assertListEqual(
            dataset.values("eval"),
            ["TN", "TN", "TN", "TN", "FP"],
        )

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())


class VideoClassificationTests(unittest.TestCase):
    def _make_video_classification_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="video1.mp4")
        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame()
        sample3 = fo.Sample(filepath="video3.mp4")
        sample3.frames[1] = fo.Frame(
            ground_truth=fo.Classification(label="cat"),
            predictions=None,
        )
        sample3.frames[2] = fo.Frame(
            ground_truth=None,
            predictions=fo.Classification(
                label="cat", confidence=0.9, logits=[0.9, 0.1]
            ),
        )
        sample4 = fo.Sample(filepath="video4.mp4")
        sample4.frames[1] = fo.Frame(
            ground_truth=fo.Classification(label="cat"),
            predictions=fo.Classification(
                label="cat", confidence=0.9, logits=[0.9, 0.1]
            ),
        )
        sample4.frames[2] = fo.Frame(
            ground_truth=fo.Classification(label="cat"),
            predictions=fo.Classification(
                label="dog", confidence=0.9, logits=[0.1, 0.9]
            ),
        )

        dataset.add_samples([sample1, sample2, sample3, sample4])

        return dataset

    @drop_datasets
    def test_evaluate_video_classifications_simple(self):
        dataset = self._make_video_classification_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_classifications(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="simple",
        )

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

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
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="simple",
        )

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[1, 1], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[1, 1, 1], [0, 0, 0], [1, 0, 1]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertIn("eval", dataset.get_field_schema())
        self.assertIn("eval", dataset.get_frame_field_schema())
        self.assertListEqual(
            dataset.values("frames.eval"),
            [[], [True], [False, False], [True, False]],
        )

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())
        self.assertNotIn("eval", dataset.get_frame_field_schema())

    @drop_datasets
    def test_evaluate_video_classifications_top_k(self):
        dataset = self._make_video_classification_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_classifications(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            classes=["cat", "dog"],
            method="top-k",
        )

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

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

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # suppress missing logits warning

            results = dataset.evaluate_classifications(
                "frames.predictions",
                gt_field="frames.ground_truth",
                eval_key="eval",
                classes=["cat", "dog"],
                method="top-k",
            )

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[2, 0], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[2, 0, 1], [0, 0, 0], [1, 0, 1]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertIn("eval", dataset.get_field_schema())
        self.assertIn("eval", dataset.get_frame_field_schema())
        self.assertListEqual(
            dataset.values("frames.eval"),
            [[], [False], [False, False], [True, True]],
        )

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())
        self.assertNotIn("eval", dataset.get_frame_field_schema())

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # suppress missing logits warning

            results = dataset.evaluate_classifications(
                "frames.predictions",
                gt_field="frames.ground_truth",
                eval_key="eval",
                classes=["cat", "dog"],
                method="top-k",
                k=1,
            )

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[1, 1], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[1, 1, 1], [0, 0, 0], [1, 0, 1]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertListEqual(
            dataset.values("frames.eval"),
            [[], [False], [False, False], [True, False]],
        )

    @drop_datasets
    def test_evaluate_video_classifications_binary(self):
        dataset = self._make_video_classification_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_classifications(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            classes=["cat", "dog"],
            method="binary",
        )

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

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
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            classes=["cat", "dog"],
            method="binary",
        )

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 5)

        # rows = GT, cols = predicted, labels = [cat, dog]
        # Missing predictions are assigned the negative label ("cat")
        actual = results.confusion_matrix()
        expected = np.array([[4, 1], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertIn("eval", dataset.get_field_schema())
        self.assertIn("eval", dataset.get_frame_field_schema())
        self.assertListEqual(
            dataset.values("frames.eval"),
            [[], ["TN"], ["TN", "TN"], ["TN", "FP"]],
        )

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())
        self.assertNotIn("eval", dataset.get_frame_field_schema())


class DetectionsTests(unittest.TestCase):
    def _make_detections_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="image1.jpg")
        sample2 = fo.Sample(
            filepath="image2.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
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
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
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
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
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

    def _evaluate_coco(self, dataset, kwargs):
        _, gt_eval_field = dataset._get_label_field_path(
            "ground_truth", "eval"
        )
        _, pred_eval_field = dataset._get_label_field_path(
            "predictions", "eval"
        )

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
            **kwargs,
        )

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

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
            **kwargs,
        )

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[1, 0], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[1, 0, 2], [0, 0, 0], [1, 1, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values(gt_eval_field),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field),
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
            dataset.values(gt_eval_field),
            [None, [None], None, [None], [None]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field),
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
            **kwargs,
        )

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[1, 1], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[1, 1, 1], [0, 0, 0], [1, 0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertListEqual(
            dataset.values(gt_eval_field),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field),
            [None, None, ["fp"], ["tp"], ["fp"]],
        )
        self.assertListEqual(dataset.values("eval_tp"), [0, 0, 0, 1, 0])
        self.assertListEqual(dataset.values("eval_fp"), [0, 0, 1, 0, 1])
        self.assertListEqual(dataset.values("eval_fn"), [0, 1, 0, 0, 1])

    def _evaluate_open_images(self, dataset, kwargs):
        _, gt_eval_field = dataset._get_label_field_path(
            "ground_truth", "eval"
        )
        _, pred_eval_field = dataset._get_label_field_path(
            "predictions", "eval"
        )

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
            **kwargs,
        )

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

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
            **kwargs,
        )

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[1, 0], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[1, 0, 2], [0, 0, 0], [1, 1, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values(gt_eval_field),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field),
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
            dataset.values(gt_eval_field),
            [None, [None], None, [None], [None]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field),
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
            method="open-images",
            classwise=False,  # allow matches w/ different classes
            **kwargs,
        )

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[1, 1], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[1, 1, 1], [0, 0, 0], [1, 0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertListEqual(
            dataset.values(gt_eval_field),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field),
            [None, None, ["fp"], ["tp"], ["fp"]],
        )
        self.assertListEqual(dataset.values("eval_tp"), [0, 0, 0, 1, 0])
        self.assertListEqual(dataset.values("eval_fp"), [0, 0, 1, 0, 1])
        self.assertListEqual(dataset.values("eval_fn"), [0, 1, 0, 0, 1])

    @drop_datasets
    def test_evaluate_detections_coco(self):
        dataset = self._make_detections_dataset()
        kwargs = {}

        self._evaluate_coco(dataset, kwargs)

    @drop_datasets
    def test_evaluate_instances_coco(self):
        dataset = self._make_instances_dataset()
        kwargs = dict(use_masks=True)

        self._evaluate_coco(dataset, kwargs)

    @drop_datasets
    def test_evaluate_polylines_coco(self):
        dataset = self._make_polylines_dataset()
        kwargs = {}

        self._evaluate_coco(dataset, kwargs)

    @drop_datasets
    def test_evaluate_detections_open_images(self):
        dataset = self._make_detections_dataset()
        kwargs = {}

        self._evaluate_open_images(dataset, kwargs)

    @drop_datasets
    def test_evaluate_instances_open_images(self):
        dataset = self._make_instances_dataset()
        kwargs = dict(use_masks=True)

        self._evaluate_open_images(dataset, kwargs)

    @drop_datasets
    def test_evaluate_polylines_open_images(self):
        dataset = self._make_polylines_dataset()
        kwargs = {}

        self._evaluate_open_images(dataset, kwargs)

    @drop_datasets
    def test_load_evaluation_view_select_fields(self):
        dataset = self._make_detections_dataset()

        dataset.clone_sample_field("predictions", "predictions2")

        dataset.evaluate_detections(
            "predictions", gt_field="ground_truth", eval_key="eval"
        )
        dataset.evaluate_detections(
            "predictions2", gt_field="ground_truth", eval_key="eval2"
        )

        view = dataset.load_evaluation_view("eval", select_fields=True)

        schema = view.get_field_schema()
        self.assertNotIn("predictions2", schema)
        self.assertNotIn("eval2_tp", schema)
        self.assertNotIn("eval2_fp", schema)
        self.assertNotIn("eval2_fn", schema)

        sample = view.last()
        detection = sample["ground_truth"].detections[0]

        self.assertIsNotNone(detection["eval"])
        with self.assertRaises(KeyError):
            detection["eval2"]


class VideoDetectionsTests(unittest.TestCase):
    def _make_video_detections_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="video1.mp4")
        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame()
        sample3 = fo.Sample(filepath="video3.mp4")
        sample3.frames[1] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                    )
                ]
            ),
            predictions=None,
        )
        sample3.frames[2] = fo.Frame(
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
        sample4 = fo.Sample(filepath="video4.mp4")
        sample4.frames[1] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
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
        sample4.frames[2] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
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

        dataset.add_samples([sample1, sample2, sample3, sample4])

        return dataset

    def test_evaluate_video_detections_coco(self):
        dataset = self._make_video_detections_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_detections(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="coco",
            compute_mAP=True,
        )

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

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
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="coco",
            compute_mAP=True,
            classwise=True,  # don't allow matches w/ different classes
        )

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[1, 0], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[1, 0, 2], [0, 0, 0], [1, 1, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("frames.ground_truth.detections.eval"),
            [[], [None], [["fn"], None], [["tp"], ["fn"]]],
        )
        self.assertListEqual(
            dataset.values("frames.predictions.detections.eval"),
            [[], [None], [None, ["fp"]], [["tp"], ["fp"]]],
        )
        self.assertIn("eval_tp", dataset.get_field_schema())
        self.assertIn("eval_tp", dataset.get_frame_field_schema())
        self.assertListEqual(
            dataset.values("frames.eval_tp"),
            [[], [0], [0, 0], [1, 0]],
        )
        self.assertIn("eval_fp", dataset.get_field_schema())
        self.assertIn("eval_fp", dataset.get_frame_field_schema())
        self.assertListEqual(
            dataset.values("frames.eval_fp"),
            [[], [0], [0, 1], [0, 1]],
        )
        self.assertIn("eval_fn", dataset.get_field_schema())
        self.assertIn("eval_fn", dataset.get_frame_field_schema())
        self.assertListEqual(
            dataset.values("frames.eval_fn"),
            [[], [0], [1, 0], [0, 1]],
        )

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("frames.ground_truth.detections.eval"),
            [[], [None], [[None], None], [[None], [None]]],
        )
        self.assertListEqual(
            dataset.values("frames.predictions.detections.eval"),
            [[], [None], [None, [None]], [[None], [None]]],
        )
        self.assertNotIn("eval_tp", dataset.get_field_schema())
        self.assertNotIn("eval_tp", dataset.get_frame_field_schema())
        self.assertNotIn("eval_fp", dataset.get_field_schema())
        self.assertNotIn("eval_fp", dataset.get_frame_field_schema())
        self.assertNotIn("eval_fn", dataset.get_field_schema())
        self.assertNotIn("eval_fn", dataset.get_frame_field_schema())

        #
        # Test non-classwise evaluation (including missing data)
        #

        results = dataset.evaluate_detections(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="coco",
            compute_mAP=True,
            classwise=False,  # allow matches w/ different classes
        )

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[1, 1], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[1, 1, 1], [0, 0, 0], [1, 0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertListEqual(
            dataset.values("frames.ground_truth.detections.eval"),
            [[], [None], [["fn"], None], [["tp"], ["fn"]]],
        )
        self.assertListEqual(
            dataset.values("frames.predictions.detections.eval"),
            [[], [None], [None, ["fp"]], [["tp"], ["fp"]]],
        )
        self.assertListEqual(
            dataset.values("frames.eval_tp"),
            [[], [0], [0, 0], [1, 0]],
        )
        self.assertListEqual(
            dataset.values("frames.eval_fp"),
            [[], [0], [0, 1], [0, 1]],
        )
        self.assertListEqual(
            dataset.values("frames.eval_fn"),
            [[], [0], [1, 0], [0, 1]],
        )

    def test_evaluate_video_detections_open_images(self):
        dataset = self._make_video_detections_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_detections(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="open-images",
        )

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

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
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="open-images",
            classwise=True,  # don't allow matches w/ different classes
        )

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 3)

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[1, 0], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[1, 0, 2], [0, 0, 0], [1, 1, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("frames.ground_truth.detections.eval"),
            [[], [None], [["fn"], None], [["tp"], ["fn"]]],
        )
        self.assertListEqual(
            dataset.values("frames.predictions.detections.eval"),
            [[], [None], [None, ["fp"]], [["tp"], ["fp"]]],
        )
        self.assertIn("eval_tp", dataset.get_field_schema())
        self.assertIn("eval_tp", dataset.get_frame_field_schema())
        self.assertListEqual(
            dataset.values("frames.eval_tp"),
            [[], [0], [0, 0], [1, 0]],
        )
        self.assertIn("eval_fp", dataset.get_field_schema())
        self.assertIn("eval_fp", dataset.get_frame_field_schema())
        self.assertListEqual(
            dataset.values("frames.eval_fp"),
            [[], [0], [0, 1], [0, 1]],
        )
        self.assertIn("eval_fn", dataset.get_field_schema())
        self.assertIn("eval_fn", dataset.get_frame_field_schema())
        self.assertListEqual(
            dataset.values("frames.eval_fn"),
            [[], [0], [1, 0], [0, 1]],
        )

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("frames.ground_truth.detections.eval"),
            [[], [None], [[None], None], [[None], [None]]],
        )
        self.assertListEqual(
            dataset.values("frames.predictions.detections.eval"),
            [[], [None], [None, [None]], [[None], [None]]],
        )
        self.assertNotIn("eval_tp", dataset.get_field_schema())
        self.assertNotIn("eval_tp", dataset.get_frame_field_schema())
        self.assertNotIn("eval_fp", dataset.get_field_schema())
        self.assertNotIn("eval_fp", dataset.get_frame_field_schema())
        self.assertNotIn("eval_fn", dataset.get_field_schema())
        self.assertNotIn("eval_fn", dataset.get_frame_field_schema())

        #
        # Test non-classwise evaluation (including missing data)
        #

        results = dataset.evaluate_detections(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="open-images",
            classwise=False,  # allow matches w/ different classes
        )

        # rows = GT, cols = predicted, labels = [cat, dog]
        actual = results.confusion_matrix()
        expected = np.array([[1, 1], [0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        # rows = GT, cols = predicted, labels = [cat, dog, None]
        classes = list(results.classes) + [results.missing]
        actual = results.confusion_matrix(classes=classes)
        expected = np.array([[1, 1, 1], [0, 0, 0], [1, 0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertListEqual(
            dataset.values("frames.ground_truth.detections.eval"),
            [[], [None], [["fn"], None], [["tp"], ["fn"]]],
        )
        self.assertListEqual(
            dataset.values("frames.predictions.detections.eval"),
            [[], [None], [None, ["fp"]], [["tp"], ["fp"]]],
        )
        self.assertListEqual(
            dataset.values("frames.eval_tp"),
            [[], [0], [0, 0], [1, 0]],
        )
        self.assertListEqual(
            dataset.values("frames.eval_fp"),
            [[], [0], [0, 1], [0, 1]],
        )
        self.assertListEqual(
            dataset.values("frames.eval_fn"),
            [[], [0], [1, 0], [0, 1]],
        )


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

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        #
        # Test evaluation (including missing data)
        #

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # suppress missing masks warning

            results = dataset.evaluate_segmentations(
                "predictions",
                gt_field="ground_truth",
                eval_key="eval",
                method="simple",
                mask_targets={0: "background", 1: "cat", 2: "dog"},
            )

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

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
        self.assertIn("eval_precision", dataset.get_field_schema())
        self.assertIn("eval_recall", dataset.get_field_schema())

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval_accuracy", dataset.get_field_schema())
        self.assertNotIn("eval_precision", dataset.get_field_schema())
        self.assertNotIn("eval_recall", dataset.get_field_schema())


class VideoSegmentationTests(unittest.TestCase):
    def _make_video_segmentation_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="video1.mp4")
        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame()
        sample3 = fo.Sample(filepath="video3.mp4")
        sample3.frames[1] = fo.Frame(
            ground_truth=fo.Segmentation(mask=np.array([[0, 0], [1, 2]])),
            predictions=None,
        )
        sample3.frames[2] = fo.Frame(
            ground_truth=None,
            predictions=fo.Segmentation(mask=np.array([[0, 0], [1, 2]])),
        )
        sample4 = fo.Sample(filepath="video4.mp4")
        sample4.frames[1] = fo.Frame(
            ground_truth=fo.Segmentation(mask=np.array([[0, 0], [1, 2]])),
            predictions=fo.Segmentation(mask=np.array([[0, 0], [1, 2]])),
        )
        sample4.frames[2] = fo.Frame(
            ground_truth=fo.Segmentation(mask=np.array([[0, 0], [1, 2]])),
            predictions=fo.Segmentation(mask=np.array([[1, 2], [0, 0]])),
        )

        dataset.add_samples([sample1, sample2, sample3, sample4])

        return dataset

    @drop_datasets
    def test_evaluate_video_segmentations_simple(self):
        dataset = self._make_video_segmentation_dataset()

        #
        # Test empty view
        #

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_segmentations(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="simple",
        )

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        #
        # Test evaluation (including missing data)
        #

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # suppress missing masks warning

            results = dataset.evaluate_segmentations(
                "frames.predictions",
                gt_field="frames.ground_truth",
                eval_key="eval",
                method="simple",
                mask_targets={0: "background", 1: "cat", 2: "dog"},
            )

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

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
        self.assertIn("eval_accuracy", dataset.get_frame_field_schema())
        self.assertIn("eval_precision", dataset.get_field_schema())
        self.assertIn("eval_precision", dataset.get_frame_field_schema())
        self.assertIn("eval_recall", dataset.get_field_schema())
        self.assertIn("eval_recall", dataset.get_frame_field_schema())

        dataset.delete_evaluation("eval")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval_accuracy", dataset.get_field_schema())
        self.assertNotIn("eval_accuracy", dataset.get_frame_field_schema())
        self.assertNotIn("eval_precision", dataset.get_field_schema())
        self.assertNotIn("eval_precision", dataset.get_frame_field_schema())
        self.assertNotIn("eval_recall", dataset.get_field_schema())
        self.assertNotIn("eval_recall", dataset.get_frame_field_schema())


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
