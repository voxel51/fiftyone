"""
Tests to verify that all apply_model call patterns work correctly with SAM/SAM2 image models.

Covers:
  - Image dataset: auto, box prompt, keypoint prompt
  - Video dataset: auto, box prompt (frame-level via field_mapping)
  - SamplesMixin deprecation: predict_all with samples raises RuntimeError
  - Model no longer isinstance of SamplesMixin / TorchSamplesMixin

Usage:
    pytest sam_image_model_tests.py -v --timeout=500
"""

import unittest
import numpy as np
import torch

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone.core.labels import Detections


PLACEHOLDER_LABEL = "mask"
SAM_MODEL_NAME = "segment-anything-vitb-torch"
SAM2_MODEL_NAME = "segment-anything-2-hiera-tiny-image-torch"
SAM3_MODEL_NAME = "segment-anything-3-image-torch"
TEXT_PROMPTS = ["person"]


def _create_image_dataset(num_samples=5, seed=51):
    name = f"sam-apply-model-img-{seed}"
    if name in fo.list_datasets():
        fo.delete_dataset(name)
    dataset = foz.load_zoo_dataset(
        "quickstart",
        max_samples=num_samples,
        shuffle=True,
        seed=seed,
        dataset_name=name,
    )
    dataset.persistent = True
    dataset.compute_metadata()
    return dataset


def _create_video_dataset(num_samples=2):
    name = "sam-apply-model-video"
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


def _assert_field_populated(
    test_case, dataset, field_name, prompt_field=None, min_dets=0
):
    """Assert that every sample has a non-None Detections field.

    Args:
        prompt_field: if provided, assert the output detection count
            matches the prompt count per sample instead of using min_dets.
        min_dets: minimum detections per sample (only used when
            prompt_field is None, e.g. auto mode).
    """
    for sample in dataset.iter_samples(progress=False):
        value = sample.get_field(field_name)
        test_case.assertIsNotNone(
            value,
            f"Field '{field_name}' is None on sample {sample.id}",
        )
        test_case.assertIsInstance(value, Detections)

        if prompt_field is not None:
            prompt = sample.get_field(prompt_field)
            if prompt is None:
                continue
            if hasattr(prompt, "detections"):
                expected = len(prompt.detections)
            elif hasattr(prompt, "keypoints"):
                expected = len(prompt.keypoints)
            else:
                continue
            test_case.assertEqual(
                len(value.detections),
                expected,
                f"Detection count mismatch on sample {sample.id}: "
                f"got {len(value.detections)}, expected {expected} "
                f"(from '{prompt_field}')",
            )
        elif min_dets > 0:
            test_case.assertGreaterEqual(
                len(value.detections),
                min_dets,
                f"Expected >= {min_dets} detections in '{field_name}' "
                f"on sample {sample.id}, got {len(value.detections)}",
            )


class TestSAMApplyModelImage(unittest.TestCase):
    """Verify apply_model works for all SAM prompt modes on image datasets."""

    @classmethod
    def setUpClass(cls):
        cls.model = foz.load_zoo_model(SAM_MODEL_NAME)
        cls.dataset = _create_image_dataset(num_samples=5, seed=42)

    @classmethod
    def tearDownClass(cls):
        fo.delete_dataset(cls.dataset.name)

    def test_auto_segmentation(self):
        """apply_model with no prompt_field produces auto segmentation."""
        field = "sam_img_auto"
        self.dataset.apply_model(self.model, label_field=field)
        _assert_field_populated(self, self.dataset, field, min_dets=1)
        self.dataset.delete_sample_field(field)

    def test_box_prompt(self):
        """apply_model with prompt_field pointing to Detections works."""
        field = "sam_img_box"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            prompt_field="ground_truth",
        )
        _assert_field_populated(
            self, self.dataset, field, prompt_field="ground_truth"
        )
        self.dataset.delete_sample_field(field)

    def test_keypoint_prompt(self):
        """apply_model with prompt_field pointing to Keypoints works."""
        kp_field = "sam_test_kps"
        kp_model = foz.load_zoo_model("vitpose-base-simple-torch")
        self.dataset.apply_model(
            kp_model, prompt_field="ground_truth", label_field=kp_field
        )

        field = "sam_img_kp"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            prompt_field=kp_field,
        )
        _assert_field_populated(
            self, self.dataset, field, prompt_field=kp_field
        )

        self.dataset.delete_sample_field(field)
        self.dataset.delete_sample_field(kp_field)

    def test_box_prompt_field_mapping(self):
        """apply_model with box_prompt_field kwarg works."""
        field = "sam_img_box_fm"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            box_prompt_field="ground_truth",
        )
        _assert_field_populated(
            self, self.dataset, field, prompt_field="ground_truth"
        )
        self.dataset.delete_sample_field(field)

    def test_point_prompt_field_mapping(self):
        """apply_model with point_prompt_field kwarg works."""
        kp_field = "sam_test_kps_fm"
        kp_model = foz.load_zoo_model("vitpose-base-simple-torch")
        self.dataset.apply_model(
            kp_model, prompt_field="ground_truth", label_field=kp_field
        )

        field = "sam_img_kp_fm"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            point_prompt_field=kp_field,
        )
        _assert_field_populated(
            self, self.dataset, field, prompt_field=kp_field
        )

        self.dataset.delete_sample_field(field)
        self.dataset.delete_sample_field(kp_field)

    def test_output_has_masks(self):
        """All output detections should have instance masks."""
        field = "sam_img_masks_check"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            prompt_field="ground_truth",
        )

        for sample in self.dataset.iter_samples(progress=False):
            dets = sample.get_field(field)
            for det in dets.detections:
                self.assertIsNotNone(
                    det.mask,
                    f"Detection missing mask on sample {sample.id}",
                )

        self.dataset.delete_sample_field(field)

    def test_output_confidence_in_range(self):
        """All output detection confidences should be in [0, 1]."""
        field = "sam_img_conf_check"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            prompt_field="ground_truth",
        )

        for sample in self.dataset.iter_samples(progress=False):
            dets = sample.get_field(field)
            for det in dets.detections:
                if det.confidence is not None:
                    self.assertGreaterEqual(det.confidence, 0.0)
                    self.assertLessEqual(det.confidence, 1.0)

        self.dataset.delete_sample_field(field)


class TestSAMApplyModelVideo(unittest.TestCase):
    """Verify apply_model works for SAM image models on video datasets (frame-level)."""

    @classmethod
    def setUpClass(cls):
        cls.model = foz.load_zoo_model(SAM_MODEL_NAME)
        cls.dataset = _create_video_dataset(num_samples=2)

    @classmethod
    def tearDownClass(cls):
        fo.delete_dataset(cls.dataset.name)

    def test_auto_segmentation_video(self):
        """apply_model with no prompts on a video dataset should produce
        per-frame auto segmentations."""
        field = "frames.sam_vid_auto"
        self.dataset.apply_model(self.model, label_field=field)

        for sample in self.dataset.iter_samples(progress=False):
            for frame_number, frame in sample.frames.items():
                value = frame.get_field("sam_vid_auto")
                self.assertIsNotNone(
                    value,
                    f"Frame {frame_number} of sample {sample.id} "
                    f"has no auto segmentations",
                )

        self.dataset.delete_frame_field("sam_vid_auto")

    def test_box_prompt_video(self):
        """apply_model with box prompts on video frames should work
        via the field_mapping workaround.  The number of predicted
        masks on each frame must match the number of prompt boxes."""
        field = "frames.sam_vid_box"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            prompt_field="frames.detections",
        )

        for sample in self.dataset.iter_samples(progress=False):
            for frame_number, frame in sample.frames.items():
                dets = frame.get_field("detections")
                preds = frame.get_field("sam_vid_box")

                n_gt = (
                    len(dets.detections)
                    if dets is not None and dets.detections
                    else 0
                )
                n_pred = (
                    len(preds.detections)
                    if preds is not None and preds.detections
                    else 0
                )

                self.assertEqual(
                    n_pred,
                    n_gt,
                    f"Frame {frame_number} of sample {sample.id}: "
                    f"expected {n_gt} predictions, got {n_pred}",
                )

        self.dataset.delete_frame_field("sam_vid_box")


class TestSAM2ApplyModelImage(unittest.TestCase):
    """Verify apply_model works for SAM2 on image datasets."""

    @classmethod
    def setUpClass(cls):
        cls.model = foz.load_zoo_model(SAM2_MODEL_NAME)
        cls.dataset = _create_image_dataset(num_samples=5, seed=77)

    @classmethod
    def tearDownClass(cls):
        fo.delete_dataset(cls.dataset.name)

    def test_auto_segmentation(self):
        field = "sam2_img_auto"
        self.dataset.apply_model(self.model, label_field=field)
        _assert_field_populated(self, self.dataset, field, min_dets=1)
        self.dataset.delete_sample_field(field)

    def test_box_prompt(self):
        field = "sam2_img_box"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            prompt_field="ground_truth",
        )
        _assert_field_populated(
            self, self.dataset, field, prompt_field="ground_truth"
        )
        self.dataset.delete_sample_field(field)

    def test_keypoint_prompt(self):
        kp_field = "sam2_test_kps"
        kp_model = foz.load_zoo_model("vitpose-base-simple-torch")
        self.dataset.apply_model(
            kp_model, prompt_field="ground_truth", label_field=kp_field
        )

        field = "sam2_img_kp"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            prompt_field=kp_field,
        )
        _assert_field_populated(
            self, self.dataset, field, prompt_field=kp_field
        )
        self.dataset.delete_sample_field(field)
        self.dataset.delete_sample_field(kp_field)


class TestSamplesMixinDeprecation(unittest.TestCase):
    """Verify that SamplesMixin / TorchSamplesMixin is no longer used
    and that passing samples raises appropriately."""

    @classmethod
    def setUpClass(cls):
        cls.model = foz.load_zoo_model(SAM_MODEL_NAME)
        cls.dataset = _create_image_dataset(num_samples=2, seed=99)

    @classmethod
    def tearDownClass(cls):
        fo.delete_dataset(cls.dataset.name)

    def test_model_is_not_samples_mixin(self):
        """After refactor, SegmentAnythingModel should not be a
        SamplesMixin instance."""
        from fiftyone.core.models import SamplesMixin

        self.assertNotIsInstance(
            self.model,
            SamplesMixin,
            "SegmentAnythingModel should no longer inherit SamplesMixin",
        )

    def test_model_is_not_torch_samples_mixin(self):
        """After refactor, SegmentAnythingModel should not be a
        TorchSamplesMixin instance."""
        from fiftyone.utils.torch import TorchSamplesMixin

        self.assertNotIsInstance(
            self.model,
            TorchSamplesMixin,
            "SegmentAnythingModel should no longer inherit TorchSamplesMixin",
        )

    def test_predict_all_with_samples_raises(self):
        """Calling predict_all(imgs, samples=...) should raise
        RuntimeError after SamplesMixin removal."""
        from PIL import Image

        sample = self.dataset.first()
        img = np.array(Image.open(sample.filepath).convert("RGB"))

        with self.assertRaises(RuntimeError) as ctx:
            self.model.predict_all([img], samples=[sample])

        # Error message should reference the deprecation
        msg = str(ctx.exception)
        self.assertIn(
            "deprecated",
            msg.lower(),
            "RuntimeError message should mention deprecation",
        )

    def test_predict_without_sample_works(self):
        """predict should still work when sample is not passed,
        provided input is in the new GetItem format."""
        # Build a GetItem-produced input for a single sample
        sample = self.dataset.first()

        get_item = self.model.build_get_item(
            field_mapping={"box_prompt_field": "ground_truth"}
        )

        import fiftyone.utils.torch as fout

        model_input = fout.get_model_inputs_from_get_item([sample], get_item)[
            0
        ]
        result = self.model.predict(model_input)
        self.assertIsNotNone(result)
        self.assertEqual(
            len(result.detections), len(sample["ground_truth"].detections)
        )


class TestSAM3ConceptApplyModel(unittest.TestCase):
    """Verify ``apply_model`` works for SAM3 concept mode on image
    datasets."""

    @classmethod
    def setUpClass(cls):
        cls.model = foz.load_zoo_model(
            SAM3_MODEL_NAME,
            classes=TEXT_PROMPTS,
            operation_mode="concept",
        )
        cls.dataset = _create_image_dataset(num_samples=5, seed=80)

    @classmethod
    def tearDownClass(cls):
        fo.delete_dataset(cls.dataset.name)

    def test_concept_single_prompt(self):
        field = "sam3_concept_single"
        self.dataset.apply_model(self.model, label_field=field)
        _assert_field_populated(self, self.dataset, field, min_dets=0)

        self.dataset.delete_sample_field(field)

    def test_concept_multi_prompt(self):
        """Multiple text prompts produce detections labeled per prompt."""
        multi_prompts = ["person", "car"]
        model = foz.load_zoo_model(
            SAM3_MODEL_NAME,
            classes=multi_prompts,
            operation_mode="concept",
        )

        field = "sam3_concept_multi"
        self.dataset.apply_model(model, label_field=field)
        _assert_field_populated(self, self.dataset, field, min_dets=0)

        self.dataset.delete_sample_field(field)


class TestSAM3VisualApplyModel(unittest.TestCase):
    """Verify ``apply_model`` works for SAM3 visual mode on image
    datasets."""

    @classmethod
    def setUpClass(cls):
        cls.model = foz.load_zoo_model(
            SAM3_MODEL_NAME,
            operation_mode="visual",
        )
        cls.dataset = _create_image_dataset(num_samples=5, seed=81)

    @classmethod
    def tearDownClass(cls):
        fo.delete_dataset(cls.dataset.name)

    def test_box_prompt(self):
        """Box prompts from ground_truth produce detections."""
        field = "sam3_visual_box"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            prompt_field="ground_truth",
        )
        _assert_field_populated(
            self, self.dataset, field, prompt_field="ground_truth"
        )

        # Labels should come from the ground truth detections
        for sample in self.dataset.iter_samples(progress=False):
            gt = sample.get_field("ground_truth")
            preds = sample.get_field(field)
            if gt is None or preds is None:
                continue

            gt_labels = {d.label for d in gt.detections}
            for det in preds.detections:
                self.assertIn(
                    det.label,
                    gt_labels,
                    f"Visual box label '{det.label}' not in GT labels",
                )

        self.dataset.delete_sample_field(field)

    def test_keypoint_prompt(self):
        """Keypoint prompts produce detections."""
        kp_field = "sam3_test_kps"
        kp_model = foz.load_zoo_model("vitpose-base-simple-torch")
        with torch.amp.autocast("cuda", enabled=False):
            self.dataset.apply_model(
                kp_model,
                prompt_field="ground_truth",
                label_field=kp_field,
            )

        field = "sam3_visual_kp"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            prompt_field=kp_field,
        )
        _assert_field_populated(
            self, self.dataset, field, prompt_field=kp_field
        )

        self.dataset.delete_sample_field(field)
        self.dataset.delete_sample_field(kp_field)


class TestSAM3ConceptApplyModelVideo(unittest.TestCase):
    """Verify apply_model works for SAM3 concept-mode image model on video
    datasets (frame-level inference)."""

    @classmethod
    def setUpClass(cls):
        cls.model = foz.load_zoo_model(
            SAM3_MODEL_NAME,
            classes=TEXT_PROMPTS,
            operation_mode="concept",
        )
        cls.dataset = _create_video_dataset(num_samples=2)

    @classmethod
    def tearDownClass(cls):
        fo.delete_dataset(cls.dataset.name)

    def test_concept_segmentation_video(self):
        """apply_model with text prompts on a video dataset should produce
        per-frame concept segmentations."""
        field = "frames.sam3_vid_concept"
        self.dataset.apply_model(self.model, label_field=field)

        for sample in self.dataset.iter_samples(progress=False):
            for frame_number, frame in sample.frames.items():
                value = frame.get_field("sam3_vid_concept")
                self.assertIsNotNone(
                    value,
                    f"Frame {frame_number} of sample {sample.id} "
                    f"has no concept segmentations",
                )
                self.assertIsInstance(value, Detections)

        self.dataset.delete_frame_field("sam3_vid_concept")

    def test_concept_multi_prompt_video(self):
        """Multiple text prompts on video frames should produce correctly
        labeled per-frame detections."""
        multi_prompts = ["person", "car"]
        model = foz.load_zoo_model(
            SAM3_MODEL_NAME,
            classes=multi_prompts,
            operation_mode="concept",
        )

        field = "frames.sam3_vid_multi"
        self.dataset.apply_model(model, label_field=field)

        for sample in self.dataset.iter_samples(progress=False):
            for frame_number, frame in sample.frames.items():
                value = frame.get_field("sam3_vid_multi")
                self.assertIsNotNone(
                    value,
                    f"Frame {frame_number} of sample {sample.id} "
                    f"has no multi-prompt segmentations",
                )
                self.assertIsInstance(value, Detections)

        self.dataset.delete_frame_field("sam3_vid_multi")


class TestSAM3VisualApplyModelVideo(unittest.TestCase):
    """Verify apply_model works for SAM3 visual-mode image model on video
    datasets (frame-level inference with box prompts)."""

    @classmethod
    def setUpClass(cls):
        cls.model = foz.load_zoo_model(
            SAM3_MODEL_NAME,
            operation_mode="visual",
        )
        cls.dataset = _create_video_dataset(num_samples=2)

    @classmethod
    def tearDownClass(cls):
        fo.delete_dataset(cls.dataset.name)

    def test_box_prompt_video(self):
        """apply_model with box prompts on video frames should produce
        per-frame segmentations. The number of predicted masks on each
        frame must match the number of prompt boxes."""
        field = "frames.sam3_vid_box"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            prompt_field="frames.detections",
        )

        for sample in self.dataset.iter_samples(progress=False):
            for frame_number, frame in sample.frames.items():
                dets = frame.get_field("detections")
                preds = frame.get_field("sam3_vid_box")

                n_gt = (
                    len(dets.detections)
                    if dets is not None and dets.detections
                    else 0
                )
                n_pred = (
                    len(preds.detections)
                    if preds is not None and preds.detections
                    else 0
                )

                self.assertEqual(
                    n_pred,
                    n_gt,
                    f"Frame {frame_number} of sample {sample.id}: "
                    f"expected {n_gt} predictions, got {n_pred}",
                )

                # Each prediction should have a mask
                if preds is not None:
                    for det in preds.detections:
                        self.assertIsNotNone(det.mask)
                        self.assertIsNotNone(det.confidence)

        self.dataset.delete_frame_field("sam3_vid_box")

    def test_box_prompt_video_labels_match_gt(self):
        """Box-prompted predictions on video frames should inherit labels
        from the prompt field's detections."""
        field = "frames.sam3_vid_box_lbl"
        self.dataset.apply_model(
            self.model,
            label_field=field,
            prompt_field="frames.detections",
        )

        for sample in self.dataset.iter_samples(progress=False):
            for frame_number, frame in sample.frames.items():
                dets = frame.get_field("detections")
                preds = frame.get_field("sam3_vid_box_lbl")

                if dets is None or not dets.detections:
                    continue
                if preds is None or not preds.detections:
                    continue

                gt_labels = [d.label for d in dets.detections]
                pred_labels = [d.label for d in preds.detections]

                self.assertEqual(
                    pred_labels,
                    gt_labels,
                    f"Frame {frame_number} of sample {sample.id}: "
                    f"label mismatch: {pred_labels} != {gt_labels}",
                )

        self.dataset.delete_frame_field("sam3_vid_box_lbl")


if __name__ == "__main__":
    unittest.main()
