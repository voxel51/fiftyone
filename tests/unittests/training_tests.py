"""
Training-run framework tests (minimal, experimental).

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone as fo
import fiftyone.core.labels as fol

from decorators import drop_datasets


class TrainingRunTests(unittest.TestCase):
    def _dataset(self):
        ds = fo.Dataset()
        samples = []
        for i in range(6):
            s = fo.Sample(filepath=f"/tmp/img{i}.jpg")
            s["ground_truth"] = fol.Classification(label="a" if i % 2 else "b")
            s.tags = ["train"] if i < 4 else ["val"]
            samples.append(s)
        ds.add_samples(samples)
        return ds

    @drop_datasets
    def test_init_status_and_discovery(self):
        ds = self._dataset()
        run = ds.init_training_run(
            train_key="run_one",
            train_view=ds.match_tags("train"),
            val_view=ds.match_tags("val"),
            gt_field="ground_truth",
            pred_field="preds",
        )
        self.assertEqual(run.status, "in_progress")  # spec UD4
        self.assertTrue(
            ds.has_training_runs
        )  # property (mirrors has_evaluations)
        self.assertIn("run_one", ds.list_training_runs())
        self.assertEqual(run.train_view.count(), 4)
        self.assertEqual(run.val_view.count(), 2)

    @drop_datasets
    def test_finish_runs_eval_and_links(self):
        ds = self._dataset()
        run = ds.init_training_run(
            train_key="run_two",
            train_view=ds.match_tags("train"),
            val_view=ds.match_tags("val"),
            gt_field="ground_truth",
            pred_field="preds",
            auto_eval=True,
        )
        ids = run.val_view.values("id")
        run.log_predictions(
            {sid: fol.Classification(label="a") for sid in ids}
        )
        results = run.finish(checkpoint_uri="s3://bucket/best.pt")
        self.assertEqual(run.status, "completed")
        # RD6: singular eval_key defaulting to train_key; single result
        self.assertEqual(run.eval_key, "run_two")
        self.assertIsNotNone(results)
        self.assertEqual(run.checkpoint_uri, "s3://bucket/best.pt")
        # eval view recoverable + frozen to the combined samples (here: val)
        self.assertEqual(run.eval_view.count(), 2)
        # back-pointer (spec §6.4 / AD2)
        info = ds.get_evaluation_info("run_two")
        self.assertEqual(getattr(info.config, "train_key", None), "run_two")

    @drop_datasets
    def test_invalid_key_rejected_not_slugged(self):
        # RD1: keys are NOT slugged; a non-identifier key raises, exactly
        # like every other FO run type (runs.py:341-345).
        ds = self._dataset()
        with self.assertRaises(ValueError):
            ds.init_training_run(
                train_key="my-training-key",  # hyphen => invalid identifier
                train_view=ds.match_tags("train"),
            )

    @drop_datasets
    def test_context_manager_failure_marks_failed(self):
        ds = self._dataset()
        run = ds.init_training_run(
            train_key="run_fail",
            train_view=ds.match_tags("train"),
        )
        with self.assertRaises(RuntimeError):
            with run:
                raise RuntimeError("boom")
        reloaded = ds.load_training_run("run_fail")
        self.assertEqual(reloaded.status, "failed")
        self.assertIn("boom", reloaded.config.error)

    @drop_datasets
    def test_status_filter_and_delete(self):
        ds = self._dataset()
        ds.init_training_run(
            train_key="lineage_only", train_view=ds.match_tags("train")
        )
        self.assertEqual(
            ds.list_training_runs(status="in_progress"), ["lineage_only"]
        )
        ds.delete_training_run("lineage_only")
        self.assertFalse(
            ds.has_training_runs
        )  # property (mirrors has_evaluations)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
