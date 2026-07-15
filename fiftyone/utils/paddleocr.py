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

# PP-OCRv6 models and the ``transformers`` engine require paddleocr>=3.7. The
# engine needs a transformers version that provides
# ``AutoModelForTextRecognition`` and the PP-OCR model types
_MIN_PADDLEOCR = "paddleocr>=3.7"
_MIN_TRANSFORMERS = "transformers>=5.13"


def _ensure_paddleocr():
    fou.ensure_package(_MIN_PADDLEOCR)
    fou.ensure_package(_MIN_TRANSFORMERS)


paddleocr = fou.lazy_import("paddleocr", callback=_ensure_paddleocr)

DEFAULT_DET_MODEL = "PP-OCRv6_medium_det"
DEFAULT_REC_MODEL = "PP-OCRv6_medium_rec"


def _map_device(device):
    """Maps a torch device string to paddleocr's device convention."""
    device = str(device)
    if device.startswith("cuda"):
        return "gpu" + device[4:]

    return device


def _to_numpy_bgr(img):
    """Converts a raw model input to a contiguous HWC uint8 BGR numpy array,
    the format paddleocr's predictors consume for in-memory inputs."""
    rgb = np.asarray(fout.to_rgb_pil(img))
    return np.ascontiguousarray(rgb[:, :, ::-1])


def _normalize_quad(poly, width, height):
    """Normalizes a pixel-coordinate quad into ``[0, 1]``, clamped to the
    frame."""
    return [
        (
            min(max(float(x) / width, 0.0), 1.0),
            min(max(float(y) / height, 0.0), 1.0),
        )
        for x, y in poly
    ]


def _rotate_crop(img_bgr, poly):
    """Perspective-warps a detected quad to a horizontal text-line crop, the
    standard PaddleOCR ``get_rotate_crop_image`` used before recognition so
    rotated text lines are read correctly."""
    import cv2

    points = np.array(poly, dtype=np.float32)
    if points.shape != (4, 2):
        return None

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
                points = [_normalize_quad(poly, width, height)]
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
                    bounding_box=fout._polyline_to_bbox(
                        [_normalize_quad(poly, width, height)]
                    ),
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
            model_name=config.det_model_name,
            engine="transformers",
            device=_map_device(self._device),
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
                    if r.get("dt_polys") is not None:
                        polys.extend(r["dt_polys"])
                    if r.get("dt_scores") is not None:
                        scores.extend(r["dt_scores"])
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
        rec_batch_size (32): the batch size to use when recognizing the
            detected text-region crops
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
        self.rec_batch_size = self.parse_int(d, "rec_batch_size", default=32)
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
        device = _map_device(self._device)
        self._rec_model = paddleocr.TextRecognition(
            model_name=config.rec_model_name,
            engine="transformers",
            device=device,
        )
        return paddleocr.TextDetection(
            model_name=config.det_model_name,
            engine="transformers",
            device=device,
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
                    if r.get("dt_polys") is not None:
                        polys.extend(r["dt_polys"])
                    if r.get("dt_scores") is not None:
                        det_scores.extend(r["dt_scores"])
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
                            input=crops,
                            batch_size=min(
                                len(crops), self.config.rec_batch_size
                            ),
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
