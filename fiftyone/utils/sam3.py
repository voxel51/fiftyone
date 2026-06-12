"""
`Segment Anything 3 <https://github.com/facebookresearch/sam3>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import numpy as np
import os
from PIL import Image

import cv2
import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.utils.sam as fosam
import fiftyone.utils.sam2 as fosam2
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

sam3 = fou.lazy_import("sam3")
sam3tr = fou.lazy_import("sam3.train.transforms.basic_for_api")
sam3ds = fou.lazy_import("sam3.train.data.sam3_image_dataset")
sam3coll = fou.lazy_import("sam3.train.data.collator")
sam3misc = fou.lazy_import("sam3.model.utils.misc")
sam2ip = fou.lazy_import("sam2.sam2_image_predictor")

logger = logging.getLogger(__name__)


class SegmentAnything3ImageModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`SegmentAnything3ImageModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        points_mask_index (None): an optional mask index to use for each
            keypoint output
        get_item_cls (None): a string like
            ``"fiftyone.utils.sam.SegmentAnything3ImageGetItem"`` specifying the
            :class:`GetItem` to use for SAM3
        get_item_args (None): a dictionary of arguments for
            ``get_item_cls(field_mapping=field_mapping, **kwargs)``
        operation_mode ("concept"): concept or visual mode of operation for inference
    """

    def __init__(self, cfg_dict):
        """Initializes :class:`SegmentAnything3ImageModelConfig`

        Args:
            cfg_dict: a dictionary with config parameters
        """
        d = self.init(cfg_dict)
        super().__init__(d)

        self.points_mask_index = self.parse_int(
            d, "points_mask_index", default=None
        )
        if self.points_mask_index and not 0 <= self.points_mask_index <= 2:
            raise ValueError("mask_index must be 0, 1, or 2")

        self.get_item_cls = self.parse_string(
            d,
            "get_item_cls",
            default="fiftyone.utils.sam3.SegmentAnything3ImageGetItem",
        )
        self.get_item_args = self.parse_dict(d, "get_item_args", default=None)

        self.operation_mode = self.parse_string(
            d, "operation_mode", default="concept"
        )


class _SAM3Predictor(fosam2._SAM2Predictor):
    def __init__(self, model):
        if model.inst_interactive_predictor is None:
            raise AttributeError(
                "Sam3Image.inst_interactive_predictor must be initialized."
            )

        self.processor = model.inst_interactive_predictor
        self.image_id = None
        self.sam_transforms = (
            self.processor._transforms
            if hasattr(self.processor, "_transforms")
            else sam2ip.SAM2Transforms(model.image_size, mask_threshold=0)
        )
        self.resolution = float(self.sam_transforms.resolution)


class SegmentAnything3ImageGetItem(fosam.SegmentAnythingImageGetItem):
    """A :class:`GetItem` that loads images, bounding boxes and/or keypoints to feed to
    :class:`SegmentAnything3ImageModel` instances.

    Args:
        field_mapping (None): the user-supplied dict mapping keys in
            :attr:`required_keys` to field names of their dataset that contain
            the required values
        transform (None): SAM specific image transform function to apply
        use_numpy (False): whether to use numpy arrays rather than PIL images
            and Torch tensors when loading data
        box_transform (None): SAM specific box transform function to apply
        point_transform (None): SAM specific point transform function to apply
        text_prompts (None): Text prompts for concept prompting the model
        operation_mode ("concept"): Operation mode of the model (required for collate_fn)
    """

    def __init__(
        self,
        field_mapping=None,
        transform=None,
        use_numpy=False,
        box_transform=None,
        point_transform=None,
        text_prompts=None,
        operation_mode="concept",
        **kwargs,
    ):
        self.text_prompts = text_prompts
        self.operation_mode = operation_mode
        super().__init__(
            field_mapping=field_mapping,
            transform=transform,
            use_numpy=use_numpy,
            box_transform=box_transform,
            point_transform=point_transform,
            **kwargs,
        )

    def __call__(self, d):
        """Prepares the model input for a given sample's data.

        Args:
            d: a dict mapping the :meth:`required_keys` to values from the
                sample being processed

        Returns:
            the model input
        """
        item_dict = super().__call__(d=d)
        item_dict["operation_mode"] = self.operation_mode
        if self.operation_mode == "concept":
            item_dict["text_prompts"] = self.text_prompts
        return item_dict


class SegmentAnything3ImageGetItemForVideo(SegmentAnything3ImageGetItem):
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
        item_dict = fosam.SegmentAnythingImageGetItemForVideo.__call__(
            self, d=d
        )
        item_dict["operation_mode"] = self.operation_mode
        if self.operation_mode == "concept":
            item_dict["image"] = Image.fromarray(item_dict["image"], "RGB")
            item_dict["text_prompts"] = self.text_prompts
        return item_dict

    @property
    def required_keys(self):
        """The list of keys that must exist on the dicts provided to the
        :meth:`__call__` method at runtime."""

        common_keys = ["image"]
        box_keys = ["box_prompt_field"]
        point_keys = ["point_prompt_field"]

        if self.mode == fosam.SAMPromptMode.auto:
            return common_keys
        elif self.mode == fosam.SAMPromptMode.box_only:
            return common_keys + box_keys
        elif self.mode == fosam.SAMPromptMode.point_only:
            return common_keys + point_keys
        elif self.mode == fosam.SAMPromptMode.box_point_combo:
            return common_keys + box_keys + point_keys
        else:
            raise ValueError(f"Undefined required keys for {self.mode.name}")


def build_sam_datapoint_transform():
    """Builds transforms for SAM3 datapoints.

    Returns:
        composed transforms
    """
    transform = sam3tr.ComposeAPI(
        transforms=[
            sam3tr.RandomResizeAPI(
                sizes=1008,
                max_size=1008,
                square=True,
                consistent_transform=False,
            ),
            sam3tr.ToTensorAPI(),
            sam3tr.NormalizeAPI(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
        ]
    )
    return transform


class SAM3ConceptSegmenterOutputProcessor(fout.OutputProcessor):
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
    ):
        """Returns processed model output in FiftyOne format.

        Args:
            output: a list of model output per sample
            frame_size: a list of tuple containing original image height and width

        Returns:
            a list of :class:`fiftyone.core.labels.Detections` instances
        """
        proc_output = []
        for idx, out in enumerate(output):
            out_logits = out["pred_logits"]
            out_masks = out["pred_masks"]
            out_probs = out_logits.sigmoid()
            presence_score = out["presence_logit_dec"].sigmoid().unsqueeze(1)
            out_probs = (out_probs * presence_score).squeeze(-1)

            keep = out_probs > self.mask_thresh
            out_probs = out_probs[keep]
            out_masks = out_masks[keep]

            img_h = frame_size[idx][0]
            img_w = frame_size[idx][1]

            out_masks = sam3.model.data_misc.interpolate(
                out_masks.unsqueeze(1),
                (img_h, img_w),
                mode="bilinear",
                align_corners=False,
            ).sigmoid()
            proc_output.append(
                {
                    "masks": out_masks.float(),
                    "iou_predictions": out_probs.unsqueeze(1).float(),
                }
            )
        return proc_output


class SegmentAnything3ImageModel(fosam2.SegmentAnything2ImageModel):
    """Wrapper for running `Segment Anything 3 <https://ai.meta.com/research/sam3>`_
    inference.

    Args:
        config: a :class:`SegmentAnything3ModelConfig`
    """

    def __init__(self, config):
        if config.output_processor_cls is None:
            config.output_processor_cls = (
                "fiftyone.utils.sam.SAMSegmenterOutputProcessor"
            )

        if config.entrypoint_args is None:
            config.entrypoint_args = {}
        if "enable_inst_interactivity" not in config.entrypoint_args:
            # Sam3Image.inst_interactive_predictor is only needed for "visual" operation mode.
            # Always set to True for easy switching of operation modes in a loaded zoo model.
            config.entrypoint_args["enable_inst_interactivity"] = True

        fout.TorchImageModelWithPrompts.__init__(self, config)
        self._sam_auto_generator = None
        self._sam_predictor = self._load_predictor()
        self._operation_mode = self.config.operation_mode
        self._concept_output_processor = self._build_concept_output_processor(
            config
        )

    def _load_predictor(self):
        predictor = _SAM3Predictor(model=self._model)
        tracker_model = predictor.processor.model
        if getattr(tracker_model, "backbone", None) is None:
            tracker_model.backbone = self._model.backbone
        return predictor

    def _load_model(self, config):
        if "device" not in config.entrypoint_args:
            config.entrypoint_args["device"] = str(self._device)
        model = super()._load_model(config)
        return model

    def _download_model(self, config):
        # Download sam3 to fo.config.model_zoo_dir from HF hub.
        from huggingface_hub import hf_hub_download

        hf_hub_download(
            repo_id="facebook/sam3",
            filename=os.path.basename(config.model_path),
            local_dir=os.path.dirname(config.model_path),
        )

    def _build_concept_output_processor(self, config):
        kwargs = config.output_processor_args or {}
        # NOTE: Add params for concept output processor to SegmentAnything3ImageModelConfig
        # if needed for more configurability.
        return SAM3ConceptSegmenterOutputProcessor(
            classes=None, mask_thresh=kwargs.get("mask_thresh", 0.5)
        )

    @property
    def operation_mode(self):
        """Whether to use the model in visual or concept segmentation mode"""
        return self._operation_mode

    @operation_mode.setter
    def operation_mode(self, value):
        if value not in ["visual", "concept"]:
            raise ValueError(
                f"Operation mode can be either visual or concept. {value} is not supported."
            )
        self._operation_mode = value

    @staticmethod
    def collate_fn(batch):
        """Collates a batch of inputs where each input is generated from :class:`SegmentAnything3ImageGetItem`.

        Args:
            batch: a list of dict containing model input from :class:`SegmentAnything3ImageGetItem`

        Returns:
            a collated dictionary of model input for the batch.
        """
        results = fosam.SegmentAnythingModel.collate_fn(batch)

        operation_modes = results["operation_mode"]
        if not all(op == operation_modes[0] for op in operation_modes):
            raise ValueError(
                "All samples in a batch must have the same operation_mode"
            )
        results["operation_mode"] = results["operation_mode"][0]

        if results["operation_mode"] == "visual":
            return results

        # For "concept" mode, the collated output needs to be in Datapoint.
        transform = build_sam_datapoint_transform()
        datapoints = []
        for img_idx in range(len(results["image"])):
            datapoint = sam3ds.Datapoint(find_queries=[], images=[])
            datapoint.images = [
                sam3ds.Image(
                    data=results["image"][img_idx],
                    objects=[],
                    size=results["original_size"][img_idx],
                )
            ]
            text_prompts = (
                results["text_prompts"][img_idx]
                if "text_prompts" in results
                else []
            )
            for tx in text_prompts:
                datapoint.find_queries.append(
                    sam3ds.FindQueryLoaded(
                        query_text=tx,
                        image_id=0,
                        object_ids_output=[],  # unused for inference
                        is_exhaustive=True,  # unused for inference
                        query_processing_order=0,
                        inference_metadata=sam3ds.InferenceMetadata(
                            original_image_id=img_idx,
                            original_size=results["original_size"][img_idx][
                                ::-1
                            ],
                            # dummy values
                            coco_image_id=img_idx,
                            original_category_id=1,
                            object_id=0,
                            frame_index=0,
                        ),
                    )
                )
            box_prompts = (
                results["boxes_xyxy"][img_idx]
                if "boxes_xyxy" in results
                else None
            )
            if box_prompts is not None:
                datapoint.find_queries.append(
                    sam3ds.FindQueryLoaded(
                        query_text="visual",
                        image_id=0,
                        object_ids_output=[],  # unused for inference
                        is_exhaustive=True,  # unused for inference
                        query_processing_order=0,
                        input_bbox=torch.tensor(
                            box_prompts, dtype=torch.float
                        ),
                        input_bbox_label=torch.tensor(
                            results["boxes_labels"][img_idx], dtype=torch.bool
                        ),
                        inference_metadata=sam3ds.InferenceMetadata(
                            original_image_id=img_idx,
                            original_size=results["original_size"][img_idx][
                                ::-1
                            ],
                            # dummy values
                            coco_image_id=img_idx,
                            original_category_id=1,
                            object_id=0,
                            frame_index=0,
                        ),
                    )
                )
            datapoints.append(transform(datapoint))
        batched_dps = sam3coll.collate_fn_api(
            datapoints, dict_key="datapoints"
        )
        results["datapoints"] = batched_dps["datapoints"]
        return results

    def build_get_item(self, field_mapping=None):
        """Builds a :class:`SegmentAnything3ImageGetItem` for loading model input from samples.

        Args:
            field_mapping (None): a dict mapping required keys to sample fields

        Returns:
            a :class:`SegmentAnything3ImageGetItem` instance
        """
        base_args = self.config.get_item_args or {}
        overrides = {
            "operation_mode": base_args.get(
                "operation_mode", self.config.operation_mode
            ),
            "use_numpy": self.config.operation_mode == "visual",
        }
        if "text_prompts" not in base_args and self.config.classes is not None:
            overrides["text_prompts"] = self.config.classes
        original = self.config.get_item_args
        self.config.get_item_args = {**base_args, **overrides}
        try:
            return super().build_get_item(field_mapping=field_mapping)
        finally:
            self.config.get_item_args = original

    def _predict_all(self, args):
        if self._preprocess and self.has_collate_fn:
            # Pre-processing only applies collate. Args are expected to have the model transformations applied.
            if isinstance(args, dict):
                args = [args]
            args = self.collate_fn(args)

        prompt_type = args["prompt_type"]

        orig_image_sizes = args.get("original_size")
        # Only preserve boxes when using prompts with boxes.
        boxes_xyxy = (
            args.get("boxes_xyxy")
            if prompt_type in ["box_only", "box_point_combo"]
            else None
        )
        # TODO: Add classes to concept mode by adding tracking for which detection came from which prompt.
        labels = args.get("classes") if "datapoints" not in args else None

        if "datapoints" in args:
            # Concept mode
            args["datapoints"] = sam3misc.copy_data_to_device(
                args["datapoints"], self.device, non_blocking=True
            )

            output = self._forward_pass_concept(args)
            if self._concept_output_processor is not None:
                output = self._concept_output_processor(
                    output, orig_image_sizes
                )
        elif prompt_type == "auto":
            return self._forward_pass_auto(args)
        else:
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

    def _forward_pass_concept(self, imgs):
        with torch.inference_mode():
            return self._model(imgs["datapoints"])

    def _forward_pass(self, imgs):
        """Forward pass with prompts

        Args:
            imgs: a dict containing model input

        Returns:
            a dict containing model output
        """
        return fosam2.SegmentAnything2ImageModel._forward_pass(self, imgs)

    def _forward_pass_auto(self, imgs):
        raise RuntimeError(
            "sam3.model.sam3_image.Sam3Image doesn't support auto segmentation. You may use one of the SAM/SAM2 zoo models for auto segmentation."
        )


def _sam3_output_to_detections(
    out_binary_masks,
    out_boxes_xywh,
    out_obj_ids,
    out_probs,
    frame_width,
    frame_height,
    label_map=None,
    default_label=None,
):
    """Convert SAM 3 video outputs to FiftyOne Detections.

    Args:
        out_binary_masks: (N, H, W) bool array of segmentation masks
        out_boxes_xywh: (N, 4) normalised [x, y, w, h] boxes
        out_obj_ids: list of int object IDs
        out_probs: (N,) confidence scores
        frame_width: original frame width
        frame_height: original frame height
        label_map: optional dict mapping obj_id -> label string
        default_label: fallback label when ``label_map`` is ``None``

    Returns:
        list of :class:`fiftyone.core.labels.Detection`
    """
    if len(out_obj_ids) == 0:
        return []

    boxes = np.asarray(out_boxes_xywh)
    coords = np.round(
        fosam._to_abs_boxes(boxes, frame_width, frame_height)
    ).astype(int)
    coords[:, [0, 2]] = np.clip(coords[:, [0, 2]], 0, frame_width)
    coords[:, [1, 3]] = np.clip(coords[:, [1, 3]], 0, frame_height)

    widths = coords[:, 2] - coords[:, 0]
    heights = coords[:, 3] - coords[:, 1]
    valid = (widths > 0) & (heights > 0)

    detections = []
    for i, obj_id in enumerate(out_obj_ids):
        if not valid[i]:
            continue

        x1, y1, x2, y2 = coords[i]

        detections.append(
            fol.Detection(
                label=(
                    label_map.get(obj_id, default_label)
                    if label_map
                    else default_label
                ),
                bounding_box=[
                    x1 / frame_width,
                    y1 / frame_height,
                    widths[i] / frame_width,
                    heights[i] / frame_height,
                ],
                mask=out_binary_masks[i, y1:y2, x1:x2],
                index=int(obj_id),
                confidence=(
                    float(out_probs[i]) if out_probs is not None else None
                ),
            )
        )

    return detections


class SegmentAnything3VideoModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`SegmentAnything3VideoModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        operation_mode ("concept"): concept or visual mode of operation for inference
        propagation_direction ("both"): direction to propagate in video;
            supported values are ``"forward"``, ``"backward"``, and ``"both"``
        prompt_frame_indices (None): 1-based frame indices for visual / exemplar prompts
        text_frame_idx (1): 1-based frame index for text concept prompts
    """

    def __init__(self, cfg_dict):
        """Initializes :class:`SegmentAnything3VideoModelConfig`

        Args:
            cfg_dict: a dictionary with config parameters
        """
        d = self.init(cfg_dict)
        super().__init__(d)

        self.operation_mode = self.parse_string(
            d, "operation_mode", default="concept"
        )
        if self.operation_mode not in {"concept", "visual"}:
            raise ValueError("operation_mode must be 'concept' or 'visual'")

        self.propagation_direction = self.parse_string(
            d, "propagation_direction", default="both"
        )
        if self.propagation_direction not in {
            "forward",
            "backward",
            "both",
        }:
            raise ValueError(
                "propagation_direction must be 'forward', 'backward', or 'both'"
            )
        self.prompt_frame_indices = self.parse_array(
            d, "prompt_frame_indices", default=None
        )
        self.text_frame_idx = self.parse_int(d, "text_frame_idx", default=1)


class SegmentAnything3VideoModel(fom.SamplesMixin, fom.Model):
    """Wrapper for running `Segment Anything 3 <https://ai.meta.com/sam3>`_
    inference on videos.

    SAM3 Video performs Promptable Concept Segmentation (PCS) on videos -
    given a text prompt, it finds, segments, and tracks ALL instances of the
    concept across video frames.

    Video prompt example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-video", max_samples=2)

        model = foz.load_zoo_model("segment-anything-3-video-torch")

        # Segment and track "person" instances across frames
        dataset.apply_model(
            model,
            label_field="sam3_tracking",
            classes=["person"],
        )

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`SegmentAnything3VideoModelConfig`
    """

    def __init__(self, config):
        self._fields = {}
        self.config = config
        self.needs_fields = {}

        device = config.device
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self._device = torch.device(device)

        if self._device.type != "cuda":
            raise ValueError(
                f"SAM3 device should be cuda. Found {self._device.type}"
            )

        self._operation_mode = self.config.operation_mode

        self.ctx = _load_video_frames_monkey_patch_sam3()

        self._download_model(config)
        self.model = self._load_model(config)
        self.visual_predictor = self.model.tracker
        self.visual_predictor.backbone = self.model.detector.backbone
        self.concept_predictor = self._load_concept_predictor()

        self._curr_exemplar_prompts = None
        self._curr_visual_prompts = {}
        self._curr_frame_width = None
        self._curr_frame_height = None

    @property
    def media_type(self):
        return "video"

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_model(self, config):
        if config.model is not None:
            model = config.model
        else:
            entrypoint_fcn = config.entrypoint_fcn

            if etau.is_str(entrypoint_fcn):
                entrypoint_fcn = etau.get_function(entrypoint_fcn)

            kwargs = config.entrypoint_args or {}
            with self.ctx:
                model = entrypoint_fcn(**kwargs)

        model = model.to(self._device)
        if self.config.use_half_precision:
            model = model.half()

        model.eval()

        return model

    def _load_concept_predictor(self):
        return sam3.model_builder.build_sam3_video_predictor(
            gpus_to_use=[self._device.index if self._device.index else 0]
        )

    @property
    def operation_mode(self):
        """Whether to use the model in visual or concept segmentation mode"""
        return self._operation_mode

    @operation_mode.setter
    def operation_mode(self, value):
        if value not in ["visual", "concept"]:
            raise ValueError(
                f"Operation mode can be either visual or concept. {value} is not supported."
            )
        self._operation_mode = value

    def _get_frame_prompt_field(self):
        """Return the frame field name, or ``None`` when no
        ``prompt_field`` was provided."""

        prompt_field = None
        if "prompt_field" in self.needs_fields:
            prompt_field = self.needs_fields["prompt_field"]

        if prompt_field is None:
            return None

        if not prompt_field.startswith("frames."):
            raise ValueError(
                "'prompt_field' should be a frame field for "
                "segment anything 3 video model"
            )

        return prompt_field[len("frames.") :]

    def _get_frame_indices(self):
        """Return the frame indices from which to extract prompt fields for prompting.

        When ``None``,``prompt_field`` in all the frames are used for visual prompting."""

        prompt_frame_indices = self.config.prompt_frame_indices
        if prompt_frame_indices is None:
            logger.warning(
                "No frame indices selected for prompting. Prompts in prompt_field across all the frames will be used."
            )
        return prompt_frame_indices

    def _get_text_frame_idx(self):
        """Return the 1-based frame index for text prompting."""
        return self.config.text_frame_idx

    def _parse_concept_frame_prompts(
        self, sample, frame_field_name, frame_indices
    ):
        """Read per-frame exemplar prompts in concept mode.

        Concept mode returns a dict of 0-based frame index to lists of
        normalised prompt dicts::

            {0: [{"box": [x1, y1, x2, y2], "_label": "dog"}], ...}
            {0: [{"points": [[x1, y1], [x2, y2]], "labels": [1, 0], _label": "dog"}], ...}
        """
        _frame_indices = (
            frame_indices if frame_indices else sorted(sample.frames.keys())
        )

        prompts = {}
        for frame_number in _frame_indices:
            if frame_number not in sample.frames:
                raise ValueError(
                    f"Frame index {frame_number} not valid for sample with frame keys {sorted(sample.frames.keys())}."
                )

            value = sample.frames[frame_number].get_field(frame_field_name)
            if value is None:
                continue
            frame_idx = int(frame_number - 1)
            if isinstance(value, fol.Detections):
                frame_prompts = []
                for det in value.detections:
                    rx, ry, rw, rh = det.bounding_box
                    frame_prompts.append(
                        {
                            "box": [rx, ry, rx + rw, ry + rh],
                            "_label": det.label,
                        }
                    )
                if frame_prompts:
                    prompts[frame_idx] = frame_prompts

            elif isinstance(value, fol.Keypoints):
                frame_prompts = []
                for kp in value.keypoints:
                    points_norm, labels = fosam._to_sam_points(
                        kp.points,
                        width=1,
                        height=1,
                        point_labels=fosam._get_sam_point_labels(kp),
                    )
                    frame_prompts.append(
                        {
                            "points": points_norm.tolist(),
                            "labels": labels.tolist(),
                            "_label": kp.label,
                        }
                    )
                if frame_prompts:
                    prompts[frame_idx] = frame_prompts

            else:
                raise ValueError(
                    f"Unsupported prompt type {type(value)} on frame "
                    f"{frame_number}. Use Detections or Keypoints. "
                )

        return prompts

    def _parse_visual_frame_prompts(
        self, sample, frame_field_name, frame_indices
    ):
        """Read per-frame prompts for visual mode.

        Returns a dict mapping 0-based SAM3 frame index to raw FiftyOne labels.
        Frame number N (1-based FiftyOne) maps to SAM3 frame index N-1.
        """
        _frame_indices = (
            set(frame_indices) if frame_indices else set(sample.frames.keys())
        )
        prompts = {}
        for frame_number, frame in sample.frames.items():
            if frame_number not in _frame_indices:
                continue
            value = frame.get_field(frame_field_name)
            if value is not None:
                prompts[frame_number - 1] = value
        return prompts

    def _get_visual_prompt_type(self, sample, field_name):
        for _, frame in sample.frames.items():
            value = frame.get_field(field_name)
            if value is None:
                continue
            if isinstance(value, fol.Detections):
                return "boxes"
            if isinstance(value, fol.Keypoints):
                return "points"
            raise ValueError(
                f"Unsupported prompt type {type(value)} for visual mode"
            )
        raise ValueError(f"Frame field '{field_name}' is empty")

    def predict(self, video_reader, sample):
        (
            self._curr_frame_width,
            self._curr_frame_height,
        ) = video_reader.frame_size

        frame_field_name = self._get_frame_prompt_field()
        if frame_field_name is not None:
            frame_indices = self._get_frame_indices()
            if self.operation_mode == "concept":
                self._curr_exemplar_prompts = (
                    self._parse_concept_frame_prompts(
                        sample, frame_field_name, frame_indices
                    )
                )
            else:
                self._curr_visual_prompts = self._parse_visual_frame_prompts(
                    sample, frame_field_name, frame_indices
                )
        else:
            self._curr_exemplar_prompts = {}
            self._curr_visual_prompts = {}

        if self.operation_mode == "concept":
            outputs = self._forward_pass_concept(video_reader, sample)
        else:
            outputs = self._forward_pass_visual(video_reader, sample)

        return outputs

    def _forward_pass_concept(self, video_reader, sample):
        """Run video segmentation via the SAM 3 session API."""
        if not self.config.classes and not self._curr_exemplar_prompts:
            raise ValueError(
                "Concept mode requires at least one text prompt (via 'classes') "
                "or one exemplar prompt (via 'prompt_field')."
            )

        video_path = sample.filepath

        response = self.concept_predictor.handle_request(
            request=dict(
                type="start_session",
                resource_path=video_path,
            )
        )
        session_id = response["session_id"]

        sample_detections = {
            i + 1: fol.Detections(detections=[])
            for i in range(len(sample.frames))
        }

        try:
            # Each add_prompt call resets model state, so we run a separate
            # propagation pass per prompt and accumulate results across passes.
            if self.config.classes:
                text_frame = self._get_text_frame_idx()
                for text_prompt in self.config.classes:
                    prompt_response = self.concept_predictor.handle_request(
                        request=dict(
                            type="add_prompt",
                            session_id=session_id,
                            frame_index=text_frame - 1,
                            text=text_prompt,
                        )
                    )
                    outputs = prompt_response.get("outputs", prompt_response)
                    label_map = {
                        oid: text_prompt
                        for oid in outputs.get("out_obj_ids", [])
                    }
                    self._accumulate_concept_propagation(
                        session_id, label_map, text_prompt, sample_detections
                    )

            for frame_idx, prompt_list in self._curr_exemplar_prompts.items():
                for prompt_dict in prompt_list:
                    label = prompt_dict.get("_label", None)
                    request = dict(
                        type="add_prompt",
                        session_id=session_id,
                        frame_index=frame_idx,
                    )
                    request.update(
                        {k: v for k, v in prompt_dict.items() if k != "_label"}
                    )
                    prompt_response = self.concept_predictor.handle_request(
                        request=request
                    )
                    outputs = prompt_response.get("outputs", prompt_response)
                    label_map = {
                        oid: label for oid in outputs.get("out_obj_ids", [])
                    }
                    self._accumulate_concept_propagation(
                        session_id, label_map, label, sample_detections
                    )

        finally:
            self.concept_predictor.handle_request(
                request=dict(
                    type="close_session",
                    session_id=session_id,
                )
            )

        return sample_detections

    def _accumulate_concept_propagation(
        self, session_id, label_map, default_label, sample_detections
    ):
        """Propagate the current session state and merge detections into
        ``sample_detections``, using ``default_label`` for any object whose
        ID is not in ``label_map`` (e.g. newly discovered instances)."""
        for frame_result in self.concept_predictor.handle_stream_request(
            request=dict(
                type="propagate_in_video",
                session_id=session_id,
                propagation_direction=self.config.propagation_direction,
            )
        ):
            out_frame_idx = frame_result.get("frame_index", 0)
            outputs = frame_result.get("outputs", frame_result)

            out_obj_ids = outputs.get("out_obj_ids", [])
            out_probs = outputs.get("out_probs")
            out_boxes = outputs.get("out_boxes_xywh")
            out_masks = outputs.get("out_binary_masks")

            if out_masks is None or len(out_obj_ids) == 0:
                continue

            if isinstance(out_masks, torch.Tensor):
                out_masks = out_masks.cpu().numpy()
            if isinstance(out_probs, torch.Tensor):
                out_probs = out_probs.cpu().numpy()
            if isinstance(out_boxes, torch.Tensor):
                out_boxes = out_boxes.cpu().numpy()

            new_dets = _sam3_output_to_detections(
                out_binary_masks=out_masks,
                out_boxes_xywh=out_boxes,
                out_obj_ids=out_obj_ids,
                out_probs=out_probs,
                frame_width=self._curr_frame_width,
                frame_height=self._curr_frame_height,
                label_map=label_map,
                default_label=default_label,
            )

            frame_num = int(out_frame_idx) + 1
            existing = sample_detections.get(
                frame_num, fol.Detections(detections=[])
            )
            sample_detections[frame_num] = fol.Detections(
                detections=existing.detections + new_dets
            )

    def _forward_pass_visual(self, video_reader, sample):
        field_name = self._get_frame_prompt_field()
        if field_name is None:
            raise ValueError(
                "Visual mode requires a prompt_field with "
                "Detections or Keypoints"
            )

        prompt_type = self._get_visual_prompt_type(sample, field_name)

        if prompt_type == "boxes":
            return self._forward_pass_visual_boxes(video_reader, sample)
        else:
            return self._forward_pass_visual_points(video_reader, sample)

    def _forward_pass_visual_boxes(self, video_reader, sample):
        video_path = (sample, video_reader)

        with self.ctx:
            inference_state = self.visual_predictor.init_state(
                video_path=video_path
            )

        classes_obj_id_map = {}
        idx_obj_id_map = {}
        current_obj_idx = 0

        for frame_idx, frame_detections in self._curr_visual_prompts.items():
            if (
                not frame_detections
                or not isinstance(frame_detections, fol.Detections)
                or len(frame_detections.detections) == 0
            ):
                continue

            for detection in frame_detections.detections:
                if detection.index is not None:
                    if detection.index in idx_obj_id_map:
                        ann_obj_id = idx_obj_id_map[detection.index]
                    else:
                        ann_obj_id = current_obj_idx
                        idx_obj_id_map[detection.index] = ann_obj_id
                        current_obj_idx += 1
                else:
                    ann_obj_id = current_obj_idx
                    current_obj_idx += 1

                classes_obj_id_map[ann_obj_id] = detection.label

                rx, ry, rw, rh = detection.bounding_box
                box = np.array([rx, ry, rx + rw, ry + rh], dtype=np.float32)

                _, _, _, _ = self.visual_predictor.add_new_points_or_box(
                    inference_state=inference_state,
                    frame_idx=frame_idx,
                    obj_id=ann_obj_id,
                    box=box,
                )

        return self._propagate_visual(inference_state, classes_obj_id_map)

    def _forward_pass_visual_points(self, video_reader, sample):
        video_path = (sample, video_reader)

        with self.ctx:
            inference_state = self.visual_predictor.init_state(
                video_path=video_path
            )

        classes_obj_id_map = {}
        idx_obj_id_map = {}
        current_obj_idx = 0

        for frame_idx, frame_keypoints in self._curr_visual_prompts.items():
            if (
                not frame_keypoints
                or not isinstance(frame_keypoints, fol.Keypoints)
                or len(frame_keypoints.keypoints) == 0
            ):
                continue

            for keypoint in frame_keypoints.keypoints:
                if keypoint.index is not None:
                    if keypoint.index in idx_obj_id_map:
                        ann_obj_id = idx_obj_id_map[keypoint.index]
                    else:
                        ann_obj_id = current_obj_idx
                        idx_obj_id_map[keypoint.index] = ann_obj_id
                        current_obj_idx += 1
                else:
                    ann_obj_id = current_obj_idx
                    current_obj_idx += 1

                classes_obj_id_map[ann_obj_id] = keypoint.label

                points, labels = fosam._to_sam_points(
                    keypoint.points,
                    width=1,
                    height=1,
                    point_labels=fosam._get_sam_point_labels(keypoint),
                )

                _, _, _, _ = self.visual_predictor.add_new_points_or_box(
                    inference_state=inference_state,
                    frame_idx=frame_idx,
                    obj_id=ann_obj_id,
                    points=points,
                    labels=labels,
                )

        return self._propagate_visual(inference_state, classes_obj_id_map)

    def _propagate_visual(self, inference_state, classes_obj_id_map):
        """Shared propagation for visual mode."""
        direction = self.config.propagation_direction

        if direction == "forward":
            return self._run_visual_propagation(
                inference_state,
                classes_obj_id_map,
                reverse=False,
                propagate_preflight=True,
            )
        elif direction == "backward":
            return self._run_visual_propagation(
                inference_state,
                classes_obj_id_map,
                reverse=True,
                propagate_preflight=True,
            )
        else:
            forward = self._run_visual_propagation(
                inference_state,
                classes_obj_id_map,
                reverse=False,
                propagate_preflight=True,
            )
            backward = self._run_visual_propagation(
                inference_state,
                classes_obj_id_map,
                reverse=True,
                propagate_preflight=False,
            )
            return self._merge_propagation_results(forward, backward)

    def _run_visual_propagation(
        self, inference_state, classes_obj_id_map, reverse, propagate_preflight
    ):
        """Run a single-direction propagation pass and return frame detections."""
        sample_detections = {}

        for (
            out_frame_idx,
            out_obj_ids,
            _low_res_masks,
            out_mask_logits,
            _obj_scores,
        ) in self.visual_predictor.propagate_in_video(
            inference_state,
            start_frame_idx=None,
            max_frame_num_to_track=None,
            reverse=reverse,
            propagate_preflight=propagate_preflight,
        ):
            detections = []

            for i, out_obj_id in enumerate(out_obj_ids):
                mask = np.squeeze(
                    (out_mask_logits[i] > 0.0).cpu().numpy(), axis=0
                )

                box = fosam._mask_to_box(mask)
                if box is None:
                    continue

                label = classes_obj_id_map.get(out_obj_id, None)
                x1, y1, x2, y2 = box

                bounding_box = [
                    x1 / self._curr_frame_width,
                    y1 / self._curr_frame_height,
                    (x2 - x1) / self._curr_frame_width,
                    (y2 - y1) / self._curr_frame_height,
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
                        index=out_obj_id,
                    )
                )

            sample_detections[int(out_frame_idx) + 1] = fol.Detections(
                detections=detections
            )

        return sample_detections

    def _merge_propagation_results(self, forward, backward):
        """Merge forward and backward propagation results per Detection.index.

        Detections are merged by their ``index`` field so that objects tracked
        only in the backward pass are not discarded on frames where the forward
        pass produced detections for different objects.
        """
        all_frame_nums = set(forward) | set(backward)
        merged = {}
        for frame_num in all_frame_nums:
            fwd_dets = forward.get(frame_num, fol.Detections(detections=[]))
            bwd_dets = backward.get(frame_num, fol.Detections(detections=[]))

            seen_indices = set()
            combined = []
            for det in fwd_dets.detections:
                combined.append(det)
                if det.index is not None:
                    seen_indices.add(det.index)

            for det in bwd_dets.detections:
                if det.index is None or det.index not in seen_indices:
                    combined.append(det)

            merged[frame_num] = fol.Detections(detections=combined)
        return merged


def load_fiftyone_video_frames_sam3(
    video_path,
    image_size,
    offload_video_to_cpu,
    img_mean=(0.5, 0.5, 0.5),
    img_std=(0.5, 0.5, 0.5),
    async_loading_frames=False,
    compute_device=torch.device("cuda"),
):
    """Load video frames from a FiftyOne video reader for SAM 3.

    SAM 3 uses different normalisation constants from SAM 2:
    mean/std = 0.5 instead of ImageNet values.
    """
    sample, video_reader = video_path

    img_mean = torch.tensor(img_mean, dtype=torch.float32)[:, None, None]
    img_std = torch.tensor(img_std, dtype=torch.float32)[:, None, None]

    num_frames = (
        sample.metadata.total_frame_count
        if sample.metadata is not None
        and sample.metadata.total_frame_count is not None
        else len(sample.frames)
    )

    images = torch.zeros(
        num_frames, 3, image_size, image_size, dtype=torch.float32
    )

    video_width, video_height = None, None
    for frame_number in range(num_frames):
        current_frame = video_reader.read()
        if current_frame is None:
            raise RuntimeError(
                f"Video reader returned None at frame {frame_number}, "
                f"expected {num_frames} frames"
            )
        if video_width is None:
            video_height, video_width = current_frame.shape[:2]
        resized_frame = (
            cv2.resize(current_frame, (image_size, image_size)) / 255.0
        )
        img = torch.from_numpy(resized_frame).permute(2, 0, 1)
        images[frame_number] = img

    if not offload_video_to_cpu:
        images = images.to(compute_device)
        img_mean = img_mean.to(compute_device)
        img_std = img_std.to(compute_device)

    images -= img_mean
    images /= img_std

    return images, video_height, video_width


def _load_video_frames_monkey_patch_sam3():
    import sam3.model.sam3_tracking_predictor as _m

    return fou.MonkeyPatchFunction(
        _m,
        load_fiftyone_video_frames_sam3,
        fcn_name="load_video_frames",
    )
