"""
Tests for fiftyone/utils/paddleocr.py PP-OCRv6 model wrappers.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np
from PIL import Image
import pytest

import fiftyone.core.labels as fol


class _FakeRes:
    """Mimics a paddleocr result object exposing ``.json`` -> {"res": {...}}."""

    def __init__(self, res):
        self._res = {"res": res}

    @property
    def json(self):
        return self._res


class _FakeDet:
    def __init__(self, polys, scores):
        # paddleocr returns arrays, not lists
        self._polys = np.asarray(polys, dtype=np.float32)
        self._scores = np.asarray(scores, dtype=np.float32)

    def predict(self, input, batch_size=1):
        return [_FakeRes({"dt_polys": self._polys, "dt_scores": self._scores})]


class _FakeRec:
    def __init__(self, texts_scores):
        self._texts_scores = texts_scores
        self.last_batch_size = None

    def predict(self, input, batch_size=1):
        # input is a list of crops; one result per crop, in order
        self.last_batch_size = batch_size
        return [
            _FakeRes({"rec_text": t, "rec_score": s})
            for t, s in self._texts_scores
        ]


class TestPaddleOCRConfig:
    def test_detection_config_defaults(self):
        from fiftyone.utils.paddleocr import PaddleOCRDetectionModelConfig

        config = PaddleOCRDetectionModelConfig({})
        assert config.det_model_name == "PP-OCRv6_medium_det"
        assert config.raw_inputs is True
        assert config.output_processor_cls == (
            "fiftyone.utils.paddleocr.PaddleOCRDetectionOutputProcessor"
        )

    def test_detection_config_custom_model(self):
        from fiftyone.utils.paddleocr import PaddleOCRDetectionModelConfig

        config = PaddleOCRDetectionModelConfig(
            {"det_model_name": "PP-OCRv6_tiny_det"}
        )
        assert config.det_model_name == "PP-OCRv6_tiny_det"

    def test_ocr_config_defaults(self):
        from fiftyone.utils.paddleocr import PaddleOCRModelConfig

        config = PaddleOCRModelConfig({})
        assert config.det_model_name == "PP-OCRv6_medium_det"
        assert config.rec_model_name == "PP-OCRv6_medium_rec"
        assert config.rec_batch_size == 32
        assert config.raw_inputs is True
        assert config.output_processor_cls == (
            "fiftyone.utils.paddleocr.PaddleOCROutputProcessor"
        )

    def test_ocr_config_custom_rec_batch_size(self):
        from fiftyone.utils.paddleocr import PaddleOCRModelConfig

        config = PaddleOCRModelConfig({"rec_batch_size": 8})
        assert config.rec_batch_size == 8


class TestPaddleOCRHelpers:
    def test_to_numpy_bgr_flips_channels(self):
        from fiftyone.utils.paddleocr import _to_numpy_bgr

        # pure-red RGB image -> BGR should put 255 in the last channel
        rgb = np.zeros((4, 5, 3), dtype=np.uint8)
        rgb[..., 0] = 255  # red
        bgr = _to_numpy_bgr(Image.fromarray(rgb))
        assert bgr.shape == (4, 5, 3)
        assert bgr.dtype == np.uint8
        assert np.all(bgr[..., 2] == 255)  # red now in BGR blue-last slot
        assert np.all(bgr[..., 0] == 0)

    def test_to_numpy_bgr_grayscale_and_rgba(self):
        from fiftyone.utils.paddleocr import _to_numpy_bgr

        gray = np.full((3, 3), 128, dtype=np.uint8)
        out = _to_numpy_bgr(gray)
        assert out.shape == (3, 3, 3)

        gray_hw1 = np.full((3, 3, 1), 128, dtype=np.uint8)
        out = _to_numpy_bgr(gray_hw1)
        assert out.shape == (3, 3, 3)
        assert np.all(out == 128)

        rgba = np.zeros((3, 3, 4), dtype=np.uint8)
        out = _to_numpy_bgr(rgba)
        assert out.shape == (3, 3, 3)

    def test_to_numpy_bgr_float_input(self):
        from fiftyone.utils.paddleocr import _to_numpy_bgr

        f = np.ones((2, 2, 3), dtype=np.float32)  # max <= 1.0 -> scaled by 255
        out = _to_numpy_bgr(f)
        assert out.dtype == np.uint8
        assert out.max() == 255

    def test_quad_to_bbox(self):
        from fiftyone.utils.paddleocr import _quad_to_bbox

        poly = [[20, 40], [120, 40], [120, 90], [20, 90]]
        bbox = _quad_to_bbox(poly, width=200, height=100)
        assert bbox == pytest.approx([0.1, 0.4, 0.5, 0.5])

    def test_quad_to_bbox_out_of_frame(self):
        from fiftyone.utils.paddleocr import _quad_to_bbox

        # polygon lying wholly outside the frame clamps into [0, 1]
        poly = [[250, 150], [300, 150], [300, 180], [250, 180]]
        bbox = _quad_to_bbox(poly, width=200, height=100)
        assert bbox == pytest.approx([1.0, 1.0, 0.0, 0.0])
        assert all(0.0 <= v <= 1.0 for v in bbox)

    def test_map_device(self):
        from fiftyone.utils.paddleocr import _map_device

        assert _map_device("cpu") == "cpu"
        assert _map_device("cuda") == "gpu"
        assert _map_device("cuda:1") == "gpu:1"


class TestPaddleOCRDetectionOutputProcessor:
    def test_polys_to_polylines(self):
        from fiftyone.utils.paddleocr import PaddleOCRDetectionOutputProcessor

        proc = PaddleOCRDetectionOutputProcessor()
        output = [
            {
                "width": 100,
                "height": 50,
                "polys": [[[10, 5], [90, 5], [90, 45], [10, 45]]],
                "scores": [0.8],
            }
        ]
        labels = proc(output, (100, 50))
        assert len(labels) == 1
        assert isinstance(labels[0], fol.Polylines)
        pl = labels[0].polylines[0]
        assert pl.label == "text"
        assert pl.closed is True
        assert pl.filled is False
        assert pl.confidence == pytest.approx(0.8)
        assert pl.points[0][0] == pytest.approx((0.1, 0.1))
        assert pl.points[0][2] == pytest.approx((0.9, 0.9))

    def test_confidence_threshold_filters(self):
        from fiftyone.utils.paddleocr import PaddleOCRDetectionOutputProcessor

        proc = PaddleOCRDetectionOutputProcessor()
        output = [
            {
                "width": 100,
                "height": 100,
                "polys": [
                    [[0, 0], [10, 0], [10, 10], [0, 10]],
                    [[0, 0], [10, 0], [10, 10], [0, 10]],
                ],
                "scores": [0.9, 0.2],
            }
        ]
        labels = proc(output, (100, 100), confidence_thresh=0.5)
        assert len(labels[0].polylines) == 1
        assert labels[0].polylines[0].confidence == pytest.approx(0.9)

    def test_empty_image(self):
        from fiftyone.utils.paddleocr import PaddleOCRDetectionOutputProcessor

        proc = PaddleOCRDetectionOutputProcessor()
        labels = proc(
            [{"width": 10, "height": 10, "polys": [], "scores": []}], (10, 10)
        )
        assert labels[0].polylines == []


class TestPaddleOCROutputProcessor:
    def test_ocr_to_detections(self):
        from fiftyone.utils.paddleocr import PaddleOCROutputProcessor

        proc = PaddleOCROutputProcessor()
        output = [
            {
                "width": 200,
                "height": 100,
                "polys": [[[20, 40], [120, 40], [120, 90], [20, 90]]],
                "det_scores": [0.88],
                "texts": ["Hello"],
                "rec_scores": [0.97],
            }
        ]
        labels = proc(output, (200, 100))
        assert isinstance(labels[0], fol.Detections)
        det = labels[0].detections[0]
        assert det.label == "Hello"
        assert det.confidence == pytest.approx(0.97)
        assert det.get_attribute_value("det_confidence") == pytest.approx(0.88)
        assert det.bounding_box == pytest.approx([0.1, 0.4, 0.5, 0.5])

    def test_empty_text_skipped(self):
        from fiftyone.utils.paddleocr import PaddleOCROutputProcessor

        proc = PaddleOCROutputProcessor()
        output = [
            {
                "width": 100,
                "height": 100,
                "polys": [
                    [[0, 0], [10, 0], [10, 10], [0, 10]],
                    [[0, 0], [10, 0], [10, 10], [0, 10]],
                ],
                "det_scores": [0.9, 0.9],
                "texts": ["", "world"],
                "rec_scores": [0.0, 0.9],
            }
        ]
        labels = proc(output, (100, 100))
        assert [d.label for d in labels[0].detections] == ["world"]

    def test_confidence_threshold_filters(self):
        from fiftyone.utils.paddleocr import PaddleOCROutputProcessor

        proc = PaddleOCROutputProcessor()
        output = [
            {
                "width": 100,
                "height": 100,
                "polys": [
                    [[0, 0], [10, 0], [10, 10], [0, 10]],
                    [[0, 0], [10, 0], [10, 10], [0, 10]],
                ],
                "det_scores": [0.9, 0.9],
                "texts": ["keep", "drop"],
                "rec_scores": [0.8, 0.3],
            }
        ]
        labels = proc(output, (100, 100), confidence_thresh=0.5)
        assert [d.label for d in labels[0].detections] == ["keep"]


class TestPaddleOCRForwardPass:
    def test_detection_forward_pass(self):
        from fiftyone.utils.paddleocr import PaddleOCRDetectionModel

        model = PaddleOCRDetectionModel.__new__(PaddleOCRDetectionModel)
        model._model = _FakeDet(
            polys=[[[10, 10], [50, 10], [50, 30], [10, 30]]], scores=[0.9]
        )
        img = np.zeros((100, 200, 3), dtype=np.uint8)
        out = model._forward_pass([img])
        assert out[0]["width"] == 200
        assert out[0]["height"] == 100
        assert np.allclose(
            out[0]["polys"], [[[10, 10], [50, 10], [50, 30], [10, 30]]]
        )
        assert np.allclose(out[0]["scores"], [0.9])

    def test_ocr_forward_pass_chains_det_and_rec(self):
        pytest.importorskip("cv2")
        from fiftyone.utils.paddleocr import (
            PaddleOCRModel,
            PaddleOCRModelConfig,
        )

        model = PaddleOCRModel.__new__(PaddleOCRModel)
        model.config = PaddleOCRModelConfig({})
        model._model = _FakeDet(
            polys=[[[10, 10], [50, 10], [50, 30], [10, 30]]], scores=[0.9]
        )
        model._rec_model = _FakeRec([("hello", 0.95)])
        img = np.zeros((100, 200, 3), dtype=np.uint8)
        out = model._forward_pass([img])
        assert np.allclose(
            out[0]["polys"], [[[10, 10], [50, 10], [50, 30], [10, 30]]]
        )
        assert np.allclose(out[0]["det_scores"], [0.9])
        assert out[0]["texts"] == ["hello"]
        assert out[0]["rec_scores"] == [0.95]
        assert model._rec_model.last_batch_size == 1

    def test_ocr_forward_pass_caps_rec_batch_size(self):
        pytest.importorskip("cv2")
        from fiftyone.utils.paddleocr import (
            PaddleOCRModel,
            PaddleOCRModelConfig,
        )

        polys = [
            [[10, 10], [50, 10], [50, 30], [10, 30]],
            [[60, 10], [100, 10], [100, 30], [60, 30]],
            [[110, 10], [150, 10], [150, 30], [110, 30]],
        ]
        model = PaddleOCRModel.__new__(PaddleOCRModel)
        model.config = PaddleOCRModelConfig({"rec_batch_size": 2})
        model._model = _FakeDet(polys=polys, scores=[0.9, 0.9, 0.9])
        model._rec_model = _FakeRec([("a", 0.9), ("b", 0.9), ("c", 0.9)])
        img = np.zeros((100, 200, 3), dtype=np.uint8)
        out = model._forward_pass([img])
        assert out[0]["texts"] == ["a", "b", "c"]
        assert model._rec_model.last_batch_size == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
