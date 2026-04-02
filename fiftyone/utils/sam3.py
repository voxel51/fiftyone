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
from enum import Enum

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.utils.sam as fosam
import fiftyone.utils.sam2 as fosam2

fou.ensure_torch()
import torch

sam3 = fou.lazy_import("sam3")
sam3tr = fou.lazy_import("sam3.train.transforms.basic_for_api")
sam3ds = fou.lazy_import("sam3.train.data.sam3_image_dataset")
sam2ip = fou.lazy_import("sam2.sam2_image_predictor")

logger = logging.getLogger(__name__)


class SegmentAnything3ImageModelConfig(fosam.SegmentAnythingModelConfig):
    """Configuration for running a :class:`SegmentAnything3ImageModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        classes (None): a list of custom classes for use as SAM3 text prompts
    """

    def __init__(self, cfg_dict):
        """Initializes :class:`SegmentAnythingModelConfig`

        Args:
            cfg_dict: a dictionary with config parameters
        """
        d = self.init(cfg_dict)
        super().__init__(d)
        self.get_item_cls = self.parse_string(
            d,
            "get_item_cls",
            default="fiftyone.utils.sam3.SegmentAnything3ImageGetItem",
        )
        self.classes = self.parse_array(d, "classes", default=None)
        self.operation_mode = self.parse_string(
            d, "operation_mode", default="concept"
        )
        self.image_id = None


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

    def image_transform(self, img):
        """Transforms image for SAM3 model input.

        Args:
            img: a PIL or a uint8 numpy array containing image in HWC format

        Returns:
            a PIL image or a uint8 numpy array containing image in HWC format
            a tuple containing original image dimensions
        """
        # SAM2 does image pre-processing when it calls SAM2ImagePredictor.set_image.
        # No straight-forward way to decouple them other than extracting the functionality.
        if isinstance(img, np.ndarray):
            return super().image_transform(img)
        return img, img.size[::-1]


class SegmentAnything3ImageGetItem(fosam.SegmentAnythingImageGetItem):
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
        super().__init__(
            field_mapping=field_mapping,
            transform=transform,
            use_numpy=use_numpy,
            box_transform=box_transform,
            point_transform=point_transform,
        )
        self.text_prompts = text_prompts
        self.operation_mode = operation_mode

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


class SegmentAnything3ImageModel(fosam.SegmentAnythingModel):
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

    def _load_predictor(self):
        predictor = _SAM3Predictor(model=self._model)
        tracker_model = predictor.processor.model
        if getattr(tracker_model, "backbone", None) is None:
            tracker_model.backbone = self._model.backbone
        return predictor

    def _load_model(self, config):
        if "device" not in config.entrypoint_args:
            config.entrypoint_args["device"] = self._device
        return super()._load_model(config)

    def _download_model(self, config):
        # Download sam3 to fo.config.model_zoo_dir from HF hub.
        from huggingface_hub import hf_hub_download

        hf_hub_download(
            repo_id="facebook/sam3",
            filename=os.path.basename(config.model_path),
            local_dir=os.path.dirname(config.model_path),
            local_dir_use_symlinks=False,
        )

    @property
    def operation_mode(self):
        """Whether to use the model in visual or concept segmentation mode"""
        return self._operation_mode

    @operation_mode.setter
    def operation_mode(self, value):
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
                            original_size=results["original_size"][::-1],
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
                            original_size=results["original_size"][::-1],
                            # dummy values
                            coco_image_id=img_idx,
                            original_category_id=1,
                            object_id=0,
                            frame_index=0,
                        ),
                    )
                )
            datapoints.append(transform(datapoint))
        batched_dps = sam3.train.data.collator.collate_fn_api(
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
        rm_text_prompts, rm_op_mode = False, False
        if self.config.get_item_args is None:
            self.config.get_item_args = {}
        if (
            "text_prompts" not in self.config.get_item_args
            and self.config.classes is not None
        ):
            self.config.get_item_args["text_prompts"] = self.config.classes
            rm_text_prompts = True
        if "operation_mode" not in self.config.get_item_args:
            self.config.get_item_args[
                "operation_mode"
            ] = self.config.operation_mode
            rm_op_mode = True
        self.config.get_item_args["use_numpy"] = (
            self.config.operation_mode == "visual"
        )
        get_item = super().build_get_item(field_mapping=field_mapping)
        if rm_text_prompts:
            _ = self.config.get_item_args.pop("text_prompts")
        if rm_op_mode:
            _ = self.config.get_item_args.pop("operation_mode")
        return get_item

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
        labels = args.get("classes") if "datapoints" not in args else None

        if "datapoints" in args:
            # Concept mode
            args["datapoints"] = sam3.model.utils.misc.copy_data_to_device(
                args["datapoints"], self.device, non_blocking=True
            )
            orig_image_sizes = args.get("original_size")

            output = self._forward_pass_concept(args)
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
            _output = self._model(imgs["datapoints"])

        output = []
        orig_image_sizes = imgs.get("original_size")
        for idx, out in enumerate(_output):
            out_bbox = out["pred_boxes"]
            out_logits = out["pred_logits"]
            out_masks = out["pred_masks"]
            out_probs = out_logits.sigmoid()
            presence_score = out["presence_logit_dec"].sigmoid().unsqueeze(1)
            out_probs = (out_probs * presence_score).squeeze(-1)

            keep = out_probs > 0.5
            out_probs = out_probs[keep]
            out_masks = out_masks[keep]
            out_bbox = out_bbox[keep]

            boxes = sam3.model.box_ops.box_cxcywh_to_xyxy(out_bbox)

            img_h = orig_image_sizes[idx][0]
            img_w = orig_image_sizes[idx][1]
            scale_fct = torch.tensor([img_w, img_h, img_w, img_h]).to(
                self.device
            )
            boxes = boxes * scale_fct[None, :]

            out_masks = sam3.model.data_misc.interpolate(
                out_masks.unsqueeze(1),
                (img_h, img_w),
                mode="bilinear",
                align_corners=False,
            ).sigmoid()
            output.append(
                {
                    "masks": (out_masks > 0.5).float(),
                    "iou_predictions": out_probs.unsqueeze(1).float(),
                }
            )

        return output

    def _forward_pass(self, imgs):
        """Forward pass with prompts

        Args:
            imgs: a dict containing model input

        Returns:
            a dict containing model output
        """
        # TODO: FIX THIS! Using sam3 predict_inst_batch
        images = imgs.pop("image")

        self._sam_predictor.processor.set_image_batch(images)

        point_coords = imgs.get("point_coords")
        point_labels = imgs.get("point_labels")
        boxes = imgs.get("boxes")
        mask_inputs = imgs.get("mask_inputs")  # Not used currently
        multimask_output = (
            True if (boxes is None and point_coords is not None) else False
        )
        outputs = []
        for img_idx in range(len(images)):
            out_masks, iou_pred, _ = self._sam_predictor.processor._predict(
                point_coords=point_coords[img_idx]
                if point_coords is not None
                else None,
                point_labels=point_labels[img_idx]
                if point_labels is not None
                else None,
                boxes=boxes[img_idx] if boxes is not None else None,
                mask_input=mask_inputs[img_idx] if mask_inputs else None,
                multimask_output=multimask_output,
            )
            outputs.append(
                {
                    "masks": out_masks.float(),
                    "iou_predictions": iou_pred.float(),
                }
            )
        return outputs

    def _forward_pass_auto(self, imgs):
        raise RuntimeError(
            "sam3.model.sam3_image.Sam3Image doesn't support auto segmentation. You may use one of the SAM/SAM2 zoo models for auto segmentation."
        )
