"""
Tests for YOLOE visual prompt support in fiftyone/utils/ultralytics.py.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from types import SimpleNamespace
from typing import Any

import numpy as np
import pytest

import fiftyone.core.labels as fol


class TestDetectionsToVisualPrompts:
    def test_single_class_normalized_to_absolute(self):
        from fiftyone.utils.ultralytics import _detections_to_visual_prompts

        original_bbox_a = [0.1, 0.2, 0.3, 0.4]
        original_bbox_b = [0.5, 0.0, 0.5, 1.0]
        dets = fol.Detections(
            detections=[
                fol.Detection(label="person", bounding_box=list(original_bbox_a)),
                fol.Detection(label="person", bounding_box=list(original_bbox_b)),
            ]
        )

        boxes, cls_indices, classes = _detections_to_visual_prompts(
            dets, img_width=100, img_height=200
        )

        assert classes == ["person"]
        assert isinstance(classes, list)
        assert all(isinstance(c, str) for c in classes)

        assert cls_indices == [0, 0]
        assert isinstance(cls_indices, list)
        assert all(isinstance(c, int) for c in cls_indices)

        assert isinstance(boxes, list)
        assert len(boxes) == 2
        np.testing.assert_allclose(
            boxes,
            [[10.0, 40.0, 40.0, 120.0], [50.0, 0.0, 100.0, 200.0]],
        )

        assert dets.detections[0].bounding_box == original_bbox_a
        assert dets.detections[1].bounding_box == original_bbox_b

    def test_multiple_classes_dedup_preserves_first_seen_order(self):
        from fiftyone.utils.ultralytics import _detections_to_visual_prompts

        bbox = [0.0, 0.0, 0.1, 0.1]
        dets = fol.Detections(
            detections=[
                fol.Detection(label="dog", bounding_box=list(bbox)),
                fol.Detection(label="cat", bounding_box=list(bbox)),
                fol.Detection(label="dog", bounding_box=list(bbox)),
                fol.Detection(label="bird", bounding_box=list(bbox)),
                fol.Detection(label="cat", bounding_box=list(bbox)),
            ]
        )

        boxes, cls_indices, classes = _detections_to_visual_prompts(
            dets, img_width=10, img_height=10
        )

        assert classes == ["dog", "cat", "bird"]
        assert cls_indices == [0, 1, 0, 2, 1]
        assert len(boxes) == len(dets.detections)


class TestYOLOEVPGetItem:
    def test_required_keys(self):
        from fiftyone.utils.ultralytics import YOLOEVPGetItem

        item = YOLOEVPGetItem(transform=lambda x: {"img": x})

        keys = item.required_keys
        assert isinstance(keys, list)
        assert keys == ["filepath", "prompt_field"]

    def test_call_without_transform_raises_typeerror(self, tmp_path):
        from PIL import Image

        from fiftyone.utils.ultralytics import YOLOEVPGetItem

        path = tmp_path / "x.png"
        Image.new("RGB", (4, 4)).save(path)

        item = YOLOEVPGetItem(transform=None)
        with pytest.raises(TypeError, match="requires a transform"):
            item({"filepath": str(path), "prompt_field": fol.Detections()})

    def test_call_loads_image_force_rgb_and_builds_visual_prompts(
        self, tmp_path
    ):
        from PIL import Image

        from fiftyone.utils.ultralytics import YOLOEVPGetItem

        # "L" source verifies the loader forces RGB before the transform.
        path = tmp_path / "gray.png"
        Image.new("L", (20, 10), color=128).save(path)

        prompt = fol.Detections(
            detections=[
                fol.Detection(label="dog", bounding_box=[0.0, 0.0, 0.5, 0.5]),
                fol.Detection(label="cat", bounding_box=[0.5, 0.5, 0.5, 0.5]),
            ]
        )

        captured: dict[str, Any] = {}

        def fake_transform(img):
            captured["mode"] = img.mode
            captured["size"] = img.size
            return {"img": "TENSOR", "orig_img": "ARRAY"}

        item = YOLOEVPGetItem(transform=fake_transform)
        result = item({"filepath": str(path), "prompt_field": prompt})

        assert captured == {"mode": "RGB", "size": (20, 10)}
        assert set(result.keys()) == {
            "img",
            "orig_img",
            "visual_prompts",
            "vp_classes",
        }
        assert result["img"] == "TENSOR"
        assert result["orig_img"] == "ARRAY"
        assert result["vp_classes"] == ["dog", "cat"]
        np.testing.assert_array_equal(
            result["visual_prompts"]["bboxes"],
            np.array([[0.0, 0.0, 10.0, 5.0], [10.0, 5.0, 20.0, 10.0]]),
        )
        np.testing.assert_array_equal(
            result["visual_prompts"]["cls"], np.array([0, 1])
        )

    @pytest.mark.parametrize(
        "prompt", [None, fol.Detections()], ids=("none", "empty")
    )
    def test_call_emits_none_visual_prompts_for_missing_or_empty_prompt(
        self, prompt, tmp_path
    ):
        from PIL import Image

        from fiftyone.utils.ultralytics import YOLOEVPGetItem

        path = tmp_path / "x.png"
        Image.new("RGB", (4, 4)).save(path)

        item = YOLOEVPGetItem(
            transform=lambda img: {"img": "TENSOR", "orig_img": "ARRAY"}
        )
        result = item({"filepath": str(path), "prompt_field": prompt})

        assert result["visual_prompts"] is None
        assert result["vp_classes"] is None


class TestFiftyOneYOLOEVPCollate:
    def test_collate_collects_visual_prompts_and_stacks_images(self):
        import torch

        from fiftyone.utils.ultralytics import FiftyOneYOLOEVPModel

        vp_a = {"bboxes": np.array([[0.0, 0.0, 1.0, 1.0]]), "cls": np.array([0])}
        classes_a = ["dog"]
        vp_b = None
        classes_b = None

        img_a_t = torch.full((3, 5, 7), 1.0)
        img_b_t = torch.full((3, 5, 7), 2.0)
        img_a_o = np.zeros((5, 7, 3), dtype=np.uint8)
        img_b_o = np.zeros((5, 7, 3), dtype=np.uint8)

        batch = [
            {
                "img": img_a_t,
                "orig_img": img_a_o,
                "visual_prompts": vp_a,
                "vp_classes": classes_a,
            },
            {
                "img": img_b_t,
                "orig_img": img_b_o,
                "visual_prompts": vp_b,
                "vp_classes": classes_b,
            },
        ]

        out = FiftyOneYOLOEVPModel.collate_fn(batch)

        assert set(out.keys()) == {
            "orig_imgs",
            "images",
            "orig_shapes",
            "visual_prompts",
            "vp_classes",
        }
        assert out["visual_prompts"] == [vp_a, vp_b]
        assert out["vp_classes"] == [classes_a, classes_b]
        assert out["orig_imgs"][0] is img_a_o
        assert out["orig_imgs"][1] is img_b_o
        assert out["orig_shapes"] == [(7, 5), (7, 5)]

        assert isinstance(out["images"], torch.Tensor)
        assert out["images"].shape == (2, 3, 5, 7)
        assert torch.equal(out["images"][0], img_a_t)
        assert torch.equal(out["images"][1], img_b_t)

    def test_collate_uses_none_for_missing_keys(self):
        import torch

        from fiftyone.utils.ultralytics import FiftyOneYOLOEVPModel

        batch = [
            {
                "img": torch.zeros(3, 4, 4),
                "orig_img": np.zeros((4, 4, 3), dtype=np.uint8),
            }
        ]

        out = FiftyOneYOLOEVPModel.collate_fn(batch)

        assert out["visual_prompts"] == [None]
        assert out["vp_classes"] == [None]
        assert out["images"].shape == (1, 3, 4, 4)


class TestFiftyOneYOLOEVPDispatch:
    @staticmethod
    def _bare_model():
        from fiftyone.utils.ultralytics import FiftyOneYOLOEVPModel

        return FiftyOneYOLOEVPModel.__new__(FiftyOneYOLOEVPModel)

    def test_dispatch_with_visual_prompts_calls_vp_path(self, monkeypatch):
        from fiftyone.utils import ultralytics as fu

        model = self._bare_model()

        captured: dict[str, Any] = {}

        def fake_vp(orig_imgs, visual_prompts, vp_classes):
            captured["orig_imgs"] = orig_imgs
            captured["visual_prompts"] = visual_prompts
            captured["vp_classes"] = vp_classes
            return ["VP_RESULT"]

        model._predict_all_visual_prompts = fake_vp

        monkeypatch.setattr(
            fu.FiftyOneYOLOModel,
            "_predict_all",
            lambda self, imgs: pytest.fail(
                "super()._predict_all called when visual_prompts present"
            ),
        )

        vp = {"bboxes": np.array([[0.0, 0.0, 1.0, 1.0]]), "cls": np.array([0])}
        batch = {
            "orig_imgs": ["A"],
            "images": "stacked-tensor",
            "orig_shapes": [(7, 5)],
            "visual_prompts": [vp],
            "vp_classes": [["dog"]],
        }

        out = model._predict_all(batch)

        assert out == ["VP_RESULT"]
        assert captured["orig_imgs"] == ["A"]
        assert captured["visual_prompts"] == [vp]
        assert captured["vp_classes"] == [["dog"]]

    def test_dispatch_with_mixed_visual_prompts_uses_vp_path(self):
        model = self._bare_model()

        seen = {}

        def fake_vp(orig_imgs, visual_prompts, vp_classes):
            seen["visual_prompts"] = visual_prompts
            seen["vp_classes"] = vp_classes
            return ["MIXED"]

        model._predict_all_visual_prompts = fake_vp

        vp = {"bboxes": np.array([[0.0, 0.0, 1.0, 1.0]]), "cls": np.array([0])}
        batch = {
            "orig_imgs": ["A", "B", "C"],
            "images": "T",
            "orig_shapes": [(1, 1), (1, 1), (1, 1)],
            "visual_prompts": [None, vp, None],
            "vp_classes": [None, ["dog"], None],
        }

        out = model._predict_all(batch)

        assert out == ["MIXED"]
        assert seen["visual_prompts"] == [None, vp, None]
        assert seen["vp_classes"] == [None, ["dog"], None]

    def test_dispatch_with_all_none_visual_prompts_falls_through_to_super(
        self, monkeypatch
    ):
        from fiftyone.utils import ultralytics as fu

        model = self._bare_model()

        super_calls = []

        def fake_super_predict_all(self, imgs):
            super_calls.append(imgs)
            return ["SUPER"]

        monkeypatch.setattr(
            fu.FiftyOneYOLOModel,
            "_predict_all",
            fake_super_predict_all,
        )

        model._predict_all_visual_prompts = lambda *a, **kw: pytest.fail(
            "_predict_all_visual_prompts called for all-None visual_prompts"
        )

        batch = {
            "orig_imgs": ["A"],
            "images": "T",
            "orig_shapes": [(1, 1)],
            "visual_prompts": [None],
            "vp_classes": [None],
        }

        out = model._predict_all(batch)

        assert out == ["SUPER"]
        assert super_calls == [batch]

    def test_dispatch_with_empty_visual_prompts_falls_through_to_super(
        self, monkeypatch
    ):
        from fiftyone.utils import ultralytics as fu

        model = self._bare_model()

        super_calls = []
        monkeypatch.setattr(
            fu.FiftyOneYOLOModel,
            "_predict_all",
            lambda self, imgs: super_calls.append(imgs) or ["SUPER"],
        )

        model._predict_all_visual_prompts = lambda *a, **kw: pytest.fail(
            "_predict_all_visual_prompts called for empty visual_prompts list"
        )

        batch = {
            "orig_imgs": [],
            "images": "T",
            "orig_shapes": [],
            "visual_prompts": [],
            "vp_classes": [],
        }

        assert model._predict_all(batch) == ["SUPER"]
        assert super_calls == [batch]

    def test_dispatch_with_non_dict_falls_through_to_super(self, monkeypatch):
        from fiftyone.utils import ultralytics as fu

        model = self._bare_model()

        super_calls = []
        monkeypatch.setattr(
            fu.FiftyOneYOLOModel,
            "_predict_all",
            lambda self, imgs: super_calls.append(imgs) or ["SUPER"],
        )

        model._predict_all_visual_prompts = lambda *a, **kw: pytest.fail(
            "_predict_all_visual_prompts called for non-dict input"
        )

        out = model._predict_all(["raw", "list"])

        assert out == ["SUPER"]
        assert super_calls == [["raw", "list"]]


class TestFiftyOneYOLOEVPVisualPrompts:
    @staticmethod
    def _make_model(
        monkeypatch,
        *,
        predict,
        vp_predictor_cls=object,
        confidence_thresh=None,
        filter_classes=None,
        rect=False,
        retina_masks=True,
        predictor_default_conf=0.25,
    ):
        from fiftyone.utils import ultralytics as fu

        monkeypatch.setattr(
            fu, "_get_yoloe_vp_predictor", lambda: vp_predictor_cls
        )

        model = fu.FiftyOneYOLOEVPModel.__new__(fu.FiftyOneYOLOEVPModel)
        model.config = SimpleNamespace(
            confidence_thresh=confidence_thresh,
            filter_classes=filter_classes,
        )
        model._device = "cpu"
        model._model = SimpleNamespace(
            predict=predict,
            predictor=SimpleNamespace(
                args=SimpleNamespace(
                    rect=rect,
                    retina_masks=retina_masks,
                    conf=predictor_default_conf,
                )
            ),
        )

        # Stub _set_predictor: parent's implementation requires a real
        # ultralytics model. Tests inspect _set_predictor_calls.
        model._set_predictor_calls = []
        model._set_predictor = lambda config, m: model._set_predictor_calls.append(
            (config, m)
        )

        # Recording mock for self._output_processor. Captures every call and
        # returns a list of fol.Detections labelled "out-<first vp_class>" so
        # tests can verify both invocation and value flow.
        processor_calls = []

        def fake_output_processor(
            output,
            frame_size,
            vp_classes=None,
            confidence_thresh=None,
            classes=None,
            **kwargs,
        ):
            processor_calls.append(
                {
                    "output": output,
                    "frame_size": frame_size,
                    "vp_classes": vp_classes,
                    "confidence_thresh": confidence_thresh,
                    "classes": classes,
                }
            )
            label = (
                f"out-{vp_classes[0]}" if vp_classes else "no-vp"
            )
            return [
                fol.Detections(
                    detections=[
                        fol.Detection(label=label, bounding_box=[0, 0, 1, 1])
                    ]
                )
            ]

        fake_output_processor.calls = processor_calls
        model._output_processor = fake_output_processor

        return model

    def test_visual_prompts_consumed_per_image_with_full_predict_kwargs(
        self, monkeypatch
    ):
        captured_calls = []

        class _Result:
            def __init__(self):
                self.names = None

        result_a = _Result()
        result_b = _Result()

        def fake_predict(img, **kwargs):
            captured_calls.append({"img": img, **kwargs})
            return [result_a if img == "img-A" else result_b]

        sentinel_predictor = object
        model = self._make_model(
            monkeypatch,
            predict=fake_predict,
            vp_predictor_cls=sentinel_predictor,
            rect=True,
            retina_masks=False,
            predictor_default_conf=0.31,
        )

        vp_a = {
            "bboxes": np.array(
                [[0.0, 0.0, 10.0, 5.0], [10.0, 5.0, 20.0, 10.0]]
            ),
            "cls": np.array([0, 1]),
        }
        vp_b = {
            "bboxes": np.array([[0.0, 0.0, 4.0, 4.0]]),
            "cls": np.array([0]),
        }

        labels = model._predict_all_visual_prompts(
            orig_images=["img-A", "img-B"],
            visual_prompts_list=[vp_a, vp_b],
            vp_classes_list=[["dog", "cat"], ["bird"]],
        )

        assert len(captured_calls) == 2

        for call, expected_img in zip(captured_calls, ["img-A", "img-B"]):
            assert call["img"] == expected_img
            assert call["predictor"] is sentinel_predictor
            assert call["mode"] == "predict"
            assert call["save"] is False
            assert call["verbose"] is False
            assert call["device"] == "cpu"
            assert call["rect"] is True
            assert call["retina_masks"] is False
            assert call["conf"] == 0.31

        assert captured_calls[0]["visual_prompts"] is vp_a
        assert captured_calls[1]["visual_prompts"] is vp_b

        processor_calls = model._output_processor.calls
        assert len(processor_calls) == 2

        assert processor_calls[0]["output"] == [result_a]
        assert processor_calls[0]["vp_classes"] == ["dog", "cat"]
        assert processor_calls[0]["confidence_thresh"] is None
        assert processor_calls[0]["classes"] is None

        assert processor_calls[1]["output"] == [result_b]
        assert processor_calls[1]["vp_classes"] == ["bird"]

        assert len(labels) == 2
        assert isinstance(labels[0], fol.Detections)
        assert labels[0].detections[0].label == "out-dog"
        assert labels[1].detections[0].label == "out-bird"

    def test_visual_prompts_forwards_config_to_output_processor(
        self, monkeypatch
    ):
        class _Result:
            names = None

        def fake_predict(img, **kwargs):
            return [_Result()]

        model = self._make_model(
            monkeypatch,
            predict=fake_predict,
            confidence_thresh=0.42,
            filter_classes=["dog", "cat"],
        )

        vp = {"bboxes": np.array([[0.0, 0.0, 1.0, 1.0]]), "cls": np.array([0])}

        model._predict_all_visual_prompts(["A"], [vp], [["dog"]])

        calls = model._output_processor.calls
        assert len(calls) == 1
        assert calls[0]["confidence_thresh"] == 0.42
        assert calls[0]["classes"] == ["dog", "cat"]
        assert calls[0]["vp_classes"] == ["dog"]

    def test_predictor_restored_on_success(self, monkeypatch):
        class _Result:
            names = None

        def fake_predict(img, **kwargs):
            return [_Result()]

        model = self._make_model(monkeypatch, predict=fake_predict)

        vp = {"bboxes": np.array([[0.0, 0.0, 1.0, 1.0]]), "cls": np.array([0])}

        model._predict_all_visual_prompts(
            ["A", "B"], [vp, vp], [["x"], ["x"]]
        )

        assert model._set_predictor_calls == [(model.config, model._model)]

    def test_predictor_restored_on_exception(self, monkeypatch):
        def fake_predict(img, **kwargs):
            raise RuntimeError("ultralytics blew up")

        model = self._make_model(monkeypatch, predict=fake_predict)

        vp = {"bboxes": np.array([[0.0, 0.0, 1.0, 1.0]]), "cls": np.array([0])}

        with pytest.raises(RuntimeError, match="ultralytics blew up"):
            model._predict_all_visual_prompts(["A"], [vp], [["x"]])

        assert model._set_predictor_calls == [(model.config, model._model)]

    def test_none_visual_prompts_yield_empty_detections(self, monkeypatch):
        predict_calls = []

        class _Result:
            names = None

        def fake_predict(img, **kwargs):
            predict_calls.append(img)
            return [_Result()]

        model = self._make_model(monkeypatch, predict=fake_predict)

        vp_real = {
            "bboxes": np.array([[0.0, 0.0, 2.0, 2.0]]),
            "cls": np.array([0]),
        }

        labels = model._predict_all_visual_prompts(
            orig_images=["img-none-1", "img-none-2", "img-real"],
            visual_prompts_list=[None, None, vp_real],
            vp_classes_list=[None, None, ["dog"]],
        )

        assert predict_calls == ["img-real"]
        assert len(model._output_processor.calls) == 1
        assert model._output_processor.calls[0]["vp_classes"] == ["dog"]

        assert len(labels) == 3
        assert isinstance(labels[0], fol.Detections)
        assert labels[0].detections == []
        assert isinstance(labels[1], fol.Detections)
        assert labels[1].detections == []
        assert labels[2].detections[0].label == "out-dog"

    def test_confidence_thresh_overrides_predictor_default(self, monkeypatch):
        captured = {}

        class _Result:
            names = None

        def fake_predict(img, **kwargs):
            captured.update(kwargs)
            return [_Result()]

        model = self._make_model(
            monkeypatch,
            predict=fake_predict,
            confidence_thresh=0.42,
            predictor_default_conf=0.25,
        )

        vp = {"bboxes": np.array([[0.0, 0.0, 1.0, 1.0]]), "cls": np.array([0])}

        model._predict_all_visual_prompts(["A"], [vp], [["x"]])

        assert captured["conf"] == 0.42

    def test_confidence_thresh_zero_overrides_predictor_default(
        self, monkeypatch
    ):
        # Falsy guard: an explicit 0.0 must not collapse to the predictor
        # default.
        captured = {}

        class _Result:
            names = None

        def fake_predict(img, **kwargs):
            captured.update(kwargs)
            return [_Result()]

        model = self._make_model(
            monkeypatch,
            predict=fake_predict,
            confidence_thresh=0.0,
            predictor_default_conf=0.25,
        )

        vp = {"bboxes": np.array([[0.0, 0.0, 1.0, 1.0]]), "cls": np.array([0])}

        model._predict_all_visual_prompts(["A"], [vp], [["x"]])

        assert captured["conf"] == 0.0

    def test_confidence_thresh_none_falls_back_to_predictor_default(
        self, monkeypatch
    ):
        captured = {}

        class _Result:
            names = None

        def fake_predict(img, **kwargs):
            captured.update(kwargs)
            return [_Result()]

        model = self._make_model(
            monkeypatch,
            predict=fake_predict,
            confidence_thresh=None,
            predictor_default_conf=0.31,
        )

        vp = {"bboxes": np.array([[0.0, 0.0, 1.0, 1.0]]), "cls": np.array([0])}

        model._predict_all_visual_prompts(["A"], [vp], [["x"]])

        assert captured["conf"] == 0.31

    def test_multiple_results_per_predict_call_pass_to_output_processor(
        self, monkeypatch
    ):
        # The full results list from a single predict() call is forwarded to
        # the OutputProcessor in one invocation; per-result names_map handling
        # belongs to the processor.
        class _Result:
            def __init__(self):
                self.names = None

        result_first = _Result()
        result_second = _Result()

        def fake_predict(img, **kwargs):
            return [result_first, result_second]

        model = self._make_model(monkeypatch, predict=fake_predict)

        vp = {
            "bboxes": np.array([[0.0, 0.0, 1.0, 1.0], [0.0, 0.0, 1.0, 1.0]]),
            "cls": np.array([0, 1]),
        }

        model._predict_all_visual_prompts(["A"], [vp], [["dog", "cat"]])

        calls = model._output_processor.calls
        assert len(calls) == 1
        assert calls[0]["output"] == [result_first, result_second]
        assert calls[0]["vp_classes"] == ["dog", "cat"]

    def test_length_mismatch_raises_before_any_predict(self, monkeypatch):
        # The upfront length check raises before any model.predict call,
        # but the finally block must still restore the default predictor.
        class _Result:
            names = None

        predict_calls = []

        def fake_predict(img, **kwargs):
            predict_calls.append(img)
            return [_Result()]

        model = self._make_model(monkeypatch, predict=fake_predict)

        vp = {"bboxes": np.array([[0.0, 0.0, 1.0, 1.0]]), "cls": np.array([0])}

        with pytest.raises(ValueError, match="must have equal length"):
            model._predict_all_visual_prompts(
                orig_images=["A", "B", "C"],
                visual_prompts_list=[vp, vp],
                vp_classes_list=[["x"], ["x"]],
            )

        assert predict_calls == []
        assert model._set_predictor_calls == [(model.config, model._model)]


class TestYOLOEVPSegmentationOutputProcessor:
    def test_remaps_names_when_vp_classes_provided(self, monkeypatch):
        from fiftyone.utils import ultralytics as fu

        class _Result:
            def __init__(self):
                self.names = None

        result_first = _Result()
        result_second = _Result()

        captured_to_instances = []

        def fake_to_instances(results, confidence_thresh=None, classes=None):
            captured_to_instances.append(
                {
                    "results": results,
                    "confidence_thresh": confidence_thresh,
                    "classes": classes,
                }
            )
            return [
                fol.Detections(
                    detections=[
                        fol.Detection(
                            label=r.names[0], bounding_box=[0, 0, 1, 1]
                        )
                    ]
                )
                for r in results
            ]

        monkeypatch.setattr(fu, "to_instances", fake_to_instances)

        proc = fu.YOLOEVPSegmentationOutputProcessor(classes=["unused"])

        out = proc(
            [result_first, result_second],
            None,
            vp_classes=["dog", "cat"],
            confidence_thresh=0.5,
            classes=["dog"],
        )

        expected_names = {0: "dog", 1: "cat"}
        assert result_first.names == expected_names
        assert result_second.names == expected_names

        assert len(captured_to_instances) == 1
        forwarded = captured_to_instances[0]
        assert forwarded["results"] == [result_first, result_second]
        assert forwarded["confidence_thresh"] == 0.5
        assert forwarded["classes"] == ["dog"]

        assert isinstance(out, list)
        assert len(out) == 2

    def test_falls_through_to_super_when_vp_classes_none(self, monkeypatch):
        from fiftyone.utils import ultralytics as fu

        super_calls = []

        def fake_super_call(self, output, frame_size, **kwargs):
            super_calls.append({"output": output, "kwargs": kwargs})
            return [fol.Detections()]

        monkeypatch.setattr(
            fu.UltralyticsSegmentationOutputProcessor,
            "__call__",
            fake_super_call,
        )

        proc = fu.YOLOEVPSegmentationOutputProcessor(classes=["a"])

        sentinel_output = {"preds": "P", "imgs": "I", "orig_imgs": "OI"}

        proc(
            sentinel_output,
            (10, 20),
            confidence_thresh=0.7,
            classes=["a", "b"],
        )

        assert len(super_calls) == 1
        assert super_calls[0]["output"] is sentinel_output
        assert super_calls[0]["kwargs"]["confidence_thresh"] == 0.7
        assert super_calls[0]["kwargs"]["classes"] == ["a", "b"]


class TestGetYOLOEVPPredictor:
    def test_returns_predictor_class_when_available(self, monkeypatch):
        from fiftyone.utils import ultralytics as fu

        class _FakeYoloe:
            YOLOEVPSegPredictor = type("YOLOEVPSegPredictor", (), {})

        monkeypatch.setattr(fu, "_yoloe", _FakeYoloe())
        cls = fu._get_yoloe_vp_predictor()

        assert isinstance(cls, type)
        assert cls.__name__ == "YOLOEVPSegPredictor"

    def test_raises_attribute_error_when_missing(self, monkeypatch):
        from fiftyone.utils import ultralytics as fu

        class _BrokenYoloe:
            def __getattr__(self, name):
                raise AttributeError(name)

        monkeypatch.setattr(fu, "_yoloe", _BrokenYoloe())

        with pytest.raises(AttributeError, match="ultralytics>=8.4.0") as exc:
            fu._get_yoloe_vp_predictor()

        # `from e` chains the underlying AttributeError as __cause__.
        assert isinstance(exc.value.__cause__, AttributeError)


class TestFiftyOneYOLOEVPPredictAllIntegration:
    """End-to-end through build_get_item -> get_model_inputs_from_get_item ->
    predict_all."""

    def test_predict_all_via_get_item_dispatches_to_vp_path(
        self, tmp_path, monkeypatch
    ):
        import fiftyone.utils.torch as fout
        import torch
        from PIL import Image

        path_a = tmp_path / "a.png"
        path_b = tmp_path / "b.png"
        Image.new("RGB", (20, 10)).save(path_a)
        Image.new("RGB", (20, 10)).save(path_b)

        samples = [
            {
                "filepath": str(path_a),
                "ground_truth": fol.Detections(
                    detections=[
                        fol.Detection(
                            label="dog",
                            bounding_box=[0.0, 0.0, 0.5, 0.5],
                        )
                    ]
                ),
            },
            {
                "filepath": str(path_b),
                "ground_truth": fol.Detections(),
            },
        ]

        captured = []

        def fake_predict(img, **kwargs):
            captured.append(kwargs.get("visual_prompts"))

            class _R:
                names = None

            return [_R()]

        def fake_transform(img):
            return {
                "img": torch.zeros(3, 10, 20),
                "orig_img": np.array(img),
            }

        model = TestFiftyOneYOLOEVPVisualPrompts._make_model(
            monkeypatch, predict=fake_predict
        )
        model._transforms = fake_transform

        get_item = model.build_get_item(
            field_mapping={
                "filepath": "filepath",
                "prompt_field": "ground_truth",
            }
        )
        model_inputs = fout.get_model_inputs_from_get_item(samples, get_item)

        assert len(model_inputs) == 2
        assert {"img", "orig_img", "visual_prompts", "vp_classes"} <= set(
            model_inputs[0].keys()
        )

        outputs = model.predict_all(model_inputs)

        assert len(outputs) == 2
        # Only sample A had a non-empty prompt; sample B is a None-prompt
        # fall-through, so exactly one predict call was made.
        assert len(captured) == 1
        np.testing.assert_array_equal(captured[0]["cls"], np.array([0]))
        np.testing.assert_allclose(
            captured[0]["bboxes"], np.array([[0.0, 0.0, 10.0, 5.0]])
        )
        assert outputs[1].detections == []
        assert model._set_predictor_calls == [(model.config, model._model)]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
