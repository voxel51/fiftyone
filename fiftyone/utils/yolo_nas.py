"""
YOLO-NAS model wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2023, Voxel51, Inc.
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
        """
        Loads the Yolo-nas model based on the provided configuration.

        Args:
            config (TorchYoloNasModelConfig): Configuration for the Yolo-nas model.

        Returns:
            The loaded Yolo-nas model.
        """
        if self._using_gpu:
            self._model = super_gradients.training.models.get(
                config.yolo_nas_model, pretrained_weights=config.pretrained
            ).cuda()
        else:
            self._model = super_gradients.training.models.get(
                config.yolo_nas_model, pretrained_weights=config.pretrained
            )

        return self._model

    def _convert_bboxes(self, bboxes, w, h):
        """
        Converts bounding boxes from YOLO format (xyxy) to COCO format (normalized xywh).

        Args:
            bboxes (numpy.ndarray): Bounding boxes in YOLO format.
            w (int): Width of the image.
            h (int): Height of the image.

        Returns:
            numpy.ndarray: Bounding boxes in COCO format.
        """
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
        """
        Generates FiftyOne detection objects from the model's predictions.

        Args:
            p (Prediction): The prediction output from the model.
            width (int): Width of the original image.
            height (int): Height of the original image.

        Returns:
            fo.Detections: A FiftyOne Detections object containing the formatted detections.
        """
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

    def _predict_all(self, imgs):
        """
        Performs batch prediction on a set of images and generates FiftyOne detection objects.

        Args:
            imgs (PIL.images): A batch of images.

        Returns:
            List[fo.Detections]: A list of FiftyOne Detections objects for each image in the batch.
        """

        preds = self._model.predict(
            imgs, conf=self.config.confidence_thresh
        )._images_prediction_lst
        dets = [self._generate_detections(pred) for pred in preds]
        return dets
