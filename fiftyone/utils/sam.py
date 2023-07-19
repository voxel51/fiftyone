"""
`Segment Anything <https://segment-anything.com>`_ wrapper for the FiftyOne
Model Zoo.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np

import eta.core.utils as etau

import fiftyone.core.models as fom
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


class SegmentAnythingModel(fout.TorchImageModel, fom.SamplesMixin):
    """Wrapper for running `Segment Anything <https://segment-anything.com>`_
    inference.
    """

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_network(self, config):
        entrypoint = etau.get_function(config.entrypoint_fcn)
        model = entrypoint(checkpoint=config.model_path)
        self.preprocess = False
        return model

    def predict_all(self, imgs, samples=None):
        if samples is not None:
            self.prompts = [self.get_labels(samples)]
            self.class_labels = self.get_classes(samples)

        return self._predict_all(imgs)

    def _forward_pass(self, inputs):
        mode = self.field_type

        if mode == "keypoints":
            return self._forward_pass_points(inputs)

        if mode == "detections":
            return self._forward_pass_boxes(inputs)

        return self._forward_pass_amg(inputs)

    def _forward_pass_amg(self, inputs):
        mask_generator = sam.SamAutomaticMaskGenerator(
            self._model,
            **(self.config.amg_kwargs or {}),
        )
        masks = [
            mask_generator.generate(self._to_numpy_input(inp))
            for inp in inputs
        ]
        masks = torch.stack([self._to_torch_output(m) for m in masks])
        return dict(out=masks)

    def _forward_pass_points(self, inputs):
        self._output_processor = fout.InstanceSegmenterOutputProcessor(
            self.class_labels
        )

        sam_predictor = sam.SamPredictor(self._model)
        outputs = []
        for inp, keypoints in zip(inputs, self.prompts):
            sam_predictor.set_image(self._to_numpy_input(inp))
            h, w = inp.size(1), inp.size(2)

            boxes, labels, scores, masks = [], [], [], []

            # each keypoints object will generate its own instance segmentation
            for kp in keypoints.keypoints:
                sam_points, sam_labels = _to_sam_points(kp.points, w, h)

                multi_mask, mask_scores, _ = sam_predictor.predict(
                    point_coords=sam_points,
                    point_labels=sam_labels,
                    multimask_output=True,
                )
                mask_index = (
                    self.config.points_mask_index
                    if self.config.points_mask_index
                    else np.argmax(mask_scores)
                )
                mask = multi_mask[mask_index].astype(int)

                # add boxes, labels, scores, and masks
                if mask.any():
                    boxes.append(_mask_to_box(mask))
                    labels.append(self.class_labels.index(kp.label))
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

    def _forward_pass_boxes(self, inputs):
        self._output_processor = fout.InstanceSegmenterOutputProcessor(
            self.class_labels
        )

        sam_predictor = sam.SamPredictor(self._model)
        outputs = []
        for inp, detections in zip(inputs, self.prompts):
            sam_predictor.set_image(self._to_numpy_input(inp))
            h, w = inp.size(1), inp.size(2)
            boxes = [d.bounding_box for d in detections.detections]
            sam_boxes = np.array([_to_sam_box(box, w, h) for box in boxes])
            input_boxes = torch.tensor(sam_boxes, device=sam_predictor.device)
            transformed_boxes = sam_predictor.transform.apply_boxes_torch(
                input_boxes, (h, w)
            )

            mask, _, _ = sam_predictor.predict_torch(
                point_coords=None,
                point_labels=None,
                boxes=transformed_boxes,
                multimask_output=False,
            )
            outputs.append(
                {
                    "boxes": input_boxes,
                    "labels": torch.tensor(
                        [
                            self.class_labels.index(d.label)
                            for d in detections.detections
                        ],
                        device=sam_predictor.device,
                    ),
                    "scores": torch.tensor(
                        [
                            d.confidence if d.confidence else 1.0
                            for d in detections.detections
                        ],
                        device=sam_predictor.device,
                    ),
                    "masks": mask,
                }
            )

        return outputs

    @staticmethod
    def _to_numpy_input(tensor):
        return (tensor.cpu().numpy() * 255).astype("uint8").transpose(1, 2, 0)

    @staticmethod
    def _to_torch_output(model_output):
        masks = [one["segmentation"].astype(int) for one in model_output]

        # background
        masks.insert(0, np.zeros_like(model_output[0]["segmentation"]))

        return torch.from_numpy(np.stack(masks))


def _to_sam_points(points, w, h, negative=False):
    scaled_points = np.array(points) * np.array([w, h])
    labels = np.zeros(len(points)) if negative else np.ones(len(points))
    return scaled_points, labels


def _to_sam_box(box, img_width, img_height):
    new_box = np.copy(np.array(box))
    new_box[0] *= img_width
    new_box[2] *= img_width
    new_box[1] *= img_height
    new_box[3] *= img_height
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
