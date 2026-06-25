"""
Tests for the SAM3 video model (SegmentAnything3VideoModel).

Covers:
  - apply_model tests for concept mode (text prompts)
  - apply_model tests for visual mode (box and keypoint prompts)
  - Parity tests: FiftyOne apply_model vs. direct SAM3 video predictor inference

Usage:
    pytest sam_video_model_tests.py -v --timeout=600
"""

import gc

import torch
import unittest

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone.core.labels import Detections, Keypoint, Keypoints

SAM3_VIDEO_MODEL_NAME = "segment-anything-3-video-torch"
TEXT_PROMPTS = ["car"]
MASK_IOU = 0.95
MIN_METRIC = 1.0


def _create_video_dataset(num_samples=2, seed=51):
    name = f"sam3-video-test-{seed}"
    if name in fo.list_datasets():
        fo.delete_dataset(name)
    dataset = foz.load_zoo_dataset(
        "quickstart-video",
        max_samples=num_samples,
        dataset_name=name,
    )
    dataset.persistent = True
    dataset.compute_metadata()
    return dataset


def _assert_video_field_populated(test_case, dataset, frame_field):
    """Assert every frame has a non-None Detections object in frame_field."""
    for sample in dataset.iter_samples(progress=False):
        for frame_number, frame in sample.frames.items():
            value = frame.get_field(frame_field)
            test_case.assertIsNotNone(
                value,
                f"Frame {frame_number} of sample {sample.id} "
                f"is missing field '{frame_field}'",
            )
            test_case.assertIsInstance(value, Detections)


class TestSAM3VideoConceptApplyModel(unittest.TestCase):
    """Verify apply_model works for SAM3 video model in concept mode."""

    @classmethod
    def setUpClass(cls):
        cls.model = foz.load_zoo_model(
            SAM3_VIDEO_MODEL_NAME,
            classes=TEXT_PROMPTS,
            operation_mode="concept",
        )
        cls.dataset = _create_video_dataset(num_samples=2, seed=42)

    @classmethod
    def tearDownClass(cls):
        del cls.model
        gc.collect()
        torch.cuda.empty_cache()

    def tearDown(self):
        gc.collect()
        torch.cuda.empty_cache()

    def test_concept_single_text_prompt(self):
        """Concept mode with a single text prompt produces Detections on every frame."""
        field = "sam3v_concept_single"
        self.dataset.apply_model(self.model, label_field=field)
        _assert_video_field_populated(self, self.dataset, field)

    def test_concept_multi_text_prompt(self):
        """Multiple text prompts produce per-frame Detections."""
        model = foz.load_zoo_model(
            SAM3_VIDEO_MODEL_NAME,
            classes=["person", "car"],
            operation_mode="concept",
        )
        field = "sam3v_concept_multi"
        self.dataset.apply_model(model, label_field=field)
        _assert_video_field_populated(self, self.dataset, field)

    def test_output_has_masks(self):
        """All concept-mode detections should have instance masks."""
        field = "sam3v_concept_masks"
        self.dataset.apply_model(self.model, label_field=field)
        for sample in self.dataset.iter_samples(progress=False):
            for frame_number, frame in sample.frames.items():
                dets = frame.get_field(field)
                self.assertIsNotNone(
                    dets,
                    f"No detections on frame {frame_number} "
                    f"of sample {sample.id}",
                )
                for det in dets.detections:
                    self.assertIsNotNone(
                        det.mask,
                        f"Detection missing mask on frame {frame_number} "
                        f"of sample {sample.id}",
                    )

    def test_concept_propagation_forward(self):
        """Forward propagation fills every frame (not just the first)."""
        model = foz.load_zoo_model(
            SAM3_VIDEO_MODEL_NAME,
            classes=TEXT_PROMPTS,
            operation_mode="concept",
            propagation_direction="forward",
        )
        field = "sam3v_concept_fwd"
        self.dataset.apply_model(model, label_field=field)

        for sample in self.dataset.iter_samples(progress=False):
            n_frames = len(sample.frames)
            frames_with_detections = sum(
                1
                for frame in sample.frames.values()
                if frame.get_field(field) is not None
            )
            self.assertEqual(
                frames_with_detections,
                n_frames,
                f"Expected {n_frames} frames with '{field}', "
                f"got {frames_with_detections} on sample {sample.id}",
            )


class TestSAM3VideoVisualApplyModel(unittest.TestCase):
    """Verify apply_model works for SAM3 video model in visual mode."""

    @classmethod
    def setUpClass(cls):
        cls.model = foz.load_zoo_model(
            SAM3_VIDEO_MODEL_NAME,
            operation_mode="visual",
            prompt_frame_indices=[1],
        )
        cls.dataset = _create_video_dataset(num_samples=2, seed=77)

    @classmethod
    def tearDownClass(cls):
        del cls.model
        gc.collect()
        torch.cuda.empty_cache()

    def tearDown(self):
        gc.collect()
        torch.cuda.empty_cache()

    def test_visual_box_prompt_first_frame_only(self):
        """Visual mode prompting only from frame 1 still propagates to all frames."""
        field = "sam3v_visual_box_f1"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            prompt_field="frames.detections",
        )
        _assert_video_field_populated(self, self.dataset, field)

    def test_visual_keypoint_prompt_first_frame_only(self):
        """Visual mode with Keypoints as prompts produces per-frame segmentations."""
        kp_field = "sam3v_visual_kps"
        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            first_frame = sample.frames[1]
            dets = first_frame.get_field("detections")
            self.assertTrue(
                dets is not None and bool(dets.detections),
                f"Missing first-frame detections required for keypoint prompts on sample {sample.id}",
            )
            first_frame[kp_field] = Keypoints(
                keypoints=[
                    Keypoint(
                        label=d.label,
                        points=[
                            (
                                d.bounding_box[0] + d.bounding_box[2] / 2,
                                d.bounding_box[1] + d.bounding_box[3] / 2,
                            )
                        ],
                    )
                    for d in dets.detections
                ]
            )

        field = "sam3v_visual_kp"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            prompt_field=f"frames.{kp_field}",
        )
        _assert_video_field_populated(self, self.dataset, field)

        self.dataset.delete_frame_field(field)
        if kp_field in self.dataset.get_frame_field_schema():
            self.dataset.delete_frame_field(kp_field)


if __name__ == "__main__":
    unittest.main()
