"""
FiftyOne tracking evaluation tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from contextlib import redirect_stdout
import importlib.util
import io
import unittest

from decorators import drop_datasets
import numpy as np

import fiftyone as fo

_HAS_TRACKEVAL = importlib.util.find_spec("trackeval") is not None
_HAS_PYCOCOTOOLS = importlib.util.find_spec("pycocotools") is not None


@unittest.skipUnless(_HAS_TRACKEVAL, "requires trackeval")
class TrackingEvaluationTests(unittest.TestCase):
    @drop_datasets
    def test_perfect_box_tracks_and_empty_frames(self):
        dataset = _make_dataset(
            [
                [
                    (_dets(_det(1)), _dets(_det(11))),
                    None,
                    (_dets(), _dets()),
                    (_dets(_det(1)), _dets(_det(11))),
                ]
            ]
        )

        results = dataset.evaluate_tracks(
            "frames.predictions",
            gt_field="frames.ground_truth",
            method="motchallenge",
        )

        self.assertEqual(results.hota(), 1)
        self.assertEqual(results.mota(), 1)
        self.assertEqual(results.idf1(), 1)
        self.assertEqual(results.metrics()["TP"], 2)
        self.assertTupleEqual(
            tuple(results.metrics()),
            (
                "HOTA",
                "DetA",
                "AssA",
                "IDF1",
                "MOTA",
                "LocA",
                "DetRe",
                "DetPr",
                "AssRe",
                "AssPr",
                "MOTP",
                "TP",
                "FP",
                "FN",
                "IDSW",
                "Frag",
                "MT",
                "PT",
                "ML",
                "IDP",
                "IDR",
                "IDTP",
                "IDFP",
                "IDFN",
            ),
        )

        output = io.StringIO()
        with redirect_stdout(output):
            results.print_report()

        report = output.getvalue()
        for section in (
            "Summary",
            "Detection and localization",
            "Association and identity",
            "Track coverage",
        ):
            self.assertIn(section, report)

        output = io.StringIO()
        with redirect_stdout(output):
            results.print_report(full_names=True)

        report = output.getvalue()
        self.assertIn("Higher Order Tracking Accuracy (HOTA)", report)
        self.assertIn("True Positives (TP)", report)
        self.assertIn("Identity Switches (IDSW)", report)

        plot = results.plot_hota_curves(
            sample=dataset.first(),
            backend="matplotlib",
        )
        self.assertEqual(len(plot.axes[0].lines), 8)
        self.assertEqual(len(plot.axes[0].lines[0].get_xdata()), 19)

    @drop_datasets
    def test_identity_switch(self):
        dataset = _make_dataset(
            [
                [
                    (_dets(_det(1)), _dets(_det(10))),
                    (_dets(_det(1)), _dets(_det(10))),
                    (_dets(_det(1)), _dets(_det(20))),
                    (_dets(_det(1)), _dets(_det(20))),
                ]
            ]
        )

        results = dataset.evaluate_tracks(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="switched",
            metrics=["CLEAR", "Identity"],
        )

        self.assertEqual(results.metrics()["IDSW"], 1)
        self.assertLess(results.idf1(), 1)

        plot = results.plot_id_switches(
            sample=dataset.first(),
            backend="matplotlib",
        )
        self.assertEqual(plot.axes[0].lines[0].get_label(), "GT 1 (person)")
        self.assertListEqual(
            plot.axes[0].lines[0].get_ydata().tolist(),
            [10, 10, 20, 20],
        )

        sample = dataset.first()
        for frame_number in (3, 4):
            frame = sample.frames[frame_number]
            frame.predictions.detections[0].index = 10
            frame.save()

        perfect = dataset.evaluate_tracks(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="perfect",
            metrics=["CLEAR", "Identity"],
        )

        output = io.StringIO()
        with redirect_stdout(output):
            perfect.compare(
                "switched",
                values=["IDF1", "MOTA", "IDSW"],
                full_names=True,
            )

        comparison = output.getvalue()
        self.assertIn("Identity F1 Score (IDF1)", comparison)
        self.assertIn("Delta (switched - perfect)", comparison)
        self.assertIn("+1", comparison)
        self.assertIn("-", comparison)

        plot = perfect.plot_compare(
            results,
            values=["IDF1", "MOTA"],
            backend="matplotlib",
        )
        self.assertEqual(len(plot.axes[0].patches), 4)

    @drop_datasets
    def test_false_positives_false_negatives_and_fragmentation(self):
        far_box = [0.7, 0.7, 0.2, 0.2]
        dataset = _make_dataset(
            [
                [
                    (_dets(_det(1)), _dets(_det(10))),
                    (
                        _dets(_det(1)),
                        _dets(
                            _det(10, box=far_box),
                            _det(20, box=far_box),
                        ),
                    ),
                    (_dets(_det(1)), _dets(_det(10))),
                ]
            ]
        )

        results = dataset.evaluate_tracks(
            "frames.predictions",
            gt_field="frames.ground_truth",
            metrics=["CLEAR"],
        )
        metrics = results.metrics()

        self.assertEqual(metrics["FP"], 2)
        self.assertEqual(metrics["FN"], 1)
        self.assertEqual(metrics["Frag"], 1)

    @drop_datasets
    def test_multiple_videos_protocol_aggregation(self):
        dataset = _make_dataset(
            [
                [(_dets(_det(1)), _dets(_det(10)))],
                [(_dets(_det(1)), _dets())],
            ]
        )

        results = dataset.evaluate_tracks(
            "frames.predictions",
            gt_field="frames.ground_truth",
            metrics=["CLEAR", "Identity"],
        )

        self.assertEqual(len(results.sequence_results), 2)
        self.assertEqual(results.metrics()["TP"], 1)
        self.assertEqual(results.metrics()["FN"], 1)
        self.assertEqual(results.mota(), 0.5)
        self.assertEqual(results.idf1(), 2 / 3)

    @drop_datasets
    def test_multiple_classes(self):
        dataset = _make_dataset(
            [
                [
                    (
                        _dets(_det(1, label="person"), _det(2, label="car")),
                        _dets(
                            _det(11, label="person"),
                            _det(22, label="car"),
                        ),
                    )
                ]
            ]
        )

        results = dataset.evaluate_tracks(
            "frames.predictions",
            gt_field="frames.ground_truth",
        )

        self.assertListEqual(results.classes, ["car", "person"])
        self.assertEqual(results.hota(), 1)
        self.assertEqual(results.hota(class_name="car"), 1)

    @drop_datasets
    def test_missing_and_duplicate_indices(self):
        missing = _make_dataset([[(_dets(_det(None)), _dets(_det(10)))]])
        with self.assertRaisesRegex(ValueError, "missing its track `index`"):
            missing.evaluate_tracks(
                "frames.predictions",
                gt_field="frames.ground_truth",
            )

        duplicate = _make_dataset(
            [[(_dets(_det(1), _det(1)), _dets(_det(10)))]]
        )
        with self.assertRaisesRegex(ValueError, "duplicate track index 1"):
            duplicate.evaluate_tracks(
                "frames.predictions",
                gt_field="frames.ground_truth",
            )

    @drop_datasets
    def test_ambiguous_track_class(self):
        dataset = _make_dataset(
            [
                [
                    (_dets(_det(1, label="person")), _dets(_det(10))),
                    (_dets(_det(1, label="car")), _dets(_det(10))),
                ]
            ]
        )

        with self.assertRaisesRegex(ValueError, "ambiguous within video"):
            dataset.evaluate_tracks(
                "frames.predictions",
                gt_field="frames.ground_truth",
            )

    @unittest.skipUnless(_HAS_PYCOCOTOOLS, "requires pycocotools")
    @drop_datasets
    def test_perfect_and_shifted_masks(self):
        mask = np.ones((5, 5), dtype=np.uint8)
        perfect = _make_dataset(
            [
                [
                    (
                        _dets(_det(1, mask=mask)),
                        _dets(_det(10, mask=mask)),
                    )
                ]
            ],
            frame_size=(10, 10),
        )
        results = perfect.evaluate_tracks(
            "frames.predictions",
            gt_field="frames.ground_truth",
            method="mots",
            use_masks=True,
        )
        self.assertEqual(results.hota(), 1)

        shifted = _make_dataset(
            [
                [
                    (
                        _dets(_det(1, box=[0, 0, 0.5, 1], mask=mask)),
                        _dets(
                            _det(
                                10,
                                box=[0.5, 0, 0.5, 1],
                                mask=mask,
                            )
                        ),
                    )
                ]
            ],
            frame_size=(10, 10),
        )
        results = shifted.evaluate_tracks(
            "frames.predictions",
            gt_field="frames.ground_truth",
            method="mots",
            use_masks=True,
        )
        self.assertEqual(results.hota(), 0)

    @unittest.skipUnless(_HAS_PYCOCOTOOLS, "requires pycocotools")
    @drop_datasets
    def test_invalid_mask(self):
        dataset = _make_dataset(
            [
                [
                    (
                        _dets(_det(1, mask=np.full((2, 2), 255))),
                        _dets(_det(10, mask=np.ones((2, 2)))),
                    )
                ]
            ]
        )

        with self.assertRaisesRegex(ValueError, "binary 0/1 mask"):
            dataset.evaluate_tracks(
                "frames.predictions",
                gt_field="frames.ground_truth",
                method="mots",
                use_masks=True,
            )

    @drop_datasets
    def test_evaluation_persistence(self):
        dataset = _make_dataset([[(_dets(_det(1)), _dets(_det(10)))]])

        results = dataset.evaluate_tracks(
            "frames.predictions",
            gt_field="frames.ground_truth",
            eval_key="mot",
        )

        self.assertIn("mot", dataset.list_evaluations(type="tracking"))
        self.assertEqual(dataset.first().mot_hota, 1)
        dataset._evaluation_cache.clear()

        loaded = dataset.load_evaluation_results("mot")
        self.assertIsInstance(loaded, fo.TrackingResults)
        self.assertEqual(loaded.metrics(), results.metrics())
        self.assertEqual(loaded.hota_curves, results.hota_curves)
        plot = loaded.plot_id_switches(
            dataset.first(),
            backend="matplotlib",
        )
        self.assertEqual(plot.axes[0].lines[0].get_label(), "GT 1 (person)")

        dataset.rename_evaluation("mot", "mot2")
        self.assertIn("mot2", dataset.list_evaluations())
        self.assertIn("mot2_hota", dataset.get_field_schema())
        self.assertNotIn("mot_hota", dataset.get_field_schema())

        dataset.delete_evaluation("mot2")
        self.assertNotIn("mot2", dataset.list_evaluations())
        self.assertNotIn("mot2_hota", dataset.get_field_schema())


class TrackingValidationTests(unittest.TestCase):
    @drop_datasets
    def test_requires_video_and_frame_fields(self):
        images = fo.Dataset()
        images.add_sample(
            fo.Sample(
                filepath="image.jpg",
                ground_truth=_dets(_det(1)),
                predictions=_dets(_det(10)),
            )
        )
        with self.assertRaisesRegex(ValueError, "media type video"):
            images.evaluate_tracks(
                "predictions",
                gt_field="ground_truth",
            )

        videos = fo.Dataset()
        videos.add_sample(
            fo.Sample(
                filepath="video.mp4",
                metadata=fo.VideoMetadata(
                    frame_width=100,
                    frame_height=100,
                    total_frame_count=1,
                ),
                ground_truth=_dets(_det(1)),
                predictions=_dets(_det(10)),
            )
        )
        with self.assertRaisesRegex(ValueError, "frame-level field"):
            videos.evaluate_tracks(
                "predictions",
                gt_field="ground_truth",
            )


def _make_dataset(sequences, frame_size=(100, 100)):
    dataset = fo.Dataset()
    width, height = frame_size
    samples = []
    for sequence_index, frames in enumerate(sequences):
        sample = fo.Sample(
            filepath="video-%d.mp4" % sequence_index,
            metadata=fo.VideoMetadata(
                frame_width=width,
                frame_height=height,
                total_frame_count=len(frames),
            ),
        )
        for frame_number, labels in enumerate(frames, 1):
            if labels is None:
                continue

            ground_truth, predictions = labels
            sample.frames[frame_number] = fo.Frame(
                ground_truth=ground_truth,
                predictions=predictions,
            )

        samples.append(sample)

    dataset.add_samples(samples)
    return dataset


def _det(index, label="person", box=None, mask=None):
    if box is None:
        box = [0.1, 0.1, 0.2, 0.2]

    return fo.Detection(
        label=label,
        bounding_box=box,
        mask=mask,
        confidence=0.9,
        index=index,
    )


def _dets(*detections):
    return fo.Detections(detections=list(detections))
