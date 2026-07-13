"""
`PP-OCRv6 <https://huggingface.co/collections/PaddlePaddle/pp-ocrv6>`_
(PaddleOCR) wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()

logger = logging.getLogger(__name__)

# The PP-OCRv6 safetensors weights are run through paddleocr's ``transformers``
# engine (torch only, no paddlepaddle). That engine needs a transformers new
# enough to expose ``AutoModelForTextRecognition`` and the PP-OCR model types;
# 5.0.0 (the version pinned in some enterprise images) is too old.
_MIN_TRANSFORMERS = "transformers>=5.13"


def _ensure_paddleocr():
    fou.ensure_package("paddleocr")
    fou.ensure_package(_MIN_TRANSFORMERS)


paddleocr = fou.lazy_import("paddleocr", callback=_ensure_paddleocr)

from PIL import Image as PILImage

DEFAULT_DET_MODEL = "PP-OCRv6_medium_det"
DEFAULT_REC_MODEL = "PP-OCRv6_medium_rec"


def _to_numpy_bgr(img):
    """Converts a raw model input (PIL image, HWC uint8 numpy array, or CHW
    torch tensor) to a contiguous HWC uint8 BGR numpy array, the format
    paddleocr's predictors consume for in-memory inputs."""
    try:
        import torch

        if isinstance(img, torch.Tensor):
            img = img.detach().cpu().numpy()
            if img.ndim == 3 and img.shape[0] in (1, 3, 4):
                img = np.transpose(img, (1, 2, 0))
    except ImportError:
        pass

    if isinstance(img, PILImage.Image):
        img = np.asarray(img.convert("RGB"))

    img = np.asarray(img)

    if np.issubdtype(img.dtype, np.floating):
        if img.max() <= 1.0:
            img = img * 255.0
        img = np.clip(img, 0, 255)
    img = img.astype(np.uint8)

    if img.ndim == 2:
        img = np.stack([img] * 3, axis=-1)
    if img.shape[2] == 4:
        img = img[:, :, :3]

    # RGB (FiftyOne/PIL) -> BGR (paddleocr/cv2)
    return np.ascontiguousarray(img[:, :, ::-1])


def _quad_to_bbox(poly, width, height):
    """Axis-aligned ``[x, y, w, h]`` in ``[0, 1]`` enclosing a quad polygon."""
    xs = [float(p[0]) for p in poly]
    ys = [float(p[1]) for p in poly]
    x0 = max(min(xs), 0.0)
    y0 = max(min(ys), 0.0)
    x1 = min(max(xs), float(width))
    y1 = min(max(ys), float(height))
    return [
        x0 / width,
        y0 / height,
        max(x1 - x0, 0.0) / width,
        max(y1 - y0, 0.0) / height,
    ]


def _rotate_crop(img_bgr, poly):
    """Perspective-warps a detected quad to a horizontal text-line crop, the
    standard PaddleOCR ``get_rotate_crop_image`` used before recognition so
    rotated text lines are read correctly."""
    import cv2

    points = np.array(poly, dtype=np.float32)
    crop_w = int(
        max(
            np.linalg.norm(points[0] - points[1]),
            np.linalg.norm(points[2] - points[3]),
        )
    )
    crop_h = int(
        max(
            np.linalg.norm(points[0] - points[3]),
            np.linalg.norm(points[1] - points[2]),
        )
    )
    if crop_w < 1 or crop_h < 1:
        return None

    pts_std = np.float32([[0, 0], [crop_w, 0], [crop_w, crop_h], [0, crop_h]])
    matrix = cv2.getPerspectiveTransform(points, pts_std)
    dst = cv2.warpPerspective(
        img_bgr,
        matrix,
        (crop_w, crop_h),
        borderMode=cv2.BORDER_REPLICATE,
        flags=cv2.INTER_CUBIC,
    )
    # Rotate near-vertical crops upright, as PaddleOCR does.
    if dst.shape[0] * 1.0 / max(dst.shape[1], 1) >= 1.5:
        dst = np.rot90(dst)
    return np.ascontiguousarray(dst)


class PaddleOCRDetectionOutputProcessor(fout.OutputProcessor):
    """Output processor for :class:`PaddleOCRDetectionModel`.

    Converts per-image ``dt_polys`` / ``dt_scores`` into
    :class:`fiftyone.core.labels.Polylines`, one closed polyline per detected
    text region. Each image carries its own ``(width, height)``, so the
    normalization is correct for mixed-size batches.
    """

    def __init__(self, classes=None, **kwargs):
        self.classes = classes

    def __call__(self, output, frame_size, confidence_thresh=None, **kwargs):
        results = []
        for res in output:
            width = res["width"]
            height = res["height"]
            polylines = []
            for poly, score in zip(res["polys"], res["scores"]):
                score = float(score)
                if confidence_thresh is not None and score < confidence_thresh:
                    continue
                points = [
                    [(float(x) / width, float(y) / height) for x, y in poly]
                ]
                polylines.append(
                    fol.Polyline(
                        label="text",
                        points=points,
                        confidence=score,
                        closed=True,
                        filled=False,
                    )
                )
            results.append(fol.Polylines(polylines=polylines))
        return results


class PaddleOCROutputProcessor(fout.OutputProcessor):
    """Output processor for :class:`PaddleOCRModel`.

    Converts per-image detection + recognition output into
    :class:`fiftyone.core.labels.Detections`, one detection per text region
    whose ``label`` is the recognized string, ``confidence`` is the
    recognition score, and ``det_confidence`` attribute is the detection score.
    """

    def __init__(self, classes=None, **kwargs):
        self.classes = classes

    def __call__(self, output, frame_size, confidence_thresh=None, **kwargs):
        results = []
        for res in output:
            width = res["width"]
            height = res["height"]
            detections = []
            for poly, det_score, text, rec_score in zip(
                res["polys"],
                res["det_scores"],
                res["texts"],
                res["rec_scores"],
            ):
                if not text:
                    continue
                rec_score = float(rec_score)
                if (
                    confidence_thresh is not None
                    and rec_score < confidence_thresh
                ):
                    continue
                detection = fol.Detection(
                    label=text,
                    bounding_box=_quad_to_bbox(poly, width, height),
                    confidence=rec_score,
                )
                detection["det_confidence"] = float(det_score)
                detections.append(detection)
            results.append(fol.Detections(detections=detections))
        return results


class PaddleOCRDetectionModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`PaddleOCRDetectionModel`.

    Args:
        det_model_name ("PP-OCRv6_medium_det"): the PP-OCR text-detection model
            name to run through paddleocr's ``transformers`` engine
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self.det_model_name = self.parse_string(
            d, "det_model_name", default=DEFAULT_DET_MODEL
        )
        self.raw_inputs = True
        if self.output_processor_cls is None:
            self.output_processor_cls = (
                "fiftyone.utils.paddleocr.PaddleOCRDetectionOutputProcessor"
            )


class PaddleOCRDetectionModel(fout.TorchImageModel):
    """FiftyOne wrapper for PP-OCRv6 text detection.

    Detects text regions and returns a
    :class:`fiftyone.core.labels.Polylines` per image (one closed quad per
    text region, ``label="text"``, ``confidence`` = detection score). Runs on
    torch via paddleocr's ``transformers`` engine (no paddlepaddle).

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)
        model = foz.load_zoo_model("paddle-ocr-v6-medium-det-torch")
        dataset.apply_model(model, label_field="text_regions")
        session = fo.launch_app(dataset)

    Args:
        config: a :class:`PaddleOCRDetectionModelConfig`
    """

    def _download_model(self, config):
        pass  # paddleocr downloads the model on first load

    def _load_model(self, config):
        return paddleocr.TextDetection(
            model_name=config.det_model_name, engine="transformers"
        )

    @property
    def media_type(self):
        return "image"

    def _forward_pass(self, imgs):
        out = []
        for img in imgs:
            arr = _to_numpy_bgr(img)
            height, width = arr.shape[:2]
            polys, scores = [], []
            try:
                for res in self._model.predict(input=arr, batch_size=1):
                    r = res.json["res"]
                    polys.extend(r.get("dt_polys") or [])
                    scores.extend(r.get("dt_scores") or [])
            except Exception as e:  # per-image guard
                logger.warning("PP-OCR detection failed on an image: %s", e)
            out.append(
                {
                    "width": width,
                    "height": height,
                    "polys": polys,
                    "scores": scores,
                }
            )
        return out


class PaddleOCRModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`PaddleOCRModel`.

    Args:
        det_model_name ("PP-OCRv6_medium_det"): the PP-OCR text-detection model
        rec_model_name ("PP-OCRv6_medium_rec"): the PP-OCR text-recognition
            model
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self.det_model_name = self.parse_string(
            d, "det_model_name", default=DEFAULT_DET_MODEL
        )
        self.rec_model_name = self.parse_string(
            d, "rec_model_name", default=DEFAULT_REC_MODEL
        )
        self.raw_inputs = True
        if self.output_processor_cls is None:
            self.output_processor_cls = (
                "fiftyone.utils.paddleocr.PaddleOCROutputProcessor"
            )


class PaddleOCRModel(fout.TorchImageModel):
    """FiftyOne wrapper for the PP-OCRv6 OCR pipeline (detection + recognition).

    Detects text regions with a PP-OCR detection model, crops each region, and
    reads it with a PP-OCR recognition model, returning a
    :class:`fiftyone.core.labels.Detections` per image whose ``label`` is the
    recognized string and ``confidence`` is the recognition score (the
    detection score is stored in a ``det_confidence`` attribute). The two
    component predictors are chained directly (rather than via paddleocr's
    ``PaddleOCR`` pipeline class) so the crop and the FiftyOne mapping stay
    under the wrapper's control. Runs on torch via paddleocr's ``transformers``
    engine (no paddlepaddle).

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)
        model = foz.load_zoo_model("paddle-ocr-v6-medium-torch")
        dataset.apply_model(model, label_field="ocr")
        session = fo.launch_app(dataset)

    Args:
        config: a :class:`PaddleOCRModelConfig`
    """

    def __init__(self, config):
        self._rec_model = None
        super().__init__(config)

    def _download_model(self, config):
        pass  # paddleocr downloads the models on first load

    def _load_model(self, config):
        self._rec_model = paddleocr.TextRecognition(
            model_name=config.rec_model_name, engine="transformers"
        )
        return paddleocr.TextDetection(
            model_name=config.det_model_name, engine="transformers"
        )

    @property
    def media_type(self):
        return "image"

    def _forward_pass(self, imgs):
        out = []
        for img in imgs:
            arr = _to_numpy_bgr(img)
            height, width = arr.shape[:2]
            polys, det_scores = [], []
            try:
                for res in self._model.predict(input=arr, batch_size=1):
                    r = res.json["res"]
                    polys.extend(r.get("dt_polys") or [])
                    det_scores.extend(r.get("dt_scores") or [])
            except Exception as e:
                logger.warning("PP-OCR detection failed on an image: %s", e)

            texts = [""] * len(polys)
            rec_scores = [0.0] * len(polys)
            crops, crop_idx = [], []
            for i, poly in enumerate(polys):
                crop = _rotate_crop(arr, poly)
                if crop is not None and crop.size > 0:
                    crops.append(crop)
                    crop_idx.append(i)

            if crops:
                try:
                    rec_out = list(
                        self._rec_model.predict(
                            input=crops, batch_size=len(crops)
                        )
                    )
                    for i, res in zip(crop_idx, rec_out):
                        r = res.json["res"]
                        texts[i] = r.get("rec_text", "")
                        rec_scores[i] = r.get("rec_score", 0.0)
                except Exception as e:
                    logger.warning(
                        "PP-OCR recognition failed on an image: %s", e
                    )

            out.append(
                {
                    "width": width,
                    "height": height,
                    "polys": polys,
                    "det_scores": det_scores,
                    "texts": texts,
                    "rec_scores": rec_scores,
                }
            )
        return out
