"""
Tests to verify that the FiftyOne SAM/SAM2 integration produces
identical results to direct inference using the segment-anything and sam2
libraries.

For each prompt mode (automatic, box, keypoint), direct SAM/SAM2
output is converted to FiftyOne ``Detections`` labels, stored on the dataset
alongside the FiftyOne model output, and then compared via
``dataset.evaluate_detections(use_masks=True)``.

Usage:
    pytest test_sam_parity.py -v --timeout=500
"""

import unittest
import numpy as np
import torch

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone.core.labels import Detection, Detections, Keypoint, Keypoints
from fiftyone import ViewField as F

MASK_IOU = 0.99
MASK_THRESH = 0.5
PLACEHOLDER_LABEL = "mask"
MIN_METRIC = 1.0


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


def _get_image_as_numpy(filepath):
    import fiftyone.utils.torch as fout

    return fout._load_image(filepath, use_numpy=True, force_rgb=True)


def _auto_masks_to_detections(masks_list):
    """Convert ``SamAutomaticMaskGenerator.generate()`` output to
    ``fo.Detections``."""
    dets = []
    for m in masks_list:
        det = Detection.from_mask(
            mask=m["segmentation"],
            label=PLACEHOLDER_LABEL,
            stability=m.get("stability_score", 1.0),
            score=m.get("predicted_iou", 1.0),
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


if __name__ == "__main__":
    unittest.main()
