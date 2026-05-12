"""
`Segment Anything 3 <https://github.com/facebookresearch/sam3>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import shutil
from PIL import Image

import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.utils.sam as fosam
import fiftyone.utils.sam2 as fosam2
import fiftyone.zoo.models as fozm

import eta.core.web as etaw

fou.ensure_torch()
import torch

sam3 = fou.lazy_import("sam3")
sam3tr = fou.lazy_import("sam3.train.transforms.basic_for_api")
sam3ds = fou.lazy_import("sam3.train.data.sam3_image_dataset")
sam3coll = fou.lazy_import("sam3.train.data.collator")
sam3misc = fou.lazy_import("sam3.model.utils.misc")
sam2ip = fou.lazy_import("sam2.sam2_image_predictor")

logger = logging.getLogger(__name__)


_SAM3_BPE_FILENAME = "bpe_simple_vocab_16e6.txt.gz"
_SAM3_BPE_URL = (
    "https://raw.githubusercontent.com/openai/CLIP/main/clip/"
    + _SAM3_BPE_FILENAME
)


def _ensure_sam3_bpe_vocab_path():
    """Ensures SAM3 has a valid BPE vocab file and returns its path.

    The upstream `sam3` package defaults to a relative `../assets/` location
    that is not always present in packaged wheels, so we store/download this
    file in FiftyOne's model zoo directory.
    """

    import fiftyone as fo

    bpe_dir = os.path.join(fo.config.model_zoo_dir, "sam3")
    os.makedirs(bpe_dir, exist_ok=True)
    bpe_path = os.path.join(bpe_dir, _SAM3_BPE_FILENAME)

    if os.path.isfile(bpe_path):
        return bpe_path

    # Best-effort: copy from installed `sam3` package if it ships the asset
    try:
        import sam3 as _sam3_pkg

        sam3_pkg_dir = os.path.dirname(os.path.abspath(_sam3_pkg.__file__))
        candidates = (
            os.path.join(
                os.path.dirname(sam3_pkg_dir), "assets", _SAM3_BPE_FILENAME
            ),
            os.path.join(sam3_pkg_dir, "assets", _SAM3_BPE_FILENAME),
        )
        for candidate in candidates:
            if os.path.isfile(candidate):
                shutil.copyfile(candidate, bpe_path)
                return bpe_path
    except Exception:
        pass

    logger.info("Downloading SAM3 tokenizer vocab (%s)...", _SAM3_BPE_FILENAME)
    try:
        etaw.download_file(_SAM3_BPE_URL, path=bpe_path)
    except Exception as e:
        raise RuntimeError(
            "Failed to download SAM3 tokenizer vocab. "
            "You can manually download '%s' from %s and save it to %s"
            % (_SAM3_BPE_FILENAME, _SAM3_BPE_URL, bpe_path)
        ) from e

    return bpe_path


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
            ``"fiftyone.utils.sam.SegmentAnythingImageGetItem"`` specifying the
            :class:`GetItem` to use for SAM
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

        # Ensure the upstream `sam3` entrypoint has a valid BPE vocab path
        bpe_path = config.entrypoint_args.get("bpe_path", None)
        if not bpe_path or not os.path.isfile(bpe_path):
            config.entrypoint_args["bpe_path"] = _ensure_sam3_bpe_vocab_path()

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
