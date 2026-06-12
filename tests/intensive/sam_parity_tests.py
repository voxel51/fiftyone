"""
Tests to verify that the FiftyOne SAM/SAM2 integration produces
identical results to direct inference using the segment-anything and sam2
libraries.

For each prompt mode (automatic, box, keypoint), direct SAM/SAM2
output is converted to FiftyOne ``Detections`` labels, stored on the dataset
alongside the FiftyOne model output, and then compared via
``dataset.evaluate_detections(use_masks=True)``.

Usage:
    pytest sam_parity_tests.py -v --timeout=500
"""

import gc

import cv2
import numpy as np
import torch
import unittest

import eta.core.video as etav

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone.core.labels import Detection, Detections, Keypoint, Keypoints
from fiftyone import ViewField as F
import fiftyone.utils.sam as fosam
import fiftyone.utils.sam3 as fosam3

MASK_IOU = 0.95  # change for more/less aggressive mask parity testing
MASK_THRESH = 0.5
PLACEHOLDER_LABEL = "mask"
MIN_METRIC = 1.0

TEXT_PROMPTS = ["person"]
VID_TEXT_PROMPTS = ["car"]

SAM3_VIDEO_MODEL_NAME = "segment-anything-3-video-torch"


def _create_test_dataset(num_samples=5, seed=51):
    name = f"sam-parity-test-{seed}"
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


def _create_video_dataset(num_samples=2, seed=51):
    name = f"sam3-video-test-{seed}"
    if name in fo.list_datasets():
        fo.delete_dataset(name)
    dataset = foz.load_zoo_dataset(
        "quickstart-video",
        max_samples=num_samples,
        shuffle=True,
        seed=seed,
        dataset_name=name,
    )
    dataset.persistent = True
    dataset.compute_metadata()
    return dataset


def _get_image_as_numpy(filepath):
    from PIL import Image

    return np.array(Image.open(filepath).convert("RGB"))


def _get_image_as_pil(filepath):
    from PIL import Image

    return Image.open(filepath).convert("RGB")


def _auto_masks_to_detections(masks_list):
    """Convert ``SamAutomaticMaskGenerator.generate()`` output to
    ``fo.Detections``."""
    dets = []
    for m in masks_list:
        det = Detection.from_mask(
            mask=m["segmentation"],
            label=PLACEHOLDER_LABEL,
            confidence=m.get("stability_score", m.get("predicted_iou", 1.0)),
        )
        dets.append(det)
    return Detections(detections=dets)


def _box_to_sam_abs(bbox_rel, img_w, img_h):
    """Convert a FiftyOne [x, y, w, h] relative bbox to SAM-style
    [x1, y1, x2, y2] absolute pixel coords."""
    bx, by, bw, bh = bbox_rel
    return np.array(
        [
            bx * img_w,
            by * img_h,
            (bx + bw) * img_w,
            (by + bh) * img_h,
        ]
    )


def _run_eval(
    dataset,
    pred_field,
    gt_field,
    eval_key,
    iou,
    use_masks=True,
):
    """Run COCO-style evaluate_detections and return the results object."""
    return dataset.evaluate_detections(
        pred_field,
        gt_field=gt_field,
        eval_key=eval_key,
        iou=iou,
        use_masks=use_masks,
        classwise=True,
    )


def _assert_parity(
    test_case,
    dataset,
    pred_field,
    gt_field,
    eval_key,
    use_masks=True,
):
    """Evaluate and assert that predictions and ground truth match closely.

    Checks:
      1. Every match has IoU >= MIN_MEAN_IOU.
      2. (optionally) There are zero FP and zero FN.
    """
    results = _run_eval(
        dataset, pred_field, gt_field, eval_key, MASK_IOU, use_masks
    )

    metrics = results.metrics()
    test_case.assertGreaterEqual(
        metrics["accuracy"],
        MIN_METRIC,
        f"[{eval_key}] Accuracy {metrics['accuracy']:.4f} < {MIN_METRIC}",
    )

    test_case.assertGreaterEqual(
        metrics["precision"],
        MIN_METRIC,
        f"[{eval_key}] Precision {metrics['precision']:.4f} < {MIN_METRIC}",
    )

    test_case.assertGreaterEqual(
        metrics["recall"],
        MIN_METRIC,
        f"[{eval_key}] Recall {metrics['recall']:.4f} < {MIN_METRIC}",
    )

    test_case.assertGreaterEqual(
        metrics["fscore"],
        MIN_METRIC,
        f"[{eval_key}] Fscore {metrics['fscore']:.4f} < {MIN_METRIC}",
    )


def _assert_video_parity(test_case, dataset, pred_field, gt_field, eval_key):
    """Run frame-level evaluate_detections and assert near-perfect agreement."""
    results = dataset.evaluate_detections(
        f"frames.{pred_field}",
        gt_field=f"frames.{gt_field}",
        eval_key=eval_key,
        iou=MASK_IOU,
        use_masks=True,
        classwise=True,
    )
    metrics = results.metrics()
    for metric_name in ("accuracy", "precision", "recall", "fscore"):
        test_case.assertGreaterEqual(
            metrics[metric_name],
            MIN_METRIC,
            f"[{eval_key}] {metric_name} {metrics[metric_name]:.4f} < {MIN_METRIC}",
        )


class TestSAMParity(unittest.TestCase):
    """Compare FiftyOne SAM integration outputs against direct
    segment_anything inference using evaluate_detections."""

    MODEL_NAME = "segment-anything-vitb-torch"

    @classmethod
    def setUpClass(cls):
        cls.fo_model = foz.load_zoo_model(cls.MODEL_NAME)

        from segment_anything import sam_model_registry, SamPredictor
        from segment_anything import SamAutomaticMaskGenerator

        checkpoint_path = cls.fo_model.config.model_path
        device = "cuda" if torch.cuda.is_available() else "cpu"

        sam = sam_model_registry["vit_b"](checkpoint=checkpoint_path)
        sam.to(device=device)

        cls.predictor = SamPredictor(sam)
        cls.auto_gen = SamAutomaticMaskGenerator(sam)
        cls.device = device
        cls.dataset = _create_test_dataset(num_samples=4, seed=12)
        cls.output_processor = fo.utils.sam.SAMSegmenterOutputProcessor()

    @classmethod
    def tearDownClass(cls):
        del cls.fo_model
        del cls.predictor
        del cls.auto_gen
        gc.collect()
        torch.cuda.empty_cache()

    def test_automatic_segmentation_parity(self):
        fo_field = "sam_auto_fo"
        direct_field = "sam_auto_direct"

        self.dataset.apply_model(self.fo_model, label_field=fo_field)
        self.dataset.set_field(
            f"{fo_field}.detections.label",
            F("label").if_else(F("label"), PLACEHOLDER_LABEL),
        ).save()

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            image = _get_image_as_numpy(sample.filepath)
            with torch.amp.autocast("cuda", enabled=False):
                masks = self.auto_gen.generate(image)
            sample[direct_field] = _auto_masks_to_detections(masks)

        _assert_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam_auto",
        )

    def test_box_prompt_parity(self):
        fo_field = "sam_box_fo"
        direct_field = "sam_box_direct"

        self.dataset.apply_model(
            self.fo_model,
            label_field=fo_field,
            prompt_field="ground_truth",
        )

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            gt = sample.get_field("ground_truth")

            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]
            self.predictor.set_image(image)

            masks = []
            scores = []
            dims_hw = (h, w)
            box_prompts = []
            labels = []
            with torch.amp.autocast("cuda", enabled=False):
                for gt_det in gt.detections:
                    box_abs = _box_to_sam_abs(gt_det.bounding_box, w, h)
                    _masks, _scores, _ = self.predictor.predict(
                        box=box_abs,
                        multimask_output=False,
                    )
                    masks.append(_masks[None, ...])
                    scores.append(_scores[None, ...])
                    box_prompts.append(box_abs)
                    labels.append(gt_det.label)

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[dims_hw],
                box_prompts=[box_prompts],
                labels=[labels],
            )[0]

        _assert_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam_box",
        )

    def test_keypoint_prompt_parity(self):
        kp_field = "sam_test_kps"
        fo_field = "sam_kp_fo"
        direct_field = "sam_kp_direct"

        kp_model = foz.load_zoo_model("vitpose-base-simple-torch")
        self.dataset.apply_model(
            kp_model, prompt_field="ground_truth", label_field=kp_field
        )

        self.dataset.apply_model(
            self.fo_model,
            label_field=fo_field,
            prompt_field=kp_field,
        )
        self.dataset.set_field(
            f"{fo_field}.detections.label",
            F("label").if_else(F("label"), PLACEHOLDER_LABEL),
        ).save()

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            kps_label = sample.get_field(kp_field)
            if kps_label is None or not kps_label.keypoints:
                sample[direct_field] = Detections()
                continue

            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]
            self.predictor.set_image(image)

            masks = []
            scores = []
            dims_hw = (h, w)
            labels = []
            with torch.amp.autocast("cuda", enabled=False):
                for kp in kps_label.keypoints:
                    pts = np.array(kp.points)
                    valid = (pts[:, 0] > 0) & (pts[:, 1] > 0)
                    if not valid.any():
                        continue

                    pts_abs = pts[valid] * np.array([w, h])
                    pts_labels = np.ones(len(pts_abs), dtype=np.int32)

                    _masks, _scores, _ = self.predictor.predict(
                        point_coords=pts_abs,
                        point_labels=pts_labels,
                        multimask_output=True,
                    )
                    masks.append(_masks[None, ...])
                    scores.append(_scores[None, ...])
                    labels.append(PLACEHOLDER_LABEL)

            if not masks:
                sample[direct_field] = Detections()
                continue

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[dims_hw],
                labels=[labels],
                mask_index=self.fo_model.config.points_mask_index,
            )[0]

        _assert_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam_kp",
        )


class TestSAM2Parity(unittest.TestCase):
    """Compare FiftyOne SAM2 integration outputs against direct
    sam2 inference using evaluate_detections."""

    MODEL_NAME = "segment-anything-2-hiera-tiny-image-torch"

    @classmethod
    def setUpClass(cls):
        cls.fo_model = foz.load_zoo_model(cls.MODEL_NAME)

        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor
        from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator

        checkpoint_path = cls.fo_model.config.model_path
        model_cfg = cls.fo_model.config.entrypoint_args["config_file"]
        device = "cuda" if torch.cuda.is_available() else "cpu"

        sam2 = build_sam2(model_cfg, checkpoint_path, device=device)

        cls.predictor = SAM2ImagePredictor(sam2)
        cls.auto_gen = SAM2AutomaticMaskGenerator(sam2)
        cls.device = device
        cls.dataset = _create_test_dataset(num_samples=4, seed=21)
        cls.output_processor = fo.utils.sam.SAMSegmenterOutputProcessor()

    @classmethod
    def tearDownClass(cls):
        del cls.fo_model
        del cls.predictor
        del cls.auto_gen
        gc.collect()
        torch.cuda.empty_cache()

    def test_automatic_segmentation_parity(self):
        fo_field = "sam2_auto_fo"
        direct_field = "sam2_auto_direct"

        self.dataset.apply_model(self.fo_model, label_field=fo_field)
        self.dataset.set_field(
            f"{fo_field}.detections.label",
            F("label").if_else(F("label"), PLACEHOLDER_LABEL),
        ).save()

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            image = _get_image_as_numpy(sample.filepath)
            masks = self.auto_gen.generate(image)
            sample[direct_field] = _auto_masks_to_detections(masks)

        _assert_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam2_auto",
        )

    def test_box_prompt_parity(self):
        fo_field = "sam2_box_fo"
        direct_field = "sam2_box_direct"

        self.dataset.apply_model(
            self.fo_model,
            label_field=fo_field,
            prompt_field="ground_truth",
        )

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            gt = sample.get_field("ground_truth")

            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]

            self.predictor.set_image(image)

            masks = []
            scores = []
            dims_hw = (h, w)
            box_prompts = []
            labels = []
            for gt_det in gt.detections:
                box_abs = _box_to_sam_abs(gt_det.bounding_box, w, h)
                _masks, _scores, _ = self.predictor.predict(
                    box=box_abs,
                    multimask_output=False,
                )
                masks.append(_masks[None, ...])
                scores.append(_scores[None, ...])
                box_prompts.append(box_abs)
                labels.append(gt_det.label)

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[dims_hw],
                box_prompts=[box_prompts],
                labels=[labels],
            )[0]

        _assert_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam2_box",
        )

    def test_keypoint_prompt_parity(self):
        kp_field = "sam2_test_kps"
        fo_field = "sam2_kp_fo"
        direct_field = "sam2_kp_direct"

        kp_model = foz.load_zoo_model("vitpose-base-simple-torch")
        self.dataset.apply_model(
            kp_model, prompt_field="ground_truth", label_field=kp_field
        )

        self.dataset.apply_model(
            self.fo_model,
            label_field=fo_field,
            prompt_field=kp_field,
        )
        self.dataset.set_field(
            f"{fo_field}.detections.label",
            F("label").if_else(F("label"), PLACEHOLDER_LABEL),
        ).save()

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            kps_label = sample.get_field(kp_field)
            if kps_label is None or not kps_label.keypoints:
                sample[direct_field] = Detections()
                continue

            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]

            self.predictor.set_image(image)

            masks = []
            scores = []
            dims_hw = (h, w)
            labels = []
            for kp in kps_label.keypoints:
                pts = np.array(kp.points)
                valid = (pts[:, 0] > 0) & (pts[:, 1] > 0)
                if not valid.any():
                    continue

                pts_abs = pts[valid] * np.array([w, h])
                labels_arr = np.ones(len(pts_abs), dtype=np.int32)

                _masks, _scores, _ = self.predictor.predict(
                    point_coords=pts_abs,
                    point_labels=labels_arr,
                    multimask_output=True,
                )
                masks.append(_masks[None, ...])
                scores.append(_scores[None, ...])
                labels.append(PLACEHOLDER_LABEL)

            if not masks:
                sample[direct_field] = Detections()
                continue

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[dims_hw],
                labels=[labels],
                mask_index=self.fo_model.config.points_mask_index,
            )[0]

        _assert_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam2_kp",
        )

    def test_combined_box_and_point_prompt_parity(self):
        """Box + center-point combined prompts."""
        fo_field = "sam2_combo_fo"
        direct_field = "sam2_combo_direct"

        # Build synthetic center-point keypoints from ground_truth boxes
        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            gt = sample.get_field("ground_truth")
            if gt is None:
                continue
            kps = []
            for det in gt.detections:
                bx, by, bw, bh = det.bounding_box
                cx, cy = bx + bw / 2, by + bh / 2
                kps.append(Keypoint(points=[(cx, cy)], label=det.label))
            sample["combo_points"] = Keypoints(keypoints=kps)

        # FiftyOne model inference with box and point prompts
        self.dataset.apply_model(
            self.fo_model,
            label_field=fo_field,
            box_prompt_field="ground_truth",
            point_prompt_field="combo_points",
        )

        # Direct SAM2 inference with box + center point
        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            gt = sample.get_field("ground_truth")
            combo_kps = sample.get_field("combo_points")
            if gt is None or not gt.detections:
                sample[direct_field] = Detections()
                continue

            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]

            self.predictor.set_image(image)

            masks = []
            scores = []
            dims_hw = (h, w)
            box_prompts = []
            labels = []
            for i, gt_det in enumerate(gt.detections):
                box_abs = _box_to_sam_abs(gt_det.bounding_box, w, h)

                # Also provide center point if available
                point_coords = None
                point_labels = None
                if combo_kps is not None and i < len(combo_kps.keypoints):
                    pts = combo_kps.keypoints[i].points
                    if pts:
                        px, py = pts[0]
                        point_coords = np.array([[px * w, py * h]])
                        point_labels = np.array([1])

                _masks, _scores, _ = self.predictor.predict(
                    point_coords=point_coords,
                    point_labels=point_labels,
                    box=box_abs,
                    multimask_output=False,
                )

                masks.append(_masks[None, ...])
                scores.append(_scores[None, ...])
                box_prompts.append(box_abs)
                labels.append(gt_det.label)

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[dims_hw],
                box_prompts=[box_prompts],
                labels=[labels],
            )[0]

        _assert_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam2_combo",
        )


class TestSAMInteractiveValidation(unittest.TestCase):
    """Input validation for predict_interactive."""

    MODEL_NAME = "segment-anything-vitb-torch"

    @classmethod
    def setUpClass(cls):
        cls.fo_model = foz.load_zoo_model(cls.MODEL_NAME)
        cls.dataset = _create_test_dataset(num_samples=2, seed=22)

    @classmethod
    def tearDownClass(cls):
        fo.delete_dataset(cls.dataset.name)

    def test_points_without_labels_raises(self):
        sample = self.dataset.first()
        points = [torch.tensor([[100.0, 200.0]])]
        with self.assertRaises((AssertionError, ValueError)):
            self.fo_model.predict_interactive(
                sample=sample,
                points=points,
                point_labels=None,
            )

    def test_mismatched_points_labels_raises(self):
        sample = self.dataset.first()
        points = [
            torch.tensor([[100.0, 200.0]]),
            torch.tensor([[300.0, 400.0]]),
        ]
        point_labels = [torch.tensor([1])]
        with self.assertRaises((AssertionError, ValueError)):
            self.fo_model.predict_interactive(
                sample=sample,
                points=points,
                point_labels=point_labels,
            )

    def test_mismatched_boxes_points_raises(self):
        sample = self.dataset.first()
        boxes = torch.tensor([[10.0, 20.0, 100.0, 200.0]])
        points = [
            torch.tensor([[50.0, 60.0]]),
            torch.tensor([[70.0, 80.0]]),
        ]
        point_labels = [torch.tensor([1]), torch.tensor([1])]
        with self.assertRaises((AssertionError, ValueError)):
            self.fo_model.predict_interactive(
                sample=sample,
                boxes=boxes,
                points=points,
                point_labels=point_labels,
            )

    def test_no_sample_no_cache_warns(self):
        self.fo_model._sam_predictor.reset_image()
        with self.assertLogs(level="WARNING"):
            try:
                self.fo_model.predict_interactive(
                    sample=None,
                    boxes=torch.tensor([[10.0, 20.0, 100.0, 200.0]]),
                )
            except Exception:
                pass


class TestSAMInteractiveParity(unittest.TestCase):
    """Compare predict_interactive outputs against direct
    segment_anything inference using evaluate_detections."""

    MODEL_NAME = "segment-anything-vitb-torch"

    @classmethod
    def setUpClass(cls):
        cls.fo_model = foz.load_zoo_model(cls.MODEL_NAME)

        from segment_anything import sam_model_registry, SamPredictor
        from segment_anything import SamAutomaticMaskGenerator

        checkpoint_path = cls.fo_model.config.model_path
        device = "cuda" if torch.cuda.is_available() else "cpu"

        sam = sam_model_registry["vit_b"](checkpoint=checkpoint_path)
        sam.to(device=device)

        cls.predictor = SamPredictor(sam)
        cls.auto_gen = SamAutomaticMaskGenerator(sam)
        cls.device = device
        cls.dataset = _create_test_dataset(num_samples=2, seed=7)
        cls.output_processor = fo.utils.sam.SAMSegmenterOutputProcessor()

    @classmethod
    def tearDownClass(cls):
        del cls.fo_model
        del cls.predictor
        del cls.auto_gen
        gc.collect()
        torch.cuda.empty_cache()

    def test_interactive_auto_parity(self):
        interactive_field = "sam_inter_auto"
        direct_field = "sam_direct_auto"

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            # predict_interactive auto mode
            sample[interactive_field] = self.fo_model.predict_interactive(
                sample=sample
            )

            # Direct SAM auto
            image = _get_image_as_numpy(sample.filepath)
            with torch.amp.autocast("cuda", enabled=False):
                masks = self.auto_gen.generate(image)
            sample[direct_field] = _auto_masks_to_detections(masks)

        self.dataset.set_field(
            f"{interactive_field}.detections.label",
            F("label").if_else(F("label"), PLACEHOLDER_LABEL),
        ).save()

        _assert_parity(
            self,
            self.dataset,
            interactive_field,
            direct_field,
            eval_key="eval_sam_inter_auto",
        )

    def test_interactive_box_prompt_parity(self):
        interactive_field = "sam_inter_box"
        direct_field = "sam_direct_box"

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            gt = sample.get_field("ground_truth")
            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]

            (
                boxes,
                boxes_xyxy,
                box_classes,
                _,
            ) = fo.utils.sam.preprocess_detections_to_sam(
                gt, (h, w), self.fo_model._sam_predictor.box_transform
            )
            sample[interactive_field] = self.fo_model.predict_interactive(
                sample=sample,
                boxes=boxes,
                boxes_xyxy=boxes_xyxy,
                prompt_classes=box_classes,
            )

            self.predictor.set_image(image)
            masks = []
            scores = []
            box_prompts = []
            labels = []
            with torch.amp.autocast("cuda", enabled=False):
                for gt_det in gt.detections:
                    box_abs = _box_to_sam_abs(gt_det.bounding_box, w, h)
                    _masks, _scores, _ = self.predictor.predict(
                        box=box_abs,
                        multimask_output=False,
                    )
                    masks.append(_masks[None, ...])
                    scores.append(_scores[None, ...])
                    box_prompts.append(box_abs)
                    labels.append(gt_det.label)

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[(h, w)],
                box_prompts=[box_prompts],
                labels=[labels],
            )[0]

        _assert_parity(
            self,
            self.dataset,
            interactive_field,
            direct_field,
            eval_key="eval_sam_inter_box",
        )

    def test_interactive_keypoint_prompt_parity(self):
        kp_field = "sam_inter_test_kps"
        interactive_field = "sam_inter_kp"
        direct_field = "sam_direct_kp"

        kp_model = foz.load_zoo_model("vitpose-base-simple-torch")
        self.dataset.apply_model(
            kp_model, prompt_field="ground_truth", label_field=kp_field
        )

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            kps_label = sample.get_field(kp_field)
            if kps_label is None or not kps_label.keypoints:
                sample[interactive_field] = Detections()
                sample[direct_field] = Detections()
                continue

            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]

            (
                points,
                points_labels,
                points_classes,
            ) = fo.utils.sam.preprocess_keypoints_to_sam(
                kps_label,
                (h, w),
                self.fo_model._sam_predictor.point_transform,
            )

            sample[interactive_field] = self.fo_model.predict_interactive(
                sample=sample,
                points=points,
                point_labels=points_labels,
                prompt_classes=points_classes,
            )

            self.predictor.set_image(image)
            masks = []
            scores = []
            labels = []
            with torch.amp.autocast("cuda", enabled=False):
                for kp in kps_label.keypoints:
                    pts = np.array(kp.points)
                    valid = (pts[:, 0] > 0) & (pts[:, 1] > 0)
                    if not valid.any():
                        continue

                    pts_abs = pts[valid] * np.array([w, h])
                    pts_labels = np.ones(len(pts_abs), dtype=np.int32)

                    _masks, _scores, _ = self.predictor.predict(
                        point_coords=pts_abs,
                        point_labels=pts_labels,
                        multimask_output=True,
                    )
                    masks.append(_masks[None, ...])
                    scores.append(_scores[None, ...])
                    labels.append(PLACEHOLDER_LABEL)

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[(h, w)],
                labels=[labels],
                mask_index=self.fo_model.config.points_mask_index,
            )[0]

        self.dataset.set_field(
            f"{interactive_field}.detections.label",
            F("label").if_else(F("label"), PLACEHOLDER_LABEL),
        ).save()

        _assert_parity(
            self,
            self.dataset,
            interactive_field,
            direct_field,
            eval_key="eval_sam_inter_kp",
        )

    def test_interactive_box_point_combo_parity(self):
        interactive_field = "sam_inter_combo"
        direct_field = "sam_direct_combo"

        # Build center-point keypoints from ground_truth boxes
        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            gt = sample.get_field("ground_truth")
            if gt is None:
                continue
            kps = []
            for det in gt.detections:
                bx, by, bw, bh = det.bounding_box
                cx, cy = bx + bw / 2, by + bh / 2
                kps.append(Keypoint(points=[(cx, cy)], label=det.label))
            sample["combo_points"] = Keypoints(keypoints=kps)

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            gt = sample.get_field("ground_truth")
            combo_kps = sample.get_field("combo_points")
            if gt is None or not gt.detections:
                sample[interactive_field] = Detections()
                sample[direct_field] = Detections()
                continue

            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]

            (
                boxes,
                boxes_xyxy,
                box_classes,
                _,
            ) = fo.utils.sam.preprocess_detections_to_sam(
                gt, (h, w), self.fo_model._sam_predictor.box_transform
            )

            (
                points,
                points_labels,
                _,
            ) = fo.utils.sam.preprocess_keypoints_to_sam(
                combo_kps,
                (h, w),
                self.fo_model._sam_predictor.point_transform,
            )

            sample[interactive_field] = self.fo_model.predict_interactive(
                sample=sample,
                boxes=boxes,
                points=points,
                point_labels=points_labels,
                prompt_classes=box_classes,
                boxes_xyxy=boxes_xyxy,
            )

            self.predictor.set_image(image)
            masks = []
            scores = []
            box_prompts = []
            labels = []
            with torch.amp.autocast("cuda", enabled=False):
                for i, gt_det in enumerate(gt.detections):
                    box_abs = _box_to_sam_abs(gt_det.bounding_box, w, h)

                    point_coords = None
                    point_labels_arr = None
                    if combo_kps is not None and i < len(combo_kps.keypoints):
                        pts = combo_kps.keypoints[i].points
                        if pts:
                            px, py = pts[0]
                            point_coords = np.array([[px * w, py * h]])
                            point_labels_arr = np.array([1])

                    _masks, _scores, _ = self.predictor.predict(
                        point_coords=point_coords,
                        point_labels=point_labels_arr,
                        box=box_abs,
                        multimask_output=False,
                    )
                    masks.append(_masks[None, ...])
                    scores.append(_scores[None, ...])
                    box_prompts.append(box_abs)
                    labels.append(gt_det.label)

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[(h, w)],
                box_prompts=[box_prompts],
                labels=[labels],
            )[0]

        _assert_parity(
            self,
            self.dataset,
            interactive_field,
            direct_field,
            eval_key="eval_sam_inter_combo",
        )


class TestSAM2InteractiveParity(unittest.TestCase):
    """Compare predict_interactive outputs against direct
    segment_anything inference using evaluate_detections."""

    MODEL_NAME = "segment-anything-2-hiera-tiny-image-torch"

    @classmethod
    def setUpClass(cls):
        cls.fo_model = foz.load_zoo_model(cls.MODEL_NAME)

        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor
        from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator

        checkpoint_path = cls.fo_model.config.model_path
        model_cfg = cls.fo_model.config.entrypoint_args["config_file"]
        device = "cuda" if torch.cuda.is_available() else "cpu"

        sam2 = build_sam2(model_cfg, checkpoint_path, device=device)

        cls.predictor = SAM2ImagePredictor(sam2)
        cls.auto_gen = SAM2AutomaticMaskGenerator(sam2)
        cls.device = device
        cls.dataset = _create_test_dataset(num_samples=2, seed=7)
        cls.output_processor = fo.utils.sam.SAMSegmenterOutputProcessor()

    @classmethod
    def tearDownClass(cls):
        del cls.fo_model
        del cls.predictor
        del cls.auto_gen
        gc.collect()
        torch.cuda.empty_cache()

    def test_interactive_auto_parity(self):
        interactive_field = "sam2_inter_auto"
        direct_field = "sam2_direct_auto"

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            # predict_interactive auto mode
            sample[interactive_field] = self.fo_model.predict_interactive(
                sample=sample
            )

            # Direct SAM auto
            image = _get_image_as_numpy(sample.filepath)
            masks = self.auto_gen.generate(image)
            sample[direct_field] = _auto_masks_to_detections(masks)

        self.dataset.set_field(
            f"{interactive_field}.detections.label",
            F("label").if_else(F("label"), PLACEHOLDER_LABEL),
        ).save()

        _assert_parity(
            self,
            self.dataset,
            interactive_field,
            direct_field,
            eval_key="eval_sam2_inter_auto",
        )

    def test_interactive_box_prompt_parity(self):
        interactive_field = "sam2_inter_box"
        direct_field = "sam2_direct_box"

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            gt = sample.get_field("ground_truth")
            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]

            (
                boxes,
                boxes_xyxy,
                box_classes,
                _,
            ) = fo.utils.sam.preprocess_detections_to_sam(
                gt, (h, w), self.fo_model._sam_predictor.box_transform
            )
            sample[interactive_field] = self.fo_model.predict_interactive(
                sample=sample,
                boxes=boxes,
                boxes_xyxy=boxes_xyxy,
                prompt_classes=box_classes,
            )

            self.predictor.set_image(image)
            masks = []
            scores = []
            box_prompts = []
            labels = []
            for gt_det in gt.detections:
                box_abs = _box_to_sam_abs(gt_det.bounding_box, w, h)
                _masks, _scores, _ = self.predictor.predict(
                    box=box_abs,
                    multimask_output=False,
                )
                masks.append(_masks[None, ...])
                scores.append(_scores[None, ...])
                box_prompts.append(box_abs)
                labels.append(gt_det.label)

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[(h, w)],
                box_prompts=[box_prompts],
                labels=[labels],
            )[0]

        _assert_parity(
            self,
            self.dataset,
            interactive_field,
            direct_field,
            eval_key="eval_sam2_inter_box",
        )

    def test_interactive_keypoint_prompt_parity(self):
        kp_field = "sam2_inter_test_kps"
        interactive_field = "sam2_inter_kp"
        direct_field = "sam2_direct_kp"

        kp_model = foz.load_zoo_model("vitpose-base-simple-torch")
        self.dataset.apply_model(
            kp_model, prompt_field="ground_truth", label_field=kp_field
        )

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            kps_label = sample.get_field(kp_field)
            if kps_label is None or not kps_label.keypoints:
                sample[interactive_field] = Detections()
                sample[direct_field] = Detections()
                continue

            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]

            (
                points,
                points_labels,
                points_classes,
            ) = fo.utils.sam.preprocess_keypoints_to_sam(
                kps_label,
                (h, w),
                self.fo_model._sam_predictor.point_transform,
            )

            sample[interactive_field] = self.fo_model.predict_interactive(
                sample=sample,
                points=points,
                point_labels=points_labels,
                prompt_classes=points_classes,
            )

            self.predictor.set_image(image)
            masks = []
            scores = []
            labels = []
            for kp in kps_label.keypoints:
                pts = np.array(kp.points)
                valid = (pts[:, 0] > 0) & (pts[:, 1] > 0)
                if not valid.any():
                    continue

                pts_abs = pts[valid] * np.array([w, h])
                pts_labels = np.ones(len(pts_abs), dtype=np.int32)

                _masks, _scores, _ = self.predictor.predict(
                    point_coords=pts_abs,
                    point_labels=pts_labels,
                    multimask_output=True,
                )
                masks.append(_masks[None, ...])
                scores.append(_scores[None, ...])
                labels.append(PLACEHOLDER_LABEL)

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[(h, w)],
                labels=[labels],
                mask_index=self.fo_model.config.points_mask_index,
            )[0]

        self.dataset.set_field(
            f"{interactive_field}.detections.label",
            F("label").if_else(F("label"), PLACEHOLDER_LABEL),
        ).save()

        _assert_parity(
            self,
            self.dataset,
            interactive_field,
            direct_field,
            eval_key="eval_sam2_inter_kp",
        )

    def test_interactive_box_point_combo_parity(self):
        interactive_field = "sam2_inter_combo"
        direct_field = "sam2_direct_combo"

        # Build center-point keypoints from ground_truth boxes
        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            gt = sample.get_field("ground_truth")
            if gt is None:
                continue
            kps = []
            for det in gt.detections:
                bx, by, bw, bh = det.bounding_box
                cx, cy = bx + bw / 2, by + bh / 2
                kps.append(Keypoint(points=[(cx, cy)], label=det.label))
            sample["combo_points"] = Keypoints(keypoints=kps)

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            gt = sample.get_field("ground_truth")
            combo_kps = sample.get_field("combo_points")
            if gt is None or not gt.detections:
                sample[interactive_field] = Detections()
                sample[direct_field] = Detections()
                continue

            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]

            (
                boxes,
                boxes_xyxy,
                box_classes,
                _,
            ) = fo.utils.sam.preprocess_detections_to_sam(
                gt, (h, w), self.fo_model._sam_predictor.box_transform
            )

            (
                points,
                points_labels,
                _,
            ) = fo.utils.sam.preprocess_keypoints_to_sam(
                combo_kps,
                (h, w),
                self.fo_model._sam_predictor.point_transform,
            )

            sample[interactive_field] = self.fo_model.predict_interactive(
                sample=sample,
                boxes=boxes,
                points=points,
                point_labels=points_labels,
                prompt_classes=box_classes,
                boxes_xyxy=boxes_xyxy,
            )

            self.predictor.set_image(image)
            masks = []
            scores = []
            box_prompts = []
            labels = []
            for i, gt_det in enumerate(gt.detections):
                box_abs = _box_to_sam_abs(gt_det.bounding_box, w, h)

                point_coords = None
                point_labels_arr = None
                if combo_kps is not None and i < len(combo_kps.keypoints):
                    pts = combo_kps.keypoints[i].points
                    if pts:
                        px, py = pts[0]
                        point_coords = np.array([[px * w, py * h]])
                        point_labels_arr = np.array([1])

                _masks, _scores, _ = self.predictor.predict(
                    point_coords=point_coords,
                    point_labels=point_labels_arr,
                    box=box_abs,
                    multimask_output=False,
                )
                masks.append(_masks[None, ...])
                scores.append(_scores[None, ...])
                box_prompts.append(box_abs)
                labels.append(gt_det.label)

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[(h, w)],
                box_prompts=[box_prompts],
                labels=[labels],
            )[0]

        _assert_parity(
            self,
            self.dataset,
            interactive_field,
            direct_field,
            eval_key="eval_sam2_inter_combo",
        )


def _concept_output_to_detections(output, img_h, img_w, label="mask"):
    """Convert ``Sam3Processor.set_text_prompt()`` output to
    ``fo.Detections``.

    Args:
        output: dict with keys ``masks`` ([N, H, W] bool/uint8),
            ``boxes`` ([N, 4] xyxy absolute), ``scores`` ([N] float).
        img_h: original image height.
        img_w: original image width.
        label: label string to assign to each detection.

    Returns:
        a :class:`fiftyone.core.labels.Detections` instance.
    """
    masks = output["masks"]
    scores = output["scores"]

    if isinstance(masks, torch.Tensor):
        masks = masks.cpu().float().numpy()
    if isinstance(scores, torch.Tensor):
        scores = scores.cpu().float().numpy()

    if masks.ndim > 3:
        masks = masks.squeeze(1)

    dets = []
    for i in range(len(masks)):
        mask_i = masks[i].astype(bool) if masks[i].dtype != bool else masks[i]

        # Resize to original image size if needed
        mh, mw = mask_i.shape
        if mh != img_h or mw != img_w:
            mask_i = cv2.resize(
                mask_i.astype(np.uint8),
                (img_w, img_h),
                interpolation=cv2.INTER_NEAREST,
            ).astype(bool)

        if not mask_i.any():
            continue

        det = Detection.from_mask(
            mask=mask_i,
            label=label,
            confidence=float(scores[i]),
        )
        dets.append(det)

    return Detections(detections=dets)


class TestSAM3ConceptParity(unittest.TestCase):
    """Compare FiftyOne SAM3 concept-mode integration outputs against
    direct ``Sam3Processor.set_text_prompt()`` inference."""

    MODEL_NAME = "segment-anything-3-image-torch"

    @classmethod
    def setUpClass(cls):
        cls.fo_model = foz.load_zoo_model(
            cls.MODEL_NAME,
            classes=TEXT_PROMPTS,
            operation_mode="concept",
        )

        from sam3.model_builder import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor

        cls.sam3_model = build_sam3_image_model()
        cls.processor = Sam3Processor(cls.sam3_model)

        cls.device = "cuda" if torch.cuda.is_available() else "cpu"
        cls.dataset = _create_test_dataset(num_samples=4, seed=31)

    @classmethod
    def tearDownClass(cls):
        del cls.fo_model
        del cls.sam3_model
        del cls.processor
        gc.collect()
        torch.cuda.empty_cache()

    def test_concept_text_prompt_parity(self):
        fo_field = "sam3_concept_fo"
        direct_field = "sam3_concept_direct"

        self.dataset.apply_model(self.fo_model, label_field=fo_field)
        self.dataset.set_field(
            f"{fo_field}.detections.label",
            F("label").if_else(F("label"), PLACEHOLDER_LABEL),
        ).save()

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            image = _get_image_as_pil(sample.filepath)
            img_np = np.array(image)
            img_h, img_w = img_np.shape[:2]

            inference_state = self.processor.set_image(image)

            all_dets = []
            for prompt_text in TEXT_PROMPTS:
                output = self.processor.set_text_prompt(
                    state=inference_state,
                    prompt=prompt_text,
                )
                dets = _concept_output_to_detections(
                    output, img_h, img_w, label=PLACEHOLDER_LABEL
                )
                all_dets.extend(dets.detections)

            sample[direct_field] = Detections(detections=all_dets)

        _assert_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam3_concept",
        )

    def test_concept_multi_prompt_parity(self):
        """Multiple text prompts: verify each prompt's detections match."""
        multi_prompts = ["person", "car"]

        fo_model_multi = foz.load_zoo_model(
            self.MODEL_NAME,
            classes=multi_prompts,
            operation_mode="concept",
        )

        fo_field = "sam3_multi_fo"
        direct_field = "sam3_multi_direct"

        self.dataset.apply_model(fo_model_multi, label_field=fo_field)
        self.dataset.set_field(
            f"{fo_field}.detections.label",
            F("label").if_else(F("label"), PLACEHOLDER_LABEL),
        ).save()

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            image = _get_image_as_pil(sample.filepath)
            img_np = np.array(image)
            img_h, img_w = img_np.shape[:2]

            inference_state = self.processor.set_image(image)

            all_dets = []
            for prompt_text in multi_prompts:
                output = self.processor.set_text_prompt(
                    state=inference_state,
                    prompt=prompt_text,
                )
                dets = _concept_output_to_detections(
                    output, img_h, img_w, label=PLACEHOLDER_LABEL
                )
                all_dets.extend(dets.detections)

            sample[direct_field] = Detections(detections=all_dets)

        _assert_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam3_multi",
        )


class TestSAM3VisualParity(unittest.TestCase):
    """Compare FiftyOne SAM3 visual-mode integration outputs against
    direct SAM3 interactive predictor inference."""

    MODEL_NAME = "segment-anything-3-image-torch"

    @classmethod
    def setUpClass(cls):
        cls.fo_model = foz.load_zoo_model(
            cls.MODEL_NAME,
            operation_mode="visual",
        )

        from sam3.model_builder import build_sam3_image_model

        sam3_model = build_sam3_image_model(
            enable_inst_interactivity=True,
        )
        tracker_model = sam3_model.inst_interactive_predictor.model
        if getattr(tracker_model, "backbone", None) is None:
            tracker_model.backbone = sam3_model.backbone
        cls.predictor = sam3_model.inst_interactive_predictor

        cls.device = "cuda" if torch.cuda.is_available() else "cpu"
        cls.dataset = _create_test_dataset(num_samples=4, seed=21)
        cls.output_processor = fo.utils.sam.SAMSegmenterOutputProcessor()

    @classmethod
    def tearDownClass(cls):
        del cls.fo_model
        del cls.predictor
        gc.collect()
        torch.cuda.empty_cache()

    def test_box_prompt_parity(self):
        """Box prompts: FiftyOne apply_model vs. direct predictor."""
        fo_field = "sam3_box_fo"
        direct_field = "sam3_box_direct"

        # FiftyOne model inference with box prompts
        self.dataset.apply_model(
            self.fo_model,
            label_field=fo_field,
            prompt_field="ground_truth",
        )

        # Direct SAM3 inference with box prompts
        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            gt = sample.get_field("ground_truth")

            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]

            self.predictor.set_image(image)

            masks = []
            scores = []
            dims_hw = (h, w)
            box_prompts = []
            labels = []
            for gt_det in gt.detections:
                box_abs = _box_to_sam_abs(gt_det.bounding_box, w, h)
                _masks, _scores, _ = self.predictor.predict(
                    box=box_abs,
                    multimask_output=False,
                )
                masks.append(_masks[None, ...])
                scores.append(_scores[None, ...])
                box_prompts.append(box_abs)
                labels.append(gt_det.label)

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[dims_hw],
                box_prompts=[box_prompts],
                labels=[labels],
            )[0]

        _assert_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam3_box",
        )

    def test_keypoint_prompt_parity(self):
        """Keypoint prompts: FiftyOne apply_model vs. direct predictor."""
        kp_field = "sam3_test_kps"
        fo_field = "sam3_kp_fo"
        direct_field = "sam3_kp_direct"

        kp_model = foz.load_zoo_model("vitpose-base-simple-torch")
        with torch.amp.autocast("cuda", enabled=False):
            self.dataset.apply_model(
                kp_model,
                prompt_field="ground_truth",
                label_field=kp_field,
            )

        self.dataset.apply_model(
            self.fo_model,
            label_field=fo_field,
            prompt_field=kp_field,
        )
        self.dataset.set_field(
            f"{fo_field}.detections.label",
            F("label").if_else(F("label"), PLACEHOLDER_LABEL),
        ).save()

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            kps_label = sample.get_field(kp_field)
            if kps_label is None or not kps_label.keypoints:
                sample[direct_field] = Detections()
                continue

            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]

            self.predictor.set_image(image)

            masks = []
            scores = []
            dims_hw = (h, w)
            labels = []
            for kp in kps_label.keypoints:
                pts = np.array(kp.points)
                valid = (pts[:, 0] > 0) & (pts[:, 1] > 0)
                if not valid.any():
                    continue

                pts_abs = pts[valid] * np.array([w, h])
                labels_arr = np.ones(len(pts_abs), dtype=np.int32)

                _masks, _scores, _ = self.predictor.predict(
                    point_coords=pts_abs,
                    point_labels=labels_arr,
                    multimask_output=True,
                )
                masks.append(_masks[None, ...])
                scores.append(_scores[None, ...])
                labels.append(PLACEHOLDER_LABEL)

            if not masks:
                sample[direct_field] = Detections()
                continue

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[dims_hw],
                labels=[labels],
                mask_index=self.fo_model.config.points_mask_index,
            )[0]

        _assert_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam3_kp",
        )

    def test_combined_box_and_point_prompt_parity(self):
        """Box + center-point combined prompts."""
        fo_field = "sam3_combo_fo"
        direct_field = "sam3_combo_direct"

        # Build synthetic center-point keypoints from ground_truth boxes
        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            gt = sample.get_field("ground_truth")
            if gt is None:
                continue
            kps = []
            for det in gt.detections:
                bx, by, bw, bh = det.bounding_box
                cx, cy = bx + bw / 2, by + bh / 2
                kps.append(Keypoint(points=[(cx, cy)], label=det.label))
            sample["combo_points"] = Keypoints(keypoints=kps)

        # FiftyOne model inference with box + point prompts
        self.dataset.apply_model(
            self.fo_model,
            label_field=fo_field,
            box_prompt_field="ground_truth",
            point_prompt_field="combo_points",
        )

        # Direct SAM3 inference with box + center point
        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            gt = sample.get_field("ground_truth")
            combo_kps = sample.get_field("combo_points")
            if gt is None or not gt.detections:
                sample[direct_field] = Detections()
                continue

            image = _get_image_as_numpy(sample.filepath)
            h, w = image.shape[:2]

            self.predictor.set_image(image)

            masks = []
            scores = []
            dims_hw = (h, w)
            box_prompts = []
            labels = []
            for i, gt_det in enumerate(gt.detections):
                box_abs = _box_to_sam_abs(gt_det.bounding_box, w, h)

                # Also provide center point if available
                point_coords = None
                point_labels = None
                if combo_kps is not None and i < len(combo_kps.keypoints):
                    pts = combo_kps.keypoints[i].points
                    if pts:
                        px, py = pts[0]
                        point_coords = np.array([[px * w, py * h]])
                        point_labels = np.array([1])

                _masks, _scores, _ = self.predictor.predict(
                    point_coords=point_coords,
                    point_labels=point_labels,
                    box=box_abs,
                    multimask_output=False,
                )

                masks.append(_masks[None, ...])
                scores.append(_scores[None, ...])
                box_prompts.append(box_abs)
                labels.append(gt_det.label)

            outputs = {
                "masks": torch.as_tensor(np.concatenate(masks, axis=0)),
                "iou_predictions": torch.as_tensor(
                    np.concatenate(scores, axis=0)
                ),
            }
            sample[direct_field] = self.output_processor(
                output=[outputs],
                frame_size=[dims_hw],
                box_prompts=[box_prompts],
                labels=[labels],
            )[0]

        _assert_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam3_combo",
        )


class TestSAM3VideoConceptParity(unittest.TestCase):
    """Compare FiftyOne SAM3 video concept-mode output against direct
    concept_predictor (handle_request) inference."""

    @classmethod
    def setUpClass(cls):
        from sam3.model_builder import build_sam3_video_predictor

        cls.fo_model = foz.load_zoo_model(
            SAM3_VIDEO_MODEL_NAME,
            classes=VID_TEXT_PROMPTS,
            operation_mode="concept",
        )

        device_idx = (
            cls.fo_model._device.index
            if cls.fo_model._device.index is not None
            else 0
        )
        cls.direct_predictor = build_sam3_video_predictor(
            gpus_to_use=[device_idx]
        )
        cls.dataset = _create_video_dataset(num_samples=2, seed=31)

    @classmethod
    def tearDownClass(cls):
        del cls.fo_model
        del cls.direct_predictor
        gc.collect()
        torch.cuda.empty_cache()

    def tearDown(self):
        gc.collect()
        torch.cuda.empty_cache()

    def _run_direct_concept(self, sample, text_prompts, text_frame_idx=0):
        """Run concept_predictor directly and return {frame_number: Detections}.

        Mirrors FO's per-prompt propagation: each add_prompt resets model
        state, so we run one propagation pass per prompt and accumulate."""
        video_path = sample.filepath
        w = sample.metadata.frame_width
        h = sample.metadata.frame_height

        response = self.direct_predictor.handle_request(
            request=dict(type="start_session", resource_path=video_path)
        )
        session_id = response["session_id"]

        result = {
            i + 1: Detections(detections=[]) for i in range(len(sample.frames))
        }

        try:
            for text_prompt in text_prompts:
                prompt_response = self.direct_predictor.handle_request(
                    request=dict(
                        type="add_prompt",
                        session_id=session_id,
                        frame_index=text_frame_idx,
                        text=text_prompt,
                    )
                )
                outputs = prompt_response.get("outputs", prompt_response)
                label_map = {
                    oid: text_prompt for oid in outputs.get("out_obj_ids", [])
                }

                for (
                    frame_result
                ) in self.direct_predictor.handle_stream_request(
                    request=dict(
                        type="propagate_in_video",
                        session_id=session_id,
                        propagation_direction="forward",
                    )
                ):
                    out_frame_idx = frame_result.get("frame_index", 0)
                    out = frame_result.get("outputs", frame_result)

                    out_obj_ids = out.get("out_obj_ids", [])
                    out_probs = out.get("out_probs")
                    out_boxes = out.get("out_boxes_xywh")
                    out_masks = out.get("out_binary_masks")

                    if out_masks is None or len(out_obj_ids) == 0:
                        continue

                    if isinstance(out_masks, torch.Tensor):
                        out_masks = out_masks.cpu().numpy()
                    if isinstance(out_probs, torch.Tensor):
                        out_probs = out_probs.cpu().numpy()
                    if isinstance(out_boxes, torch.Tensor):
                        out_boxes = out_boxes.cpu().numpy()

                    new_dets = fosam3._sam3_output_to_detections(
                        out_binary_masks=out_masks,
                        out_boxes_xywh=out_boxes,
                        out_obj_ids=out_obj_ids,
                        out_probs=out_probs,
                        frame_width=w,
                        frame_height=h,
                        label_map=label_map,
                        default_label=text_prompt,
                    )
                    frame_num = int(out_frame_idx) + 1
                    existing = result.get(frame_num, Detections(detections=[]))
                    result[frame_num] = Detections(
                        detections=existing.detections + new_dets
                    )

        finally:
            self.direct_predictor.handle_request(
                request=dict(type="close_session", session_id=session_id)
            )

        return result

    def test_concept_single_prompt_parity(self):
        """FO apply_model concept output matches direct concept predictor (single text prompt)."""
        fo_field = "sam3v_concept_fo"
        direct_field = "sam3v_concept_direct"

        self.dataset.apply_model(self.fo_model, label_field=fo_field)

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            direct_result = self._run_direct_concept(sample, VID_TEXT_PROMPTS)
            for frame_number, dets in direct_result.items():
                sample.frames[frame_number][direct_field] = dets

        _assert_video_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam3v_concept",
        )

    def test_concept_multi_prompt_parity(self):
        """Multiple text prompts: FO output matches direct concept predictor."""
        multi_prompts = ["person", "car"]
        fo_model_multi = foz.load_zoo_model(
            SAM3_VIDEO_MODEL_NAME,
            classes=multi_prompts,
            operation_mode="concept",
        )

        fo_field = "sam3v_concept_multi_fo"
        direct_field = "sam3v_concept_multi_direct"

        self.dataset.apply_model(fo_model_multi, label_field=fo_field)

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            direct_result = self._run_direct_concept(sample, multi_prompts)
            for frame_number, dets in direct_result.items():
                sample.frames[frame_number][direct_field] = dets

        _assert_video_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam3v_concept_multi",
        )


class TestSAM3VideoVisualParity(unittest.TestCase):
    """Compare FiftyOne SAM3 video visual-mode output against direct
    visual_predictor (tracker) inference."""

    @classmethod
    def setUpClass(cls):
        from sam3.model_builder import build_sam3_video_model

        cls.fo_model = foz.load_zoo_model(
            SAM3_VIDEO_MODEL_NAME,
            operation_mode="visual",
            prompt_frame_indices=[1],
        )

        sam3_model = build_sam3_video_model()
        cls.direct_predictor = sam3_model.tracker
        cls.direct_predictor.backbone = sam3_model.detector.backbone

        cls.ctx = fosam3._load_video_frames_monkey_patch_sam3()
        cls.dataset = _create_video_dataset(num_samples=2, seed=21)

        # Shared frame anchors for directional tests.
        # Use per-sample minimums so prompt_frame_indices is valid for all samples.
        cls.last_frame_1based = min(len(s.frames) for s in cls.dataset)
        cls.mid_frame_1based = max(1, cls.last_frame_1based // 2)

    @classmethod
    def tearDownClass(cls):
        del cls.fo_model
        del cls.direct_predictor
        gc.collect()
        torch.cuda.empty_cache()

    def tearDown(self):
        gc.collect()
        torch.cuda.empty_cache()

    def _run_direct_visual_boxes(self, sample):
        """Run visual_predictor directly with box prompts from frames.detections."""
        w = sample.metadata.frame_width
        h = sample.metadata.frame_height

        with etav.FFmpegVideoReader(sample.filepath) as video_reader:
            with self.ctx:
                inference_state = self.direct_predictor.init_state(
                    video_path=(sample, video_reader)
                )

        classes_obj_id_map = {}
        current_obj_idx = 0

        first_frame = next(iter(sample.frames.values()))
        dets = first_frame.get_field("detections")
        if dets is not None:
            for detection in dets.detections:
                ann_obj_id = current_obj_idx
                current_obj_idx += 1
                classes_obj_id_map[ann_obj_id] = detection.label

                rx, ry, rw, rh = detection.bounding_box
                box = np.array([rx, ry, rx + rw, ry + rh], dtype=np.float32)

                self.direct_predictor.add_new_points_or_box(
                    inference_state=inference_state,
                    frame_idx=0,
                    obj_id=ann_obj_id,
                    box=box,
                )

        result = {}

        for (
            out_frame_idx,
            out_obj_ids,
            _low_res_masks,
            out_mask_logits,
            _obj_scores,
        ) in self.direct_predictor.propagate_in_video(
            inference_state,
            start_frame_idx=None,
            max_frame_num_to_track=None,
            reverse=False,
            propagate_preflight=True,
        ):
            detections = []
            for i, out_obj_id in enumerate(out_obj_ids):
                mask = np.squeeze(
                    (out_mask_logits[i] > 0.0).cpu().numpy(), axis=0
                )
                box = fosam._mask_to_box(mask)
                if box is None:
                    continue

                label = classes_obj_id_map.get(out_obj_id, "object")
                x1, y1, x2, y2 = box
                bounding_box = [
                    x1 / w,
                    y1 / h,
                    (x2 - x1) / w,
                    (y2 - y1) / h,
                ]
                cropped_mask = mask[
                    int(round(y1)) : int(round(y2)),
                    int(round(x1)) : int(round(x2)),
                ]
                detections.append(
                    Detection(
                        label=label,
                        bounding_box=bounding_box,
                        mask=cropped_mask,
                        index=out_obj_id,
                    )
                )

            result[int(out_frame_idx) + 1] = Detections(detections=detections)

        return result

    def _run_direct_visual_points(self, sample, kp_field):
        """Run visual_predictor directly with point prompts from a Keypoints frame field."""
        w = sample.metadata.frame_width
        h = sample.metadata.frame_height

        with etav.FFmpegVideoReader(sample.filepath) as video_reader:
            with self.ctx:
                inference_state = self.direct_predictor.init_state(
                    video_path=(sample, video_reader)
                )

        classes_obj_id_map = {}
        current_obj_idx = 0

        for frame_idx, (_, frame) in enumerate(sample.frames.items()):
            kps = frame.get_field(kp_field)
            if kps is None or not kps.keypoints:
                continue

            for keypoint in kps.keypoints:
                ann_obj_id = current_obj_idx
                current_obj_idx += 1
                classes_obj_id_map[ann_obj_id] = keypoint.label

                points, labels = fosam._to_sam_points(
                    keypoint.points,
                    width=1,
                    height=1,
                    point_labels=fosam._get_sam_point_labels(keypoint),
                )

                self.direct_predictor.add_new_points_or_box(
                    inference_state=inference_state,
                    frame_idx=frame_idx,
                    obj_id=ann_obj_id,
                    points=points,
                    labels=labels,
                )

        result = {}

        for (
            out_frame_idx,
            out_obj_ids,
            _low_res_masks,
            out_mask_logits,
            _obj_scores,
        ) in self.direct_predictor.propagate_in_video(
            inference_state,
            start_frame_idx=None,
            max_frame_num_to_track=None,
            reverse=False,
            propagate_preflight=True,
        ):
            detections = []
            for i, out_obj_id in enumerate(out_obj_ids):
                mask = np.squeeze(
                    (out_mask_logits[i] > 0.0).cpu().numpy(), axis=0
                )
                box = fosam._mask_to_box(mask)
                if box is None:
                    continue

                label = classes_obj_id_map.get(out_obj_id, "object")
                x1, y1, x2, y2 = box
                bounding_box = [
                    x1 / w,
                    y1 / h,
                    (x2 - x1) / w,
                    (y2 - y1) / h,
                ]
                cropped_mask = mask[
                    int(round(y1)) : int(round(y2)),
                    int(round(x1)) : int(round(x2)),
                ]
                detections.append(
                    Detection(
                        label=label,
                        bounding_box=bounding_box,
                        mask=cropped_mask,
                        index=out_obj_id,
                    )
                )

            result[int(out_frame_idx) + 1] = Detections(detections=detections)

        del inference_state
        return result

    def test_visual_box_parity(self):
        """FO apply_model visual-box output matches direct visual predictor."""
        fo_field = "sam3v_vis_box_fo"
        direct_field = "sam3v_vis_box_direct"

        self.dataset.apply_model(
            self.fo_model,
            label_field=fo_field,
            prompt_field="frames.detections",
        )

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            direct_result = self._run_direct_visual_boxes(sample)
            for frame_number, dets in direct_result.items():
                if frame_number in sample.frames:
                    sample.frames[frame_number][direct_field] = dets

        _assert_video_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam3v_vis_box",
        )

    def _run_direct_visual_boxes_for_direction(
        self, sample, propagation_direction, prompt_frame_0based
    ):
        """Run visual_predictor directly with box prompts from ``prompt_frame_0based``
        using the specified propagation direction, mirroring FO's _propagate_visual."""
        w = sample.metadata.frame_width
        h = sample.metadata.frame_height

        with etav.FFmpegVideoReader(sample.filepath) as video_reader:
            with self.ctx:
                inference_state = self.direct_predictor.init_state(
                    video_path=(sample, video_reader)
                )

        classes_obj_id_map = {}
        current_obj_idx = 0

        frame_dets = sample.frames[prompt_frame_0based + 1].get_field(
            "detections"
        )
        if frame_dets is not None:
            for detection in frame_dets.detections:
                ann_obj_id = current_obj_idx
                current_obj_idx += 1
                classes_obj_id_map[ann_obj_id] = detection.label
                rx, ry, rw, rh = detection.bounding_box
                box = np.array([rx, ry, rx + rw, ry + rh], dtype=np.float32)
                self.direct_predictor.add_new_points_or_box(
                    inference_state=inference_state,
                    frame_idx=prompt_frame_0based,
                    obj_id=ann_obj_id,
                    box=box,
                )

        def _collect(reverse, preflight):
            result = {}
            for (
                out_frame_idx,
                out_obj_ids,
                _low_res_masks,
                out_mask_logits,
                _obj_scores,
            ) in self.direct_predictor.propagate_in_video(
                inference_state,
                start_frame_idx=None,
                max_frame_num_to_track=None,
                reverse=reverse,
                propagate_preflight=preflight,
            ):
                detections = []
                for i, out_obj_id in enumerate(out_obj_ids):
                    mask = np.squeeze(
                        (out_mask_logits[i] > 0.0).cpu().numpy(), axis=0
                    )
                    b = fosam._mask_to_box(mask)
                    if b is None:
                        continue
                    label = classes_obj_id_map.get(out_obj_id, "object")
                    x1, y1, x2, y2 = b
                    bounding_box = [
                        x1 / w,
                        y1 / h,
                        (x2 - x1) / w,
                        (y2 - y1) / h,
                    ]
                    cropped_mask = mask[
                        int(round(y1)) : int(round(y2)),
                        int(round(x1)) : int(round(x2)),
                    ]
                    detections.append(
                        Detection(
                            label=label,
                            bounding_box=bounding_box,
                            mask=cropped_mask,
                            index=out_obj_id,
                        )
                    )
                result[int(out_frame_idx) + 1] = Detections(
                    detections=detections
                )
            return result

        if propagation_direction == "forward":
            return _collect(reverse=False, preflight=True)
        elif propagation_direction == "backward":
            return _collect(reverse=True, preflight=True)
        else:  # "both"
            forward = _collect(reverse=False, preflight=True)
            backward = _collect(reverse=True, preflight=False)
            merged = dict(forward)
            for frame_num, dets in backward.items():
                if frame_num not in merged or not merged[frame_num].detections:
                    merged[frame_num] = dets
            return merged

    def test_visual_box_explicit_forward_parity(self):
        """direction='forward' from frame 1 matches direct reverse=False propagation."""
        fo_model_fwd = foz.load_zoo_model(
            SAM3_VIDEO_MODEL_NAME,
            operation_mode="visual",
            prompt_frame_indices=[1],
            propagation_direction="forward",
        )
        fo_field = "sam3v_vis_box_fwd_fo"
        direct_field = "sam3v_vis_box_fwd_direct"

        self.dataset.apply_model(
            fo_model_fwd,
            label_field=fo_field,
            prompt_field="frames.detections",
        )

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            direct_result = self._run_direct_visual_boxes_for_direction(
                sample, "forward", prompt_frame_0based=0
            )
            for frame_number, dets in direct_result.items():
                if frame_number in sample.frames:
                    sample.frames[frame_number][direct_field] = dets

        _assert_video_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam3v_vis_fwd",
        )

    def test_visual_box_backward_parity(self):
        """direction='backward' from the last frame matches direct reverse=True."""
        fo_model_bwd = foz.load_zoo_model(
            SAM3_VIDEO_MODEL_NAME,
            operation_mode="visual",
            prompt_frame_indices=[self.last_frame_1based],
            propagation_direction="backward",
        )
        fo_field = "sam3v_vis_box_bwd_fo"
        direct_field = "sam3v_vis_box_bwd_direct"

        self.dataset.apply_model(
            fo_model_bwd,
            label_field=fo_field,
            prompt_field="frames.detections",
        )

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            direct_result = self._run_direct_visual_boxes_for_direction(
                sample,
                "backward",
                prompt_frame_0based=self.last_frame_1based - 1,
            )
            for frame_number, dets in direct_result.items():
                if frame_number in sample.frames:
                    sample.frames[frame_number][direct_field] = dets

        _assert_video_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam3v_vis_bwd",
        )

    def test_visual_box_both_parity(self):
        """direction='both' from a mid-video frame matches direct forward+backward merge."""
        fo_model_both = foz.load_zoo_model(
            SAM3_VIDEO_MODEL_NAME,
            operation_mode="visual",
            prompt_frame_indices=[self.mid_frame_1based],
            propagation_direction="both",
        )
        fo_field = "sam3v_vis_box_both_fo"
        direct_field = "sam3v_vis_box_both_direct"

        self.dataset.apply_model(
            fo_model_both,
            label_field=fo_field,
            prompt_field="frames.detections",
        )

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            direct_result = self._run_direct_visual_boxes_for_direction(
                sample, "both", prompt_frame_0based=self.mid_frame_1based - 1
            )
            for frame_number, dets in direct_result.items():
                if frame_number in sample.frames:
                    sample.frames[frame_number][direct_field] = dets

        _assert_video_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam3v_vis_both",
        )

    def test_visual_keypoint_parity(self):
        """FO apply_model visual-keypoint output matches direct visual predictor."""
        kp_field = "sam3v_vis_kps"
        fo_field = "sam3v_vis_kp_fo"
        direct_field = "sam3v_vis_kp_direct"

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            first_frame = next(iter(sample.frames.values()))
            dets = first_frame.get_field("detections")
            if dets is not None and dets.detections:
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

        self.dataset.apply_model(
            self.fo_model,
            label_field=fo_field,
            prompt_field=f"frames.{kp_field}",
        )

        for sample in self.dataset.iter_samples(progress=False, autosave=True):
            direct_result = self._run_direct_visual_points(sample, kp_field)
            for frame_number, dets in direct_result.items():
                if frame_number in sample.frames:
                    sample.frames[frame_number][direct_field] = dets

        _assert_video_parity(
            self,
            self.dataset,
            fo_field,
            direct_field,
            eval_key="eval_sam3v_vis_kp",
        )


if __name__ == "__main__":
    unittest.main()
