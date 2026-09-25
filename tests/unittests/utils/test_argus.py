"""
Tests for fiftyone/utils/argus.py Argus model wrapper.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import os

import numpy as np
import pytest
import torch
from PIL import Image as PILImage

import fiftyone.core.labels as fol
import fiftyone.utils.argus as foua


class TestArgusModelConfig:
    def test_defaults(self):
        config = foua.ArgusModelConfig({})

        assert config.name_or_path == "phanerozoic/argus"
        assert config.revision is None
        assert config.task == "detection"
        assert config.resolution is None
        assert config.nms_thresh == 0.5
        assert config.max_detections == 100
        assert config.raw_inputs is True

    def test_unknown_task_raises(self):
        with pytest.raises(ValueError, match="Unsupported task"):
            foua.ArgusModelConfig({"task": "correspondence"})

    @pytest.mark.parametrize("task", foua._TASKS)
    def test_every_task_is_accepted(self, task):
        assert foua.ArgusModelConfig({"task": task}).task == task

    @pytest.mark.parametrize(
        "key,value", [("resolution", 0), ("max_detections", 0)]
    )
    def test_non_positive_settings_raise(self, key, value):
        with pytest.raises(ValueError, match=key):
            foua.ArgusModelConfig({key: value})


class TestToClassification:
    def test_first_name_of_the_class_is_the_label(self):
        label = foua._to_classification(
            {
                "class_id": "n01440764",
                "class_name": "tench, Tinca tinca",
                "score": 0.75,
                "margin": 0.5,
            }
        )

        assert isinstance(label, fol.Classification)
        assert label.label == "tench"
        assert label.confidence == pytest.approx(0.75)


class TestToSegmentation:
    def test_class_indices_are_kept(self):
        mask = torch.tensor([[0, 2], [149, 12]])

        label = foua._to_segmentation(mask)

        assert isinstance(label, fol.Segmentation)
        assert label.mask.dtype == np.uint8
        np.testing.assert_array_equal(label.mask, [[0, 2], [149, 12]])


class TestToHeatmap:
    def test_depth_is_normalized_by_its_maximum(self):
        depth = torch.tensor([[1.0, 2.0], [4.0, 0.5]])

        label = foua._to_heatmap(depth)

        assert isinstance(label, fol.Heatmap)
        assert label.is_metric is True
        assert label.max_depth == pytest.approx(4.0)
        np.testing.assert_allclose(label.map, [[0.25, 0.5], [1.0, 0.125]])
        np.testing.assert_allclose(label.map * label.max_depth, depth.numpy())

    def test_zero_depth(self):
        label = foua._to_heatmap(np.zeros((2, 2), dtype=np.float32))

        assert label.max_depth == 0.0
        np.testing.assert_array_equal(label.map, np.zeros((2, 2)))


class TestToDetections:
    def test_pixel_corners_become_relative_boxes(self):
        results = [
            {
                "box": [64.0, 48.0, 320.0, 240.0],
                "score": 0.9,
                "label": 0,
                "class_name": "person",
            }
        ]

        dets = foua._to_detections(results, 640, 480).detections

        assert [d.label for d in dets] == ["person"]
        assert dets[0].bounding_box == pytest.approx([0.1, 0.1, 0.4, 0.4])
        assert dets[0].confidence == pytest.approx(0.9)

    def test_boxes_are_clipped_and_empty_ones_dropped(self):
        results = [
            {"box": [-10, -10, 700, 500], "score": 0.5, "class_name": "a"},
            {"box": [50, 50, 50, 90], "score": 0.5, "class_name": "b"},
        ]

        dets = foua._to_detections(results, 640, 480).detections

        assert [d.label for d in dets] == ["a"]
        assert dets[0].bounding_box == pytest.approx([0.0, 0.0, 1.0, 1.0])

    def test_empty_result(self):
        assert foua._to_detections([], 640, 480).detections == []


class _FakeArgus(object):
    """Records the calls of each task method and returns canned results."""

    def __init__(self, fail_on=None):
        self.calls = []
        self.fail_on = fail_on

    def _record(self, name, images, kwargs):
        self.calls.append((name, len(images), kwargs))
        if self.fail_on is not None and any(
            i.size == self.fail_on for i in images
        ):
            raise RuntimeError("boom")

    def classify(self, images, top_k=5):
        self._record("classify", images, {"top_k": top_k})
        return [
            [{"class_id": "n0", "class_name": "zebra", "score": 0.9}]
            for _ in images
        ]

    def segment(self, images, **kwargs):
        self._record("segment", images, kwargs)
        return [torch.full((4, 4), 2) for _ in images]

    def depth(self, images, **kwargs):
        self._record("depth", images, kwargs)
        return [torch.full((4, 4), 3.0) for _ in images]

    def detect(self, images, **kwargs):
        self._record("detect", images, kwargs)
        return [
            [
                {
                    "box": [0.0, 0.0, i.size[0] / 2, i.size[1] / 2],
                    "score": 0.8,
                    "label": 0,
                    "class_name": "person",
                }
            ]
            for i in images
        ]


def _model(d=None, fail_on=None):
    model = foua.ArgusModel.__new__(foua.ArgusModel)
    model.config = foua.ArgusModelConfig(d or {})
    model._model = _FakeArgus(fail_on=fail_on)
    return model


class TestPredictAll:
    def test_classification(self):
        model = _model({"task": "classification", "resolution": 320})

        out = model._predict_all([PILImage.new("RGB", (10, 10))] * 2)

        assert model._model.calls == [("classify", 2, {"top_k": 1})]
        assert [c.label for c in out] == ["zebra", "zebra"]

    def test_segmentation_and_depth_take_the_resolution(self):
        for task, method in (("segmentation", "segment"), ("depth", "depth")):
            model = _model({"task": task, "resolution": 320})

            out = model._predict_all([PILImage.new("RGB", (10, 10))])

            assert model._model.calls == [(method, 1, {"resolution": 320})]
            assert len(out) == 1

    def test_segmentation_labels(self):
        model = _model({"task": "segmentation"})

        out = model._predict_all([PILImage.new("RGB", (10, 10))])

        assert model._model.calls == [("segment", 1, {})]
        np.testing.assert_array_equal(out[0].mask, np.full((4, 4), 2))

    def test_detection_settings(self):
        model = _model(
            {"confidence_thresh": 0.3, "nms_thresh": 0.6, "max_detections": 7}
        )

        model._predict_all([PILImage.new("RGB", (10, 10))])

        assert model._model.calls == [
            (
                "detect",
                1,
                {"score_thresh": 0.3, "nms_thresh": 0.6, "max_per_image": 7},
            )
        ]

    def test_detection_default_score_threshold(self):
        model = _model()

        model._predict_all([PILImage.new("RGB", (10, 10))])

        assert model._model.calls[0][2]["score_thresh"] == 0.05

    def test_arrays_and_tensors_are_converted(self):
        model = _model()
        images = [
            np.zeros((10, 20, 3), dtype=np.uint8),
            torch.zeros(3, 30, 40, dtype=torch.uint8),
        ]

        out = model._predict_all(images)

        for dets in out:
            assert dets.detections[0].bounding_box == pytest.approx(
                [0.0, 0.0, 0.5, 0.5]
            )

    def test_failed_batch_is_retried_one_image_at_a_time(self):
        model = _model({"task": "depth"}, fail_on=(20, 10))
        images = [PILImage.new("RGB", (10, 10)), PILImage.new("RGB", (20, 10))]

        out = model._predict_all(images)

        assert [c[1] for c in model._model.calls] == [2, 1, 1]
        assert isinstance(out[0], fol.Heatmap)
        assert out[1] is None

    def test_failed_single_image(self):
        model = _model(fail_on=(10, 10))

        assert model._predict_all([PILImage.new("RGB", (10, 10))]) == [None]


class TestMaskTargets:
    def test_segmentation_names_the_ade20k_classes(self):
        targets = _model({"task": "segmentation"}).mask_targets

        assert len(targets) == 150
        assert targets[0] == "wall"
        assert targets[2] == "sky"
        assert targets[149] == "flag"

    def test_other_tasks_have_none(self):
        assert _model({"task": "depth"}).mask_targets is None


class TestZooEntry:
    def test_entry_is_wired_to_the_wrapper(self):
        path = os.path.join(
            os.path.dirname(foua.__file__),
            os.pardir,
            "zoo",
            "models",
            "manifest-torch.json",
        )
        with open(path, "r", encoding="utf-8") as f:
            models = {m["base_name"]: m for m in json.load(f)["models"]}

        entry = models["argus-torch"]
        deployment = entry["default_deployment_config_dict"]

        assert deployment["type"] == "fiftyone.utils.argus.ArgusModel"
        assert deployment["config"]["name_or_path"] == "phanerozoic/argus"
        assert len(deployment["config"]["revision"]) == 40
        assert "detection" in entry["tags"]
        assert "depth" not in entry["tags"]
