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
        get_item_cls (None): a string like
            ``"fifytone.utils.sam.SegmentAnythingImageGetItem"`` specifying the
            :class:`GetItem` to use for SAM
        get_item_args (None): a dictionary of arguments for
            ``get_item_cls(field_mapping=field_mapping, **kwargs)``
    """

    def __init__(self, d):
        d = self.init(d)
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
        return torch.tensor(points), torch.tensor(labels)


class SAMPromptMode(Enum):
    """Enumeration of supported prompt modes for SAM."""

    auto = 1
    box_only = 2
    point_only = 3
    box_point_combo = 4

    @classmethod
    def from_mode_name(cls, mode_name):
        """_summary_

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
            img_hw = img.shape[-2:]
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
                _mask_index = (
                    mask_index
                    if mask_index is not None
                    else mask_scores.argmax(dim=1)
                )
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
        masks = output["masks"].detach().cpu().numpy()
        scores = output["scores"].detach().cpu().numpy()
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

            if box is None:
                # Compute box from mask
                box = _mask_to_box(mask)
                if box is None:
                    continue

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

            if mask.dtype != bool:
                mask = mask > self.mask_thresh

            detections.append(
                fol.Detection(
                    label=label,
                    bounding_box=bounding_box,
                    mask=mask,
                    confidence=score,
                )
            )
        return fol.Detections(detections=detections)


class SegmentAnythingModel(fout.TorchImageModel):
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

        fout.TorchImageModel.__init__(self, config)
        self._sam_auto_generator = self._load_auto_generator()
        self._sam_predictor = self._load_predictor()

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_predictor(self):
        return _SAMPredictor(model=self._model)

    def _load_auto_generator(self):
        kwargs = self.config.auto_kwargs or {}
        return sam.SamAutomaticMaskGenerator(self._model, **kwargs)

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

        Args:
            img: A dictionary containing images, original sizes, and prompts. See :class:`fiftyone.utils.sam.SegmentAnythingGetItem` for details.
            samples (None): samples is no longer used. Available for backward compatibility.

        Returns:
            a list of :class:`fiftyone.core.labels.Detections` instances or a list of dict
            containing the "masks", "iou_predictions", "low_res_logits" from SAM model output.
        """
        if samples is not None:
            raise RuntimeError(
                "Use of SamplesMixin has been deprecated."
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
            raise Exception("GetItem class is set to None")

        if not etau.is_str(self.config.get_item_cls):
            raise Exception(
                f"Expected class string. GetItem class can't be initialized from {get_item_cls}"
            )
        get_item = etau.get_class(get_item_cls)
        get_item_args = dict(self.config.get_item_args or {})
        field_mapping = {} if field_mapping is None else dict(field_mapping)

        if "prompt_field" in field_mapping:
            # Maintain backward compability of prompt_field.
            if (
                "box_prompt_field" in field_mapping
                and "point_prompt_field" in field_mapping
            ):
                raise ValueError(
                    "The generic prompt_field cannot be used when both box_prompt_field and point_prompt_field are present."
                )
            value = field_mapping["prompt_field"]
            # Copy to box and/or point fields since prompt type is unknown.
            if "box_prompt_field" not in field_mapping:
                logger.debug("Moving prompt_field to box_prompt_field")
                field_mapping["box_prompt_field"] = value
            if "point_prompt_field" not in field_mapping:
                logger.debug("Moving prompt_field to point_prompt_field")
                field_mapping["point_prompt_field"] = value

        # TODO: Add an optional mode in GetItem which can be set via apply_model.
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
                "image": a list of torch tensor or numpy arrays of (B X C X H X W) shape
                "boxes": a list of B X 4 boxes for SAM model input
                "boxes_xyxy: a list of B x 4 boxes in XYXY pixels in original image space
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
                    for pts, pts_labels in zip(val, point_labels):
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
            elif isinstance(args[key][0], torch.Tensor):
                args[key] = [v.to(self.device) for v in args[key]]

        args["multimask_output"] = (
            True if prompt_type == "point_only" else False
        )
        output = self._forward_pass(args)

        if self._output_processor is not None:
            return self._output_processor(
                output,
                orig_image_sizes,
                confidence_thresh=self.config.confidence_thresh,
                box_prompts=boxes_xyxy,
                labels=labels,
                mask_index=self.config.points_mask_index,
            )
        return output

    def _forward_pass(self, imgs):
        """Forward pass with prompts

        Args:
            imgs: a dict containing model input

        Returns:
            a dict containing model output
        """
        multimask_output = imgs.pop("multimask_output", False)
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
                    "masks": masks,
                    "iou_predictions": iou_predictions,
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
                detection = fol.Detection.from_mask(
                    mask=data["segmentation"],
                    score=data["predicted_iou"],
                    stability=data["stability_score"],
                )
                detections.append(detection)
            outputs.append(fol.Detections(detections=detections))
        return outputs


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
