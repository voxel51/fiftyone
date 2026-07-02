"""
FiftyOne VQA evaluation unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
from fiftyone import ViewField as F
from fiftyone.utils.eval.vqa import VQAResults, _normalize_answer

from decorators import drop_datasets


class VQANormalizerTests(unittest.TestCase):
    def test_normalize_answer(self):
        # golden cases pinned to the official VQAv2 normalizer
        # (github.com/GT-Vision-Lab/VQA vqaEval.py)
        cases = [
            ("1,000", "1000"),  # comma removed, no space inserted
            ("4.5", "4.5"),  # decimal point preserved
            ("5.", "5"),  # trailing period stripped
            ("The cat", "cat"),  # article dropped + lowercased
            ("black and white", "black and white"),  # "and" retained
            ("Two", "2"),  # number-word mapped
            ("dont know", "don't know"),  # contraction expanded
            ("yes!", "yes"),  # punct replaced with space, then split
            ("a man's hat", "man's hat"),  # apostrophe untouched
        ]
        for in_answer, expected in cases:
            self.assertEqual(_normalize_answer(in_answer), expected)


def _make_vqas_dataset():
    dataset = fo.Dataset()
    dataset.add_samples(
        [
            fo.Sample(
                filepath="image1.jpg",
                ground_truth=fo.VQAs(
                    vqas=[
                        fo.VQA(
                            question="Is there a cat?",
                            answer="yes",
                            question_id="q1",
                            question_type="is there",
                            answer_type="yes/no",
                        ),
                        fo.VQA(
                            question="How many cats?",
                            answer="2",
                            question_id="q2",
                            question_type="how many",
                            answer_type="number",
                        ),
                    ]
                ),
                predictions=fo.VQAs(
                    vqas=[
                        # order swapped; matching must go by question_id
                        fo.VQA(
                            answer="two",
                            question_id="q2",
                            confidence=0.8,
                        ),
                        fo.VQA(
                            answer="yes",
                            question_id="q1",
                            confidence=0.9,
                        ),
                    ]
                ),
            ),
            fo.Sample(
                filepath="image2.jpg",
                ground_truth=fo.VQAs(
                    vqas=[
                        # no question_id; matched positionally
                        fo.VQA(question="What color?", answer="red"),
                        # unmatched gt; scores 0
                        fo.VQA(
                            question="Is it raining?",
                            answer="no",
                            question_id="q4",
                        ),
                    ]
                ),
                predictions=fo.VQAs(vqas=[fo.VQA(answer="blue")]),
            ),
        ]
    )
    return dataset


class VQAEvaluationTests(unittest.TestCase):
    @drop_datasets
    def test_evaluate_vqas_exact(self):
        dataset = _make_vqas_dataset()

        results = dataset.evaluate_vqa(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
        )

        self.assertIsInstance(results, VQAResults)

        # sample 1: both correct ("two" -> "2" via normalizer);
        # sample 2: both wrong
        self.assertAlmostEqual(results.accuracy, 0.5)
        self.assertListEqual(dataset.values("eval"), [1.0, 0.0])

        sample = dataset.first()
        for vqa in sample["predictions"].vqas:
            self.assertTrue(vqa["eval"])
            self.assertIsNotNone(vqa["eval_id"])

        # matched counterpart ids line up
        gts = {v.question_id: v for v in sample["ground_truth"].vqas}
        preds = {v.question_id: v for v in sample["predictions"].vqas}
        for qid in ("q1", "q2"):
            self.assertEqual(preds[qid]["eval_id"], gts[qid].id)
            self.assertEqual(gts[qid]["eval_id"], preds[qid].id)

        # error triage: filter to incorrect predictions
        view = dataset.filter_labels("predictions", F("eval") == False)
        self.assertEqual(view.count("predictions.vqas"), 1)

        # breakdowns
        d = results.breakdown(by="question_type")
        self.assertAlmostEqual(d["is there"], 1.0)
        self.assertAlmostEqual(d["how many"], 1.0)

        # inherited classification machinery works
        self.assertIn("accuracy", results.metrics())
        results.report()

    @drop_datasets
    def test_evaluate_vqa_single(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="image1.jpg",
                    ground_truth=fo.VQA(question="How many?", answer="Two"),
                    predictions=fo.VQA(answer="2"),
                ),
                fo.Sample(
                    filepath="image2.jpg",
                    ground_truth=fo.VQA(question="What color?", answer="red"),
                    predictions=fo.VQA(answer="blue"),
                ),
            ]
        )

        results = dataset.evaluate_vqa(
            "predictions", eval_key="eval", method="exact"
        )

        self.assertAlmostEqual(results.accuracy, 0.5)
        self.assertListEqual(dataset.values("eval"), [1.0, 0.0])
        self.assertTrue(dataset.first()["predictions"]["eval"])

    @drop_datasets
    def test_evaluate_vqa_soft_accuracy(self):
        # official 10-choose-9 protocol, min(1, matches / 3)
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="image1.jpg",
                    ground_truth=fo.VQAs(
                        vqas=[
                            fo.VQA(
                                question="Is there a cat?",
                                answers=["yes"] * 2 + ["no"] * 8,
                                question_id="q1",
                            ),
                            # identical references; normalization skipped
                            # and duplicate answers must not be dropped
                            # by the holdout loop
                            fo.VQA(
                                question="How many?",
                                answers=["2"] * 10,
                                question_id="q2",
                            ),
                        ]
                    ),
                    predictions=fo.VQAs(
                        vqas=[
                            fo.VQA(answer="yes", question_id="q1"),
                            fo.VQA(answer="2", question_id="q2"),
                        ]
                    ),
                ),
            ]
        )

        results = dataset.evaluate_vqa(
            "predictions", eval_key="eval", method="vqa"
        )

        sample = dataset.first()
        scores = {v.question_id: v["eval"] for v in sample["predictions"].vqas}

        # held-out "yes" (2x): 1 other "yes" -> 1/3
        # held-out "no" (8x): 2 other "yes" -> 2/3
        self.assertAlmostEqual(scores["q1"], 0.6)
        self.assertAlmostEqual(scores["q2"], 1.0)
        self.assertAlmostEqual(sample["eval"], 0.8)

    @drop_datasets
    def test_evaluation_lifecycle(self):
        dataset = _make_vqas_dataset()
        dataset.evaluate_vqa("predictions", eval_key="eval")

        self.assertIn("eval", dataset.list_evaluations())

        info = dataset.get_evaluation_info("eval")
        self.assertEqual(info.config.type, "vqa")
        self.assertEqual(info.config.method, "exact")

        results = dataset.load_evaluation_results("eval")
        self.assertIsInstance(results, VQAResults)
        self.assertAlmostEqual(results.accuracy, 0.5)

        dataset.rename_evaluation("eval", "eval2")
        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("eval", schema)
        self.assertIn("eval2", schema)
        self.assertIn("predictions.vqas.eval2", schema)

        dataset.delete_evaluation("eval2")
        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("eval2", schema)
        self.assertNotIn("predictions.vqas.eval2", schema)
        self.assertNotIn("eval2", dataset.list_evaluations())


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
