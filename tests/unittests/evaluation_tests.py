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
import tempfile
import shutil
import time

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

from .decorators import drop_datasets


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
                        label="cat",
                        bounding_box=[0.6, 0.6, 0.4, 0.4],
                        confidence=0.9,
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        confidence=0.9,
                    ),
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
                        label="cat",
                        bounding_box=[0.6, 0.6, 0.4, 0.4],
                        confidence=0.9,
                        mask=np.full((8, 8), True),
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        confidence=0.9,
                        mask=np.full((8, 8), True),
                    ),
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
                        label="cat",
                        points=[
                            [(0.6, 0.6), (0.6, 1.0), (1.0, 1.0), (1.0, 0.6)]
                        ],
                        filled=True,
                        confidence=0.9,
                    ),
                    fo.Polyline(
                        label="dog",
                        points=[
                            [(0.1, 0.1), (0.1, 0.4), (0.4, 0.4), (0.4, 0.1)]
                        ],
                        filled=True,
                        confidence=0.9,
                    ),
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
        expected = np.array([[1, 0, 2], [0, 0, 0], [2, 1, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values(gt_eval_field),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field),
            [None, None, ["fp"], ["tp"], ["fp", "fp"]],
        )
        self.assertIn("eval_tp", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_tp"), [0, 0, 0, 1, 0])
        self.assertIn("eval_fp", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_fp"), [0, 0, 1, 0, 2])
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
            [None, None, [None], [None], [None, None]],
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
            [None, None, ["fp"], ["tp"], ["fp", "fp"]],
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
            [None, None, [None], [None], [None, None]],
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
        expected = np.array([[1, 1, 1], [0, 0, 0], [2, 0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertListEqual(
            dataset.values(gt_eval_field),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field),
            [None, None, ["fp"], ["tp"], ["fp", "fp"]],
        )
        self.assertListEqual(dataset.values("eval_tp"), [0, 0, 0, 1, 0])
        self.assertListEqual(dataset.values("eval_fp"), [0, 0, 1, 0, 2])
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
        expected = np.array([[1, 0, 2], [0, 0, 0], [2, 1, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertIn("eval", dataset.list_evaluations())
        self.assertListEqual(
            dataset.values(gt_eval_field),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field),
            [None, None, ["fp"], ["tp"], ["fp", "fp"]],
        )
        self.assertIn("eval_tp", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_tp"), [0, 0, 0, 1, 0])
        self.assertIn("eval_fp", dataset.get_field_schema())
        self.assertListEqual(dataset.values("eval_fp"), [0, 0, 1, 0, 2])
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
            [None, None, [None], [None], [None, None]],
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
            [None, None, ["fp"], ["tp"], ["fp", "fp"]],
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
            [None, None, [None], [None], [None, None]],
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
        expected = np.array([[1, 1, 1], [0, 0, 0], [2, 0, 0]], dtype=int)
        self.assertEqual(actual.shape, expected.shape)
        self.assertTrue((actual == expected).all())

        self.assertListEqual(
            dataset.values(gt_eval_field),
            [None, ["fn"], None, ["tp"], ["fn"]],
        )
        self.assertListEqual(
            dataset.values(pred_eval_field),
            [None, None, ["fp"], ["tp"], ["fp", "fp"]],
        )
        self.assertListEqual(dataset.values("eval_tp"), [0, 0, 0, 1, 0])
        self.assertListEqual(dataset.values("eval_fp"), [0, 0, 1, 0, 2])
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


class EvaluateSegmentationMultiWorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create a temporary dataset
        cls.dataset = fo.Dataset("test-evaluate-segmentation-multi")

        # Add some sample data (25 samples to better test performance)
        for i in range(25):
            sample = fo.Sample(filepath=f"test_{i}.jpg")

            # Add ground truth segmentations
            sample["ground_truth"] = fo.Segmentation(
                mask=np.zeros((100, 100), dtype=np.uint8)
            )
            # Set some pixels to class 1
            sample["ground_truth"].mask[20:40, 20:40] = 1

            # Add predicted segmentations
            sample["predictions"] = fo.Segmentation(
                mask=np.zeros((100, 100), dtype=np.uint8)
            )
            # Set similar but slightly different pixels to class 1
            sample["predictions"].mask[25:45, 25:45] = 1

            cls.dataset.add_sample(sample)

        # Create temporary directory for test outputs
        cls.temp_dir = tempfile.mkdtemp()

    @classmethod
    def tearDownClass(cls):
        # Clean up the dataset
        if hasattr(cls, "dataset"):
            try:
                cls.dataset.delete()
            except:
                pass

        # Remove temporary directory
        if hasattr(cls, "temp_dir"):
            shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def test_evaluate_segmentations_single_worker(self):
        """Test running segmentation evaluation."""
        results = self.dataset.evaluate_segmentations(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval_single",
            method="simple",
        )

        # Check that results are valid
        self.assertTrue(hasattr(results, "metrics"))

        # Check that metrics are available and have expected values
        metrics = results.metrics()
        self.assertIn("accuracy", metrics)
        self.assertIn("precision", metrics)
        self.assertIn("recall", metrics)
        self.assertIn("fscore", metrics)
        self.assertIn("support", metrics)

        # All metrics should be between 0 and 1 (except support)
        self.assertTrue(0 <= metrics["accuracy"] <= 1)
        self.assertTrue(0 <= metrics["precision"] <= 1)
        self.assertTrue(0 <= metrics["recall"] <= 1)
        self.assertTrue(0 <= metrics["fscore"] <= 1)

        # Support should be positive (pixels count)
        self.assertTrue(metrics["support"] > 0)

    def test_multi_worker_configurations(self):
        """Test different worker counts, parallelize methods, and batch methods."""
        # Define test configurations
        configs = [
            # workers, parallelize_method, batch_method
            (2, "process", "id"),
            (2, "process", "slice"),
            (2, "thread", "id"),
            (2, "thread", "slice"),
            (4, "process", "id"),
            (4, "process", "slice"),
            (4, "thread", "id"),
            (4, "thread", "slice"),
        ]

        results_dict = {}

        # Run evaluations with different configurations
        for i, (workers, parallelize_method, batch_method) in enumerate(
            configs
        ):
            eval_key = f"eval_config_{i}"

            print(
                f"\nTesting with {workers} workers, {parallelize_method} parallelize method, {batch_method} batch method"
            )

            results = self.dataset.evaluate_segmentations(
                "predictions",
                gt_field="ground_truth",
                eval_key=eval_key,
                method="simple",
                workers=workers,
                parallelize_method=parallelize_method,
                batch_method=batch_method,
            )

            # Store results for comparison
            results_dict[eval_key] = results.metrics()

            # Check that results are valid
            self.assertTrue(hasattr(results, "metrics"))
            metrics = results.metrics()

            # Check that metrics are available
            self.assertIn("accuracy", metrics)
            self.assertIn("precision", metrics)
            self.assertIn("recall", metrics)

            # All metrics should be between 0 and 1 (except support)
            self.assertTrue(0 <= metrics["accuracy"] <= 1)
            self.assertTrue(0 <= metrics["precision"] <= 1)
            self.assertTrue(0 <= metrics["recall"] <= 1)

        # Verify consistency of results across all configurations
        baseline_metrics = results_dict["eval_config_0"]
        for eval_key, metrics in results_dict.items():
            if eval_key == "eval_config_0":
                continue

            print(f"Comparing baseline to {eval_key}")
            for metric in ["accuracy", "precision", "recall", "fscore"]:
                # Allow for small floating-point differences
                self.assertAlmostEqual(
                    float(baseline_metrics[metric]),
                    float(metrics[metric]),
                    places=5,
                    msg=f"{metric} differs between configurations",
                )

    def test_results_consistency(self):
        """Test that results are consistent across multiple runs."""
        # First evaluation
        results1 = self.dataset.evaluate_segmentations(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval_consistency1",
            method="simple",
            workers=2,
        )

        # Second evaluation
        results2 = self.dataset.evaluate_segmentations(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval_consistency2",
            method="simple",
            workers=2,
        )

        # Get metrics from both results
        metrics1 = results1.metrics()
        metrics2 = results2.metrics()

        # Check that metrics are consistent
        for metric in ["accuracy", "precision", "recall", "fscore", "support"]:
            self.assertAlmostEqual(
                float(metrics1[metric]), float(metrics2[metric]), places=5
            )

    def test_map_samples_validation(self):
        """Test validation of map_samples parameters when evaluating segmentations."""
        import unittest.mock as mock

        # Mock the map_samples method to track calls
        original_map_samples = fo.Dataset.map_samples

        # Keep track of calls to map_samples
        map_samples_calls = []

        def mock_map_samples(self, *args, **kwargs):
            # Record the call
            map_samples_calls.append(kwargs)
            # Call the original function
            return original_map_samples(self, *args, **kwargs)

        try:
            # Patch the map_samples method
            with mock.patch.object(
                fo.Dataset, "map_samples", new=mock_map_samples
            ):
                # Test with different worker counts
                for worker_count in [1, 2, 4]:
                    # Reset tracking
                    map_samples_calls.clear()

                    # Run evaluation with specific worker count
                    self.dataset.evaluate_segmentations(
                        "predictions",
                        gt_field="ground_truth",
                        eval_key=f"eval_validate_workers_{worker_count}",
                        method="simple",
                        workers=worker_count,
                    )

                    # Verify that map_samples was called
                    self.assertTrue(
                        len(map_samples_calls) > 0,
                        f"map_samples was not called when workers={worker_count}",
                    )

                    # Verify workers parameter was correctly passed
                    self.assertEqual(
                        map_samples_calls[0].get("workers"),
                        worker_count,
                        f"map_samples was called with incorrect workers value. Expected {worker_count}, got {map_samples_calls[0].get('workers')}",
                    )

                # Test different parallelize methods
                for method in ["process", "thread"]:
                    # Reset tracking
                    map_samples_calls.clear()

                    # Run evaluation with specific parallelize method
                    self.dataset.evaluate_segmentations(
                        "predictions",
                        gt_field="ground_truth",
                        eval_key=f"eval_validate_method_{method}",
                        method="simple",
                        workers=2,
                        parallelize_method=method,
                    )

                    # Verify that map_samples was called
                    self.assertTrue(
                        len(map_samples_calls) > 0,
                        f"map_samples was not called when parallelize_method={method}",
                    )

                    # Verify parallelize_method parameter was correctly passed
                    self.assertEqual(
                        map_samples_calls[0].get("parallelize_method"),
                        method,
                        f"map_samples was called with incorrect parallelize_method value. Expected {method}, got {map_samples_calls[0].get('parallelize_method')}",
                    )

                # Test different batch methods
                for batch_method in ["id", "slice"]:
                    # Reset tracking
                    map_samples_calls.clear()

                    # Run evaluation with specific batch method
                    self.dataset.evaluate_segmentations(
                        "predictions",
                        gt_field="ground_truth",
                        eval_key=f"eval_validate_batch_{batch_method}",
                        method="simple",
                        workers=2,
                        batch_method=batch_method,
                    )

                    # Verify that map_samples was called
                    self.assertTrue(
                        len(map_samples_calls) > 0,
                        f"map_samples was not called when batch_method={batch_method}",
                    )

                    # Verify batch_method parameter was correctly passed
                    self.assertEqual(
                        map_samples_calls[0].get("batch_method"),
                        batch_method,
                        f"map_samples was called with incorrect batch_method value. Expected {batch_method}, got {map_samples_calls[0].get('batch_method')}",
                    )

                # Finally, test a combination of all parameters
                map_samples_calls.clear()

                # Define test parameters
                test_workers = 4
                test_parallelize = "thread"
                test_batch = "slice"

                self.dataset.evaluate_segmentations(
                    "predictions",
                    gt_field="ground_truth",
                    eval_key="eval_validate_all",
                    method="simple",
                    workers=test_workers,
                    parallelize_method=test_parallelize,
                    batch_method=test_batch,
                )

                # Verify that map_samples was called
                self.assertTrue(
                    len(map_samples_calls) > 0,
                    "map_samples was not called with combined parameters",
                )

                # Check all parameters were passed correctly
                self.assertEqual(
                    map_samples_calls[0].get("workers"),
                    test_workers,
                    f"workers parameter not passed correctly. Expected {test_workers}, got {map_samples_calls[0].get('workers')}",
                )
                self.assertEqual(
                    map_samples_calls[0].get("parallelize_method"),
                    test_parallelize,
                    f"parallelize_method parameter not passed correctly. Expected {test_parallelize}, got {map_samples_calls[0].get('parallelize_method')}",
                )
                self.assertEqual(
                    map_samples_calls[0].get("batch_method"),
                    test_batch,
                    f"batch_method parameter not passed correctly. Expected {test_batch}, got {map_samples_calls[0].get('batch_method')}",
                )
        finally:
            # No need to restore map_samples since we used a context manager
            pass


class EvaluateSegmentationBasicTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create a temporary dataset
        cls.dataset = fo.Dataset("test-evaluate-segmentation-basic")

        # Add some sample data
        for i in range(10):
            sample = fo.Sample(filepath=f"test_{i}.jpg")

            # Add ground truth segmentations
            sample["ground_truth"] = fo.Segmentation(
                mask=np.zeros((100, 100), dtype=np.uint8)
            )
            # Set some pixels to class 1
            sample["ground_truth"].mask[20:40, 20:40] = 1

            # Add predicted segmentations
            sample["predictions"] = fo.Segmentation(
                mask=np.zeros((100, 100), dtype=np.uint8)
            )
            # Set similar but slightly different pixels to class 1
            sample["predictions"].mask[25:45, 25:45] = 1

            cls.dataset.add_sample(sample)

        # Create temporary directory for test outputs
        cls.temp_dir = tempfile.mkdtemp()

    @classmethod
    def tearDownClass(cls):
        # Clean up the dataset
        if hasattr(cls, "dataset"):
            try:
                cls.dataset.delete()
            except:
                pass

        # Remove temporary directory
        if hasattr(cls, "temp_dir"):
            shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def test_evaluate_segmentations_simple(self):
        """Test basic segmentation evaluation."""
        results = self.dataset.evaluate_segmentations(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval_basic",
            method="simple",
        )

        # Check that results are valid
        self.assertTrue(hasattr(results, "metrics"))

        # Check that metrics are available and have expected values
        metrics = results.metrics()
        self.assertIn("accuracy", metrics)
        self.assertIn("precision", metrics)
        self.assertIn("recall", metrics)
        self.assertIn("fscore", metrics)
        self.assertIn("support", metrics)

        # All metrics should be between 0 and 1 (except support)
        self.assertTrue(0 <= metrics["accuracy"] <= 1)
        self.assertTrue(0 <= metrics["precision"] <= 1)
        self.assertTrue(0 <= metrics["recall"] <= 1)
        self.assertTrue(0 <= metrics["fscore"] <= 1)

        # Support should be positive (pixels count)
        self.assertTrue(metrics["support"] > 0)

    def test_results_consistency(self):
        """Test that results are consistent across multiple runs."""
        # First evaluation
        results1 = self.dataset.evaluate_segmentations(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval_consistency1",
            method="simple",
        )

        # Second evaluation
        results2 = self.dataset.evaluate_segmentations(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval_consistency2",
            method="simple",
        )

        # Get metrics from both results
        metrics1 = results1.metrics()
        metrics2 = results2.metrics()

        # Check that metrics are consistent
        for metric in ["accuracy", "precision", "recall", "fscore", "support"]:
            self.assertAlmostEqual(
                float(metrics1[metric]), float(metrics2[metric]), places=5
            )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
