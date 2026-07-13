"""
FiftyOne wrapper for OpenWorldSAM zero-shot instance segmentation.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np
import torch
import torch.nn.functional as F
from torchvision import transforms as T

import fiftyone.core.labels as fol
from fiftyone.zoo.models import HasZooModel
import fiftyone.utils.torch as fout


def build_sam_transform(
    sam_pixel_mean=(123.675, 116.280, 103.530),
    sam_pixel_std=(58.395, 57.120, 57.375),
    sam_image_size=1024,
    **_kwargs,
):
    """Build the SAM2 preprocessing pipeline used by OpenWorldSAM.

    Matches ``preprocess_image()`` in the HuggingFace repo: uint8 pixel-space
    normalization after bilinear resize.

    Args:
        sam_pixel_mean: per-channel mean in ``[0, 255]``. Defaults to the
            standard SAM2 pixel mean
        sam_pixel_std: per-channel std in ``[0, 255]``. Defaults to the
            standard SAM2 pixel std
        sam_image_size (1024): the square input size
    """
    pixel_mean = torch.tensor(sam_pixel_mean)
    pixel_std = torch.tensor(sam_pixel_std)

    def transform(arr):
        sam_tensor = torch.as_tensor(
            np.ascontiguousarray(arr.transpose(2, 0, 1))
        ).float()
        sam_tensor = F.interpolate(
            sam_tensor.unsqueeze(0),
            (sam_image_size, sam_image_size),
            mode="bilinear",
            align_corners=False,
        ).squeeze(0)
        mean = pixel_mean.view(-1, 1, 1)
        std = pixel_std.view(-1, 1, 1)
        return (sam_tensor - mean) / std

    return transform


def build_beit_transform(
    beit_image_size=224,
    beit_image_mean=(0.5, 0.5, 0.5),
    beit_image_std=(0.5, 0.5, 0.5),
    **_kwargs,
):
    """Build the BEiT-3 preprocessing pipeline used by OpenWorldSAM.

    Matches ``preprocess_image_beit3()`` in the HuggingFace repo: tensor resize
    after ``ToTensor()``, instead of resizing after ToPILImage as in the TorchImageModel.

    Args:
        beit_image_size (224): the square input size
        beit_image_mean: normalization mean in ``[0, 1]``
        beit_image_std: normalization std in ``[0, 1]``
    """
    return T.Compose(
        [
            T.ToTensor(),
            T.Resize(
                (beit_image_size, beit_image_size),
                interpolation=3,
                antialias=None,
            ),
            T.Normalize(mean=beit_image_mean, std=beit_image_std),
        ]
    )


class OpenWorldSAMTransform:
    """Dual-branch image transform for OpenWorldSAM.

    Accepts RGB PIL images as produced by :class:`fiftyone.utils.torch.ImageGetItem`.
    Returns a dict containing the SAM2-preprocessed tensor (1024×1024), the
    BEiT-3-preprocessed tensor (224×224), and the original image dimensions.
    This dict is the per-image unit passed through the DataLoader and into
    :meth:`OpenWorldSAMModel._predict_all`.

    Tensors are left on CPU here; ``OpenWorldSAMModel._forward_pass`` moves
    them to the model's device. This transform runs inside forked DataLoader
    worker processes, and CUDA cannot be re-initialized in a forked
    subprocess.

    Args:
        sam_transform: SAM2 branch preprocessing transform
        beit_transform: BEiT-3 branch preprocessing transform
    """

    def __init__(self, sam_transform, beit_transform):
        self._sam_transform = sam_transform
        self._beit_transform = beit_transform

    def __call__(self, pil):
        w, h = pil.size
        arr = np.array(pil)

        sam_tensor = self._sam_transform(arr)
        beit_tensor = self._beit_transform(pil)

        return {
            "image": sam_tensor,
            "evf_image": beit_tensor,
            "height": h,
            "width": w,
        }


class OpenWorldSAMOutputProcessor(fout.OutputProcessor):
    """Output processor for :class:`OpenWorldSAMModel`.

    Parses the HF model's ``List[Dict]`` output into
    :class:`fiftyone.core.labels.Detections`. ``frame_size`` is ignored because
    masks already carry their own spatial dimensions.

    Args:
        classes (None): the list of class labels for the model
    """

    def __init__(self, classes=None, **kwargs):
        if classes is None:
            raise ValueError("This model requires class labels")
        self.classes = classes

    def __call__(
        self,
        output,
        frame_size,
        confidence_thresh=None,
        classes=None,
        **kwargs,
    ):
        return [
            fol.Detections(
                detections=self._parse_output(out, confidence_thresh, classes)
            )
            for out in output
        ]

    def _parse_output(self, output, confidence_thresh, filter_classes):
        if not output or "instances" not in output:
            return []

        instances = output["instances"]
        # Support both detectron2 Instances objects and plain dicts
        if hasattr(instances, "pred_masks"):
            pred_masks = instances.pred_masks
            pred_classes = instances.pred_classes
            scores = instances.scores
        else:
            pred_masks = instances.get(
                "pred_masks", instances.get("masks", torch.empty(0))
            )
            pred_classes = instances.get(
                "pred_classes",
                instances.get("class_ids", torch.empty(0, dtype=torch.long)),
            )
            scores = instances.get("scores", torch.empty(0))

        detections = []
        for mask_t, cls_id, score in zip(
            pred_masks, pred_classes, scores, strict=True
        ):
            score = float(score)
            if confidence_thresh is not None and score < confidence_thresh:
                continue
            idx = int(cls_id)
            label = (
                self.classes[idx] if 0 <= idx < len(self.classes) else str(idx)
            )
            if filter_classes is not None and label not in filter_classes:
                continue
            mask = (mask_t > 0).cpu().numpy().astype(bool)
            if not mask.any():
                continue
            detections.append(
                fol.Detection.from_mask(
                    mask=mask, label=label, confidence=score
                )
            )

        return detections


class OpenWorldSAMModelConfig(fout.TorchImageModelConfig, HasZooModel):
    """Configuration for :class:`OpenWorldSAMModel`.

    Args:
        name_or_path (None): HF repo ID or local path to the OpenWorldSAM model
            uploaded with ``trust_remote_code=True``
        revision (None): optional HF commit SHA / branch / tag to pin when
            downloading the Hub snapshot
        iou_thresh (0.5): minimum IoU score to keep an instance
        classes (None): list of text prompts for zero-shot segmentation.
            Defaults to ``ADE_PANOPTIC_CLASSES`` from the HuggingFace repo
        nms_thresh (0.2): NMS IoU threshold for duplicate suppression
        top_k (100): maximum instances returned per image
        mask_decoder_chunk_size (500): number of candidate queries scored per
            mask decoder call. The decoder's repeat_image path duplicates the
            image embeddings once per candidate, so this bounds peak memory;
            larger values are faster (less call overhead, more parallelism)
            but use more memory
        transforms_fcn (None): function that builds the BEiT-3 branch transform.
            Defaults to :func:`build_beit_transform`
        sam_transforms_fcn (None): function that builds the SAM2 branch
            transform. Defaults to :func:`build_sam_transform`
        transforms_args (None): arguments passed to both branch transform
            factories. The SAM2 branch uses ``sam_pixel_mean``,
            ``sam_pixel_std``, and ``sam_image_size``. The BEiT branch uses
            ``beit_image_size``, ``beit_image_mean``, and ``beit_image_std``
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self.name_or_path = self.parse_string(d, "name_or_path")
        self.revision = self.parse_string(d, "revision", default=None)
        self.iou_thresh = self.parse_number(d, "iou_thresh", default=0.5)
        self.nms_thresh = self.parse_number(d, "nms_thresh", default=0.2)
        self.top_k = self.parse_int(d, "top_k", default=100)
        self.mask_decoder_chunk_size = self.parse_int(
            d, "mask_decoder_chunk_size", default=500
        )
        self.raw_inputs = True  # items are dicts, not stackable tensors
        self.sam_transforms_fcn = self.parse_raw(
            d, "sam_transforms_fcn", default=None
        )
        if self.transforms_fcn is None:
            self.transforms_fcn = build_beit_transform
        if self.sam_transforms_fcn is None:
            self.sam_transforms_fcn = build_sam_transform
        self.validate_config()

    def validate_config(self):
        if not 0 <= self.iou_thresh <= 1:
            raise ValueError("iou_thresh must be in [0, 1]")
        if not 0 <= self.nms_thresh <= 1:
            raise ValueError("nms_thresh must be in [0, 1]")
        if self.top_k < 1:
            raise ValueError("top_k must be >= 1")
        if self.mask_decoder_chunk_size < 1:
            raise ValueError("mask_decoder_chunk_size must be >= 1")


class OpenWorldSAMModel(fout.TorchImageModel):
    """FiftyOne wrapper for OpenWorldSAM zero-shot instance segmentation.

    OpenWorldSAM extends SAM2 (Hiera Large) with BEiT-3 language understanding
    to enable open-vocabulary segmentation from arbitrary text prompts. Weights
    are hosted on HuggingFace Hub (``trust_remote_code=True``).

    Returns :class:`fiftyone.core.labels.Detections` with per-instance binary
    masks, labels, and confidence scores for each image.

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)
        model = foz.load_zoo_model(
            "openworld-sam-ade20k-torch",
            classes=["person", "car", "chair", "table"],
        )
        dataset.apply_model(model, label_field="owsam_pred")
        session = fo.launch_app(dataset)

    Args:
        config: an :class:`OpenWorldSAMModelConfig`
    """

    def __init__(self, config):
        fout.TorchImageModel.__init__(self, config)

    def _parse_classes(self, config):
        if config.classes is not None:
            return list(config.classes)

        # Load constants.py directly by file path rather than importing the
        # `utils` package. `utils/__init__.py` does `from .visualizer import
        # *`, and visualizer.py unconditionally imports detectron2, which
        # isn't a dependency of this model.
        import importlib.util
        import os

        constants_path = os.path.join(
            self._local_hf_dir, "utils", "constants.py"
        )
        spec = importlib.util.spec_from_file_location(
            "openworld_sam_constants", constants_path
        )
        constants = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(constants)

        return list(constants.ADE_PANOPTIC_CLASSES)

    def _download_model(self, config):
        pass  # HF Hub handles download automatically on first load

    def _load_model(self, config):
        import sys, importlib
        from huggingface_hub import snapshot_download
        import fiftyone as fo

        # HF trust_remote_code can't resolve nested package imports, so we
        # download the snapshot and import directly via sys.path.
        self._local_hf_dir = snapshot_download(
            config.name_or_path,
            revision=config.revision,
            cache_dir=fo.config.model_zoo_dir,
            ignore_patterns=["*.pt", "*.pth"],
        )

        inserted = self._local_hf_dir not in sys.path
        if inserted:
            sys.path.insert(0, self._local_hf_dir)

        try:
            OpenWorldSAMConfig = importlib.import_module(
                "configuration_openworld_sam"
            ).OpenWorldSAMConfig
            OpenWorldSAMModel = importlib.import_module(
                "modeling_openworld_sam"
            ).OpenWorldSAMModel
        finally:
            if inserted:
                sys.path.remove(self._local_hf_dir)

        hf_config = OpenWorldSAMConfig(
            nms_thresh=config.nms_thresh,
            iou_thresh=config.iou_thresh,
            top_k_on=True,
            detections_per_image=config.top_k,
            mask_decoder_chunk_size=config.mask_decoder_chunk_size,
        )
        model = OpenWorldSAMModel.from_pretrained(
            self._local_hf_dir,
            config=hf_config,
            low_cpu_mem_usage=False,
        )
        model = model.to(self._device)
        if self._using_half_precision:
            model = model.half()
        model.eval()
        return model

    def _load_sam_transform(self, config):
        import eta.core.utils as etau

        sam_transforms_fcn = config.sam_transforms_fcn
        if etau.is_str(sam_transforms_fcn):
            sam_transforms_fcn = etau.get_function(sam_transforms_fcn)

        kwargs = config.transforms_args or {}
        return sam_transforms_fcn(**kwargs)

    def _build_transforms(self, config):
        transform = OpenWorldSAMTransform(
            sam_transform=self._load_sam_transform(config),
            beit_transform=self._load_transforms(config),
        )
        # ragged_batches=True: items are dicts, not uniform tensors, so the
        # DataLoader must not attempt to torch.stack them
        return transform, True

    def _build_output_processor(self, config):
        return OpenWorldSAMOutputProcessor(classes=self._classes)

    def _forward_pass(self, imgs):
        prompts = list(self._classes)
        # Assign sequential integer IDs; class labels in output index into this list
        category_ids = list(range(len(prompts)))

        batch_input = []
        for d in imgs:
            image = d["image"].to(self._device)
            evf_image = d["evf_image"].to(self._device)
            if self._using_half_precision:
                image = image.half()
                evf_image = evf_image.half()

            batch_input.append(
                {
                    **d,
                    "image": image,
                    "evf_image": evf_image,
                    "prompt": prompts,
                    "unique_categories": category_ids,
                }
            )

        return self._model(batch_input)
