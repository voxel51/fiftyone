"""
FiftyOne run-related unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone as fo
import fiftyone.core.brain as fob

from decorators import drop_datasets


class RunTests(unittest.TestCase):
    @drop_datasets
    def test_custom_run(self):
        dataset = fo.Dataset()

        self.assertFalse(dataset.has_runs)
        self.assertListEqual(dataset.list_runs(), [])

        config = dataset.init_run()
        config.foo = "bar"
        config.spam = "eggs"
        dataset.register_run("custom", config)

        results = dataset.init_run_results("custom")
        results.foo = "bar"
        results.spam = "eggs"
        dataset.save_run_results("custom", results)

        self.assertTrue(dataset.has_runs)
        self.assertListEqual(dataset.list_runs(), ["custom"])

        del config
        del results
        dataset.clear_cache()

        info = dataset.get_run_info("custom")
        config = info.config
        self.assertEqual(config.foo, "bar")
        self.assertEqual(config.spam, "eggs")

        delattr(config, "spam")
        config.foo = "eggs"

        dataset.update_run_config("custom", config)

        del config
        dataset.clear_cache()

        info = dataset.get_run_info("custom")
        config = info.config
        self.assertEqual(config.foo, "eggs")
        with self.assertRaises(AttributeError):
            _ = config.spam

        results = dataset.load_run_results("custom")
        self.assertEqual(results.foo, "bar")
        self.assertEqual(results.spam, "eggs")

        delattr(results, "spam")
        results.foo = "eggs"

        with self.assertRaises(ValueError):
            dataset.save_run_results("custom", results, overwrite=False)

        dataset.save_run_results("custom", results, overwrite=True)

        del results
        dataset.clear_cache()

        results = dataset.load_run_results("custom")
        self.assertEqual(results.foo, "eggs")
        with self.assertRaises(AttributeError):
            _ = results.spam

        dataset2 = dataset.clone()

        self.assertTrue(dataset2.has_runs)
        self.assertListEqual(dataset2.list_runs(), ["custom"])

        dataset.delete_run("custom")

        self.assertFalse(dataset.has_runs)
        self.assertListEqual(dataset.list_runs(), [])

        dataset2.rename_run("custom", "still_custom")
        dataset2.clear_cache()

        self.assertTrue(dataset2.has_runs)
        self.assertListEqual(dataset2.list_runs(), ["still_custom"])

        info = dataset2.get_run_info("still_custom")
        results = dataset2.load_run_results("still_custom")

        dataset2.delete_runs()

        self.assertFalse(dataset2.has_runs)
        self.assertListEqual(dataset2.list_runs(), [])

    @drop_datasets
    def test_custom_run_kwargs(self):
        dataset = fo.Dataset()
        kwargs = {"foo": "bar", "spam": "eggs"}

        config1 = dataset.init_run(**kwargs)
        dataset.register_run("custom1", config1)

        results1 = dataset.init_run_results("custom1", **kwargs)
        dataset.save_run_results("custom1", results1)

        config2 = dataset.init_run(method="test", **kwargs)
        dataset.register_run("custom2", config2)

        results2 = dataset.init_run_results("custom2", **kwargs)
        dataset.save_run_results("custom2", results2)

        runs = dataset.list_runs()
        self.assertListEqual(runs, ["custom1", "custom2"])

        info1 = dataset.get_run_info("custom1")
        self.assertEqual(info1.config.method, None)

        info2 = dataset.get_run_info("custom2")
        self.assertEqual(info2.config.method, "test")

        runs = dataset.list_runs(method="test")
        self.assertListEqual(runs, ["custom2"])

    @drop_datasets
    def test_concurrent_run_updates(self):
        dataset = fo.Dataset()
        kwargs = {"foo": "bar", "spam": "eggs"}

        config1 = dataset.init_run(**kwargs)
        dataset.register_run("custom1", config1)

        results1 = dataset.init_run_results("custom1", **kwargs)
        dataset.save_run_results("custom1", results1)

        # Don't reuse singleton; we want to test concurrent edits here
        dataset._instances.pop(dataset.name)
        also_dataset = fo.load_dataset(dataset.name)
        self.assertIsNot(dataset, also_dataset)

        config2 = also_dataset.init_run(**kwargs)
        also_dataset.register_run("custom2", config2)

        results2 = also_dataset.init_run_results("custom2", **kwargs)
        also_dataset.save_run_results("custom2", results2)

        self.assertListEqual(dataset.list_runs(), ["custom1"])

        dataset.rename_run("custom1", "still_custom1")
        also_dataset.reload()

        self.assertListEqual(
            also_dataset.list_runs(),
            ["custom2", "still_custom1"],
        )

        dataset.delete_run("still_custom1")
        also_dataset.reload()

        self.assertListEqual(also_dataset.list_runs(), ["custom2"])

        dataset.reload()

        self.assertListEqual(dataset.list_runs(), ["custom2"])

    @drop_datasets
    def test_run_timestamps(self):
        dataset = fo.Dataset()
        kwargs = {"foo": "bar", "spam": "eggs"}

        config = dataset.init_run(**kwargs)
        dataset.register_run("test", config)

        results = dataset.init_run_results("test", **kwargs)
        dataset.save_run_results("test", results)

        # Cloning should bump timestamps
        dataset2 = dataset.clone()

        run_info1 = dataset.get_run_info("test")
        run_info2 = dataset2.get_run_info("test")

        self.assertTrue(run_info1.timestamp < run_info2.timestamp)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)


class FieldDeletionWarningTests(unittest.TestCase):
    def _register(self, samples, key, **kwargs):
        config = fob.BrainMethodConfig(**kwargs)
        fob.BrainMethod(config).register_run(samples, key)

    def _make_dataset(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="image.png",
                emb=[0.1, 0.2],
                roi=fo.Detections(
                    detections=[fo.Detection(label="cat", emb=[0.1])]
                ),
            )
        )
        return dataset

    @drop_datasets
    def test_embeddings_field(self):
        dataset = self._make_dataset()
        self._register(dataset, "sim", embeddings_field="emb")

        with self.assertLogs("fiftyone.core.brain", "WARNING") as logs:
            dataset.delete_sample_field("emb")

        self.assertEqual(len(logs.output), 1)
        self.assertIn("'emb'", logs.output[0])
        self.assertIn("brain run 'sim'", logs.output[0])

    @drop_datasets
    def test_parent_field(self):
        dataset = self._make_dataset()
        self._register(dataset, "sim", embeddings_field="roi.detections.emb")

        with self.assertLogs("fiftyone.core.brain", "WARNING") as logs:
            dataset.delete_sample_field("roi")

        self.assertIn("brain run 'sim'", logs.output[0])

    @drop_datasets
    def test_unrelated_field(self):
        dataset = self._make_dataset()
        self._register(dataset, "sim", embeddings_field="emb")

        with self.assertNoLogs("fiftyone.core.brain", "WARNING"):
            dataset.delete_sample_field("roi")

    @drop_datasets
    def test_roi_embeddings(self):
        dataset = self._make_dataset()
        self._register(
            dataset, "uniq", roi_field="roi", embeddings_field="emb"
        )

        with self.assertNoLogs("fiftyone.core.brain", "WARNING"):
            dataset.delete_sample_field("emb")

        with self.assertLogs("fiftyone.core.brain", "WARNING") as logs:
            dataset.delete_sample_field("roi.detections.emb")

        self.assertIn("brain run 'uniq'", logs.output[0])

    @drop_datasets
    def test_one_warning_per_run(self):
        dataset = self._make_dataset()
        self._register(
            dataset, "uniq", roi_field="roi", embeddings_field="emb"
        )

        with self.assertLogs("fiftyone.core.brain", "WARNING") as logs:
            dataset.delete_sample_fields(["roi", "emb"])

        self.assertEqual(len(logs.output), 1)
        self.assertIn("'roi'", logs.output[0])

    @drop_datasets
    def test_frame_field(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(dets=fo.Detections())
        dataset.add_sample(sample)
        self._register(dataset, "sim", patches_field="frames.dets")

        with self.assertLogs("fiftyone.core.brain", "WARNING") as logs:
            dataset.delete_frame_field("dets")

        self.assertIn("'frames.dets'", logs.output[0])

    @drop_datasets
    def test_generated_view_run(self):
        dataset = self._make_dataset()
        patches = dataset.to_patches("roi")
        self._register(patches, "sim", embeddings_field="emb")

        # "emb" names the patches' field, not the dataset's
        with self.assertNoLogs("fiftyone.core.brain", "WARNING"):
            dataset.delete_sample_field("emb")
