import math

import numpy as np
import torch

import fiftyone.core.labels as fol
from fiftyone.zoo.models import HasZooModel
import fiftyone.utils.torch as fout

# FC-CLIP's ConvNeXt backbone downsamples by 32x, matching the
# ``SIZE_DIVISIBILITY`` the original Detectron2-based implementation pads to
# before batching images of different sizes
_SIZE_DIVISIBILITY = 32


class FCCLIPModelConfig(fout.TorchImageModelConfig, HasZooModel):
    """Configuration for :class:`FCCLIPModel`.

    Args:
        name_or_path (None): HF repo or local path to the FC-CLIP model
            uploaded with ``trust_remote_code=True``
        revision (None): optional HF commit SHA / branch / tag to pin
        confidence_thresh (0.8): minimum panoptic segment confidence to keep
        task ("panoptic"): segmentation task — ``"instance"`` keeps only
            "thing" segments, ``"panoptic"`` keeps both "thing" and "stuff"
            segments
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self.name_or_path = self.parse_string(d, "name_or_path")
        self.revision = self.parse_string(d, "revision", default=None)
        self.confidence_thresh = self.parse_number(
            d, "confidence_thresh", default=0.8
        )
        self.task = self.parse_string(d, "task", default="panoptic")
        self.validate_config()

    def validate_config(self):
        if not 0 <= self.confidence_thresh <= 1:
            raise ValueError("confidence_thresh must be between 0 and 1")

        if self.task not in ("instance", "panoptic"):
            raise ValueError(
                "task must be 'instance' or 'panoptic'; found '%s'" % self.task
            )


class FCCLIPOutputProcessor(fout.OutputProcessor):
    """Converts FC-CLIP panoptic segmentation outputs to
    :class:`fiftyone.core.labels.Detections`.

    Args:
        classes (None): the list of class labels for the model
        task ("panoptic"): ``"instance"`` keeps only "thing" segments;
            ``"panoptic"`` keeps both "thing" and "stuff" segments
    """

    def __init__(self, classes=None, task="panoptic", **kwargs):
        super().__init__(classes=classes, **kwargs)
        self.classes = classes
        self.task = task

    def __call__(
        self,
        output,
        frame_size,
        confidence_thresh=None,
        classes=None,
        **kwargs,
    ):
        return [
            self._parse_output(
                panoptic_seg, segments_info, confidence_thresh, classes
            )
            for panoptic_seg, segments_info in output
        ]

    def _parse_output(
        self, panoptic_seg, segments_info, confidence_thresh, classes
    ):
        detections = []
        for seg in segments_info:
            if self.task == "instance" and not seg["isthing"]:
                continue

            score = seg.get("score")
            if (
                confidence_thresh is not None
                and score is not None
                and score < confidence_thresh
            ):
                continue

            cat_id = seg["category_id"]
            label = (
                self.classes[cat_id]
                if self.classes and 0 <= cat_id < len(self.classes)
                else str(cat_id)
            )
            if classes is not None and label not in classes:
                continue
            mask = (panoptic_seg == seg["id"]).numpy().astype(bool)
            if not mask.any():
                continue
            detections.append(
                fol.Detection.from_mask(
                    mask=mask,
                    label=label,
                    confidence=score,
                )
            )
        return fol.Detections(detections=detections)


class _FCCLIPTransform:
    """Preprocess any image type to a normalized, unbatched FC-CLIP tensor.

    Accepts PIL images and HWC uint8/float numpy arrays. Reimplements the
    HF model's ``preprocess_image`` normalization using CPU-resident copies
    of ``pixel_mean``/``pixel_std`` (rather than calling ``preprocess_image``
    directly, which moves the tensor to the model's device). This keeps
    preprocessing CPU-only, since this transform runs inside DataLoader
    worker processes, which cannot touch a CUDA context already initialized
    in the parent process (forked workers cannot re-initialize CUDA).
    """

    def __init__(self, pixel_mean, pixel_std):
        self._pixel_mean = pixel_mean.detach().cpu()
        self._pixel_std = pixel_std.detach().cpu()

    def __call__(self, img):
        if not isinstance(img, np.ndarray):
            img = np.array(img.convert("RGB"))

        tensor = torch.from_numpy(img).float().permute(2, 0, 1)
        return (tensor - self._pixel_mean) / self._pixel_std


class FCCLIPModel(fout.TorchImageModel):
    """FiftyOne wrapper for the HuggingFace FC-CLIP panoptic segmentation model.

    FC-CLIP is an open-vocabulary panoptic segmentation model with a frozen
    ConvNeXt-Large CLIP backbone and a Mask2Former decoder.  Weights are hosted
    on HuggingFace Hub (``trust_remote_code=True``).

    Returns :class:`fiftyone.core.labels.Detections` with per-segment binary
    masks and class labels for each image.

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)
        model = foz.load_zoo_model("fc-clip-coco-panoptic-torch")
        dataset.apply_model(model, label_field="panoptic")
        session = fo.launch_app(dataset)

    Args:
        config: an :class:`FCCLIPModelConfig`
    """

    def _parse_classes(self, config):
        if config.classes is not None:
            self._model.set_class_names(config.classes)
            return config.classes
        if self._model is not None:
            return self._model.config.stuff_classes
        return None

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        from transformers import AutoModel

        import fiftyone as fo

        model = AutoModel.from_pretrained(
            config.name_or_path,
            revision=config.revision,
            trust_remote_code=True,
            cache_dir=fo.config.model_zoo_dir,
            low_cpu_mem_usage=False,
        )
        model.config.object_mask_threshold = config.confidence_thresh

        model = model.to(self._device)
        if self.using_half_precision:
            model = model.half()

        model.eval()
        return model

    def _build_transforms(self, config):
        transform = _FCCLIPTransform(
            self._model.pixel_mean, self._model.pixel_std
        )
        return transform, False

    @property
    def has_collate_fn(self):
        return True

    @staticmethod
    def collate_fn(batch):
        """Pads a batch of ``(3, H, W)`` tensors of differing sizes to a
        common shape and stacks them into a single ``(B, 3, H, W)`` tensor,
        mirroring the padding that the original Detectron2-based FC-CLIP
        performs via ``ImageList.from_tensors`` so that images of any size
        can be run through the model in one truly batched forward pass.

        Args:
            batch: a list of ``(3, H, W)`` tensors

        Returns:
            a dict with the following keys:

            -   ``pixel_values``: the padded, stacked ``(B, 3, H, W)`` batch
                tensor
            -   ``sizes``: the list of original ``(height, width)`` of each
                image, used to crop each output back to its input
                resolution
        """
        sizes = [tuple(img.shape[-2:]) for img in batch]

        max_h = max(h for h, _ in sizes)
        max_w = max(w for _, w in sizes)
        max_h = math.ceil(max_h / _SIZE_DIVISIBILITY) * _SIZE_DIVISIBILITY
        max_w = math.ceil(max_w / _SIZE_DIVISIBILITY) * _SIZE_DIVISIBILITY

        pixel_values = batch[0].new_zeros((len(batch), 3, max_h, max_w))
        for i, (img, (h, w)) in enumerate(zip(batch, sizes)):
            pixel_values[i, :, :h, :w] = img

        return {"pixel_values": pixel_values, "sizes": sizes}

    def _build_output_processor(self, config):
        return FCCLIPOutputProcessor(classes=self._classes, task=config.task)

    def _predict_all(self, imgs):
        if self._preprocess and self._transforms is not None:
            imgs = [self._transforms(img) for img in imgs]
            if self.has_collate_fn:
                imgs = self.collate_fn(imgs)

        pixel_values = imgs["pixel_values"].to(self._device)
        sizes = imgs["sizes"]
        if self.using_half_precision:
            pixel_values = pixel_values.half()

        with torch.no_grad():
            panoptic_results = self._model(pixel_values)

        outputs = [
            (panoptic_seg[:h, :w].cpu(), segments_info)
            for (panoptic_seg, segments_info), (h, w) in zip(
                panoptic_results, sizes
            )
        ]

        if self._output_processor is None:
            return outputs

        return self._output_processor(
            outputs,
            None,
            confidence_thresh=self.config.confidence_thresh,
            classes=self.config.filter_classes,
        )
