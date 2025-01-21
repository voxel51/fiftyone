"""
Utilities for working with
`SuperGradients <https://github.com/Deci-AI/super-gradients>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch
import numpy as np

super_gradients = fou.lazy_import(
    "super_gradients", callback=lambda: fou.ensure_package("super-gradients")
)


logger = logging.getLogger(__name__)


def convert_super_gradients_model(model):
    """Converts the given SuperGradients model into a FiftyOne model.

    Args:
        model: a ``super_gradients.training.models.detection_models.yolo_nas``
            model

    Returns:
         a :class:`fiftyone.core.models.Model`

    Raises:
        ValueError: if the model could not be converted
    """
    if type(model).__module__.startswith(
        "super_gradients.training.models.detection_models.yolo_nas"
    ):
        return _convert_yolo_nas_detection_model(model)
    else:
        raise ValueError(
            "Unsupported model type; cannot convert %s to a FiftyOne model"
            % model
        )


def _convert_yolo_nas_detection_model(model):
    config_model = {"model": model, "raw_inputs": True}
    config = TorchYoloNasModelConfig(config_model)
    return TorchYoloNasModel(config)


class TorchYoloNasModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`TorchYoloNasModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        model (None): a preloaded
            ``super_gradients.training.models.detection_models.yolo_nas`` model
            to use
        yolo_nas_model ("yolo_nas_l"): the name of a YOLO-NAS model to use
        pretrained ("coco"): the pretrained version to use
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.model = self.parse_raw(d, "model", default=None)
        self.yolo_nas_model = self.parse_string(
            d, "yolo_nas_model", default="yolo_nas_l"
        )
        self.pretrained = self.parse_string(d, "pretrained", default="coco")


class TorchYoloNasModel(fout.TorchImageModel):
    """FiftyOne wrapper around YOLO-NAS from
    https://github.com/Deci-AI/super-gradients.

    Args:
        config: a :class:`TorchYoloNasModelConfig`
    """

    def _load_model(self, config):
        if config.model is not None:
            model = config.model
        else:
            model = super_gradients.training.models.get(
                config.yolo_nas_model, pretrained_weights=config.pretrained
            )

        if self._using_gpu:
            model = model.to(self.device)

        return model

    def _convert_bboxes(self, bboxes, w, h):
        tmp = np.copy(bboxes[:, 1])
        bboxes[:, 1] = h - bboxes[:, 3]
        bboxes[:, 3] = h - tmp
        bboxes[:, 0] /= w
        bboxes[:, 2] /= w
        bboxes[:, 1] /= h
        bboxes[:, 3] /= h
        bboxes[:, 2] -= bboxes[:, 0]
        bboxes[:, 3] -= bboxes[:, 1]
        bboxes[:, 1] = 1 - (bboxes[:, 1] + bboxes[:, 3])
        return bboxes

    def _generate_detections(self, p):
        class_names = p.class_names
        dp = p.prediction
        img = p.image

        bboxes, confs, labels = (
            np.array(dp.bboxes_xyxy),
            dp.confidence,
            dp.labels.astype(int),
        )
        height, width, _ = img.shape

        if 0 in bboxes.shape:
            return fo.Detections(detections=[])

        bboxes = self._convert_bboxes(bboxes, width, height)
        labels = [class_names[l] for l in labels]

        detections = [
            fo.Detection(label=l, confidence=c, bounding_box=b)
            for (l, c, b) in zip(labels, confs, bboxes)
        ]
        return fo.Detections(detections=detections)

    def predict(self, img):
        preds = self._model.predict(img, conf=self.config.confidence_thresh)
        return self._generate_detections(preds)

    def predict_all(self, imgs):
        return [self.predict(img) for img in imgs]
