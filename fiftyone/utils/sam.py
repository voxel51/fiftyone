"""
`Segment Anything <https://segment-anything.com>`_ wrapper for the FiftyOne
Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import numpy as np
from enum import Enum

import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

sam = fou.lazy_import("segment_anything")

logger = logging.getLogger(__name__)


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

class _SAMPredictor:
    """Wrapper for ``segment_anything.predictor.SamPredictor``.

    Args:
        model: a :class:`segment_anything.modeling.Sam` model
    """

    def __init__(self, model):
        self.processor = sam.SamPredictor(model)
        self._image_id = None

    def image_transform(self, img):
        """Transforms image for SAM model input.

        Args:
            img: a uint8 numpy array containing image in HWC format

        Returns:
            a torch image tensor in CHW format
            a tuple containing original image dimensions
        """
        image_torch = torch.as_tensor(
            self.processor.transform.apply_image(img)
        )
        image_torch = image_torch.permute(2, 0, 1).contiguous()[None, :, :, :]
        return image_torch, img.shape[:2]

    def box_transform(self, boxes_xyxy, img_hw):
        """Transforms boxes for SAM model prompts.

        Args:
            boxes_xyxy: list of boxes in XYXY pixels
            img_hw: original image height and width

        Returns:
            resized boxes for SAM as a Bx4 tensor
        """
        sam_boxes = np.round(boxes_xyxy).astype(int)
        input_boxes = torch.tensor(sam_boxes)
        return self.processor.transform.apply_boxes_torch(
            input_boxes,
            (img_hw[0], img_hw[1]),
        )

    def point_transform(self, points, img_hw, point_labels=None):
        """Transforms points for SAM model prompts.

        Args:
            points: relative points in xyxy format
            img_hw: original image height and width
            point_labels (None): list containing positive (1) and negative (0) point labels. Defaults to None.

        Returns:
            a torch tensor containing points in XYXY pixels for SAM model
            a torch tensor containing positive and negative labels
        """
        points, labels = _to_sam_points(
            points,
            height=img_hw[0],
            width=img_hw[1],
            point_labels=point_labels,
        )
        points = self.processor.transform.apply_coords(points, img_hw)
        return torch.tensor(points, dtype=torch.float64), torch.tensor(
            labels, dtype=torch.int
        )


class SAMPromptMode(Enum):
    """Enumeration of supported prompt modes for SAM."""

    auto = 1
    box_only = 2
    point_only = 3
    box_point_combo = 4

    @classmethod
    def from_mode_name(cls, mode_name):
        """Creates an instance from mode name.

        Args:
            mode_name: name of the prompt mode

        Returns:
            class member based on prompt mode
        """
        for member in cls:
            if member.name == mode_name:
                return member
        raise ValueError(f"No supported SAM prompt mode with name {mode_name}")


class SegmentAnythingImageGetItem(fout.GetItem):
    """A :class:`GetItem` that loads images, bounding boxes and/or keypoints to feed to
    :class:`SegmentAnythingModel` instances.

    Args:
        field_mapping (None): the user-supplied dict mapping keys in
            :attr:`required_keys` to field names of their dataset that contain
            the required values
        transform (None): SAM specific image transform function to apply
        use_numpy (False): whether to use numpy arrays rather than PIL images
            and Torch tensors when loading data
        box_transform (None): SAM specific box transform function to apply
        point_transform (None): SAM specific point transform function to apply
    """

    def __init__(
        self,
        field_mapping=None,
        transform=None,
        use_numpy=None,
        box_transform=None,
        point_transform=None,
        **kwargs,
    ):
        field_mapping = {} if field_mapping is None else dict(field_mapping)
        # Used for managing backward compatibility with prompt_field in field mapping.
        self._has_prompt_field = (
            field_mapping.pop("prompt_field", None) is not None
        )

        self.mode = self._set_mode(field_mapping)

        super().__init__(field_mapping=field_mapping, **kwargs)
        self.transform = transform
        self.use_numpy = use_numpy
        self.box_transform = box_transform
        self.point_transform = point_transform

    def _set_mode(self, field_mapping):
        """Initializes mode based on field mapping dictionary.
        Args:
            field_mapping: a dict mapping required keys to sample fields

        Returns:
            a :class:`SAMPromptMode` instance
        """
        if field_mapping is None:
            return SAMPromptMode.auto

        prompt_fields = ["box_prompt_field", "point_prompt_field"]
        is_present = {f: False for f in prompt_fields}

        for key in field_mapping:
            if key in prompt_fields:
                is_present[key] = True

        if not any(is_present.values()):
            return SAMPromptMode.auto
        elif (
            is_present["box_prompt_field"]
            and not is_present["point_prompt_field"]
        ):
            return SAMPromptMode.box_only
        elif (
            not is_present["box_prompt_field"]
            and is_present["point_prompt_field"]
        ):
            return SAMPromptMode.point_only
        else:
            # NOTE: Because of how we are mainintaing backward compatibilty of prompt_field,
            # combo mode will be set when prompt_field is used.
            return SAMPromptMode.box_point_combo

    def __call__(self, d):
        """Prepares the model input for a given sample's data.

        Args:
            d: a dict mapping the :meth:`required_keys` to values from the
                sample being processed

        Returns:
            the model input
        """
        item_dict = {}
        img = fout._load_image(
            d["filepath"],
            use_numpy=self.use_numpy,
            force_rgb=True,
        )
        if self.transform is None:
            raise ValueError(
                f"Transform cannot be None for {self.__class__.__name__}."
            )
        if self.mode != SAMPromptMode.auto:
            img, img_hw = self.transform(img)
        else:
            img_hw = img.shape[:2]
        item_dict["image"] = img
        item_dict["original_size"] = img_hw
        item_dict["id"] = d["id"]
        prompts = self._preprocess_prompts(d, img_hw)
        item_dict.update(prompts)

        return item_dict

    def _preprocess_prompts(self, d, img_hw):
        """Pre-processes prompts for SAM model input.

        Args:
            d: a dictionary containing prompts
            img_hw: original image height and width

        Returns:
            a dictionary containing prompts. Expected keys are:
                "prompt_type": name of the prompt type
                "boxes": boxes for SAM model input
                "boxes_xyxy": boxes in XYXY original image space
                "point_coords": points for SAM model input
                "point_labels": positive / negative labels for points
                "classes": class labels for prompts
        """
        if self.mode == SAMPromptMode.auto:
            return {"prompt_type": self.mode.name}

        detections = d.get("box_prompt_field")
        keypoints = d.get("point_prompt_field")

        if detections and not isinstance(detections, fol.Detections):
            # This may happen when using prompt_field as the only input prompt.
            logger.debug(
                f"Invalid type for box prompts: {type(detections)}. Ignoring box prompts."
            )
            detections = None

        if keypoints and not isinstance(keypoints, fol.Keypoints):
            # This may happen when using prompt_field as the only input prompt.
            logger.debug(
                f"Invalid type for point prompts: {type(keypoints)}. Ignoring point prompts."
            )
            keypoints = None

        # Pre-process box prompts
        boxes, boxes_xyxy, box_classes = self._preprocess_boxes(
            detections, img_hw
        )

        # Pre-process point prompts
        points, point_type_labels, points_classes = self._preprocess_points(
            keypoints, img_hw
        )

        has_boxes = boxes is not None and len(boxes) > 0
        has_points = points is not None and len(points) > 0

        if self._has_prompt_field and not has_boxes and not has_points:
            raise ValueError("No prompts available when using prompt_field.")

        elif self.mode == SAMPromptMode.box_only and not has_boxes:
            raise ValueError(f"Boxes not available for {self.mode}")

        elif self.mode == SAMPromptMode.point_only and not has_points:
            raise ValueError(f"Points not available for {self.mode}")

        elif (
            self.mode == SAMPromptMode.box_point_combo
            and not self._has_prompt_field
        ):
            if not has_boxes or not has_points:
                raise ValueError(
                    f"For {self.mode}, both boxes and points are required."
                )
            if len(boxes) != len(points):
                raise ValueError(
                    f"For {self.mode}, boxes and points must match: "
                    f"got {len(boxes)} boxes and {len(points)} points."
                )

        item_dict = {}
        item_dict["prompt_type"] = self.mode.name

        if has_boxes:
            item_dict["boxes"] = boxes
            item_dict["boxes_xyxy"] = boxes_xyxy
        if has_points:
            item_dict["point_coords"] = points
            item_dict["point_labels"] = point_type_labels

        # Box classes take precedence over point classes
        item_dict["classes"] = box_classes if box_classes else points_classes

        return item_dict

    def _preprocess_boxes(self, detections, img_hw):
        """Pre-processes boxes from :class:`fiftyone.core.labels.Detections`.

        Args:
            detections: a :class:`fiftyone.core.labels.Detections` instance
            img_hw: original image height and width

        Returns:
            a torch tensor of boxes for SAM model prompts
            a numpy array of boxes in XYXY pixels in original image space
            a list class labels for the boxes
        """
        if detections is None:
            return None, None, None
        if len(detections.detections) == 0:
            raise AssertionError("No box prompts found for sample.")

        if self.box_transform is None:
            raise AssertionError(
                "Box transform cannot be None when pre-processing box prompts."
            )
        boxes = []
        box_classes = []
        for d in detections.detections:
            boxes.append(d.bounding_box)
            box_classes.append(d.label)
        boxes_xyxy = _to_abs_boxes(np.array(boxes), img_hw[1], img_hw[0])
        sam_boxes = self.box_transform(boxes_xyxy, img_hw)
        return sam_boxes, boxes_xyxy, box_classes

    def _preprocess_points(self, keypoints, img_hw):
        """Pre-processes points from :class:`fiftyone.core.labels.Keypoints`.

        Args:
            keypoints: a :class:`fiftyone.core.labels.Keypoints` instance
            img_hw: original image height and width

        Returns:
            a list of torch tensor of points in XYXY pixels for SAM model prompts
            a list of torch tensor of positive and negative labels for each point
            a list of class labels for each set of points
        """
        if keypoints is None:
            return None, None, None
        if len(keypoints.keypoints) == 0:
            raise AssertionError("No point prompts found for sample.")

        sam_points = []
        sam_labels = []
        points_classes = []
        for kp in keypoints.keypoints:
            point_labels = _get_sam_point_labels(kp)
            _points, _labels = self.point_transform(
                kp.points,
                img_hw,
                point_labels,
            )
            points_classes.append(kp.label)
            sam_points.append(_points)
            sam_labels.append(_labels)
        return sam_points, sam_labels, points_classes

    @property
    def required_keys(self):
        """The list of keys that must exist on the dicts provided to the
        :meth:`__call__` method at runtime."""

        common_keys = ["id", "filepath"]
        box_keys = ["box_prompt_field"]
        point_keys = ["point_prompt_field"]

        if self.mode == SAMPromptMode.auto:
            return common_keys
        elif self.mode == SAMPromptMode.box_only:
            return common_keys + box_keys
        elif self.mode == SAMPromptMode.point_only:
            return common_keys + point_keys
        elif self.mode == SAMPromptMode.box_point_combo:
            return common_keys + box_keys + point_keys
        else:
            raise ValueError(f"Undefined required keys for {self.mode.name}")


class SAMSegmenterOutputProcessor(fout.OutputProcessor):
    """Converts SAM model outputs to FiftyOne format.

    Args:
        classes (None): the list of class labels for the model
        mask_thresh (0.5): Threshold for converting float masks to boolean masks
    """

    def __init__(self, classes=None, mask_thresh=0.5, **kwargs):
        if classes is not None:
            logger.warning(
                "SAM doesn't generate classes. Input prompt classes will be preserved when available. Setting classes to None."
            )
        self.classes = None
        self.mask_thresh = mask_thresh

    def __call__(
        self,
        output,
        frame_size,
        confidence_thresh=None,
        classes=None,
        box_prompts=None,
        labels=None,
        mask_index=None,
    ):
        """Returns processed model output in FiftyOne format.

        Args:
            output: a list of model output per sample
            frame_size: a tuple containing original image width and height
            confidence_thresh (None): confidence threshold for filtering predictions. Defaults to None.
            classes (None): classes for filtering predictions. Defaults to None.
            box_prompts (None): boxes in XYXY pixels in original image space. Defaults to None.
            labels (None): a list of class labels for each prompt. Defaults to None.
            mask_index (None): index for selecting mask from multi-mask SAM model output. Defaults to None.

        Returns:
            a list of :class:`fiftyone.core.labels.Detections` instances
        """
        # Post-process output from model.
        post_processed_out = []
        for idx, out in enumerate(output):
            masks = out["masks"]  # (B, C, H, W)
            mask_scores = out["iou_predictions"]  # (B, C)
            if masks.shape[1] > 1:
                if mask_index is not None:
                    _mask_index = torch.full(
                        (masks.shape[0],), mask_index, dtype=torch.int
                    )
                else:
                    _mask_index = mask_scores.argmax(dim=1)
                _masks = masks[
                    torch.arange(masks.shape[0]), _mask_index
                ]  # (B, H, W)
                _mask_scores = mask_scores[
                    torch.arange(masks.shape[0]), _mask_index
                ]  # (B,)
            else:
                _masks = masks.squeeze(1)
                _mask_scores = mask_scores.squeeze(1)

            post_processed_out.append(
                {
                    "masks": _masks,
                    "scores": _mask_scores.clamp(max=1),
                    "labels": labels[idx] if labels else [],
                    "boxes": box_prompts[idx] if box_prompts else [],
                }
            )

        return [
            self._parse_output(
                out, width_height[::-1], confidence_thresh, classes
            )
            for out, width_height in zip(post_processed_out, frame_size)
        ]

    def _parse_output(self, output, frame_wh, confidence_thresh, classes):
        """Parses model output and converts to FiftyOne format.

        Args:
            output: post-processed SAM model output for a sample
            frame_wh: a tuple containing original sample image width and height
            confidence_thresh: confidence threshold for filtering predictions
            classes: classes for filtering predictions

        Returns:
            a :class:`fiftyone.core.labels.Detections` instance
        """
        width, height = frame_wh

        boxes = output["boxes"]
        labels = output["labels"]
        masks = output["masks"].float().detach().cpu().numpy()
        scores = output["scores"].float().detach().cpu().numpy()
        boxes = (
            boxes.detach().cpu().numpy()
            if isinstance(boxes, torch.Tensor)
            else boxes
        )
        boxes = [None] * len(masks) if len(boxes) == 0 else boxes
        labels = [None] * len(masks) if not labels else labels
        detections = []

        for box, label, mask, score in zip(boxes, labels, masks, scores):
            if (
                confidence_thresh is not None
                and score is not None
                and score < confidence_thresh
            ):
                continue

            if classes is not None and label not in classes:
                continue

            if mask.dtype != bool:
                mask = mask > self.mask_thresh

            if box is None:
                detections.append(
                    fol.Detection.from_mask(
                        mask=mask,
                        label=label,
                        confidence=score,
                    )
                )
            else:
                x1, y1, x2, y2 = box
                bounding_box = [
                    x1 / width,
                    y1 / height,
                    (x2 - x1) / width,
                    (y2 - y1) / height,
                ]

                mask = mask[
                    int(round(y1)) : int(round(y2)),
                    int(round(x1)) : int(round(x2)),
                ]

                detections.append(
                    fol.Detection(
                        label=label,
                        bounding_box=bounding_box,
                        mask=mask,
                        confidence=score,
                    )
                )
        return fol.Detections(detections=detections)


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

            boxes = np.array([d.bounding_box for d in detections.detections])
            boxes_xyxy = _to_abs_boxes(boxes, w, h)
            sam_boxes = np.round(boxes_xyxy).astype(int)
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
                    "boxes": torch.tensor(boxes_xyxy),
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
def _get_sam_point_labels(keypoint):
    if "sam_labels" in keypoint and keypoint.sam_labels is not None:
        return keypoint.sam_labels
    if "sam2_labels" in keypoint and keypoint.sam2_labels is not None:
        return keypoint.sam2_labels
    return None


def _to_sam_points(points, height, width, point_labels=None):
    points = np.array(points)
    valid_rows = ~np.isnan(points).any(axis=1)
    scaled_points = np.array(points[valid_rows]) * np.array([width, height])
    labels = (
        np.array(point_labels)[valid_rows]
        if point_labels is not None
        else np.ones(len(scaled_points))
    )
    return scaled_points.astype(np.float32), labels.astype(np.uint32)


def _to_abs_boxes(boxes, img_width, img_height, chunk_size=1e6):
    boxes_xyxy = np.copy(boxes)
    num_boxes = len(boxes)

    for start in range(0, num_boxes, int(chunk_size)):
        end = min(start + int(chunk_size), num_boxes)
        boxes_xyxy[start:end, 2] += boxes_xyxy[start:end, 0]
        boxes_xyxy[start:end, 3] += boxes_xyxy[start:end, 1]
        boxes_xyxy[start:end, 0] *= img_width
        boxes_xyxy[start:end, 2] *= img_width
        boxes_xyxy[start:end, 1] *= img_height
        boxes_xyxy[start:end, 3] *= img_height

    return boxes_xyxy


def _mask_to_box(mask):
    if len(mask.shape) == 3:
        mask = np.squeeze(mask, axis=0)
    pos_indices = np.where(mask)
    if all(arr.size == 0 for arr in pos_indices):
        return None
    x1 = np.min(pos_indices[1])
    x2 = np.max(pos_indices[1])
    y1 = np.min(pos_indices[0])
    y2 = np.max(pos_indices[0])
    return [x1, y1, x2, y2]
