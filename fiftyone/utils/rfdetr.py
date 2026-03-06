"""
`RF-DETR <https://github.com/roboflow/rf-detr>`_ wrapper for the FiftyOne
Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import numpy as np
from PIL import Image

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

rfdetr_lib = fou.lazy_import("rfdetr")

logger = logging.getLogger(__name__)


class RFDETRDetectionModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`RFDETRDetectionModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        model_type (None): the RF-DETR model class name to load, e.g.
            ``"RFDETRMedium"``
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.model_type = self.parse_string(d, "model_type")


class RFDETRSegmentationModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`RFDETRSegmentationModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        model_type (None): the RF-DETR segmentation model class name to load,
            e.g. ``"RFDETRSegMedium"``
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.model_type = self.parse_string(d, "model_type")


def _load_rfdetr_model(model_type):
    """Instantiate an RF-DETR model by class name.

    The rfdetr package downloads pretrained weights automatically on first
    use, so no separate download step is needed.

    Args:
        model_type: the RF-DETR class name, e.g. ``"RFDETRMedium"``

    Returns:
        an :class:`rfdetr.detr.RFDETR` instance
    """
    model_cls = getattr(rfdetr_lib, model_type)
    return model_cls()


def _get_class_names(model):
    """Build an ID-to-name mapping from the loaded RF-DETR model.

    For pretrained COCO models this returns the standard 80-class COCO
    mapping with non-contiguous integer keys (1-90 with gaps).

    Args:
        model: an :class:`rfdetr.detr.RFDETR` instance

    Returns:
        a dict mapping ``{int: str}``
    """
    return model.class_names


def _sv_detections_to_fo(sv_dets, width, height, class_names, has_masks):
    """Convert a ``supervision.Detections`` object to FiftyOne format.

    RF-DETR returns absolute pixel coordinates in xyxy format. FiftyOne
    expects normalized [x, y, w, h] bounding boxes in [0, 1].

    For segmentation models, masks arrive as boolean arrays of shape
    ``(N, H, W)`` at the original image resolution. FiftyOne expects
    each mask cropped to its bounding box.

    Args:
        sv_dets: a :class:`supervision.detection.core.Detections`
        width: image width in pixels
        height: image height in pixels
        class_names: dict mapping ``{int: str}`` class IDs to labels
        has_masks: whether to include instance masks

    Returns:
        a :class:`fiftyone.core.labels.Detections`
    """
    if sv_dets is None or len(sv_dets) == 0:
        return fol.Detections()

    xyxy = sv_dets.xyxy
    confidence = sv_dets.confidence
    class_ids = sv_dets.class_id
    masks = sv_dets.mask if has_masks else None

    detections = []
    for i in range(len(sv_dets)):
        x1, y1, x2, y2 = xyxy[i]
        cid = int(class_ids[i])
        label = class_names.get(cid, str(cid))
        score = float(confidence[i]) if confidence is not None else None

        # Normalize to [x, y, w, h] in [0, 1]
        bounding_box = [
            float(x1) / width,
            float(y1) / height,
            float(x2 - x1) / width,
            float(y2 - y1) / height,
        ]

        kwargs = dict(
            label=label,
            bounding_box=bounding_box,
            confidence=score,
        )

        if has_masks and masks is not None:
            # Crop the full-image boolean mask to the bounding box region
            mask_full = masks[i]
            r1 = max(0, int(round(y1)))
            r2 = min(mask_full.shape[0], int(round(y2)))
            c1 = max(0, int(round(x1)))
            c2 = min(mask_full.shape[1], int(round(x2)))
            mask_crop = mask_full[r1:r2, c1:c2]

            if mask_crop.dtype != bool:
                mask_crop = mask_crop > 0.5

            kwargs["mask"] = mask_crop

        detections.append(fol.Detection(**kwargs))

    return fol.Detections(detections=detections)


def _tensor_to_pil(img):
    """Convert a CHW float tensor in [0, 1] to a PIL RGB image.

    Args:
        img: a ``torch.Tensor`` of shape ``(3, H, W)``

    Returns:
        a :class:`PIL.Image.Image`
    """
    arr = (img.permute(1, 2, 0).cpu().numpy() * 255).astype(np.uint8)
    return Image.fromarray(arr)


def _imgs_to_pil(imgs):
    """Convert a batch of images to PIL format for rfdetr.

    Args:
        imgs: a list of images (torch tensors, numpy arrays, PIL images, or
            file paths)

    Returns:
        a tuple of ``(pil_images, sizes)`` where sizes is a list of
        ``(width, height)`` tuples
    """
    pil_images = []
    sizes = []
    for img in imgs:
        if isinstance(img, torch.Tensor):
            pil = _tensor_to_pil(img)
        elif isinstance(img, np.ndarray):
            pil = Image.fromarray(img)
        elif isinstance(img, Image.Image):
            pil = img
        else:
            pil = Image.open(img)

        pil_images.append(pil)
        sizes.append((pil.width, pil.height))

    return pil_images, sizes


class RFDETRDetectionModel(fout.TorchSamplesMixin, fout.TorchImageModel):
    """FiftyOne wrapper around an RF-DETR object detection model.

    Detection example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=25, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("rfdetr-medium-coco-torch")
        dataset.apply_model(model, label_field="rfdetr")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`RFDETRDetectionModelConfig`
    """

    def __init__(self, config):
        fout.TorchSamplesMixin.__init__(self)
        fout.TorchImageModel.__init__(self, config)

    @property
    def _class_name_map(self):
        """Lazy access to class names from the loaded rfdetr model."""
        return _get_class_names(self._model)

    def _download_model(self, config):
        # rfdetr downloads weights automatically during model init
        pass

    def _load_model(self, config):
        return _load_rfdetr_model(config.model_type)

    def _build_transforms(self, config):
        # RF-DETR handles its own preprocessing (resize + normalize).
        # Return an identity transform that keeps the original image as-is.
        transforms = _IdentityTransform()
        return transforms, True

    def _forward_pass(self, imgs):
        pil_images, sizes = _imgs_to_pil(imgs)

        threshold = self.config.confidence_thresh
        if threshold is None:
            threshold = 0.5

        results = self._model.predict(pil_images, threshold=threshold)
        if not isinstance(results, list):
            results = [results]

        return {"results": results, "sizes": sizes}

    def _parse_classes(self, config):
        return None

    def _build_output_processor(self, config):
        # RF-DETR output conversion is handled in _predict_all
        return None

    def predict_all(self, imgs, samples=None):
        return self._predict_all(imgs)

    def _predict_all(self, imgs):
        output = self._forward_pass(imgs)
        results = output["results"]
        sizes = output["sizes"]

        class_names = self._class_name_map
        labels = []
        for sv_dets, (w, h) in zip(results, sizes):
            fo_dets = _sv_detections_to_fo(
                sv_dets, w, h, class_names, has_masks=False
            )
            labels.append(fo_dets)

        return labels


class RFDETRSegmentationModel(fout.TorchSamplesMixin, fout.TorchImageModel):
    """FiftyOne wrapper around an RF-DETR instance segmentation model.

    Segmentation example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=25, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("rfdetr-seg-medium-coco-torch")
        dataset.apply_model(model, label_field="rfdetr_seg")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`RFDETRSegmentationModelConfig`
    """

    def __init__(self, config):
        fout.TorchSamplesMixin.__init__(self)
        fout.TorchImageModel.__init__(self, config)

    @property
    def _class_name_map(self):
        return _get_class_names(self._model)

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        return _load_rfdetr_model(config.model_type)

    def _build_transforms(self, config):
        transforms = _IdentityTransform()
        return transforms, True

    def _forward_pass(self, imgs):
        pil_images, sizes = _imgs_to_pil(imgs)

        threshold = self.config.confidence_thresh
        if threshold is None:
            threshold = 0.5

        results = self._model.predict(pil_images, threshold=threshold)
        if not isinstance(results, list):
            results = [results]

        return {"results": results, "sizes": sizes}

    def _parse_classes(self, config):
        return None

    def _build_output_processor(self, config):
        return None

    def predict_all(self, imgs, samples=None):
        return self._predict_all(imgs)

    def _predict_all(self, imgs):
        output = self._forward_pass(imgs)
        results = output["results"]
        sizes = output["sizes"]

        class_names = self._class_name_map
        labels = []
        for sv_dets, (w, h) in zip(results, sizes):
            fo_dets = _sv_detections_to_fo(
                sv_dets, w, h, class_names, has_masks=True
            )
            labels.append(fo_dets)

        return labels


class _IdentityTransform:
    """A no-op transform that returns the input image unchanged.

    RF-DETR handles its own preprocessing internally (resize to model
    resolution + ImageNet normalize), so FiftyOne's transform pipeline
    should not modify the image.
    """

    def __call__(self, img):
        return img
