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
        # For each point prompt, three masks are generated. Mask index is used to select
        # which one of the three masks to choose. When not provided, mask with the
        # highest score is chosen.
        self.points_mask_index = self.parse_int(
            d, "points_mask_index", default=None
        )
        if self.points_mask_index and not 0 <= self.points_mask_index <= 2:
            raise ValueError("mask_index must be 0, 1, or 2")

        self.get_item_cls = self.parse_int(
            d,
            "get_item_cls",
            default="fiftyone.utils.sam.SegmentAnythingImageGetItem",
        )
        self.get_item_args = self.parse_dict(d, "get_item_args", default=None)


class _SAMPredictor:
    def __init__(self, model):
        self.processor = sam.SamPredictor(model)
        self._image_id = None

    def image_transform(self, img):
        image_torch = torch.as_tensor(
            self.processor.transform.apply_image(img)
        )
        image_torch = image_torch.permute(2, 0, 1).contiguous()[None, :, :, :]
        return image_torch, img.shape[:2]

    def box_transform(self, boxes_xyxy, img_hw):
        sam_boxes = np.round(boxes_xyxy).astype(int)
        input_boxes = torch.tensor(sam_boxes)
        return self.processor.transform.apply_boxes_torch(
            input_boxes, (img_hw[0], img_hw[1])
        )

    def set_image(self, img, img_id=None, **kwargs):
        img_size = kwargs["img_size"]
        device = kwargs.pop("device", "cpu")
        self.processor.set_torch_image(img.to(device), img_size)
        self._image_id = img_id

    def reset_image(self):
        self.processor.reset_image()
        self._image_id = None

    def valid_image(self, curr_id):
        if self.processor.is_image_set():
            return curr_id == self._image_id
        return True


class SAMPromptMode(Enum):
    auto = 1
    box_only = 2
    point_only = 3
    box_point_combo = 4

    @classmethod
    def from_mode_name(cls, mode_name):
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
        validate_prompts (False): Whether to validate combination prompts
    """

    def __init__(
        self,
        field_mapping=None,
        transform=None,
        use_numpy=None,
        box_transform=None,
        validate_prompts=False,
        **kwargs,
    ):
        self.mode = self._set_mode(field_mapping)

        super().__init__(field_mapping=field_mapping, **kwargs)
        self.transform = transform
        self.use_numpy = use_numpy
        self.box_transform = box_transform
        self.validate_prompts = validate_prompts

    def _set_mode(self, field_mapping):
        prompt_fields = ["box_prompt_field", "point_prompt_field"]
        is_present = {f: False for f in prompt_fields}

        for key in field_mapping:
            if key in prompt_fields:
                is_present[key] = True

        if not any(is_present.values()):
            return SAMPromptMode(1)  # auto
        elif (
            is_present["box_prompt_field"]
            and not is_present["point_prompt_field"]
        ):
            return SAMPromptMode(2)  # box only
        elif (
            not is_present["box_prompt_field"]
            and is_present["point_prompt_field"]
        ):
            return SAMPromptMode(3)  # point only
        else:
            # NOTE: Because of how we are mainintaing backward compatibilty of prompt_field,
            # combo mode will be set when prompt_field is used.
            return SAMPromptMode(4)  # box and point combo

    def __call__(self, d):
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
        img, img_hw = self.transform(img)
        item_dict["image"] = img
        item_dict["original_size"] = img_hw
        item_dict["id"] = d["id"]
        item_dict.update(self._preprocess_prompts(d, img_hw))

        return item_dict

    def _preprocess_prompts(self, d, img_hw):
        detections = d.get("box_prompt_field")
        keypoints = d.get("point_prompt_field")

        if detections and not isinstance(detections, fol.Detections):
            # This may happen when using prompt_field as the only input prompt.
            logger.warning(
                f"Invalid type for box prompts: {type(detections)}. Ignoring box prompts."
            )
            detections = None

        if keypoints and not isinstance(keypoints, fol.Keypoints):
            # This may happen when using prompt_field as the only input prompt.
            logger.warning(
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

        item_dict = {}
        item_dict["prompt_type"] = self._set_prompt_type(has_boxes, has_points)

        if has_boxes:
            item_dict["boxes"] = boxes
            item_dict["boxes_xyxy"] = boxes_xyxy
        if has_points:
            item_dict["point_coords"] = points
            item_dict["point_labels"] = point_type_labels

        if item_dict["prompt_type"] != "auto":
            # Box classes take precedence over point classes
            item_dict["classes"] = (
                box_classes if box_classes else points_classes
            )

        if self.validate_prompts and has_boxes and has_points:
            self._validate_combination(boxes, points, point_type_labels)

        return item_dict

    def _set_prompt_type(self, has_boxes, has_points):
        # Prompt type can be different from SegmentAnythingImageGetItem.mode.
        if has_boxes and has_points:
            prompt_type = "combination"
        elif has_boxes:
            prompt_type = "box"
        elif has_points:
            prompt_type = "point"
        else:
            prompt_type = "auto"
        return prompt_type

    def _preprocess_boxes(self, detections, img_hw):
        if detections is None or len(detections.detections) == 0:
            return None, None, None

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
        if keypoints is None or len(keypoints.keypoints) == 0:
            return None, None, None
        sam_points = []
        sam_labels = []
        points_classes = []
        for kp in keypoints.keypoints:
            _points, _labels = _to_sam_points(
                kp.points, img_hw[1], img_hw[0], kp
            )
            points_classes.append(kp.label)
            sam_points.append(_points)
            sam_labels.append(_labels)
        return sam_points, sam_labels, points_classes

    def _validate_combination(self, boxes, points, point_labels):
        if len(boxes) != len(points):
            raise ValueError(
                f"For combination prompts, there should be a 1-on-1 correspondence between detections and keypoints. Found {len(boxes)} detections and {len(points)} keypoints."
            )
        # Check whether positive points lie within boxes
        for pts, box in zip(points, boxes.numpy()):
            box = box.flatten()
            pos_pts = pts[point_labels == 1]
            are_valid = np.all(
                (pos_pts[:, 0] >= box[0])
                & (pos_pts[:, 0] <= box[2])
                & (pos_pts[:, 1] >= box[1])
                & (pos_pts[:, 1] <= box[3])
            )
            if not are_valid:
                raise ValueError(
                    f"Point prompts {pts} not contained within box {box}"
                )

    @property
    def required_keys(self):
        common_keys = ["id", "filepath"]
        box_keys = ["box_prompt_field"]
        point_keys = ["point_prompt_field"]

        if self.mode == SAMPromptMode(1):
            return common_keys
        elif self.mode == SAMPromptMode(2):
            return common_keys + box_keys
        elif self.mode == SAMPromptMode(3):
            return common_keys + point_keys
        elif self.mode == SAMPromptMode(4):
            return common_keys + box_keys + point_keys
        else:
            raise ValueError(f"Undefined required keys for {self.mode.name}")


class SAMSegmenterOutputProcessor(fout.OutputProcessor):
    """Converts SAM model outputs to FiftyOne format."""

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
    ):
        return [
            self._parse_output(out, width_height, confidence_thresh, classes)
            for out, width_height in zip(output, frame_size)
        ]

    def _parse_output(self, output, frame_wh, confidence_thresh, classes):
        width, height = frame_wh

        boxes = output["boxes"]
        labels = output["labels"]
        masks = output["masks"]
        scores = output["scores"]

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

            if isinstance(mask, torch.Tensor):
                mask = mask.detach().cpu().numpy()

            x1, y1, x2, y2 = box
            bounding_box = [
                x1 / width,
                y1 / height,
                (x2 - x1) / width,
                (y2 - y1) / height,
            ]
            if len(mask.shape) == 3:
                mask = np.squeeze(mask, axis=0)

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

        if (
            not config.entrypoint_args
            or "checkpoint" not in config.entrypoint_args
        ):
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

    def predict_all(self, imgs, samples=None):
        if samples is not None:
            raise RuntimeError(
                "Use of SamplesMixin has been deprecated."
                "Use SegmentAnythingGetItem to get inputs for the predict_all method."
            )

        return self._predict_all(imgs)

    def build_get_item(self, field_mapping=None):
        get_item_cls = self.config.get_item_cls
        if get_item_cls is None:
            raise Exception("GetItem class is set to None")

        if not etau.is_str(self.config.get_item_cls):
            raise Exception(
                f"Expected class string. GetItem class can't be initialized from {get_item_cls}"
            )
        get_item = etau.get_class(get_item_cls)
        get_item_args = self.config.get_item_args or {}
        field_mapping = {} if field_mapping is None else field_mapping

        if "prompt_field" in field_mapping:
            # Maintain backward compability of prompt_field.
            logger.warning(
                "Instead of prompt_field, use type specific prompt fields, such as, box_prompt_field, point_prompt_field etc."
            )
            if (
                "box_prompt_field" in field_mapping
                and "point_prompt_field" in field_mapping
            ):
                raise ValueError(
                    "The generic prompt_field cannot be used when both box_prompt_field and point_prompt_field are present."
                )
            value = field_mapping.pop("prompt_field")
            # Copy to box and/or point fields since prompt type is unknown.
            if "box_prompt_field" not in field_mapping:
                logger.warning("Moving prompt_field to box_prompt_field")
                field_mapping["box_prompt_field"] = value
            if "point_prompt_field" not in field_mapping:
                logger.warning("Moving prompt_field to point_prompt_field")
                field_mapping["point_prompt_field"] = value

        # TODO: Add an optional mode in GetItem which can be set via apply_model.
        # This will make backward compatibility easier to maintain.
        return get_item(
            field_mapping=field_mapping,
            transform=get_item_args.pop(
                "transform", self._sam_predictor.image_transform
            ),
            use_numpy=get_item_args.pop("use_numpy", True),
            box_transform=get_item_args.pop(
                "box_transform", self._sam_predictor.box_transform
            ),
            validate_prompts=get_item_args.pop("validate_prompts", False),
            **get_item_args,
        )

    def _predict_all(self, args):
        if self.config.raw_inputs is False:
            logger.warning("Batched images are not supported for inference.")

        outputs = []
        for arg in args:
            height_width = arg["original_size"]
            prompt_type = arg.get("prompt_type", "auto")

            if prompt_type == "auto":
                out = self._forward_pass_auto(arg)
            else:
                out = self._forward_pass(arg)
                if self._output_processor is not None:
                    out = self._output_processor(
                        [out],
                        [height_width[::-1]],
                        confidence_thresh=self.config.confidence_thresh,
                        classes=self.config.filter_classes,
                    )[0]
            outputs.append(out)
        return outputs

    def _forward_pass(self, arg):
        self._sam_predictor.set_image(
            arg["image"],
            **{"img_size": arg["original_size"], "device": self.device},
        )

        prompt_type = arg["prompt_type"]
        point_coords = arg.get("point_coords")
        point_labels = arg.get("point_labels")
        boxes = arg.get("boxes")

        if prompt_type == "box":
            (
                out_masks,
                out_scores,
                _,
            ) = self._sam_predictor.processor.predict_torch(
                point_coords=None,
                point_labels=None,
                boxes=boxes.to(self.device),
                multimask_output=False,
            )
            out_boxes = arg["boxes_xyxy"]

        elif prompt_type == "point":
            # Each point prompt has varying number of points.
            out_boxes, out_scores, out_masks = [], [], []

            for points, labels in zip(point_coords, point_labels):
                (
                    multi_mask,
                    mask_scores,
                    _,
                ) = self._sam_predictor.processor.predict(
                    point_coords=points,
                    point_labels=labels,
                    multimask_output=True,
                )

                mask_index = self.config.points_mask_index
                if mask_index is None:
                    mask_index = np.argmax(mask_scores)

                mask = multi_mask[mask_index].astype(int)
                if mask.any():
                    out_boxes.append(_mask_to_box(mask))
                    out_scores.append(min(1.0, np.max(mask_scores)))
                    out_masks.append(mask)

        elif prompt_type == "combination":
            # For combination prompt, batching isn't possible since each combination prompt
            # has varying number of points.
            out_boxes, out_scores, out_masks = [], [], []

            for points, labels, box in zip(point_coords, point_labels, boxes):
                (
                    out_mask,
                    out_score,
                    _,
                ) = self._sam_predictor.processor.predict(
                    point_coords=points,
                    point_labels=labels,
                    box=box.numpy(),
                    multimask_output=False,
                )
                if out_mask.any():
                    out_boxes.append(_mask_to_box(out_mask))
                    out_scores.append(out_score)
                    out_masks.append(out_mask)
        else:
            raise RuntimeError(f"Invalid prompt type: {prompt_type}")

        return {
            "boxes": out_boxes,
            "labels": arg["classes"],
            "masks": out_masks,
            "scores": out_scores,
        }

    def _forward_pass_auto(self, arg):
        img = arg["image"]
        inp = _to_sam_input(img)
        detections = []
        # TODO: Move this to post-processing op.
        for data in self._sam_auto_generator.generate(inp):
            detection = fol.Detection.from_mask(
                mask=data["segmentation"],
                score=data["predicted_iou"],
                stability=data["stability_score"],
            )
            detections.append(detection)
        return fol.Detections(detections=detections)


def _to_sam_input(tensor):
    return (
        (255 * tensor.squeeze(0).cpu().numpy())
        .astype("uint8")
        .transpose(1, 2, 0)
    )


def _to_sam_points(points, w, h, keypoint):
    points = np.array(points)
    valid_rows = ~np.isnan(points).any(axis=1)
    scaled_points = np.array(points[valid_rows]) * np.array([w, h])
    labels = (
        np.array(keypoint.sam2_labels)[valid_rows]
        if "sam2_labels" in keypoint and keypoint.sam2_labels is not None
        else np.array(keypoint.sam_labels)[valid_rows]
        if "sam_labels" in keypoint and keypoint.sam_labels is not None
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
