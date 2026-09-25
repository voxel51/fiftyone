"""
Tests for fiftyone/utils/florence2.py Florence-2 model wrapper.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock

import numpy as np
import pytest
import torch
from PIL import Image as PILImage

import fiftyone.core.labels as fol
import fiftyone.utils.florence2 as fouf


class TestFlorence2ModelConfig:
    def test_defaults(self):
        config = fouf.Florence2ModelConfig({})

        assert config.name_or_path == "florence-community/Florence-2-base"
        assert config.task == "detection"
        assert config.text_prompt is None
        assert config.max_new_tokens == 1024
        assert config.num_beams == 3
        assert config.raw_inputs is True

    def test_unknown_task_raises(self):
        with pytest.raises(ValueError, match="Unsupported task"):
            fouf.Florence2ModelConfig({"task": "nonsense"})

    @pytest.mark.parametrize(
        "task",
        ["phrase_grounding", "open_vocabulary_detection", "segmentation"],
    )
    def test_text_tasks_need_a_prompt(self, task):
        with pytest.raises(ValueError, match="text_prompt"):
            fouf.Florence2ModelConfig({"task": task})

        config = fouf.Florence2ModelConfig(
            {"task": task, "text_prompt": "a horse"}
        )
        assert config.text_prompt == "a horse"

    def test_every_task_is_accepted(self):
        for task, (_, _, takes_text) in fouf._TASKS.items():
            d = {"task": task}
            if takes_text:
                d["text_prompt"] = "a horse"
            assert fouf.Florence2ModelConfig(d).task == task

    @pytest.mark.parametrize(
        "key,value", [("max_new_tokens", 0), ("num_beams", 0)]
    )
    def test_non_positive_generation_settings_raise(self, key, value):
        with pytest.raises(ValueError, match=key):
            fouf.Florence2ModelConfig({key: value})


class TestPrompt:
    def _model(self, d):
        model = fouf.Florence2Model.__new__(fouf.Florence2Model)
        model.config = fouf.Florence2ModelConfig(d)
        return model

    def test_task_token_alone(self):
        assert self._model({"task": "caption"})._prompt() == "<CAPTION>"

    def test_text_prompt_follows_the_token(self):
        model = self._model(
            {"task": "phrase_grounding", "text_prompt": "a horse"}
        )
        assert model._prompt() == "<CAPTION_TO_PHRASE_GROUNDING>a horse"

    def test_text_prompt_ignored_by_other_tasks(self):
        model = self._model({"task": "detection", "text_prompt": "a horse"})
        assert model._prompt() == "<OD>"


class TestToDetections:
    def test_pixel_corners_become_relative_boxes(self):
        parsed = {
            "bboxes": [[64, 48, 320, 240]],
            "labels": ["horse"],
        }
        dets = fouf._to_detections(parsed, 640, 480).detections

        assert [d.label for d in dets] == ["horse"]
        assert dets[0].bounding_box == pytest.approx([0.1, 0.1, 0.4, 0.4])

    def test_open_vocabulary_labels(self):
        parsed = {
            "bboxes": [[0, 0, 320, 240]],
            "bboxes_labels": ["horse"],
            "polygons": [],
            "polygons_labels": [],
        }
        dets = fouf._to_detections(parsed, 640, 480).detections

        assert [d.label for d in dets] == ["horse"]

    def test_unnamed_regions_get_the_default_label(self):
        parsed = {"bboxes": [[0, 0, 10, 10], [5, 5, 20, 20]], "labels": [""]}
        dets = fouf._to_detections(parsed, 100, 100).detections

        assert [d.label for d in dets] == ["object", "object"]

    def test_boxes_are_clipped_and_empty_ones_dropped(self):
        parsed = {
            "bboxes": [[-10, -10, 700, 500], [50, 50, 50, 90], [1, 2, 3]],
            "labels": ["a", "b", "c"],
        }
        dets = fouf._to_detections(parsed, 640, 480).detections

        assert [d.label for d in dets] == ["a"]
        assert dets[0].bounding_box == pytest.approx([0.0, 0.0, 1.0, 1.0])

    def test_empty_result(self):
        assert fouf._to_detections({}, 640, 480).detections == []


class TestOCRToDetections:
    def test_box_encloses_the_four_corners(self):
        parsed = {
            "quad_boxes": [[100, 50, 300, 60, 290, 120, 90, 110]],
            "labels": ["</s>STOP"],
        }
        dets = fouf._ocr_to_detections(parsed, 400, 200).detections

        assert [d.label for d in dets] == ["STOP"]
        assert dets[0].bounding_box == pytest.approx(
            [90 / 400, 50 / 200, 210 / 400, 70 / 200]
        )

    def test_blank_text_and_malformed_quads_are_dropped(self):
        parsed = {
            "quad_boxes": [[0, 0, 10, 0, 10, 10, 0, 10], [0, 0, 10, 10]],
            "labels": ["  ", "text"],
        }

        assert fouf._ocr_to_detections(parsed, 100, 100).detections == []


class TestToPolylines:
    def test_instances_keep_every_ring(self):
        parsed = {
            "polygons": [
                [[0, 0, 100, 0, 100, 100], [200, 200, 300, 200, 300, 300]]
            ],
            "labels": [""],
        }
        lines = fouf._to_polylines(parsed, 400, 400, "a horse").polylines

        assert len(lines) == 1
        assert lines[0].label == "a horse"
        assert lines[0].closed and lines[0].filled
        assert len(lines[0].points) == 2
        np.testing.assert_allclose(
            lines[0].points[0], [[0.0, 0.0], [0.25, 0.0], [0.25, 0.25]]
        )

    def test_rings_under_three_points_are_dropped(self):
        parsed = {"polygons": [[[0, 0, 10, 10]]], "labels": ["x"]}

        assert fouf._to_polylines(parsed, 100, 100, None).polylines == []


class TestToClassification:
    def test_text(self):
        label = fouf._to_classification(" A horse. ")
        assert isinstance(label, fol.Classification)
        assert label.label == "A horse."

    def test_empty_text(self):
        assert fouf._to_classification("  ") is None


class TestPredictAll:
    def _model(self, d=None, fail_on=None):
        model = fouf.Florence2Model.__new__(fouf.Florence2Model)
        model.config = fouf.Florence2ModelConfig(d or {})
        model._device = "cpu"
        model._processor = mock.MagicMock()
        model._processor.post_process_generation.side_effect = (
            lambda text, task, image_size: {
                task: {"bboxes": [[0, 0, 5, 5]], "labels": [text]}
            }
        )
        model.batches = []

        def fake_generate(images):
            model.batches.append(len(images))
            if fail_on is not None and any(i.size == fail_on for i in images):
                raise RuntimeError("boom")
            return ["label-%dx%d" % i.size for i in images]

        model._generate = fake_generate
        return model

    def test_one_batch_for_all_images(self):
        model = self._model()
        images = [PILImage.new("RGB", (10, 10)), PILImage.new("RGB", (20, 10))]

        out = model._predict_all(images)

        assert model.batches == [2]
        assert [d.detections[0].label for d in out] == [
            "label-10x10",
            "label-20x10",
        ]

    def test_arrays_and_tensors_are_converted(self):
        model = self._model()
        images = [
            np.zeros((10, 20, 3), dtype=np.uint8),
            torch.zeros(3, 30, 40, dtype=torch.uint8),
        ]

        out = model._predict_all(images)

        assert [d.detections[0].label for d in out] == [
            "label-20x10",
            "label-40x30",
        ]

    def test_failed_batch_is_retried_one_image_at_a_time(self):
        model = self._model(fail_on=(20, 10))
        images = [PILImage.new("RGB", (10, 10)), PILImage.new("RGB", (20, 10))]

        out = model._predict_all(images)

        assert model.batches == [2, 1, 1]
        assert out[0].detections[0].label == "label-10x10"
        assert out[1] is None

    def test_failed_single_image(self):
        model = self._model(fail_on=(10, 10))

        assert model._predict_all([PILImage.new("RGB", (10, 10))]) == [None]


class TestBatching:
    def test_images_of_different_sizes_are_batched_as_a_list(self):
        model = fouf.Florence2Model.__new__(fouf.Florence2Model)
        images = [PILImage.new("RGB", (10, 10)), PILImage.new("RGB", (20, 10))]

        assert model.ragged_batches is False
        assert model.has_collate_fn is True
        assert fouf.Florence2Model.collate_fn(images) == images


class TestZooEntries:
    def test_entries_are_wired_to_the_wrapper(self):
        import json
        import os

        path = os.path.join(
            os.path.dirname(fouf.__file__),
            os.pardir,
            "zoo",
            "models",
            "manifest-torch.json",
        )
        with open(path, "r", encoding="utf-8") as f:
            models = {m["base_name"]: m for m in json.load(f)["models"]}

        for size in ("base", "large", "base-ft", "large-ft"):
            entry = models["florence-2-%s-torch" % size]
            deployment = entry["default_deployment_config_dict"]

            assert deployment["type"] == (
                "fiftyone.utils.florence2.Florence2Model"
            )
            assert deployment["config"]["name_or_path"] == (
                "florence-community/Florence-2-%s" % size
            )
            assert entry["license"] == "MIT"
            assert "transformers>=4.56.0" in entry["requirements"]["packages"]
