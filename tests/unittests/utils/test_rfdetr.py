"""
Tests for fiftyone/utils/rfdetr.py.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from pathlib import Path
from types import SimpleNamespace
from typing import Any, Optional

import numpy as np
from PIL import Image
import pytest
import torch

import fiftyone as fo
import fiftyone.core.labels as fol
from decorators import drop_datasets


class _FakeSVDets:
    def __init__(
        self,
        xyxy: Optional[list[list[float]]] = None,
        confidence: Optional[list[float]] = None,
        class_id: Optional[list[int]] = None,
        mask: Optional[np.ndarray] = None,
    ) -> None:
        if xyxy is None:
            xyxy = [[0, 0, 4, 4]]
        if class_id is None:
            class_id = [1]

        self.xyxy = np.asarray(xyxy, dtype=np.float32).reshape((-1, 4))
        self.confidence = (
            None
            if confidence is None
            else np.asarray(confidence, dtype=np.float32)
        )
        self.class_id = np.asarray(class_id, dtype=np.int64)
        self.mask = None if mask is None else np.asarray(mask)

    def __len__(self) -> int:
        return len(self.xyxy)


def _make_model(
    model_cls,
    predict,
    *,
    class_names: Optional[dict[int, str]] = None,
    confidence_thresh: float = 0.6,
    filter_classes: Optional[list[str]] = None,
):
    model = model_cls.__new__(model_cls)
    model.config = SimpleNamespace(
        confidence_thresh=confidence_thresh,
        filter_classes=filter_classes,
    )
    model._model = SimpleNamespace(
        predict=predict,
        class_names=class_names or {1: "person"},
    )
    return model


class TestRFDETRDeviceForwarding:
    def test_load_model_forwards_explicit_cpu_device(self, monkeypatch):
        from fiftyone.utils.rfdetr import RFDETRDetectionModel
        import fiftyone.utils.rfdetr as ford

        calls = []

        def _fake_load(
            model_type: str, device: Optional[str] = None
        ) -> object:
            calls.append((model_type, device))
            return object()

        monkeypatch.setattr(ford, "_load_rfdetr_model", _fake_load)

        model = RFDETRDetectionModel.__new__(RFDETRDetectionModel)
        config = SimpleNamespace(model_type="RFDETRMedium", device="cpu")

        model._load_model(config)

        assert calls == [("RFDETRMedium", "cpu")]

    def test_load_model_rejects_indexed_cuda_device(self):
        from fiftyone.utils.rfdetr import RFDETRDetectionModel

        model = RFDETRDetectionModel.__new__(RFDETRDetectionModel)
        config = SimpleNamespace(model_type="RFDETRMedium", device="cuda:1")

        with pytest.raises(ValueError, match="indexed CUDA devices"):
            model._load_model(config)


class TestRFDETRBatchingContract:
    def test_build_transforms_disables_ragged_batches(self):
        from fiftyone.utils.rfdetr import RFDETRDetectionModel

        model = RFDETRDetectionModel.__new__(RFDETRDetectionModel)

        transforms, ragged_batches = model._build_transforms(SimpleNamespace())

        assert transforms is None
        assert ragged_batches is False

    @drop_datasets
    def test_apply_model_batches_raw_pil_inputs(
        self, monkeypatch, tmp_path: Path
    ):
        from fiftyone.utils.rfdetr import (
            RFDETRDetectionModel,
            RFDETRDetectionModelConfig,
        )
        import fiftyone.utils.rfdetr as ford

        batch_sizes = []

        def _fake_predict(
            images: list[Image.Image], threshold: float
        ) -> list[_FakeSVDets]:
            batch_sizes.append(len(images))
            assert threshold == pytest.approx(0.6)
            assert [img.mode for img in images] == ["RGB", "RGB"]
            return [_FakeSVDets() for _ in images]

        def _fake_load(
            model_type: str, device: Optional[str] = None
        ) -> object:
            assert model_type == "RFDETRNano"
            assert device == "cpu"
            return SimpleNamespace(
                predict=_fake_predict,
                class_names={1: "person"},
            )

        monkeypatch.setattr(ford, "_load_rfdetr_model", _fake_load)

        image_paths = []
        for idx in range(2):
            path = tmp_path / f"sample-{idx}.png"
            Image.new("RGB", (8, 8), color=(idx * 32, 0, 0)).save(path)
            image_paths.append(path)

        model = RFDETRDetectionModel(
            RFDETRDetectionModelConfig(
                {
                    "model_type": "RFDETRNano",
                    "device": "cpu",
                    "confidence_thresh": 0.6,
                }
            )
        )

        dataset = fo.Dataset()
        try:
            dataset.add_samples(
                [fo.Sample(filepath=str(path)) for path in image_paths]
            )

            dataset.apply_model(
                model,
                label_field="predictions",
                batch_size=2,
                num_workers=0,
                skip_failures=False,
            )

            assert batch_sizes == [2]
            assert len(dataset.exists("predictions")) == 2
            assert dataset.count("predictions.detections") == 2
        finally:
            dataset.delete()


class TestRFDETRClassParsing:
    def test_parse_classes_prefers_manifest_classes(self):
        from fiftyone.utils.rfdetr import RFDETRDetectionModel

        model = RFDETRDetectionModel.__new__(RFDETRDetectionModel)
        model._model = SimpleNamespace(class_names={5: "zebra", 1: "person"})

        classes = model._parse_classes(
            SimpleNamespace(
                classes=["cat", "dog"],
                labels_string=None,
                labels_path=None,
                mask_targets=None,
                mask_targets_path=None,
                output_processor_args=None,
            )
        )

        assert classes == ["cat", "dog"]

    def test_parse_classes_falls_back_to_loaded_model_classes(self):
        from fiftyone.utils.rfdetr import RFDETRDetectionModel

        model = RFDETRDetectionModel.__new__(RFDETRDetectionModel)
        model._model = SimpleNamespace(class_names={5: "zebra", 1: "person"})

        classes = model._parse_classes(
            SimpleNamespace(
                classes=None,
                labels_string=None,
                labels_path=None,
                mask_targets=None,
                mask_targets_path=None,
                output_processor_args=None,
            )
        )

        assert classes == ["person", "zebra"]


class TestRFDETRDirectInputRGBConversion:
    def test_predict_all_converts_common_direct_inputs_to_rgb(
        self, tmp_path: Path
    ):
        from fiftyone.utils.rfdetr import RFDETRDetectionModel

        gray_path = tmp_path / "gray.png"
        Image.new("L", (8, 8), color=128).save(gray_path)

        captured: dict[str, Any] = {}

        def _fake_predict(
            images: list[Image.Image], threshold: float
        ) -> list[_FakeSVDets]:
            captured["threshold"] = threshold
            captured["modes"] = [img.mode for img in images]
            captured["sizes"] = [img.size for img in images]
            return [_FakeSVDets() for _ in images]

        model = RFDETRDetectionModel.__new__(RFDETRDetectionModel)
        model.config = SimpleNamespace(
            confidence_thresh=0.6, filter_classes=None
        )
        model._model = SimpleNamespace(
            predict=_fake_predict,
            class_names={1: "person"},
        )

        labels = model.predict_all(
            [
                Image.new("L", (8, 8), color=128),
                Image.new("RGBA", (8, 8), color=(255, 0, 0, 128)),
                np.full((8, 8), 127, dtype=np.uint8),
                torch.ones((1, 8, 8), dtype=torch.float32),
                gray_path,
            ]
        )

        assert captured["threshold"] == pytest.approx(0.6)
        assert captured["modes"] == ["RGB", "RGB", "RGB", "RGB", "RGB"]
        assert captured["sizes"] == [(8, 8)] * 5
        assert len(labels) == 5
        assert all(isinstance(label, fol.Detections) for label in labels)
        assert labels[0].detections[0].label == "person"


class TestRFDETROutputParsing:
    def test_predict_all_filters_classes(self):
        from fiftyone.utils.rfdetr import RFDETRDetectionModel

        def _fake_predict(images: list[Image.Image], threshold: float):
            assert threshold == pytest.approx(0.6)
            return _FakeSVDets(
                xyxy=[[0, 0, 2, 2], [1, 1, 3, 3]],
                confidence=[0.9, 0.8],
                class_id=[1, 2],
            )

        model = _make_model(
            RFDETRDetectionModel,
            _fake_predict,
            class_names={1: "person", 2: "dog"},
            filter_classes=["person"],
        )

        labels = model.predict_all([Image.new("RGB", (4, 4))])

        assert [d.label for d in labels[0].detections] == ["person"]

    def test_predict_all_handles_empty_detections(self):
        from fiftyone.utils.rfdetr import RFDETRDetectionModel

        def _fake_predict(images: list[Image.Image], threshold: float):
            return _FakeSVDets(
                xyxy=[],
                confidence=[],
                class_id=[],
            )

        model = _make_model(RFDETRDetectionModel, _fake_predict)

        labels = model.predict_all([Image.new("RGB", (4, 4))])

        assert len(labels) == 1
        assert labels[0].detections == []

    def test_segmentation_masks_use_floor_ceil_cropping(self):
        from fiftyone.utils.rfdetr import RFDETRSegmentationModel

        mask = np.zeros((1, 6, 6), dtype=np.float32)
        mask[0, 1:4, 1:4] = 1.0

        def _fake_predict(images: list[Image.Image], threshold: float):
            return _FakeSVDets(
                xyxy=[[1.2, 1.2, 3.1, 3.1]],
                confidence=[0.9],
                class_id=[1],
                mask=mask,
            )

        model = _make_model(RFDETRSegmentationModel, _fake_predict)

        labels = model.predict_all([Image.new("RGB", (6, 6))])
        detection = labels[0].detections[0]

        assert detection.label == "person"
        assert detection.mask.dtype == bool
        assert detection.mask.shape == (3, 3)
        assert detection.mask.all()

    @pytest.mark.parametrize(
        "mask",
        (
            np.ones((1, 1, 1, 6), dtype=np.float32),
            np.ones((1, 1, 6, 1), dtype=np.float32),
        ),
        ids=("leading_channel_dim", "trailing_channel_dim"),
    )
    def test_segmentation_masks_preserve_singleton_channel_dims(self, mask):
        from fiftyone.utils.rfdetr import RFDETRSegmentationModel

        def _fake_predict(images: list[Image.Image], threshold: float):
            return _FakeSVDets(
                xyxy=[[0, 0, 6, 1]],
                confidence=[0.9],
                class_id=[1],
                mask=mask,
            )

        model = _make_model(RFDETRSegmentationModel, _fake_predict)

        labels = model.predict_all([Image.new("RGB", (6, 1))])
        detection = labels[0].detections[0]

        assert detection.mask.dtype == bool
        assert detection.mask.shape == (1, 6)
        assert detection.mask.all()

    def test_degenerate_boxes_are_skipped(self):
        from fiftyone.utils.rfdetr import RFDETRSegmentationModel

        masks = np.zeros((2, 6, 6), dtype=np.float32)
        masks[0, 1:4, 1:4] = 1.0
        masks[1, 2:5, 2:5] = 1.0

        def _fake_predict(images: list[Image.Image], threshold: float):
            return _FakeSVDets(
                xyxy=[[1, 1, 4, 4], [2, 2, 2, 5]],
                confidence=[0.9, 0.8],
                class_id=[1, 2],
                mask=masks,
            )

        model = _make_model(
            RFDETRSegmentationModel,
            _fake_predict,
            class_names={1: "person", 2: "dog"},
        )

        labels = model.predict_all([Image.new("RGB", (6, 6))])

        assert [d.label for d in labels[0].detections] == ["person"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
