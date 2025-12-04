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


def _patch_super_gradients_urls():
    """Patches super-gradients pretrained model URLs to use the current hosting location.

    SuperGradients model weights were originally hosted at https://sghub.deci.ai
    but have been migrated to https://sg-hub-nv.s3.amazonaws.com. This function
    updates the URLs in the pretrained models registry to point to the new location.

    See: https://github.com/Deci-AI/super-gradients/issues/2064
    """
    try:
        import super_gradients.training.pretrained_models as pretrained_models

        if hasattr(pretrained_models, "MODEL_URLS"):
            old_domain = "https://sghub.deci.ai"
            new_domain = "https://sg-hub-nv.s3.amazonaws.com"
            patched_count = 0

            for key, value in pretrained_models.MODEL_URLS.items():
                if isinstance(value, str) and value.startswith(old_domain):
                    new_url = value.replace(old_domain, new_domain)
                    pretrained_models.MODEL_URLS[key] = new_url
                    patched_count += 1
                    logger.debug(f"Patched URL for {key}: {value} -> {new_url}")

            if patched_count > 0:
                logger.info(f"Patched {patched_count} super-gradients model URLs to use AWS S3")
    except Exception as e:
        logger.warning(f"Failed to patch super-gradients URLs: {e}")

    try:
        from super_gradients.training.utils import checkpoint_utils
        from super_gradients.training.models import model_factory
        from urllib.parse import urlparse
        import os

        if hasattr(checkpoint_utils, "_sg_patched"):
            return

        def patched_load_pretrained_weights(model, architecture, pretrained_weights):
            """Patched version that handles both old and new URL formats."""
            from super_gradients.common.object_names import Models
            from super_gradients.training.utils.checkpoint_utils import (
                MODEL_URLS, DATASET_LICENSES, MissingPretrainedWeightsException,
                load_state_dict_from_url, wait_for_the_master, get_local_rank,
                _load_weights, _maybe_load_preprocessing_params
            )

            model_url_key = architecture + "_" + str(pretrained_weights)
            if model_url_key not in MODEL_URLS.keys():
                raise MissingPretrainedWeightsException(model_url_key)

            if pretrained_weights in DATASET_LICENSES:
                logger.warning(
                    f"The pre-trained models provided by SuperGradients may have their own licenses. "
                    f"Model pre-trained on {pretrained_weights}: {DATASET_LICENSES[pretrained_weights]}"
                )

            url = MODEL_URLS[model_url_key]

            if architecture in {Models.YOLO_NAS_S, Models.YOLO_NAS_M, Models.YOLO_NAS_L}:
                logger.info(
                    "License Notification: YOLO-NAS pre-trained weights are subjected to the license at "
                    "https://github.com/Deci-AI/super-gradients/blob/master/LICENSE.YOLONAS.md"
                )

            if url.startswith("file://") or os.path.exists(url):
                pretrained_state_dict = torch.load(url.replace("file://", ""), map_location="cpu")
            else:
                path = urlparse(url).path
                if "/models/" in path:
                    unique_filename = path.split("/models/")[1].replace("/", "_").replace(" ", "_")
                else:
                    unique_filename = os.path.basename(path)

                map_location = torch.device("cpu")
                with wait_for_the_master(get_local_rank()):
                    pretrained_state_dict = load_state_dict_from_url(
                        url=url, map_location=map_location, file_name=unique_filename
                    )

            _load_weights(architecture, model, pretrained_state_dict)
            _maybe_load_preprocessing_params(model, pretrained_state_dict)

        checkpoint_utils.load_pretrained_weights = patched_load_pretrained_weights
        model_factory.load_pretrained_weights = patched_load_pretrained_weights
        checkpoint_utils._sg_patched = True
        logger.debug("Patched super-gradients checkpoint_utils for AWS S3 URL compatibility")
    except Exception as e:
        logger.warning(f"Failed to patch super-gradients checkpoint_utils: {e}")


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
        _patch_super_gradients_urls()

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
