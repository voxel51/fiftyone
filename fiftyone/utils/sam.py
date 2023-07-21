"""
`Segment Anything <https://segment-anything.com>`_ wrapper for the FiftyOne
Model Zoo.

| Copyright 2017-2023, Voxel51, Inc.
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
        amg_kwargs (None): a dictionary of keyword arguments to pass to
            ``segment_anything.SamAutomaticMaskGenerator``
        points_mask_index (None): an optional mask index to use for each
            keypoint output
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.amg_kwargs = self.parse_dict(d, "amg_kwargs", default=None)
        self.points_mask_index = self.parse_int(
            d, "points_mask_index", default=None
        )
        if self.points_mask_index and not 0 <= self.points_mask_index <= 2:
            raise ValueError("mask_index must be 0, 1, or 2")


class SegmentAnythingModel(fout.TorchImageModel, fout.TorchSamplesMixin):
    """Wrapper for running `Segment Anything <https://segment-anything.com>`_
    inference.

    Args:
        config: an :class:`SegmentAnythingModelConfig`
    """

    def __init__(self, config):
        super().__init__(config)
        fout.TorchSamplesMixin.__init__(self)

        self._preprocess = False
        self._curr_prompt_type = None
        self._curr_prompts = None
        self._curr_classes = None

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_network(self, config):
        entrypoint = etau.get_function(config.entrypoint_fcn)
        return entrypoint(checkpoint=config.model_path)

    def predict_all(self, imgs, samples=None):
        if samples is not None:
            prompt_type, prompts, classes = self._parse_samples(samples)
        else:
            prompt_type, prompts, classes = None, None, None

        self._curr_prompt_type = prompt_type
        self._curr_prompts = prompts
        self._curr_classes = classes

        return self._predict_all(imgs)

    def _parse_samples(self, samples):
        prompt_type = self._get_prompt_type(samples)
        prompts = self._get_prompts(samples)
        classes = self._get_classes(samples)

        return prompt_type, prompts, classes

    def _get_prompt_type(self, samples):
        field_name = self._get_field()
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

    def _get_prompts(self, samples):
        field_name = self._get_field()
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

    def _get_classes(self, samples):
        field_name = self._get_field()
        classes = set()
        for sample in samples:
            value = sample.get_field(field_name)
            if isinstance(value, fol.Detections):
                classes.update(det.label for det in value.detections)

            if isinstance(value, fol.Keypoints):
                classes.update(kp.label for kp in value.keypoints)

        return sorted(classes)

    def _get_field(self):
        return next(iter(self.needs_fields.values()))

    def _forward_pass(self, imgs):
        if self._curr_prompt_type == "boxes":
            return self._forward_pass_boxes(imgs)

        if self._curr_prompt_type == "points":
            return self._forward_pass_points(imgs)

        return self._forward_pass_auto(imgs)

    def _forward_pass_boxes(self, imgs):
        sam_predictor = sam.SamPredictor(self._model)
        self._output_processor = fout.InstanceSegmenterOutputProcessor(
            self._curr_classes
        )

        outputs = []
        for img, detections in zip(imgs, self._curr_prompts):
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

            masks, _, _ = sam_predictor.predict_torch(
                point_coords=None,
                point_labels=None,
                boxes=transformed_boxes,
                multimask_output=False,
            )

            outputs.append(
                {"boxes": input_boxes, "labels": labels, "masks": masks}
            )

        return outputs

    def _forward_pass_points(self, imgs):
        sam_predictor = sam.SamPredictor(self._model)
        self._output_processor = fout.InstanceSegmenterOutputProcessor(
            self._curr_classes
        )

        outputs = []
        for img, keypoints in zip(imgs, self._curr_prompts):
            inp = _to_sam_input(img)
            sam_predictor.set_image(inp)
            h, w = img.size(1), img.size(2)

            boxes, labels, scores, masks = [], [], [], []

            for kp in keypoints.keypoints:
                sam_points, sam_labels = _to_sam_points(kp.points, w, h)

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

    def _forward_pass_auto(self, imgs):
        kwargs = self.config.amg_kwargs or {}
        mask_generator = sam.SamAutomaticMaskGenerator(self._model, **kwargs)
        self._output_processor = None

        outputs = []
        for img in imgs:
            inp = _to_sam_input(img)
            output = mask_generator.generate(inp)
            masks = [out["segmentation"].astype(int) for out in output]
            masks.insert(0, np.zeros_like(masks[0]))  # background
            outputs.append(fol.Segmentation(mask=np.stack(masks)))

        return outputs


def _to_sam_input(tensor):
    return (255 * tensor.cpu().numpy()).astype("uint8").transpose(1, 2, 0)


def _to_sam_points(points, w, h, negative=False):
    scaled_points = np.array(points) * np.array([w, h])
    labels = np.zeros(len(points)) if negative else np.ones(len(points))
    return scaled_points, labels


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
    minx = np.min(pos_indices[1])
    maxx = np.max(pos_indices[1])
    miny = np.min(pos_indices[0])
    maxy = np.max(pos_indices[0])
    return [minx, miny, maxx, maxy]
