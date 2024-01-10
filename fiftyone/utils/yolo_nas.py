"""
YOLO-NAS model wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import fiftyone as fo
import fiftyone.core.models as fom
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


class TorchYoloNasModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`TorchYoloNasModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        yolo_nas_model ("yolo_nas_l"): the Yolo-nas model to use
        pretrained ("coco"): the pretrained version to use
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.yolo_nas_model = self.parse_string(
            d, "yolo_nas_model", default="yolo_nas_l"
        )
        self.pretrained = self.parse_string(d, "pretrained", default="coco")


class TorchYoloNasModel(fout.TorchImageModel):
    """Torch implementation of Yolo-nas from
    https://github.com/Deci-AI/super-gradients

    Args:
        config: a :class:`TorchYoloNasModelConfig`
    """

    def __init__(self, config):
        super().__init__(config)

    def _load_model(self, config):
        self._model = super_gradients.training.models.get(
            config.yolo_nas_model, pretrained_weights=config.pretrained
        )
        return self._model

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

    def _predict_all(self, imgs):
        height, width = imgs.size()[-2:]
        frame_size = (width, height)

        if self._using_gpu:
            imgs = imgs.cuda()

        with torch.no_grad(), torch.cuda.amp.autocast():
            pred = self._model.predict(
                imgs, conf=self.config.confidence_thresh
            )[0]
            self._class_names = pred.class_names
            dp = pred.prediction

            bboxes, confs, labels = (
                np.array(dp.bboxes_xyxy),
                dp.confidence,
                dp.labels.astype(int),
            )

            if 0 in bboxes.shape:
                return fo.Detections(detections=[])

            bboxes = self._convert_bboxes(bboxes, width, height)
            labels = [self._class_names[l] for l in labels]

            print(labels)

        return fo.Detection(
            label=labels, confidence=confs, bounding_box=bboxes
        )
