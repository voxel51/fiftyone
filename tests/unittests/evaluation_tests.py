"""
FiftyOne evaluation-related unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import random
import string
import sys
import unittest
import warnings

import numpy as np

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.utils.eval.classification as fouc
import fiftyone.utils.eval.coco as coco
import fiftyone.utils.eval.detection as foud
import fiftyone.utils.eval.regression as four
import fiftyone.utils.eval.segmentation as fous
import fiftyone.utils.labels as foul
import fiftyone.utils.iou as foui

from decorators import drop_datasets


class CustomRegressionEvaluationConfig(four.SimpleEvaluationConfig):
    pass


class CustomRegressionEvaluation(four.SimpleEvaluation):
    pass


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

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_regressions(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="simple",
        )

        self.assertIn("eval", dataset.get_field_schema())

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.print_metrics()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        # Test evaluation (including missing data)

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

        # Test renaming

        dataset.rename_evaluation("eval", "eval2")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertIn("eval2", dataset.get_field_schema())

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertNotIn("eval2", dataset.get_field_schema())

    @drop_datasets
    def test_evaluate_regressions_embedded_fields(self):
        dataset = self._make_regression_dataset()

        dataset.add_sample_field(
            "embedded",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )

        dataset.rename_sample_field("predictions", "embedded.predictions")
        dataset.rename_sample_field("ground_truth", "embedded.ground_truth")

        results = dataset.evaluate_regressions(
            "embedded.predictions",
            gt_field="embedded.ground_truth",
            eval_key="eval",
            method="simple",
        )

        results.print_metrics()

    def test_custom_regression_evaluation(self):
        dataset = self._make_regression_dataset()

        dataset.evaluate_regressions(
            "predictions",
            gt_field="ground_truth",
            method=CustomRegressionEvaluationConfig,
            eval_key="custom",
        )

        dataset.clear_cache()

        info = dataset.get_evaluation_info("custom")
        self.assertEqual(type(info.config), CustomRegressionEvaluationConfig)

        results = dataset.load_evaluation_results("custom")
        self.assertEqual(type(results), four.RegressionResults)

        delattr(sys.modules[__name__], "CustomRegressionEvaluationConfig")
        delattr(sys.modules[__name__], "CustomRegressionEvaluation")
        dataset.clear_cache()

        # Should fallback to base class
        info = dataset.get_evaluation_info("custom")
        self.assertEqual(type(info.config), four.RegressionEvaluationConfig)

        results = dataset.load_evaluation_results("custom")
        self.assertEqual(type(results), four.RegressionResults)


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

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_regressions(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="simple",
        )

        self.assertIn("eval", dataset.get_field_schema())
        self.assertIn("eval", dataset.get_frame_field_schema())

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.print_metrics()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        # Test evaluation (including missing data)

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

        # Test renaming

        dataset.rename_evaluation("eval", "eval2")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())
        self.assertNotIn("eval", dataset.get_frame_field_schema())

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertIn("eval2", dataset.get_field_schema())
        self.assertIn("eval2", dataset.get_frame_field_schema())

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertNotIn("eval2", dataset.get_field_schema())
        self.assertNotIn("eval2", dataset.get_frame_field_schema())


class CustomClassificationEvaluationConfig(fouc.SimpleEvaluationConfig):
    pass


class CustomClassificationEvaluation(fouc.SimpleEvaluation):
    pass


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

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_classifications(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="simple",
        )

        self.assertIn("eval", dataset.get_field_schema())

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        # Test evaluation (including missing data)

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

        # Test renaming

        dataset.rename_evaluation("eval", "eval2")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertIn("eval2", dataset.get_field_schema())

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertNotIn("eval2", dataset.get_field_schema())

    @drop_datasets
    def test_evaluate_classifications_top_k(self):
        dataset = self._make_classification_dataset()

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_classifications(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            classes=["cat", "dog"],
            method="top-k",
        )

        self.assertIn("eval", dataset.get_field_schema())

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

        # Test evaluation (including missing data)

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

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_classifications(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            classes=["cat", "dog"],
            method="binary",
        )

        self.assertIn("eval", dataset.get_field_schema())

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

        # Test evaluation (including missing data)

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

        # Test renaming

        dataset.rename_evaluation("eval", "eval2")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertIn("eval2", dataset.get_field_schema())

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertNotIn("eval2", dataset.get_field_schema())

    @drop_datasets
    def test_evaluate_classifications_embedded_fields(self):
        dataset = self._make_classification_dataset()

        dataset.add_sample_field(
            "embedded",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )

        dataset.rename_sample_field("predictions", "embedded.predictions")
        dataset.rename_sample_field("ground_truth", "embedded.ground_truth")

        results = dataset.evaluate_classifications(
            "embedded.predictions",
            gt_field="embedded.ground_truth",
            eval_key="eval",
            method="simple",
        )

        results.report()
        results.print_report()

    def test_custom_classification_evaluation(self):
        dataset = self._make_classification_dataset()

        dataset.evaluate_classifications(
            "predictions",
            gt_field="ground_truth",
            method=CustomClassificationEvaluationConfig,
            eval_key="custom",
        )

        dataset.clear_cache()

        info = dataset.get_evaluation_info("custom")
        self.assertEqual(
            type(info.config), CustomClassificationEvaluationConfig
        )

        results = dataset.load_evaluation_results("custom")
        self.assertEqual(type(results), fouc.ClassificationResults)

        delattr(sys.modules[__name__], "CustomClassificationEvaluationConfig")
        delattr(sys.modules[__name__], "CustomClassificationEvaluation")
        dataset.clear_cache()

        # Should fallback to base class
        info = dataset.get_evaluation_info("custom")
        self.assertEqual(
            type(info.config), fouc.ClassificationEvaluationConfig
        )

        results = dataset.load_evaluation_results("custom")
        self.assertEqual(type(results), fouc.ClassificationResults)


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

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_classifications(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="simple",
        )

        self.assertIn("eval", dataset.get_field_schema())
        self.assertIn("eval", dataset.get_frame_field_schema())

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        # Test evaluation (including missing data)

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

        # Test renaming

        dataset.rename_evaluation("eval", "eval2")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())
        self.assertNotIn("eval", dataset.get_frame_field_schema())

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertIn("eval2", dataset.get_field_schema())
        self.assertIn("eval2", dataset.get_frame_field_schema())

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertNotIn("eval2", dataset.get_field_schema())
        self.assertNotIn("eval2", dataset.get_frame_field_schema())

    @drop_datasets
    def test_evaluate_video_classifications_top_k(self):
        dataset = self._make_video_classification_dataset()

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_classifications(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            classes=["cat", "dog"],
            method="top-k",
        )

        self.assertIn("eval", dataset.get_field_schema())
        self.assertIn("eval", dataset.get_frame_field_schema())

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

        # Test evaluation (including missing data)

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

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_classifications(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            classes=["cat", "dog"],
            method="binary",
        )

        self.assertIn("eval", dataset.get_field_schema())
        self.assertIn("eval", dataset.get_frame_field_schema())

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

        # Test evaluation (including missing data)

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

        # Test renaming

        dataset.rename_evaluation("eval", "eval2")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval", dataset.get_field_schema())
        self.assertNotIn("eval", dataset.get_frame_field_schema())

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertIn("eval2", dataset.get_field_schema())
        self.assertIn("eval2", dataset.get_frame_field_schema())

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertNotIn("eval2", dataset.get_field_schema())
        self.assertNotIn("eval2", dataset.get_frame_field_schema())


class CustomDetectionEvaluationConfig(coco.COCOEvaluationConfig):
    pass


class CustomDetectionEvaluation(coco.COCOEvaluation):
    pass


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

        # Test empty view

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

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("eval_tp", schema)
        self.assertIn("eval_fp", schema)
        self.assertIn("eval_fn", schema)
        self.assertIn(gt_eval_field, schema)
        self.assertIn(gt_eval_field + "_id", schema)
        self.assertIn(gt_eval_field + "_iou", schema)
        self.assertIn(pred_eval_field, schema)
        self.assertIn(pred_eval_field + "_id", schema)
        self.assertIn(pred_eval_field + "_iou", schema)

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        # Test classwise evaluation (including missing data)

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

        # Test renaming

        dataset.rename_evaluation("eval", "eval2")

        _, gt_eval_field2 = dataset._get_label_field_path(
            "ground_truth", "eval2"
        )
        _, pred_eval_field2 = dataset._get_label_field_path(
            "predictions", "eval2"
        )

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values(gt_eval_field),
            [None, [None], None, [None], [None]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field),
            [None, None, [None], [None], [None]],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("eval_tp", schema)
        self.assertNotIn("eval_fp", schema)
        self.assertNotIn("eval_fn", schema)
        self.assertNotIn(gt_eval_field, schema)
        self.assertNotIn(gt_eval_field + "_id", schema)
        self.assertNotIn(gt_eval_field + "_iou", schema)
        self.assertNotIn(pred_eval_field, schema)
        self.assertNotIn(pred_eval_field + "_id", schema)
        self.assertNotIn(pred_eval_field + "_iou", schema)

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values(gt_eval_field2),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field2),
            [None, None, ["fp"], ["tp"], ["fp"]],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("eval2_tp", schema)
        self.assertIn("eval2_fp", schema)
        self.assertIn("eval2_fn", schema)
        self.assertIn(gt_eval_field2, schema)
        self.assertIn(gt_eval_field2 + "_id", schema)
        self.assertIn(gt_eval_field2 + "_iou", schema)
        self.assertIn(pred_eval_field2, schema)
        self.assertIn(pred_eval_field2 + "_id", schema)
        self.assertIn(pred_eval_field2 + "_iou", schema)

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values(gt_eval_field2),
            [None, [None], None, [None], [None]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field2),
            [None, None, [None], [None], [None]],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("eval2_tp", schema)
        self.assertNotIn("eval2_fp", schema)
        self.assertNotIn("eval2_fn", schema)
        self.assertNotIn(gt_eval_field2, schema)
        self.assertNotIn(gt_eval_field2 + "_id", schema)
        self.assertNotIn(gt_eval_field2 + "_iou", schema)
        self.assertNotIn(pred_eval_field2, schema)
        self.assertNotIn(pred_eval_field2 + "_id", schema)
        self.assertNotIn(pred_eval_field2 + "_iou", schema)

        # Test non-classwise evaluation (including missing data)

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

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_detections(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="open-images",
            **kwargs,
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("eval_tp", schema)
        self.assertIn("eval_fp", schema)
        self.assertIn("eval_fn", schema)
        self.assertIn(gt_eval_field, schema)
        self.assertIn(gt_eval_field + "_id", schema)
        self.assertIn(gt_eval_field + "_iou", schema)
        self.assertIn(pred_eval_field, schema)
        self.assertIn(pred_eval_field + "_id", schema)
        self.assertIn(pred_eval_field + "_iou", schema)

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        # Test classwise evaluation (including missing data)

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

        # Test rename

        dataset.rename_evaluation("eval", "eval2")

        _, gt_eval_field2 = dataset._get_label_field_path(
            "ground_truth", "eval2"
        )
        _, pred_eval_field2 = dataset._get_label_field_path(
            "predictions", "eval2"
        )

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values(gt_eval_field),
            [None, [None], None, [None], [None]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field),
            [None, None, [None], [None], [None]],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("eval_tp", schema)
        self.assertNotIn("eval_fp", schema)
        self.assertNotIn("eval_fn", schema)
        self.assertNotIn(gt_eval_field, schema)
        self.assertNotIn(gt_eval_field + "_id", schema)
        self.assertNotIn(gt_eval_field + "_iou", schema)
        self.assertNotIn(pred_eval_field, schema)
        self.assertNotIn(pred_eval_field + "_id", schema)
        self.assertNotIn(pred_eval_field + "_iou", schema)

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values(gt_eval_field2),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field2),
            [None, None, ["fp"], ["tp"], ["fp"]],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("eval2_tp", schema)
        self.assertIn("eval2_fp", schema)
        self.assertIn("eval2_fn", schema)
        self.assertIn(gt_eval_field2, schema)
        self.assertIn(gt_eval_field2 + "_id", schema)
        self.assertIn(gt_eval_field2 + "_iou", schema)
        self.assertIn(pred_eval_field2, schema)
        self.assertIn(pred_eval_field2 + "_id", schema)
        self.assertIn(pred_eval_field2 + "_iou", schema)

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values(gt_eval_field2),
            [None, [None], None, [None], [None]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field2),
            [None, None, [None], [None], [None]],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("eval2_tp", schema)
        self.assertNotIn("eval2_fp", schema)
        self.assertNotIn("eval2_fn", schema)
        self.assertNotIn(gt_eval_field2, schema)
        self.assertNotIn(gt_eval_field2 + "_id", schema)
        self.assertNotIn(gt_eval_field2 + "_iou", schema)
        self.assertNotIn(pred_eval_field2, schema)
        self.assertNotIn(pred_eval_field2 + "_id", schema)
        self.assertNotIn(pred_eval_field2 + "_iou", schema)

        # Test non-classwise evaluation (including missing data)

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

        schema = view.get_field_schema(flat=True)

        self.assertIn("ground_truth", schema)
        self.assertIn("ground_truth.detections.eval", schema)
        self.assertIn("ground_truth.detections.eval_id", schema)
        self.assertIn("ground_truth.detections.eval_iou", schema)

        self.assertIn("predictions", schema)
        self.assertIn("predictions.detections.eval", schema)
        self.assertIn("predictions.detections.eval_id", schema)
        self.assertIn("predictions.detections.eval_iou", schema)

        self.assertNotIn("predictions2", schema)
        self.assertNotIn("ground_truth.detections.eval2", schema)
        self.assertNotIn("ground_truth.detections.eval2_id", schema)
        self.assertNotIn("ground_truth.detections.eval2_iou", schema)

        self.assertNotIn("eval2_tp", schema)
        self.assertNotIn("eval2_fp", schema)
        self.assertNotIn("eval2_fn", schema)

        self.assertEqual(view.distinct("ground_truth.detections.eval2"), [])

        sample = view.last()
        detection = sample["ground_truth"].detections[0]

        self.assertIsNotNone(detection["eval"])

        with self.assertRaises(KeyError):
            detection["eval2"]

    @drop_datasets
    def test_evaluate_detections_embedded_fields(self):
        dataset = self._make_detections_dataset()

        dataset.add_sample_field(
            "embedded",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )

        dataset.rename_sample_field("predictions", "embedded.predictions")
        dataset.rename_sample_field("ground_truth", "embedded.ground_truth")

        _, gt_eval_field = dataset._get_label_field_path(
            "embedded.ground_truth", "eval"
        )
        _, pred_eval_field = dataset._get_label_field_path(
            "embedded.predictions", "eval"
        )

        results = dataset.evaluate_detections(
            "embedded.predictions",
            gt_field="embedded.ground_truth",
            eval_key="eval",
            method="coco",
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("eval_tp", schema)
        self.assertIn("eval_fp", schema)
        self.assertIn("eval_fn", schema)
        self.assertIn(gt_eval_field, schema)
        self.assertIn(gt_eval_field + "_id", schema)
        self.assertIn(gt_eval_field + "_iou", schema)
        self.assertIn(pred_eval_field, schema)
        self.assertIn(pred_eval_field + "_id", schema)
        self.assertIn(pred_eval_field + "_iou", schema)

    def test_custom_detection_evaluation(self):
        dataset = self._make_detections_dataset()

        dataset.evaluate_detections(
            "predictions",
            gt_field="ground_truth",
            method=CustomDetectionEvaluationConfig,
            eval_key="custom",
        )

        dataset.clear_cache()

        info = dataset.get_evaluation_info("custom")
        self.assertEqual(type(info.config), CustomDetectionEvaluationConfig)

        results = dataset.load_evaluation_results("custom")
        self.assertEqual(type(results), foud.DetectionResults)

        delattr(sys.modules[__name__], "CustomDetectionEvaluationConfig")
        delattr(sys.modules[__name__], "CustomDetectionEvaluation")
        dataset.clear_cache()

        # Should fallback to base class
        info = dataset.get_evaluation_info("custom")
        self.assertEqual(type(info.config), foud.DetectionEvaluationConfig)

        results = dataset.load_evaluation_results("custom")
        self.assertEqual(type(results), foud.DetectionResults)


class BoxesTests(unittest.TestCase):
    def _make_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="image1.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.11, 0.11, 0.39, 0.39],
                    ),
                ]
            ),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        confidence=0.9,
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.11, 0.11, 0.39, 0.39],
                        confidence=0.9,
                    ),
                ]
            ),
        )
        sample2 = fo.Sample(filepath="image2.jpg")

        dataset.add_samples([sample1, sample2])

        return dataset

    def test_compute_max_ious(self):
        dataset = self._make_dataset()

        foui.compute_max_ious(
            dataset,
            "ground_truth",
            iou_attr="max_iou",
        )
        bounds1 = dataset.bounds("ground_truth.detections.max_iou")

        self.assertIsNotNone(bounds1[0])
        self.assertIsNotNone(bounds1[1])

        foui.compute_max_ious(
            dataset,
            "predictions",
            other_field="ground_truth",
            iou_attr="max_iou",
        )
        bounds2 = dataset.bounds("predictions.detections.max_iou")

        self.assertIsNotNone(bounds2[0])
        self.assertIsNotNone(bounds2[1])

    def test_find_duplicates(self):
        dataset = self._make_dataset()

        dup_ids1 = foui.find_duplicates(
            dataset,
            "ground_truth",
            iou_thresh=0.9,
            method="simple",
        )

        self.assertEqual(len(dup_ids1), 1)

        dup_ids2 = foui.find_duplicates(
            dataset,
            "ground_truth",
            iou_thresh=0.9,
            method="greedy",
        )

        self.assertEqual(len(dup_ids2), 1)


class CuboidTests(unittest.TestCase):
    def _make_dataset(self):
        group = fo.Group()
        samples = [
            fo.Sample(
                filepath="image.png",
                group=group.element("image"),
            ),
            fo.Sample(
                filepath="point-cloud.pcd",
                group=group.element("pcd"),
            ),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)
        dataset.group_slice = "pcd"

        sample = dataset.first()

        # unit box at origin
        dims = np.array([1, 1, 1])
        loc = np.array([0, 0, 0])
        rot = np.array([0, 0, 0])
        sample["test1_box1"] = self._make_box(dims, loc, rot)

        # unit box offset from origin
        loc = np.array([2, 2, 2])
        sample["test1_box2"] = self._make_box(dims, loc, rot)

        # unit box away from origin
        loc = np.array([2, -3.5, 20])
        sample["test2_box1"] = self._make_box(dims, loc, rot)

        # x shift
        sample["test2_box2"] = self._make_box(
            dims, loc + np.array([0.5, 0.0, 0.0]), rot
        )

        # y shift
        sample["test2_box3"] = self._make_box(
            dims, loc + np.array([0.0, 0.5, 0.0]), rot
        )

        # z shift
        sample["test2_box4"] = self._make_box(
            dims, loc + np.array([0.0, 0.0, 0.5]), rot
        )

        dims = np.array([5.0, 10.0, 15.0])
        loc = np.array([1.0, 2.0, 3.0])
        sample["test3_box1"] = self._make_box(dims, loc, rot)

        dims = np.array([10.0, 5.0, 20.0])
        loc = np.array([4.0, 5.0, 6.0])
        sample["test3_box2"] = self._make_box(dims, loc, rot)

        dims = np.array([1.0, 1.0, 1.0])
        loc = np.array([0, 0, 0])
        rot = np.array([0, 0, 0])
        sample["test4_box1"] = self._make_box(dims, loc, rot)

        # unit box rotated by 45 degrees about each axis
        rot = np.array([np.pi / 4.0, 0.0, 0.0])
        sample["test4_box2"] = self._make_box(dims, loc, rot)
        sample.save()

        rot = np.array([0.0, np.pi / 4.0, 0.0])
        sample["test4_box3"] = self._make_box(dims, loc, rot)
        sample.save()

        rot = np.array([0.0, 0.0, np.pi / 4.0])
        sample["test4_box4"] = self._make_box(dims, loc, rot)
        sample.save()

        return dataset

    def _make_box(self, dimensions, location, rotation):
        return fo.Detections(
            detections=[
                fo.Detection(
                    dimensions=list(dimensions),
                    location=list(location),
                    rotation=list(rotation),
                )
            ]
        )

    def _check_iou(self, dataset, field1, field2, expected_iou):
        dets1 = dataset.first()[field1].detections
        dets2 = dataset.first()[field2].detections
        ious = foui.compute_ious(dets1, dets2, sparse=True)
        result = next(iter(ious.values()), [])

        if expected_iou == 0:
            self.assertTrue(len(result) == 0)
        else:
            _, actual_iou = result[0]
            self.assertTrue(np.isclose(actual_iou, expected_iou))

    @drop_datasets
    def test_non_overlapping_boxes(self):
        dataset = self._make_dataset()

        expected_iou = 0
        self._check_iou(dataset, "test1_box1", "test1_box2", expected_iou)

    @drop_datasets
    def test_shifted_boxes(self):
        dataset = self._make_dataset()

        expected_iou = 1.0 / 3.0
        self._check_iou(dataset, "test2_box1", "test2_box2", expected_iou)
        self._check_iou(dataset, "test2_box1", "test2_box3", expected_iou)
        self._check_iou(dataset, "test2_box1", "test2_box4", expected_iou)

    @drop_datasets
    def test_shifted_and_scaled_boxes(self):
        dataset = self._make_dataset()

        intersection = 4.5 * 4.5 * 14.5
        union = 1000.0 + 750.0 - intersection
        expected_iou = intersection / union
        self._check_iou(dataset, "test3_box1", "test3_box2", expected_iou)

    @drop_datasets
    def test_single_rotation(self):
        ## the two boxes form a star of David with octagonal overlap
        ## intersection is area of octagon
        dataset = self._make_dataset()

        side = 1.0 / (1 + np.sqrt(2))
        intersection = 2.0 * (1 + np.sqrt(2)) * side**2
        union = 2 - intersection
        expected_iou = intersection / union

        self._check_iou(dataset, "test4_box1", "test4_box2", expected_iou)
        self._check_iou(dataset, "test4_box1", "test4_box3", expected_iou)
        self._check_iou(dataset, "test4_box1", "test4_box4", expected_iou)


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

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_detections(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="coco",
            compute_mAP=True,
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("eval_tp", schema)
        self.assertIn("eval_fp", schema)
        self.assertIn("eval_fn", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("eval_tp", schema)
        self.assertIn("eval_fp", schema)
        self.assertIn("eval_fn", schema)
        self.assertIn("ground_truth.detections.eval", schema)
        self.assertIn("ground_truth.detections.eval_id", schema)
        self.assertIn("ground_truth.detections.eval_iou", schema)
        self.assertIn("predictions.detections.eval", schema)
        self.assertIn("predictions.detections.eval_id", schema)
        self.assertIn("predictions.detections.eval_iou", schema)

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        # Test classwise evaluation (including missing data)

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

        # Test rename

        dataset.rename_evaluation("eval", "eval2")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("frames.ground_truth.detections.eval"),
            [[], [None], [[None], None], [[None], [None]]],
        )
        self.assertListEqual(
            dataset.values("frames.predictions.detections.eval"),
            [[], [None], [None, [None]], [[None], [None]]],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("eval_tp", schema)
        self.assertNotIn("eval_fp", schema)
        self.assertNotIn("eval_fn", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertNotIn("eval_tp", schema)
        self.assertNotIn("eval_fp", schema)
        self.assertNotIn("eval_fn", schema)
        self.assertNotIn("ground_truth.detections.eval", schema)
        self.assertNotIn("ground_truth.detections.eval_id", schema)
        self.assertNotIn("ground_truth.detections.eval_iou", schema)
        self.assertNotIn("predictions.detections.eval", schema)
        self.assertNotIn("predictions.detections.eval_id", schema)
        self.assertNotIn("predictions.detections.eval_iou", schema)

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("frames.ground_truth.detections.eval2"),
            [[], [None], [["fn"], None], [["tp"], ["fn"]]],
        )
        self.assertListEqual(
            dataset.values("frames.predictions.detections.eval2"),
            [[], [None], [None, ["fp"]], [["tp"], ["fp"]]],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("eval2_tp", schema)
        self.assertIn("eval2_fp", schema)
        self.assertIn("eval2_fn", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("eval2_tp", schema)
        self.assertIn("eval2_fp", schema)
        self.assertIn("eval2_fn", schema)
        self.assertIn("ground_truth.detections.eval2", schema)
        self.assertIn("ground_truth.detections.eval2_id", schema)
        self.assertIn("ground_truth.detections.eval2_iou", schema)
        self.assertIn("predictions.detections.eval2", schema)
        self.assertIn("predictions.detections.eval2_id", schema)
        self.assertIn("predictions.detections.eval2_iou", schema)

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("frames.ground_truth.detections.eval2"),
            [[], [None], [[None], None], [[None], [None]]],
        )
        self.assertListEqual(
            dataset.values("frames.predictions.detections.eval2"),
            [[], [None], [None, [None]], [[None], [None]]],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("eval2_tp", schema)
        self.assertNotIn("eval2_fp", schema)
        self.assertNotIn("eval2_fn", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertNotIn("eval2_tp", schema)
        self.assertNotIn("eval2_fp", schema)
        self.assertNotIn("eval2_fn", schema)
        self.assertNotIn("ground_truth.detections.eval2", schema)
        self.assertNotIn("ground_truth.detections.eval2_id", schema)
        self.assertNotIn("ground_truth.detections.eval2_iou", schema)
        self.assertNotIn("predictions.detections.eval2", schema)
        self.assertNotIn("predictions.detections.eval2_id", schema)
        self.assertNotIn("predictions.detections.eval2_iou", schema)

        # Test non-classwise evaluation (including missing data)

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

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_detections(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="open-images",
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("eval_tp", schema)
        self.assertIn("eval_fp", schema)
        self.assertIn("eval_fn", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("eval_tp", schema)
        self.assertIn("eval_fp", schema)
        self.assertIn("eval_fn", schema)
        self.assertIn("ground_truth.detections.eval", schema)
        self.assertIn("ground_truth.detections.eval_id", schema)
        self.assertIn("ground_truth.detections.eval_iou", schema)
        self.assertIn("predictions.detections.eval", schema)
        self.assertIn("predictions.detections.eval_id", schema)
        self.assertIn("predictions.detections.eval_iou", schema)

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.report()
        results.print_report()
        results.mAP()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        # Test classwise evaluation (including missing data)

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

        # Test rename

        dataset.rename_evaluation("eval", "eval2")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("frames.ground_truth.detections.eval"),
            [[], [None], [[None], None], [[None], [None]]],
        )
        self.assertListEqual(
            dataset.values("frames.predictions.detections.eval"),
            [[], [None], [None, [None]], [[None], [None]]],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("eval_tp", schema)
        self.assertNotIn("eval_fp", schema)
        self.assertNotIn("eval_fn", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertNotIn("eval_tp", schema)
        self.assertNotIn("eval_fp", schema)
        self.assertNotIn("eval_fn", schema)
        self.assertNotIn("ground_truth.detections.eval", schema)
        self.assertNotIn("ground_truth.detections.eval_id", schema)
        self.assertNotIn("ground_truth.detections.eval_iou", schema)
        self.assertNotIn("predictions.detections.eval", schema)
        self.assertNotIn("predictions.detections.eval_id", schema)
        self.assertNotIn("predictions.detections.eval_iou", schema)

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("frames.ground_truth.detections.eval2"),
            [[], [None], [["fn"], None], [["tp"], ["fn"]]],
        )
        self.assertListEqual(
            dataset.values("frames.predictions.detections.eval2"),
            [[], [None], [None, ["fp"]], [["tp"], ["fp"]]],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("eval2_tp", schema)
        self.assertIn("eval2_fp", schema)
        self.assertIn("eval2_fn", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("eval2_tp", schema)
        self.assertIn("eval2_fp", schema)
        self.assertIn("eval2_fn", schema)
        self.assertIn("ground_truth.detections.eval2", schema)
        self.assertIn("ground_truth.detections.eval2_id", schema)
        self.assertIn("ground_truth.detections.eval2_iou", schema)
        self.assertIn("predictions.detections.eval2", schema)
        self.assertIn("predictions.detections.eval2_id", schema)
        self.assertIn("predictions.detections.eval2_iou", schema)

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values("frames.ground_truth.detections.eval2"),
            [[], [None], [[None], None], [[None], [None]]],
        )
        self.assertListEqual(
            dataset.values("frames.predictions.detections.eval2"),
            [[], [None], [None, [None]], [[None], [None]]],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("eval2_tp", schema)
        self.assertNotIn("eval2_fp", schema)
        self.assertNotIn("eval2_fn", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertNotIn("eval2_tp", schema)
        self.assertNotIn("eval2_fp", schema)
        self.assertNotIn("eval2_fn", schema)
        self.assertNotIn("ground_truth.detections.eval2", schema)
        self.assertNotIn("ground_truth.detections.eval2_id", schema)
        self.assertNotIn("ground_truth.detections.eval2_iou", schema)
        self.assertNotIn("predictions.detections.eval2", schema)
        self.assertNotIn("predictions.detections.eval2_id", schema)
        self.assertNotIn("predictions.detections.eval2_iou", schema)

        # Test non-classwise evaluation (including missing data)

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


class CustomSegmentationEvaluationConfig(fous.SimpleEvaluationConfig):
    pass


class CustomSegmentationEvaluation(fous.SimpleEvaluation):
    pass


class SegmentationTests(unittest.TestCase):
    def setUp(self):
        self._temp_dir = etau.TempDir()
        self._root_dir = self._temp_dir.__enter__()

    def tearDown(self):
        self._temp_dir.__exit__()

    def _new_dir(self):
        name = "".join(
            random.choice(string.ascii_lowercase + string.digits)
            for _ in range(24)
        )
        return os.path.join(self._root_dir, name)

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

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_segmentations(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="simple",
        )

        self.assertIn("eval_accuracy", dataset.get_field_schema())
        self.assertIn("eval_precision", dataset.get_field_schema())
        self.assertIn("eval_recall", dataset.get_field_schema())

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        # Test evaluation (including missing data)

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

        # Test rename

        dataset.rename_evaluation("eval", "eval2")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval_accuracy", dataset.get_field_schema())
        self.assertNotIn("eval_precision", dataset.get_field_schema())
        self.assertNotIn("eval_recall", dataset.get_field_schema())

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertIn("eval2_accuracy", dataset.get_field_schema())
        self.assertIn("eval2_precision", dataset.get_field_schema())
        self.assertIn("eval2_recall", dataset.get_field_schema())

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertNotIn("eval2_accuracy", dataset.get_field_schema())
        self.assertNotIn("eval2_precision", dataset.get_field_schema())
        self.assertNotIn("eval2_recall", dataset.get_field_schema())

    @drop_datasets
    def test_evaluate_segmentations_on_disk_simple(self):
        dataset = self._make_segmentation_dataset()

        # Convert to on-disk segmentations
        foul.export_segmentations(dataset, "ground_truth", self._new_dir())
        foul.export_segmentations(dataset, "predictions", self._new_dir())

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_segmentations(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="simple",
        )

        self.assertIn("eval_accuracy", dataset.get_field_schema())
        self.assertIn("eval_precision", dataset.get_field_schema())
        self.assertIn("eval_recall", dataset.get_field_schema())

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        # Test evaluation (including missing data)

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

        # Test rename

        dataset.rename_evaluation("eval", "eval2")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval_accuracy", dataset.get_field_schema())
        self.assertNotIn("eval_precision", dataset.get_field_schema())
        self.assertNotIn("eval_recall", dataset.get_field_schema())

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertIn("eval2_accuracy", dataset.get_field_schema())
        self.assertIn("eval2_precision", dataset.get_field_schema())
        self.assertIn("eval2_recall", dataset.get_field_schema())

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertNotIn("eval2_accuracy", dataset.get_field_schema())
        self.assertNotIn("eval2_precision", dataset.get_field_schema())
        self.assertNotIn("eval2_recall", dataset.get_field_schema())

    @drop_datasets
    def test_evaluate_segmentations_rgb(self):
        dataset = self._make_segmentation_dataset()

        # Use opposite case in `mask_targets` to test case-insensitivity
        targets_map = {0: "#000000", 1: "#FF6D04", 2: "#499cef"}
        mask_targets = {
            "#000000": "background",
            "#ff6d04": "cat",
            "#499CEF": "dog",
        }

        # Convert to RGB segmentations
        foul.transform_segmentations(dataset, "ground_truth", targets_map)
        foul.transform_segmentations(dataset, "predictions", targets_map)

        # Convert to on-disk segmentations
        foul.export_segmentations(dataset, "ground_truth", self._new_dir())
        foul.export_segmentations(dataset, "predictions", self._new_dir())

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_segmentations(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
            method="simple",
        )

        self.assertIn("eval_accuracy", dataset.get_field_schema())
        self.assertIn("eval_precision", dataset.get_field_schema())
        self.assertIn("eval_recall", dataset.get_field_schema())

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        # Test evaluation (including missing data)

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # suppress missing masks warning

            results = dataset.evaluate_segmentations(
                "predictions",
                gt_field="ground_truth",
                eval_key="eval",
                method="simple",
                mask_targets=mask_targets,
            )

        dataset.load_evaluation_view("eval")
        dataset.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 4)

        # rows = GT, cols = predicted, labels = [background, cat, dog]
        # Ordering is based on int representation of hex color strings
        actual = results.confusion_matrix()
        expected = np.array([[2, 1, 1], [1, 1, 0], [1, 0, 1]], dtype=int)

        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertIn("eval_accuracy", dataset.get_field_schema())
        self.assertIn("eval_precision", dataset.get_field_schema())
        self.assertIn("eval_recall", dataset.get_field_schema())

        # Test rename

        dataset.rename_evaluation("eval", "eval2")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval_accuracy", dataset.get_field_schema())
        self.assertNotIn("eval_precision", dataset.get_field_schema())
        self.assertNotIn("eval_recall", dataset.get_field_schema())

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertIn("eval2_accuracy", dataset.get_field_schema())
        self.assertIn("eval2_precision", dataset.get_field_schema())
        self.assertIn("eval2_recall", dataset.get_field_schema())

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertNotIn("eval2_accuracy", dataset.get_field_schema())
        self.assertNotIn("eval2_precision", dataset.get_field_schema())
        self.assertNotIn("eval2_recall", dataset.get_field_schema())

    @drop_datasets
    def test_evaluate_segmentations_embedded_fields(self):
        dataset = self._make_segmentation_dataset()

        dataset.add_sample_field(
            "embedded",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )

        dataset.rename_sample_field("predictions", "embedded.predictions")
        dataset.rename_sample_field("ground_truth", "embedded.ground_truth")

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # suppress missing masks warning

            results = dataset.evaluate_segmentations(
                "embedded.predictions",
                gt_field="embedded.ground_truth",
                eval_key="eval",
                method="simple",
                mask_targets={0: "background", 1: "cat", 2: "dog"},
            )

        results.report()
        results.print_report()

    def test_custom_segmentation_evaluation(self):
        dataset = self._make_segmentation_dataset()

        dataset.evaluate_segmentations(
            "predictions",
            gt_field="ground_truth",
            method=CustomSegmentationEvaluationConfig,
            eval_key="custom",
        )

        dataset.clear_cache()

        info = dataset.get_evaluation_info("custom")
        self.assertEqual(type(info.config), CustomSegmentationEvaluationConfig)

        results = dataset.load_evaluation_results("custom")
        self.assertEqual(type(results), fous.SegmentationResults)

        delattr(sys.modules[__name__], "CustomSegmentationEvaluationConfig")
        delattr(sys.modules[__name__], "CustomSegmentationEvaluation")
        dataset.clear_cache()

        # Should fallback to base class
        info = dataset.get_evaluation_info("custom")
        self.assertEqual(type(info.config), fous.SegmentationEvaluationConfig)

        results = dataset.load_evaluation_results("custom")
        self.assertEqual(type(results), fous.SegmentationResults)


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

        # Test empty view

        empty_view = dataset.limit(0)
        self.assertEqual(len(empty_view), 0)

        results = empty_view.evaluate_segmentations(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="eval",
            method="simple",
        )

        self.assertIn("eval_accuracy", dataset.get_field_schema())
        self.assertIn("eval_accuracy", dataset.get_frame_field_schema())
        self.assertIn("eval_precision", dataset.get_field_schema())
        self.assertIn("eval_precision", dataset.get_frame_field_schema())
        self.assertIn("eval_recall", dataset.get_field_schema())
        self.assertIn("eval_recall", dataset.get_frame_field_schema())

        empty_view.load_evaluation_view("eval")
        empty_view.get_evaluation_info("eval")

        results.report()
        results.print_report()

        metrics = results.metrics()
        self.assertEqual(metrics["support"], 0)

        actual = results.confusion_matrix()
        self.assertEqual(actual.shape, (0, 0))

        # Test evaluation (including missing data)

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

        # Test rename

        dataset.rename_evaluation("eval", "eval2")

        self.assertNotIn("eval", dataset.list_evaluations())
        self.assertNotIn("eval_accuracy", dataset.get_field_schema())
        self.assertNotIn("eval_accuracy", dataset.get_frame_field_schema())
        self.assertNotIn("eval_precision", dataset.get_field_schema())
        self.assertNotIn("eval_precision", dataset.get_frame_field_schema())
        self.assertNotIn("eval_recall", dataset.get_field_schema())
        self.assertNotIn("eval_recall", dataset.get_frame_field_schema())

        self.assertIn("eval2", dataset.list_evaluations())
        self.assertIn("eval2_accuracy", dataset.get_field_schema())
        self.assertIn("eval2_accuracy", dataset.get_frame_field_schema())
        self.assertIn("eval2_precision", dataset.get_field_schema())
        self.assertIn("eval2_precision", dataset.get_frame_field_schema())
        self.assertIn("eval2_recall", dataset.get_field_schema())
        self.assertIn("eval2_recall", dataset.get_frame_field_schema())

        # Test deletion

        dataset.delete_evaluation("eval2")

        self.assertNotIn("eval2", dataset.list_evaluations())
        self.assertNotIn("eval2_accuracy", dataset.get_field_schema())
        self.assertNotIn("eval2_accuracy", dataset.get_frame_field_schema())
        self.assertNotIn("eval2_precision", dataset.get_field_schema())
        self.assertNotIn("eval2_precision", dataset.get_frame_field_schema())
        self.assertNotIn("eval2_recall", dataset.get_field_schema())
        self.assertNotIn("eval2_recall", dataset.get_frame_field_schema())


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
