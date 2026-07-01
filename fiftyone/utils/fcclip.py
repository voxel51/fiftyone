import numpy as np
import torch

import fiftyone.core.labels as fol
from fiftyone.zoo.models import HasZooModel
import fiftyone.utils.torch as fout


class FCCLIPModelConfig(fout.TorchImageModelConfig, HasZooModel):
    """Configuration for :class:`FCCLIPModel`.

    Args:
        name_or_path (None): HF repo or local path to the FC-CLIP model
            uploaded with ``trust_remote_code=True``
        confidence_thresh (0.8): minimum panoptic segment confidence to keep
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self.name_or_path = self.parse_string(d, "name_or_path")
        self.confidence_thresh = self.parse_number(
            d, "confidence_thresh", default=0.8
        )
        self.validate_config()

    def validate_config(self):
        if not 0 <= self.confidence_thresh <= 1:
            raise ValueError("confidence_thresh must be between 0 and 1")


class FCCLIPOutputProcessor(fout.OutputProcessor):
    """Converts FC-CLIP panoptic segmentation outputs to
    :class:`fiftyone.core.labels.Detections`.
    """

    def __init__(self, classes=None, **kwargs):
        super().__init__(classes=classes, **kwargs)
        self.classes = classes

    def __call__(
        self,
        output,
        frame_size,
        confidence_thresh=None,
        classes=None,
        **kwargs
    ):
        return [
            self._to_detections(panoptic_seg, segments_info, classes)
            for panoptic_seg, segments_info in output
        ]

    def _to_detections(self, panoptic_seg, segments_info, classes):
        detections = []
        for seg in segments_info:
            cat_id = seg["category_id"]
            mask = (panoptic_seg == seg["id"]).numpy().astype(bool)
            if not mask.any():
                continue
            label = (
                self.classes[cat_id]
                if self.classes and 0 <= cat_id < len(self.classes)
                else str(cat_id)
            )
            if classes is not None and label not in classes:
                continue
            detections.append(fol.Detection.from_mask(mask=mask, label=label))
        return fol.Detections(detections=detections)


class _FCCLIPTransform:
    """Preprocess any image type to an FC-CLIP pixel_values tensor.

    Accepts PIL images, HWC uint8/float numpy arrays, and CHW tensors.
    Wraps the HF model's ``preprocess_image`` method and returns the
    pixel_values tensor on CPU (moved to device in ``_predict_all``).
    """

    def __init__(self, preprocess_fn):
        self._preprocess_fn = preprocess_fn

    def __call__(self, img):
        return self._preprocess_fn(img)


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
        model = foz.load_zoo_model("fc-clip-coco-torch")
        dataset.apply_model(model, label_field="panoptic")
        session = fo.launch_app(dataset)

    Args:
        config: an :class:`FCCLIPModelConfig`
    """

    def __init__(self, config):
        self._hf_model = None
        fout.TorchImageModel.__init__(self, config)

    def _parse_classes(self, config):
        if config.classes is not None:
            self._hf_model.set_class_names(config.classes)
            return config.classes
        if self._hf_model is not None:
            return self._hf_model.config.stuff_classes
        return None

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        from transformers import AutoModel

        import fiftyone as fo

        self._hf_model = AutoModel.from_pretrained(
            config.name_or_path,
            trust_remote_code=True,
            cache_dir=fo.config.model_zoo_dir,
            low_cpu_mem_usage=False,
        )
        self._hf_model.eval()
        self._hf_model.config.object_mask_threshold = config.confidence_thresh
        return self._hf_model

    def _build_transforms(self, config):
        return _FCCLIPTransform(self._hf_model.preprocess_image), False

    @property
    def has_collate_fn(self):
        return True

    @staticmethod
    def collate_fn(batch):
        return batch

    def _build_output_processor(self, config):
        return FCCLIPOutputProcessor(classes=self._classes)

    def _predict_all(self, imgs):
        if self._preprocess and self._transforms is not None:
            imgs = [self._transforms(img) for img in imgs]
            if self.has_collate_fn:
                imgs = self.collate_fn(imgs)

        outputs = []
        for pixel_values in imgs:
            pixel_values = pixel_values.to(self._device)
            with torch.no_grad():
                panoptic_results = self._hf_model(pixel_values)
            panoptic_seg, segments_info = panoptic_results[0]
            outputs.append((panoptic_seg.cpu(), segments_info))

        return self._output_processor(
            outputs,
            None,
            confidence_thresh=self.config.confidence_thresh,
            classes=self.config.filter_classes,
        )
