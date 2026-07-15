"""
FiftyOne VQA dataset format unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import tempfile
import unittest

import numpy as np

import eta.core.serial as etas

import fiftyone as fo
import fiftyone.utils.image as foui

from decorators import drop_datasets


def _write_image(path):
    foui.write(np.random.randint(255, size=(4, 4, 3), dtype=np.uint8), path)


def _make_dataset(tmp_dir):
    images_dir = os.path.join(tmp_dir, "images")
    os.makedirs(images_dir, exist_ok=True)

    filepaths = []
    for i in range(2):
        filepath = os.path.join(images_dir, "image%d.png" % i)
        _write_image(filepath)
        filepaths.append(filepath)

    dataset = fo.Dataset()
    dataset.add_samples(
        [
            fo.Sample(
                filepath=filepaths[0],
                questions=fo.VQAs(
                    vqas=[
                        fo.VQA(
                            question="Is there a cat?",
                            answer="yes",
                            answers=["yes", "yes", "no"],
                            question_id="q1",
                            question_type="is there",
                            answer_type="yes/no",
                        ),
                        fo.VQA(
                            question="Which animal?",
                            answer="a cat",
                            choices=["a cat", "a dog"],
                            question_id="q2",
                            answer_index=0,
                        ),
                    ]
                ),
            ),
            fo.Sample(
                filepath=filepaths[1],
                questions=fo.VQAs(
                    vqas=[
                        fo.VQA(
                            question="What color?",
                            answer="red",
                            question_id="q3",
                            confidence=0.9,
                        )
                    ]
                ),
            ),
        ]
    )
    return dataset


class VQADatasetTests(unittest.TestCase):
    @drop_datasets
    def test_round_trip_grouped(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            dataset = _make_dataset(tmp_dir)
            export_dir = os.path.join(tmp_dir, "export")

            dataset.export(
                export_dir=export_dir,
                dataset_type=fo.types.VQADataset,
                label_field="questions",
            )

            self.assertTrue(
                os.path.isfile(os.path.join(export_dir, "labels.json"))
            )

            dataset2 = fo.Dataset.from_dir(
                dataset_dir=export_dir,
                dataset_type=fo.types.VQADataset,
                label_field="questions",
            )

            self.assertEqual(len(dataset2), 2)

            vqas = {
                v.question_id: v
                for sample in dataset2
                for v in sample["questions"].vqas
            }

            self.assertEqual(len(vqas), 3)
            self.assertEqual(vqas["q1"].answer, "yes")
            self.assertListEqual(vqas["q1"].answers, ["yes", "yes", "no"])
            self.assertEqual(vqas["q1"].question_type, "is there")
            self.assertListEqual(vqas["q2"].choices, ["a cat", "a dog"])
            self.assertEqual(vqas["q2"]["answer_index"], 0)
            self.assertAlmostEqual(vqas["q3"].confidence, 0.9)

    @drop_datasets
    def test_import_ungrouped(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            dataset = _make_dataset(tmp_dir)
            export_dir = os.path.join(tmp_dir, "export")

            dataset.export(
                export_dir=export_dir,
                dataset_type=fo.types.VQADataset,
                label_field="questions",
            )

            dataset2 = fo.Dataset.from_dir(
                dataset_dir=export_dir,
                dataset_type=fo.types.VQADataset,
                label_field="question",
                group_questions=False,
            )

            self.assertEqual(len(dataset2), 3)
            self.assertIsInstance(dataset2.first()["question"], fo.VQA)

            # two of the three samples share an image
            self.assertEqual(len(set(dataset2.values("filepath"))), 2)

    @drop_datasets
    def test_answer_index_mapping(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            data_dir = os.path.join(tmp_dir, "data")
            os.makedirs(data_dir)
            _write_image(os.path.join(data_dir, "image.png"))

            labels = {
                "questions": [
                    {
                        "image": "image",
                        "question": "Which animal?",
                        "question_id": 42,
                        "choices": ["a cat", "a dog"],
                        "answer_index": 1,
                    }
                ]
            }
            etas.write_json(labels, os.path.join(tmp_dir, "labels.json"))

            dataset = fo.Dataset.from_dir(
                dataset_dir=tmp_dir,
                dataset_type=fo.types.VQADataset,
                label_field="questions",
            )

            self.assertEqual(len(dataset), 1)

            vqa = dataset.first()["questions"].vqas[0]

            self.assertEqual(vqa.answer, "a dog")
            self.assertEqual(vqa["answer_index"], 1)
            self.assertEqual(vqa.question_id, "42")


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
