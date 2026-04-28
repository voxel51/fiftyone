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


def _expand_sam_prompt_field(field_mapping):
    """Expand ``prompt_field`` into box/point field names (in-place)."""
    if "prompt_field" not in field_mapping:
        return
    has_box = "box_prompt_field" in field_mapping
    has_point = "point_prompt_field" in field_mapping

    if has_box and has_point:
        raise ValueError(
            "The generic prompt_field cannot be used when both box_prompt_field and point_prompt_field are present."
        )

    value = field_mapping["prompt_field"]
    # Copy to box and/or point fields since prompt type is unknown.
    if not has_box:
        logger.debug("Moving prompt_field to box_prompt_field")
        field_mapping["box_prompt_field"] = value

    if not has_point:
        logger.debug("Moving prompt_field to point_prompt_field")
        field_mapping["point_prompt_field"] = value


class SegmentAnythingModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`SegmentAnythingModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        auto_kwargs (None): a dictionary of keyword arguments to pass to
            ``segment_anything.SamAutomaticMaskGenerator(model, **auto_kwargs)``
        points_mask_index (None): an optional mask index to use for each
            keypoint output
        get_item_cls (None): a string like
            ``"fiftyone.utils.sam.SegmentAnythingImageGetItem"`` specifying the
            :class:`GetItem` to use for SAM
        get_item_args (None): a dictionary of arguments for
            ``get_item_cls(field_mapping=field_mapping, **kwargs)``
    """

    def __init__(self, cfg_dict):
        """Initializes :class:`SegmentAnythingModelConfig`

        Args:
            cfg_dict: a dictionary with config parameters
        """
        d = self.init(cfg_dict)
        super().__init__(d)

        self.auto_kwargs = self.parse_dict(d, "auto_kwargs", default=None)
        # For each point prompt, three masks are generated. Mask index is used to select
        # which one of the three masks to choose. When not provided, mask with the
        # highest score is chosen.
        self.points_mask_index = self.parse_int(
            d, "points_mask_index", default=None
        )
        if self.points_mask_index and not 0 <= self.points_mask_index <= 2:
            raise ValueError("mask_index must be 0, 1, or 2")

        self.get_item_cls = self.parse_string(
            d,
            "get_item_cls",
            default="fiftyone.utils.sam.SegmentAnythingImageGetItem",
        )
        self.get_item_args = self.parse_dict(d, "get_item_args", default=None)


class _SAMPredictor:
    """Wrapper for ``segment_anything.predictor.SamPredictor``.

    Args:
        model: a :class:`segment_anything.modeling.Sam` model
    """

    def __init__(self, model):
        self.processor = sam.SamPredictor(model)
        self.image_id = None

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

    def box_transform(self, boxes_xyxy, img_hw, resolution=None):
        """Transforms boxes for SAM model prompts.

        Args:
            boxes_xyxy: list of boxes in XYXY pixels
            img_hw: original image height and width
            resolution (None): optional SAM2-style prompt resolution scaling
                parameter; ignored by SAM transforms

        Returns:
            resized boxes for SAM as a Bx4 tensor
        """
        sam_boxes = np.round(boxes_xyxy).astype(int)
        return self.processor.transform.apply_boxes_torch(
            torch.tensor(sam_boxes),
            (img_hw[0], img_hw[1]),
        )

    def point_transform(
        self, points, img_hw, point_labels=None, resolution=None
    ):
        """Transforms points for SAM model prompts.

        Args:
            points: relative points in xyxy format
            img_hw: original image height and width
            point_labels (None): list containing positive (1) and negative (0) point labels. Defaults to None.
            resolution (None): optional SAM2-style prompt resolution scaling
                parameter; ignored by SAM transforms

        Returns:
            a torch tensor containing points in XYXY pixels for SAM model
            a torch tensor containing positive and negative labels
        """
        sam_points, labels = _to_sam_points(
            points,
            height=img_hw[0],
            width=img_hw[1],
            point_labels=point_labels,
        )
        transformed_points = self.processor.transform.apply_coords(
            sam_points, img_hw
        )
        return torch.tensor(
            transformed_points, dtype=torch.float64
        ), torch.tensor(labels, dtype=torch.int)

    def set_image(self, filepath, img_id=None):
        """Calculates the image embeddings and caches them.

        Args:
            filepath: a filepath to image media
            img_id (None): a unique identifier for the image
        """
        img = fout._load_image(
            filepath,
            use_numpy=True,
            force_rgb=True,
        )
        # NOTE: SamPredictor.set_image applies the image transform.
        self.processor.set_image(img)
        self.image_id = img_id

    def reset_image(self):
        """Resets the currently set image."""

        self.processor.reset_image()
        self.image_id = None

    def valid_image(self, curr_id):
        """Checks whether the set image has the current input image id.

        Args:
            curr_id: Identifier for the current image being

        Returns:
            True if the set image id and current image id match
        """
        if self.processor.is_image_set:
            return curr_id == self.image_id
        return False

    def predict(
        self,
        boxes=None,
        point_coords=None,
        point_labels=None,
        multimask_output=False,
    ):
        """Wrapper for ``segment_anything.predictor.SamPredictor.predict_torch``

        Args:
          point_coords (None): a BxNx2 array of point prompts in (X,Y) pixels
          point_labels (None): a BxN array of labels for the
            point prompts. 1 indicates a foreground point and 0 indicates a
            background point.
          boxes (None): a Bx4 array of box prompts in XYXY format.
          multimask_output (False): if true, the model will return three masks.

        Returns:
          the output masks in BxCxHxW format where C is the number of masks
          model's prediction in BxC
          low resolution logits in BxCxHxW where H=W=256
        """
        return self.processor.predict_torch(
            point_coords=point_coords,
            point_labels=point_labels,
            boxes=boxes,
            multimask_output=multimask_output,
        )

    @property
    def original_size(self):
        """Returns height and width of the original image."""
        return self.processor.original_size


class SAMPromptMode(Enum):
    """Enumeration of supported prompt modes for SAM."""

    auto = 1
    box_only = 2
    point_only = 3
    box_point_combo = 4


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
        use_numpy=False,
        box_transform=None,
        point_transform=None,
        **kwargs,
    ):
        field_mapping = {} if field_mapping is None else dict(field_mapping)

        # NOTE: Using prompt_field as a key for prompting isn't supported. Use the type specific prompt key.
        # prompt_key is used for managing backward compatibility in field mapping in apply_model.
        self._has_prompt_field = (
            field_mapping.pop("prompt_field", None) is not None
        )
        if self._has_prompt_field and (
            "box_prompt_field" not in field_mapping
            or "point_prompt_field" not in field_mapping
        ):
            raise ValueError(
                "Field mapping contains prompt_field which is not a required key. Use type specific prompt key(s) -- box_prompt_field, point_prompt_field."
            )
        self.mode = self._set_mode(field_mapping)
        self.box_transform_kwargs = kwargs.pop("box_transform_kwargs", {})
        self.point_transform_kwargs = kwargs.pop("point_transform_kwargs", {})

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
            # NOTE: Because of how we are maintaining backward compatibilty of prompt_field,
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
        if self.mode != SAMPromptMode.auto:
            if self.transform is None:
                raise ValueError(
                    f"Transform cannot be None for {self.__class__.__name__}."
                )
            img, img_hw = self.transform(img)
        else:
            img_hw = img.shape[:2] if self.use_numpy else img.size[::-1]
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
                "boxes_labels": positive / negative labels for boxes
                "point_coords": points for SAM model input
                "point_labels": positive / negative labels for points
                "classes": class labels for prompts
        """
        if self.mode == SAMPromptMode.auto:
            return {"prompt_type": self.mode.name}

        detections = d.get("box_prompt_field")
        keypoints = d.get("point_prompt_field")

        if detections is not None and not isinstance(
            detections, fol.Detections
        ):
            # This may happen when using prompt_field as the only input prompt.
            logger.debug(
                f"Invalid type for box prompts: {type(detections)}. Ignoring box prompts."
            )
            detections = None

        if keypoints is not None and not isinstance(keypoints, fol.Keypoints):
            # This may happen when using prompt_field as the only input prompt.
            logger.debug(
                f"Invalid type for point prompts: {type(keypoints)}. Ignoring point prompts."
            )
            keypoints = None

        # Pre-process box prompts
        (
            boxes,
            boxes_xyxy,
            box_classes,
            box_labels,
        ) = preprocess_detections_to_sam(
            detections, img_hw, self.box_transform, **self.box_transform_kwargs
        )

        # Pre-process point prompts
        (
            points,
            point_type_labels,
            points_classes,
        ) = preprocess_keypoints_to_sam(
            keypoints,
            img_hw,
            self.point_transform,
            **self.point_transform_kwargs,
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
            item_dict["boxes_labels"] = box_labels  # only used in SAM3

        if has_points:
            item_dict["point_coords"] = points
            item_dict["point_labels"] = point_type_labels

        # Box classes take precedence over point classes
        item_dict["classes"] = box_classes if box_classes else points_classes

        return item_dict

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


class SegmentAnythingImageGetItemForVideo(SegmentAnythingImageGetItem):
    """Workaround for applying image model to video reader frames.

    Frames are not stored on disk and therefore cannot be loaded.
    """

    def __call__(self, d):
        """Prepares the model input for a given sample's data.

        Args:
            d: a dict mapping the :meth:`required_keys` to values from the
                sample being processed

        Returns:
            the model input
        """
        item_dict = {}
        img = d["image"]
        if self.mode != SAMPromptMode.auto:
            if self.transform is None:
                raise ValueError(
                    f"Transform cannot be None for {self.__class__.__name__}."
                )
            img, img_hw = self.transform(img)
        else:
            img_hw = img.shape[:2]
        item_dict["image"] = img
        item_dict["original_size"] = img_hw
        prompts = self._preprocess_prompts(d, img_hw)
        item_dict.update(prompts)

        return item_dict

    @property
    def required_keys(self):
        """The list of keys that must exist on the dicts provided to the
        :meth:`__call__` method at runtime."""

        common_keys = ["image"]
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


def preprocess_detections_to_sam(
    detections, img_hw, box_transform, **transform_kwargs
):
    """Pre-processes boxes from :class:`fiftyone.core.labels.Detections`.

    Args:
        detections: a :class:`fiftyone.core.labels.Detections` instance
        img_hw: original image height and width
        box_transform: SAM specific box transform function to apply

    Returns:
        a torch tensor of boxes for SAM model prompts
        a numpy array of boxes in XYXY pixels in original image space
        a list class labels for the boxes
        a list of positive/negative labels for the boxes
    """
    if detections is None:
        return None, None, None, None
    if len(detections.detections) == 0:
        raise AssertionError("No box prompts found for sample.")

    if box_transform is None:
        raise AssertionError(
            "Box transform cannot be None when pre-processing box prompts."
        )
    boxes = []
    box_classes = []
    sam_labels = []
    for d in detections.detections:
        boxes.append(d.bounding_box)
        box_classes.append(d.label)
        sam_labels.append(_get_sam_box_labels(d))
    boxes_xyxy = _to_abs_boxes(np.array(boxes), img_hw[1], img_hw[0])
    sam_boxes = box_transform(boxes_xyxy, img_hw, **transform_kwargs)
    return sam_boxes, boxes_xyxy, box_classes, sam_labels


def preprocess_keypoints_to_sam(
    keypoints, img_hw, point_transform, **transform_kwargs
):
    """Pre-processes points from :class:`fiftyone.core.labels.Keypoints`.

    Args:
        keypoints: a :class:`fiftyone.core.labels.Keypoints` instance
        img_hw: original image height and width
        point_transform: SAM specific point transform function to apply

    Returns:
        a list of torch tensor of points in XYXY pixels for SAM model prompts
        a list of torch tensor of positive and negative labels for each point
        a list of class labels for each set of points
    """
    if keypoints is None:
        return None, None, None
    if len(keypoints.keypoints) == 0:
        raise AssertionError("No point prompts found for sample.")

    if point_transform is None:
        raise AssertionError(
            "Point transform cannot be None when pre-processing point prompts."
        )
    sam_points = []
    sam_labels = []
    points_classes = []
    for kp in keypoints.keypoints:
        point_labels = _get_sam_point_labels(kp)
        _points, _labels = point_transform(
            kp.points, img_hw, point_labels, **transform_kwargs
        )
        points_classes.append(kp.label)
        sam_points.append(_points)
        sam_labels.append(_labels)
    return sam_points, sam_labels, points_classes


class SAMSegmenterOutputProcessor(fout.OutputProcessor):
    """Converts SAM model outputs to FiftyOne format.

    Args:
        classes (None): the list of class labels for the model. Not used in SAM output processor.
        mask_thresh (0.5): Threshold for converting float masks to boolean masks
    """

    def __init__(self, classes=None, mask_thresh=0.5):
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
                        (masks.shape[0],),
                        mask_index,
                        dtype=torch.long,
                        device=masks.device,
                    )
                else:
                    _mask_index = mask_scores.argmax(dim=1)

                _row_index = torch.arange(masks.shape[0], device=masks.device)
                out_masks = masks[_row_index, _mask_index]  # (B, H, W)
                out_mask_scores = mask_scores[_row_index, _mask_index]  # (B,)
            else:
                out_masks = masks.squeeze(1)
                out_mask_scores = mask_scores.squeeze(1)

            post_processed_out.append(
                {
                    "masks": out_masks,
                    "scores": out_mask_scores.clamp(max=1),
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

        for box, label, mask, score in zip(
            boxes, labels, masks, scores, strict=True
        ):
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


class SegmentAnythingModel(fout.TorchImageModelWithPrompts):
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
            box_prompt_field="ground_truth",
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
            point_prompt_field="gt_keypoints",
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
        if config.output_processor_cls is None:
            config.output_processor_cls = (
                "fiftyone.utils.sam.SAMSegmenterOutputProcessor"
            )

        if config.entrypoint_args is None:
            config.entrypoint_args = {}
        if "checkpoint" not in config.entrypoint_args:
            config.entrypoint_args["checkpoint"] = config.model_path

        fout.TorchImageModelWithPrompts.__init__(self, config)
        self._sam_auto_generator = self._load_auto_generator()
        self._sam_predictor = self._load_predictor()

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_predictor(self):
        return _SAMPredictor(model=self._model)

    def _load_auto_generator(self):
        kwargs = self.config.auto_kwargs or {}
        return sam.SamAutomaticMaskGenerator(self._model, **kwargs)

    def predict_interactive(
        self,
        sample=None,
        boxes=None,
        points=None,
        point_labels=None,
        prompt_classes=None,
        boxes_xyxy=None,
    ):
        """Generates predictions in interactive mode. Image embedding is cached.

        Args:
            sample (None): a FiftyOne Sample with image media
            boxes (None): a tensor of Bx4 pre-processed SAM transformed boxes in XYXY pixels
            points (None): a tensor of BxNx2 or a list of B tensors with pre-processed points in XY pixels
            point_labels (None): a BxN tensor or a list of B tensors of labels for the point prompts
            prompt_classes (None): a list of B class labels
            boxes_xyxy: a list of Bx4 boxes in XYXY pixels in original image space
        Returns:
            :class:`fiftyone.core.labels.Detections` or dict
            containing the "masks", "iou_predictions", "low_res_logits" from SAM model output.
        """
        if sample is not None and not self._sam_predictor.valid_image(
            sample.id
        ):
            # Compute and cache image embedding
            self._sam_predictor.set_image(sample.filepath, sample.id)

        if sample is None:
            logger.warning("No sample input. Using cached image embeddings.")

        if boxes is None and points is None:
            # Auto segment
            img = fout._load_image(
                sample.filepath,
                use_numpy=True,
                force_rgb=True,
            )
            return self._forward_pass_auto({"image": [img]})[0]

        if boxes is not None and points is not None:
            if len(boxes) != len(points):
                raise AssertionError(
                    f"Number of prompt boxes ({len(boxes)}) should be equal to the number of prompt points ({len(points)})"
                )
        sam_boxes, sam_points, sam_point_labels = boxes, points, point_labels
        img_hw = self._sam_predictor.original_size

        if points is not None and len(points):
            if point_labels is None:
                raise AssertionError(
                    "Point labels can't be None when points are provided."
                )
            if point_labels is not None and len(point_labels) != len(points):
                raise AssertionError(
                    "Points and point labels should be the same length."
                )

            if isinstance(points, list):
                max_points = max([pts.shape[0] for pts in points])
                padded_points = []
                padded_labels = []
                for pts, pts_labels in zip(points, point_labels):
                    pad_amount = max_points - pts.shape[0]
                    padded_pts = torch.nn.functional.pad(
                        pts, (0, 0, 0, pad_amount), value=0.0
                    )
                    padded_lbls = torch.nn.functional.pad(
                        pts_labels.int(), (0, pad_amount), value=-1
                    )

                    padded_points.append(padded_pts)  # BxNx2
                    padded_labels.append(padded_lbls)  # BxN
                sam_points = torch.stack(padded_points).to(self.device)
                sam_point_labels = torch.stack(padded_labels).to(self.device)

        multimask_output = (
            True if (sam_boxes is None and sam_points is not None) else False
        )
        (
            masks,
            iou_predictions,
            low_res_logits,
        ) = self._sam_predictor.predict(
            point_coords=sam_points,
            point_labels=sam_point_labels,
            boxes=sam_boxes.to(self.device) if sam_boxes is not None else None,
            multimask_output=multimask_output,
        )

        output = {
            "masks": masks.float(),
            "iou_predictions": iou_predictions.float(),
            "low_res_logits": low_res_logits,
        }

        if self._output_processor is not None:
            return self._output_processor(
                [output],
                [img_hw],
                confidence_thresh=self.config.confidence_thresh,
                box_prompts=[boxes_xyxy] if boxes_xyxy is not None else None,
                labels=[prompt_classes]
                if prompt_classes is not None
                else None,
                mask_index=self.config.points_mask_index,
            )[0]
        return output

    def predict(self, img, sample=None):
        """Performs prediction a single image.

        Args:
            img: a dictionary containing image, original size, and prompts. See :class:`fiftyone.utils.sam.SegmentAnythingGetItem` for details.
            sample (None): sample is no longer used. Available for backward compatibility.

        Returns:
            a :class:`fiftyone.core.labels.Detections` instance or a dict
            containing the "masks", "iou_predictions", "low_res_logits" from SAM model output.
        """
        return self.predict_all(img, sample)[0]

    def predict_all(self, imgs, samples=None):
        """Performs prediction on multiple images.

        To generate imgs dictionary and run prediction:

            field_mapping = {"box_prompt_field": "ground-truth"}
            get_item = model.build_get_item(field_mapping=field_mapping)
            model_inputs = fout.get_model_inputs_from_get_item(samples, get_item)
            outputs = model.predict_all(model_inputs)

        Args:
            imgs: a list of dictionary or a dictionary containing images, original sizes, and prompts. See :class:`fiftyone.utils.sam.SegmentAnythingGetItem` for details.
            samples (None): samples is no longer used. Available for backward compatibility.

        Returns:
            a list of :class:`fiftyone.core.labels.Detections` instances or a list of dict
            containing the "masks", "iou_predictions", "low_res_logits" from SAM model output.
        """
        if samples is not None:
            raise RuntimeError(
                "Use of SamplesMixin has been deprecated. "
                "Use SegmentAnythingGetItem to get inputs for the predict_all method."
            )

        return self._predict_all(imgs)

    def build_get_item(self, field_mapping=None):
        """Builds a :class:`SegmentAnythingImageGetItem` for loading model input from samples.

        Args:
            field_mapping (None): a dict mapping required keys to sample fields

        Returns:
            a :class:`SegmentAnythingImageGetItem` instance
        """
        get_item_cls = self.config.get_item_cls
        if get_item_cls is None:
            raise ValueError("GetItem class is set to None")

        if not etau.is_str(self.config.get_item_cls):
            raise TypeError(
                f"Expected class string. GetItem class can't be initialized from {get_item_cls}"
            )
        get_item = etau.get_class(get_item_cls)
        get_item_args = dict(self.config.get_item_args or {})
        field_mapping = {} if field_mapping is None else dict(field_mapping)

        _expand_sam_prompt_field(field_mapping)

        return get_item(
            field_mapping=field_mapping,
            transform=get_item_args.pop(
                "transform", self._sam_predictor.image_transform
            ),
            use_numpy=get_item_args.pop("use_numpy", True),
            box_transform=get_item_args.pop(
                "box_transform", self._sam_predictor.box_transform
            ),
            point_transform=get_item_args.pop(
                "point_transform", self._sam_predictor.point_transform
            ),
            **get_item_args,
        )

    @property
    def ragged_batches(self):
        # Ragged image batches are not allowed. All image tensors fed to the model
        # forward pass must be of the same size.
        return False

    @property
    def has_collate_fn(self):
        return True

    @staticmethod
    def collate_fn(batch):
        """Collates a batch of inputs where each input is generated from :class:`SegmentAnythingImageGetItem`.

        Args:
            batch: a list of dict containing model input from :class:`SegmentAnythingImageGetItem`

        Returns:
            a collated dictionary of model input for the batch. Expected keys are:
                "image": a list of torch tensor of (1 x C X H X W) shape or HWC numpy arrays
                "boxes": a list of B X 4 boxes for SAM model input
                "boxes_xyxy: a list of B x 4 boxes in XYXY pixels in original image space
                "boxes_labels": a list of B x N positive / negative labels for boxes
                "point_coords": a list of B X N x 2 point coordinates, padded as needed
                "point_labels": a list of B X N point positive/negative labels, padded as needed
                "prompt_type": name of prompt type for the batch
                "classes": a list of classes for each prompt
        """
        results = {}
        for key in batch[0]:
            results[key] = []

        for item in batch:
            for key, val in item.items():
                if key == "point_labels":
                    continue
                elif key == "point_coords":
                    # Pad point prompts and point labels
                    point_labels = item["point_labels"]

                    max_points = max([pts.shape[0] for pts in val])
                    padded_points = []
                    padded_labels = []
                    for pts, pts_labels in zip(val, point_labels, strict=True):
                        pad_amount = max_points - pts.shape[0]
                        padded_pts = torch.nn.functional.pad(
                            pts, (0, 0, 0, pad_amount), value=0.0
                        )
                        padded_lbls = torch.nn.functional.pad(
                            pts_labels.int(), (0, pad_amount), value=-1
                        )

                        padded_points.append(padded_pts)  # BxNx2
                        padded_labels.append(padded_lbls)  # BxN

                    results[key].append(torch.stack(padded_points))
                    results["point_labels"].append(torch.stack(padded_labels))
                else:
                    results[key].append(val)

        # Collapse prompt type
        prompt_types = results["prompt_type"]
        if not all(pt == prompt_types[0] for pt in prompt_types):
            raise ValueError(
                "All samples in a batch must have the same prompt_type"
            )
        results["prompt_type"] = results["prompt_type"][0]

        return results

    def _predict_all(self, args):
        if self._preprocess and self.has_collate_fn:
            # Pre-processing only applies collate. Args are expected to have the model transformations applied.
            if isinstance(args, dict):
                args = [args]
            args = self.collate_fn(args)

        prompt_type = args["prompt_type"]
        if prompt_type == "auto":
            return self._forward_pass_auto(args)

        orig_image_sizes = args.get("original_size")
        # Only preserve boxes when using prompts with boxes.
        boxes_xyxy = (
            args.get("boxes_xyxy")
            if prompt_type in ["box_only", "box_point_combo"]
            else None
        )
        labels = args["classes"]
        for key in args:
            if isinstance(args[key], torch.Tensor):
                args[key] = args[key].to(self.device)
            elif (
                isinstance(args[key], list)
                and args[key]
                and isinstance(args[key][0], torch.Tensor)
            ):
                args[key] = [v.to(self.device) for v in args[key]]

        output = self._forward_pass(args)

        if self._output_processor is not None:
            return self._output_processor(
                output,
                orig_image_sizes,
                confidence_thresh=self.config.confidence_thresh,
                box_prompts=boxes_xyxy,
                labels=labels,
                mask_index=self.config.points_mask_index,
                classes=self.config.filter_classes,
            )
        return output

    def _forward_pass(self, imgs):
        """Forward pass with prompts

        Args:
            imgs: a dict containing model input

        Returns:
            a dict containing model output
        """
        images = imgs["image"]

        # Adapted from segment-anything.modeling.sam.SAM.forward.
        input_images = torch.cat(
            [self._model.preprocess(img) for img in images], dim=0
        )
        image_embeddings = self._model.image_encoder(input_images)

        point_coords = imgs.get("point_coords")
        point_labels = imgs.get("point_labels")
        boxes = imgs.get("boxes")
        mask_inputs = imgs.get("mask_inputs")  # Not used currently
        multimask_output = boxes is None and point_coords is not None

        outputs = []
        for img_idx, img_embedding in enumerate(image_embeddings):
            if point_coords is not None:
                points = (
                    point_coords[img_idx],
                    point_labels[img_idx],
                )
            else:
                points = None
            sparse_embeddings, dense_embeddings = self._model.prompt_encoder(
                points=points,
                boxes=boxes[img_idx] if boxes is not None else None,
                masks=mask_inputs[img_idx]
                if mask_inputs is not None
                else None,
            )

            low_res_masks, iou_predictions = self._model.mask_decoder(
                image_embeddings=img_embedding.unsqueeze(0),
                image_pe=self._model.prompt_encoder.get_dense_pe(),
                sparse_prompt_embeddings=sparse_embeddings,
                dense_prompt_embeddings=dense_embeddings,
                multimask_output=multimask_output,
            )
            masks = self._model.postprocess_masks(
                low_res_masks,
                input_size=images[img_idx].shape[-2:],
                original_size=imgs["original_size"][img_idx],
            )
            masks = masks > self._model.mask_threshold
            outputs.append(
                {
                    "masks": masks.float(),
                    "iou_predictions": iou_predictions.float(),
                    "low_res_logits": low_res_masks,
                }
            )
        return outputs

    def _forward_pass_auto(self, imgs):
        """Forward pass with no prompts.

        Args:
            imgs: a dictionary containing model input

        Returns:
            a :class:`fiftyone.core.labels.Detections` instance
        """
        outputs = []
        images = imgs["image"]
        for img in images:
            detections = []
            # TODO: Move this to post-processing op.
            for data in self._sam_auto_generator.generate(img):
                score = data["predicted_iou"]
                if (
                    self.config.confidence_thresh is not None
                    and score < self.config.confidence_thresh
                ):
                    continue
                detection = fol.Detection.from_mask(
                    mask=data["segmentation"],
                    score=score,
                    stability=data["stability_score"],
                )
                detections.append(detection)
            outputs.append(fol.Detections(detections=detections))
        return outputs


def _get_sam_point_labels(keypoint):
    if "sam_labels" in keypoint and "sam2_labels" in keypoint:
        logger.warning(
            "Found keypoint labels under sam_labels and sam2_labels. Using sam_labels."
        )
    if "sam_labels" in keypoint and keypoint.sam_labels is not None:
        return keypoint.sam_labels
    if "sam2_labels" in keypoint and keypoint.sam2_labels is not None:
        return keypoint.sam2_labels
    return None


def _to_sam_points(points, height, width, point_labels=None):
    points = np.array(points)
    valid_rows = ~np.isnan(points).any(axis=1)
    scaled_points = np.array(points[valid_rows]) * np.array([width, height])

    if point_labels is not None:
        point_labels = np.array(point_labels)
        if len(point_labels) != len(points):
            raise ValueError(
                f"point_labels length ({len(point_labels)}) must match "
                f"points length ({len(points)})"
            )

    labels = (
        point_labels[valid_rows]
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


def _get_sam_box_labels(detection):
    # NOTE: Positive / negative bounding box labels are only used in SAM3.
    if "sam_label" in detection and "sam3_label" in detection:
        logger.warning(
            "Found detection label under sam_label and sam3_label. Using sam_label."
        )
    if "sam_label" in detection and detection.sam_label is not None:
        return detection.sam_label
    if "sam3_label" in detection and detection.sam3_label is not None:
        return detection.sam3_labels
    return True
