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
        score_threshold (0.8): minimum panoptic segment confidence to keep
        class_names (None): optional list of custom class names for
            open-vocabulary inference (overrides COCO 133-class default)
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self.name_or_path = self.parse_string(d, "name_or_path")
        self.score_threshold = self.parse_number(
            d, "score_threshold", default=0.8
        )
        self.class_names = self.parse_array(d, "class_names", default=None)
        self.validate_config()

    def validate_config(self):
        if not 0 <= self.score_threshold <= 1:
            raise ValueError("score_threshold must be between 0 and 1")
        if self.class_names is not None:
            if not self.class_names:
                raise ValueError(
                    "class_names must contain at least one prompt"
                )
            if any(
                not isinstance(c, str) or not c.strip()
                for c in self.class_names
            ):
                raise ValueError("class_names must contain non-empty strings")


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
        if config.class_names:
            return config.class_names
        if self._hf_model is not None:
            return self._hf_model.config.stuff_classes
        return None

    def _download_model(self, config):
        # HF Hub handles download automatically on first load
        pass

    def _load_model(self, config):
        from transformers import AutoModel

        import fiftyone as fo

        self._hf_model = AutoModel.from_pretrained(
            config.name_or_path,
            trust_remote_code=True,
            cache_dir=fo.config.model_zoo_dir,
            # open_clip can't initialize inside HF's meta-device context
            low_cpu_mem_usage=False,
        )
        self._hf_model.eval()
        if config.class_names:
            self._hf_model.set_class_names(config.class_names)

        self._hf_model.config.object_mask_threshold = config.score_threshold
        return self._hf_model

    def _predict_all(self, imgs):
        results = []
        for img in imgs:
            if isinstance(img, torch.Tensor):
                # DataLoader yields CHW float32 in [0, 1]; preprocess_image wants HWC uint8
                arr = (
                    (img.permute(1, 2, 0).cpu().numpy() * 255)
                    .clip(0, 255)
                    .astype("uint8")
                )
                pixel_values = self._hf_model.preprocess_image(arr)
            else:
                pixel_values = self._hf_model.preprocess_image(img)
            pixel_values = pixel_values.to(self._device)
            with torch.no_grad():
                panoptic_results = self._hf_model(pixel_values)

            panoptic_seg, segments_info = panoptic_results[0]
            panoptic_seg = panoptic_seg.cpu()

            detections = []
            for seg in segments_info:
                cat_id = seg["category_id"]
                mask = (panoptic_seg == seg["id"]).numpy().astype(bool)
                if not mask.any():
                    continue
                label = (
                    self._classes[cat_id]
                    if self._classes and cat_id < len(self._classes)
                    else str(cat_id)
                )
                detections.append(
                    fol.Detection.from_mask(mask=mask, label=label)
                )

            results.append(fol.Detections(detections=detections))
        return results
