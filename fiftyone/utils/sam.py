"""Segment-anything model integration.
"""
import eta.core.utils as etau
import numpy as np
import torch

import fiftyone.core.utils as fou
import fiftyone.core.models as fom
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()

from segment_anything import SamAutomaticMaskGenerator, SamPredictor


class SegmentAnythingModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`SegmentAnythingModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        amg_kwargs: a dictionary of keyword arguments to pass to
            ``SamAutomaticMaskGenerator``
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self.amg_kwargs = self.parse_dict(d, "amg_kwargs", default={})


class SegmentAnythingModel(fout.TorchImageModel, fom.SamplesMixin):
    """Wrapper for running 'segment-anything-model' from https://segment-anything.com/."""

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_network(self, config):
        entrypoint = etau.get_function(config.entrypoint_fcn)
        model = entrypoint(checkpoint=config.model_path)
        self.preprocess = False
        return model

    @staticmethod
    def _to_numpy_input(tensor):
        """Converts a float32 torch tensor to a uint8 numpy array.

        Args:
            tensor: a float32 torch tensor

        Returns:
            a uint8 numpy array
        """
        return (tensor.cpu().numpy() * 255).astype("uint8").transpose(1, 2, 0)

    @staticmethod
    def _to_torch_output(model_output):
        """Convert SAM's automatic mask output to a single mask torch tensor.

        Args:
            model_output: a list of masks from SAM's automatic mask generator

        Returns:
            a torch tensor of shape (num_masks, height, width)
        """
        masks = [one["segmentation"].astype(int) for one in model_output]
        masks.insert(
            0, np.zeros_like(model_output[0]["segmentation"])
        )  # background
        full_mask = np.stack(masks)
        return torch.from_numpy(full_mask)

    def _forward_pass(self, inputs):
        mode = self.field_type
        if mode == "keypoints":
            return self._forward_pass_points(inputs)
        elif mode == "detections":
            return self._forward_pass_boxes(inputs)
        else:
            return self._forward_pass_amg(inputs)

    def _forward_pass_amg(self, inputs):
        mask_generator = SamAutomaticMaskGenerator(
            self._model,
            **self.config.amg_kwargs,
        )
        masks = [
            mask_generator.generate(
                self._to_numpy_input(inp),
            )
            for inp in inputs
        ]
        masks = torch.stack([self._to_torch_output(m) for m in masks])
        return dict(out=masks)

    def _forward_pass_points(self, inputs):
        sam_predictor = SamPredictor(self._model)
        for inp in inputs:
            sam_predictor.set_image(self._to_numpy_input(inp))

    def predict_all(self, imgs, samples=None):
        if samples is not None:
            self.prompts = [
                self.get_labels(samples)
            ]  # tolist because ragged_batches=True
            self.class_labels = self.get_classes(samples)

        return self._predict_all(imgs)

    def _forward_pass_boxes(self, inputs):
        # we have to change it to instance segmentations
        self._output_processor = fout.InstanceSegmenterOutputProcessor(
            self.class_labels
        )

        sam_predictor = SamPredictor(self._model)
        outputs = []
        for inp, detections in zip(inputs, self.prompts):
            sam_predictor.set_image(self._to_numpy_input(inp))
            h, w = inp.size(1), inp.size(2)
            boxes = [d.bounding_box for d in detections.detections]
            sam_boxes = np.array([fo_to_sam(box, w, h) for box in boxes])
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


def generate_sam_points(keypoints, label, w, h):
    # Written by Jacob Marks
    def scale_keypoint(p):
        return [p[0] * w, p[1] * h]

    sam_points, sam_labels = [], []
    for kp in keypoints:
        if kp.label == label and kp.estimated_yes_no != "unsure":
            sam_points.append(scale_keypoint(kp.points[0]))
            sam_labels.append(bool(kp.estimated_yes_no == "yes"))

    return np.array(sam_points), np.array(sam_labels)


def fo_to_sam(box, img_width, img_height):
    # Written by Jacob Marks
    new_box = np.copy(np.array(box))
    new_box[0] *= img_width
    new_box[2] *= img_width
    new_box[1] *= img_height
    new_box[3] *= img_height
    new_box[2] += new_box[0]
    new_box[3] += new_box[1]
    return np.round(new_box).astype(int)
