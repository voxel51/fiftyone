"""
Undeclared field operator tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from bson import ObjectId
from mongoengine.errors import FieldDoesNotExist

import fiftyone as fo
import fiftyone.core.fields as fof

from decorators import drop_datasets  # pylint: disable=import-error
from plugins.operators.undeclared_fields import (  # pylint: disable=import-error
    declare_undeclared_fields,
    find_undeclared_fields,
    remove_undeclared_fields,
)


def _dataset():
    dataset = fo.Dataset()
    dataset.add_samples(
        [
            fo.Sample(
                filepath="/tmp/%d.jpg" % i,
                gt=fo.Detections(detections=[fo.Detection(label="cat")]),
                score=0.5,
            )
            for i in range(3)
        ]
    )
    return dataset


def _store(dataset, sample_id, **values):
    # what a run leaves behind when its field leaves the schema
    dataset._sample_collection.update_one(
        {"_id": ObjectId(sample_id)}, {"$set": values}
    )


def _load(dataset, sample_id):
    fo.Sample._reload_docs(dataset._sample_collection_name, hard=True)
    return dataset[sample_id]


class UndeclaredFieldsTests(unittest.TestCase):
    @drop_datasets
    def test_nothing_found_on_a_consistent_dataset(self):
        dataset = _dataset()
        self.assertEqual(find_undeclared_fields(dataset), {})

    @drop_datasets
    def test_finds_top_level_values_but_not_label_attributes(self):
        dataset = _dataset()
        ids = dataset.values("id")
        _store(dataset, ids[0], eval_tp=3, eval_fp=1)
        _store(dataset, ids[1], eval_tp=2)
        _store(dataset, ids[2], **{"gt.detections.0.extra": "x"})

        found = find_undeclared_fields(dataset)

        self.assertEqual(
            found,
            {
                "eval_tp": {"count": 2, "types": ["int"]},
                "eval_fp": {"count": 1, "types": ["int"]},
            },
        )

    @drop_datasets
    def test_remove_makes_samples_loadable_and_keeps_declared_fields(self):
        dataset = _dataset()
        sample_id = dataset.values("id")[0]
        _store(dataset, sample_id, eval_tp=3)

        with self.assertRaises(FieldDoesNotExist):
            _load(dataset, sample_id)

        # a declared field named alongside is never touched
        removed = remove_undeclared_fields(dataset, ["eval_tp", "score"])

        self.assertEqual(removed, ["eval_tp"])
        self.assertEqual(find_undeclared_fields(dataset), {})
        sample = _load(dataset, sample_id)
        self.assertEqual(sample["score"], 0.5)
        self.assertEqual(len(sample["gt"].detections), 1)

    @drop_datasets
    def test_declare_keeps_values(self):
        dataset = _dataset()
        sample_id = dataset.values("id")[0]
        _store(dataset, sample_id, eval_tp=3)

        declared, skipped = declare_undeclared_fields(dataset, ["eval_tp"])

        self.assertEqual((declared, skipped), (["eval_tp"], {}))
        self.assertIsInstance(dataset.get_field("eval_tp"), fof.IntField)
        self.assertEqual(_load(dataset, sample_id)["eval_tp"], 3)

    @drop_datasets
    def test_declare_infers_label_fields(self):
        dataset = _dataset()
        sample_id = dataset.values("id")[0]
        label = fo.Classification(label="dog").to_dict()
        _store(dataset, sample_id, pred=label)

        declared, _ = declare_undeclared_fields(dataset, ["pred"])

        self.assertEqual(declared, ["pred"])
        field = dataset.get_field("pred")
        self.assertIsInstance(field, fof.EmbeddedDocumentField)
        self.assertIs(field.document_type, fo.Classification)
        self.assertEqual(_load(dataset, sample_id)["pred"].label, "dog")

    @drop_datasets
    def test_declare_skips_mixed_types(self):
        dataset = _dataset()
        ids = dataset.values("id")
        _store(dataset, ids[0], eval_tp=3)
        _store(dataset, ids[1], eval_tp="three")

        declared, skipped = declare_undeclared_fields(dataset, ["eval_tp"])

        self.assertEqual(declared, [])
        self.assertIn("different types", skipped["eval_tp"])
        self.assertIsNone(dataset.get_field("eval_tp"))

    @drop_datasets
    def test_frame_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="/tmp/video.mp4")
        sample.frames[1] = fo.Frame(score=0.1)
        dataset.add_sample(sample)
        dataset._frame_collection.update_many({}, {"$set": {"orphan": 1}})

        found = find_undeclared_fields(dataset)
        self.assertEqual(
            found, {"frames.orphan": {"count": 1, "types": ["int"]}}
        )

        removed = remove_undeclared_fields(dataset, ["frames.orphan"])

        self.assertEqual(removed, ["frames.orphan"])
        self.assertEqual(find_undeclared_fields(dataset), {})
        self.assertEqual(dataset.values("frames.score"), [[0.1]])


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
