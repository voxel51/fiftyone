"""
`Segment Anything <https://segment-anything.com>`_ wrapper for the FiftyOne
Model Zoo.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np

import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

sam = fou.lazy_import("segment_anything")


class SegmentAnythingModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`SegmentAnythingModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        auto_kwargs (None): a dictionary of keyword arguments to pass to
            ``segment_anything.SamAutomaticMaskGenerator(model, **auto_kwargs)``
        points_mask_index (None): an optional mask index to use for each
            keypoint output
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.auto_kwargs = self.parse_dict(d, "auto_kwargs", default=None)
        self.points_mask_index = self.parse_int(
            d, "points_mask_index", default=None
        )
        if self.points_mask_index and not 0 <= self.points_mask_index <= 2:
            raise ValueError("mask_index must be 0, 1, or 2")


class SegmentAnythingModel(fout.TorchSamplesMixin, fout.TorchImageModel):
    """Wrapper for running `Segment Anything <https://segment-anything.com>`_
    inference.

    Box prompt example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=25, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("segment-anything-vitb-torch")

        # Prompt with boxes
        dataset.apply_model(
            model,
            label_field="segmentations",
            prompt_field="ground_truth",
        )

        session = fo.launch_app(dataset)

    Keypoint prompt example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "coco-2017",
            split="validation",
            label_types="detections",
            classes=["person"],
            max_samples=25,
            only_matching=True,
        )

        # Generate some keypoints
        model = foz.load_zoo_model("keypoint-rcnn-resnet50-fpn-coco-torch")
        dataset.default_skeleton = model.skeleton
        dataset.apply_model(model, label_field="gt")

        model = foz.load_zoo_model("segment-anything-vitb-torch")

        # Prompt with keypoints
        dataset.apply_model(
            model,
            label_field="segmentations",
            prompt_field="gt_keypoints",
        )

        session = fo.launch_app(dataset)

    Automatic segmentation example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=5, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("segment-anything-vitb-torch")

        # Automatic segmentation
        dataset.apply_model(model, label_field="auto")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`SegmentAnythingModelConfig`
    """

    def __init__(self, config):
        fout.TorchSamplesMixin.__init__(self)
        fout.TorchImageModel.__init__(self, config)

        self._curr_prompt_type = None
        self._curr_prompts = None
        self._curr_classes = None

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_model(self, config):
        entrypoint = etau.get_function(config.entrypoint_fcn)
        model = entrypoint(checkpoint=config.model_path)

        model = model.to(self._device)
        if self.using_half_precision:
            model = model.half()

        model.eval()

        return model

    def predict_all(self, imgs, samples=None):
        field_name = self._get_field()
        if field_name is not None and samples is not None:
            prompt_type, prompts, classes = self._parse_samples(
                samples, field_name
            )
        else:
            prompt_type, prompts, classes = None, None, None

        self._curr_prompt_type = prompt_type
        self._curr_prompts = prompts
        self._curr_classes = classes

        return self._predict_all(imgs)

    def _get_field(self):
        if "prompt_field" in self.needs_fields:
            prompt_field = self.needs_fields["prompt_field"]
        else:
            prompt_field = next(iter(self.needs_fields.values()), None)

        if prompt_field is not None and prompt_field.startswith("frames."):
            prompt_field = prompt_field[len("frames.") :]

        return prompt_field

    def _parse_samples(self, samples, field_name):
        prompt_type = self._get_prompt_type(samples, field_name)
        prompts = self._get_prompts(samples, field_name)
        classes = self._get_classes(samples, field_name)
        return prompt_type, prompts, classes

    def _get_prompt_type(self, samples, field_name):
        for sample in samples:
            value = sample.get_field(field_name)
            if value is None:
                continue

            if isinstance(value, fol.Detections):
                return "boxes"

            if isinstance(value, fol.Keypoints):
                return "points"

            raise ValueError(
                "Unsupported prompt type %s. The supported field types are %s"
                % (type(value), (fol.Detections, fol.Keypoints))
            )

        return None

    def _get_prompts(self, samples, field_name):
        prompts = []
        for sample in samples:
            value = sample.get_field(field_name)
            if value is not None:
                prompts.append(value)
            else:
                raise ValueError(
                    "Sample %s is missing a prompt in field '%s'"
                    % (sample.id, field_name)
                )

        return prompts

    def _get_classes(self, samples, field_name):
        classes = set()
        for sample in samples:
            value = sample.get_field(field_name)
            if isinstance(value, fol.Detections):
                classes.update(det.label for det in value.detections)

            if isinstance(value, fol.Keypoints):
                classes.update(kp.label for kp in value.keypoints)

        return sorted(classes)

    def _forward_pass(self, imgs):
        forward_methods = {
            "boxes": self._forward_pass_boxes,
            "points": self._forward_pass_points,
            None: self._forward_pass_auto,
        }
        return forward_methods.get(
            self._curr_prompt_type, self._forward_pass_auto
        )(imgs)

    def _load_predictor(self):
        return sam.SamPredictor(self._model)

    def _forward_pass_boxes(self, imgs):
        sam_predictor = self._load_predictor()
        self._output_processor = fout.InstanceSegmenterOutputProcessor(
            self._curr_classes
        )

        outputs = []
        for img, detections in zip(imgs, self._curr_prompts):
            ## If no detections, return empty tensors instead of running SAM
            if detections is None or len(detections.detections) == 0:
                h, w = img.shape[1], img.shape[2]
                outputs.append(
                    {
                        "boxes": torch.tensor([[]]),
                        "labels": torch.empty([0, 4]),
                        "masks": torch.empty([0, 1, h, w]),
                    }
                )
                continue
            inp = _to_sam_input(img)
            sam_predictor.set_image(inp)
            h, w = img.size(1), img.size(2)

            boxes = [d.bounding_box for d in detections.detections]
            sam_boxes = np.array([_to_sam_box(box, w, h) for box in boxes])
            input_boxes = torch.tensor(sam_boxes, device=sam_predictor.device)
            transformed_boxes = sam_predictor.transform.apply_boxes_torch(
                input_boxes, (h, w)
            )

            labels = torch.tensor(
                [
                    self._curr_classes.index(d.label)
                    for d in detections.detections
                ],
                device=sam_predictor.device,
            )

            masks, scores, _ = sam_predictor.predict_torch(
                point_coords=None,
                point_labels=None,
                boxes=transformed_boxes,
                multimask_output=False,
            )
            outputs.append(
                {
                    "boxes": input_boxes,
                    "labels": labels,
                    "masks": masks,
                    "scores": scores,
                }
            )

        return outputs

    def _forward_pass_points(self, imgs):
        sam_predictor = self._load_predictor()
        self._output_processor = fout.InstanceSegmenterOutputProcessor(
            self._curr_classes
        )

        outputs = []
        for img, keypoints in zip(imgs, self._curr_prompts):
            inp = _to_sam_input(img)
            sam_predictor.set_image(inp)
            h, w = img.size(1), img.size(2)

            boxes, labels, scores, masks = [], [], [], []

            ## If no keypoints, return empty tensors instead of running SAM
            if keypoints is None or len(keypoints.keypoints) == 0:
                outputs.append(
                    {
                        "boxes": torch.tensor([[]]),
                        "labels": torch.empty([0, 4]),
                        "masks": torch.empty([0, 1, h, w]),
                    }
                )
                continue

            for kp in keypoints.keypoints:
                sam_points, sam_labels = _to_sam_points(kp.points, w, h, kp)

                multi_mask, mask_scores, _ = sam_predictor.predict(
                    point_coords=sam_points,
                    point_labels=sam_labels,
                    multimask_output=True,
                )

                mask_index = self.config.points_mask_index
                if mask_index is None:
                    mask_index = np.argmax(mask_scores)

                mask = multi_mask[mask_index].astype(int)
                if mask.any():
                    boxes.append(_mask_to_box(mask))
                    labels.append(self._curr_classes.index(kp.label))
                    scores.append(min(1.0, np.max(mask_scores)))
                    masks.append(mask)

            outputs.append(
                {
                    "boxes": torch.tensor(boxes, device=sam_predictor.device),
                    "labels": torch.tensor(
                        labels, device=sam_predictor.device
                    ),
                    "scores": torch.tensor(
                        scores, device=sam_predictor.device
                    ),
                    "masks": torch.tensor(
                        np.array(masks), device=sam_predictor.device
                    ).unsqueeze(1),
                }
            )

        return outputs

    def _load_auto_generator(self):
        kwargs = self.config.auto_kwargs or {}
        return sam.SamAutomaticMaskGenerator(self._model, **kwargs)

    def _forward_pass_auto(self, imgs):
        mask_generator = self._load_auto_generator()
        self._output_processor = None

        outputs = []
        for img in imgs:
            inp = _to_sam_input(img)
            detections = []
            for data in mask_generator.generate(inp):
                detection = fol.Detection.from_mask(
                    mask=data["segmentation"],
                    score=data["predicted_iou"],
                    stability=data["stability_score"],
                )
                detections.append(detection)
            detections = fol.Detections(detections=detections)
            outputs.append(detections)

        return outputs


def _to_sam_input(tensor):
    return (255 * tensor.cpu().numpy()).astype("uint8").transpose(1, 2, 0)


def _to_sam_points(points, w, h, keypoint):
    points = np.array(points)
    valid_rows = ~np.isnan(points).any(axis=1)
    scaled_points = np.array(points[valid_rows]) * np.array([w, h])
    labels = (
        np.array(keypoint.sam2_labels)[valid_rows]
        if "sam_labels" in keypoint
        else np.ones(len(scaled_points))
    )
    return scaled_points.astype(np.float32), labels.astype(np.uint32)


def _to_sam_box(box, w, h):
    new_box = np.copy(np.array(box))
    new_box[0] *= w
    new_box[2] *= w
    new_box[1] *= h
    new_box[3] *= h
    new_box[2] += new_box[0]
    new_box[3] += new_box[1]
    return np.round(new_box).astype(int)


def _mask_to_box(mask):
    pos_indices = np.where(mask)
    if all(arr.size == 0 for arr in pos_indices):
        return None
    x1 = np.min(pos_indices[1])
    x2 = np.max(pos_indices[1])
    y1 = np.min(pos_indices[0])
    y2 = np.max(pos_indices[0])
    return [x1, y1, x2, y2]
