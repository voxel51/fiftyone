"""
`RF-DETR <https://github.com/roboflow/rf-detr>`_ wrapper for the FiftyOne
Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Any, Optional

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

rfdetr_lib = fou.lazy_import("rfdetr")

_VALID_MODEL_TYPES = (
    "RFDETRNano",
    "RFDETRSmall",
    "RFDETRMedium",
    "RFDETRBase",
    "RFDETRLarge",
    "RFDETRSegNano",
    "RFDETRSegSmall",
    "RFDETRSegMedium",
    "RFDETRSegLarge",
    "RFDETRSegXLarge",
    "RFDETRSeg2XLarge",
)

_DEFAULT_CONFIDENCE_THRESH = 0.5


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
        self.confidence_thresh = self.parse_number(
            d,
            "confidence_thresh",
            default=_DEFAULT_CONFIDENCE_THRESH,
        )


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
        self.confidence_thresh = self.parse_number(
            d,
            "confidence_thresh",
            default=_DEFAULT_CONFIDENCE_THRESH,
        )


def _normalize_rfdetr_device(device):
    """Validates device strings before forwarding them to RF-DETR."""
    if device is None:
        return None

    if isinstance(device, torch.device):
        device = str(device)

    if device.startswith("cuda:"):
        raise ValueError(
            "RF-DETR does not support indexed CUDA devices in FiftyOne "
            "config; use `cuda` or `cpu` instead of `%s`" % device
        )

    return device


def _load_rfdetr_model(
    model_type: str, device: Optional[str] = None
) -> Any:
    """Instantiate an RF-DETR model by class name.

    The rfdetr package downloads pretrained weights automatically on first
    use, so no separate download step is needed.

    Args:
        model_type: the RF-DETR class name, e.g. ``"RFDETRMedium"``
        device (None): an optional device string to forward upstream

    Returns:
        an :class:`rfdetr.detr.RFDETR` instance
    """
    model_cls = getattr(rfdetr_lib, model_type, None)
    if model_cls is None:
        raise ValueError(
            "Unknown RF-DETR model type '%s'. Available types: %s"
            % (model_type, ", ".join(_VALID_MODEL_TYPES))
        )

    kwargs = {}
    if device is not None:
        kwargs["device"] = device

    return model_cls(**kwargs)


def _sv_detections_to_fo(
    sv_dets: Any,
    width: int,
    height: int,
    class_names: dict[int, str],
    has_masks: bool,
) -> fol.Detections:
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
        cid = int(class_ids[i])
        label = class_names.get(cid, str(cid))
        score = float(confidence[i]) if confidence is not None else None
        mask = masks[i] if masks is not None else None
        detection = fout._make_frame_detection(
            label,
            xyxy[i],
            (width, height),
            confidence=score,
            mask=mask,
        )
        if detection is not None:
            detections.append(detection)

    return fol.Detections(detections=detections)


class _RFDETRBaseModel(fout.TorchSamplesMixin, fout.TorchImageModel):
    """Base class for RF-DETR model wrappers.

    Subclasses set ``_has_masks`` to control whether instance masks are
    parsed from the model output.
    """

    _has_masks = False

    def __init__(self, config):
        fout.TorchSamplesMixin.__init__(self)
        fout.TorchImageModel.__init__(self, config)

    @property
    def has_collate_fn(self) -> bool:
        return True

    @staticmethod
    def collate_fn(batch: list[Any]) -> list[Any]:
        # Preserve raw per-image inputs so apply_model() can batch RF-DETR
        # without forcing Torch's default tensor collate on PIL images.
        return batch

    @property
    def _class_name_map(self):
        """Lazy access to class names from the loaded rfdetr model."""
        return self._model.class_names

    def _download_model(self, config: Any) -> None:
        # rfdetr downloads weights automatically during model init
        pass

    def _load_model(self, config: Any) -> Any:
        return _load_rfdetr_model(
            config.model_type,
            device=_normalize_rfdetr_device(config.device),
        )

    def _build_transforms(self, config: Any) -> tuple[Any, bool]:
        # RF-DETR handles its own preprocessing (resize + normalize).
        # Keep raw inputs and advertise non-ragged batches so FiftyOne does
        # not downgrade multi-image inference to single-sample mode.
        return None, False

    def _forward_pass(self, imgs: list[Any]) -> dict[str, Any]:
        pil_images, sizes = fout.imgs_to_rgb_pil(imgs)

        results = self._model.predict(
            pil_images, threshold=self.config.confidence_thresh
        )
        if not isinstance(results, list):
            results = [results]

        return {"results": results, "sizes": sizes}

    def _parse_classes(self, config: Any) -> Optional[list[str]]:
        classes = fout.TorchImageModel._parse_classes(self, config)
        if classes is not None:
            return classes

        class_names = self._class_name_map
        if isinstance(class_names, dict):
            return [name for _, name in sorted(class_names.items())]

        return list(class_names)

    def _build_output_processor(self, config: Any) -> None:
        # RF-DETR output conversion is handled in _predict_all
        return None

    def predict_all(
        self, imgs: list[Any], samples: Optional[list[Any]] = None
    ) -> list[fol.Detections]:
        return self._predict_all(imgs)

    def _predict_all(self, imgs: list[Any]) -> list[fol.Detections]:
        output = self._forward_pass(imgs)

        class_names = self._class_name_map
        filter_classes = set(self.config.filter_classes or ())
        results = output["results"]
        sizes = output["sizes"]
        if len(results) != len(sizes):
            raise ValueError(
                "Expected one size per result, but found %d results and %d "
                "sizes" % (len(results), len(sizes))
            )

        labels = []
        for sv_dets, (w, h) in zip(results, sizes):
            fo_dets = _sv_detections_to_fo(
                sv_dets, w, h, class_names, has_masks=self._has_masks
            )
            if filter_classes:
                fo_dets.detections = [
                    det
                    for det in fo_dets.detections
                    if det.label in filter_classes
                ]
            labels.append(fo_dets)

        return labels


class RFDETRDetectionModel(_RFDETRBaseModel):
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

    _has_masks = False


class RFDETRSegmentationModel(_RFDETRBaseModel):
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

    _has_masks = True
