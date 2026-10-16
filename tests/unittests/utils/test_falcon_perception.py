"""
Tests for fiftyone/utils/falcon_perception.py config validation, batching and
conversion of the release's predictions to detections.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from types import SimpleNamespace

import numpy as np
import pytest
import torch
from PIL import Image as PILImage

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.utils.falcon_perception as fou_fp
from fiftyone.utils.falcon_perception import (
    DEFAULT_FALCON_PERCEPTION_REVISION,
    FalconPerceptionModel,
    FalconPerceptionModelConfig,
)
from decorators import drop_datasets


def _image(w=40, h=30, shade=80):
    return PILImage.new("RGB", (w, h), color=(shade, shade, shade))


def _rle(rect, size):
    """A stand-in RLE: the release's dict shape, with the mask's rectangle
    as its counts"""
    return {"counts": "%d %d %d %d" % rect, "size": list(size)}


def _decode(rle):
    h, w = rle["size"]
    x0, y0, x1, y1 = (int(v) for v in rle["counts"].decode("utf-8").split())
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[y0:y1, x0:x1] = 1
    return mask


class _FakeRelease(object):
    """Stands in for the release: every query finds one instance, the left
    half of the image for "left" queries and the top half otherwise, and
    "nothing" finds an instance whose mask is empty"""

    def __init__(self):
        self.calls = []

    def eval(self):
        return self

    def generate(self, images, queries, **kwargs):
        self.calls.append(
            ([img.size for img in images], list(queries), kwargs)
        )
        results = []
        for img, query in zip(images, queries):
            w, h = img.size
            if query == "nothing":
                rle = {"counts": "", "size": [h, w]}
            elif query.startswith("left"):
                rle = _rle((0, 0, w // 2, h), (h, w))
            else:
                rle = _rle((0, 0, w, h // 2), (h, w))

            results.append(
                [
                    {
                        "xy": {"x": 0.5, "y": 0.25},
                        "hw": {"h": 0.5, "w": 1.0},
                        "mask_rle": rle,
                    }
                ]
            )

        return results


@pytest.fixture
def release(monkeypatch):
    """A stand-in for the release, loaded in place of the real model"""
    release = _FakeRelease()
    release.loads = []

    def from_pretrained(*args, **kwargs):
        release.loads.append((args, kwargs))
        return release

    monkeypatch.setattr(
        fou_fp,
        "transformers",
        SimpleNamespace(
            AutoModelForCausalLM=SimpleNamespace(
                from_pretrained=from_pretrained
            )
        ),
    )
    monkeypatch.setattr(fou_fp, "mask_utils", SimpleNamespace(decode=_decode))
    return release


def _model(d):
    return FalconPerceptionModel(
        FalconPerceptionModelConfig(dict(d, device="cpu"))
    )


class TestFalconPerceptionModelConfig:
    """Test config parsing and validation"""

    def test_defaults(self):
        config = FalconPerceptionModelConfig({"classes": ["car"]})

        assert config.name_or_path == "tiiuae/Falcon-Perception"
        assert config.revision == DEFAULT_FALCON_PERCEPTION_REVISION
        assert config.min_dimension == 256
        assert config.max_dimension == 1024
        assert config.max_new_tokens == 2048
        assert config.segm_threshold == 0.5
        assert config.queries_per_pass == 4
        assert config.compile is True
        assert config.dtype == "bfloat16"
        assert config.raw_inputs is True

    def test_other_repositories_have_no_default_revision(self):
        config = FalconPerceptionModelConfig(
            {"classes": ["car"], "name_or_path": "/models/falcon-local"}
        )

        assert config.revision is None

    def test_an_explicit_revision_is_kept(self):
        config = FalconPerceptionModelConfig(
            {"classes": ["car"], "revision": "main"}
        )

        assert config.revision == "main"

    @pytest.mark.parametrize(
        "d",
        [
            {"min_dimension": 0},
            {"min_dimension": 512, "max_dimension": 256},
            {"max_new_tokens": 0},
            {"queries_per_pass": 0},
            {"segm_threshold": 0},
            {"segm_threshold": 1.5},
            {"dtype": "int8"},
        ],
    )
    def test_invalid_settings_are_rejected(self, d):
        with pytest.raises(ValueError):
            FalconPerceptionModelConfig(dict(d, classes=["car"]))

    def test_model_needs_queries_before_loading(self, monkeypatch):
        """The queries are checked before any download is attempted"""

        def fail(*args, **kwargs):
            raise AssertionError("download attempted")

        monkeypatch.setattr(
            fou_fp,
            "transformers",
            SimpleNamespace(
                AutoModelForCausalLM=SimpleNamespace(from_pretrained=fail)
            ),
        )

        with pytest.raises(ValueError, match="classes"):
            FalconPerceptionModel(FalconPerceptionModelConfig({}))


class TestFalconPerceptionModel:
    """Test loading, batching and the conversion of predictions against a
    stand-in release"""

    def test_release_loads_with_its_own_code(self, release):
        _model({"classes": ["car"]})

        ((args, kwargs),) = release.loads
        assert args == ("tiiuae/Falcon-Perception",)
        assert kwargs == {
            "revision": DEFAULT_FALCON_PERCEPTION_REVISION,
            "trust_remote_code": True,
            "dtype": torch.bfloat16,
            "device_map": {"": "cpu"},
        }

    def test_the_release_can_load_in_float32(self, release):
        _model({"classes": ["car"], "dtype": "float32"})

        ((_, kwargs),) = release.loads
        assert kwargs["dtype"] is torch.float32

    def test_each_query_labels_its_instances(self, release):
        model = _model({"classes": ["left side", "top"]})

        detections = model.predict(_image(40, 30))

        assert [d.label for d in detections.detections] == ["left side", "top"]
        left, top = detections.detections
        assert left.bounding_box == pytest.approx([0, 0, 0.5, 1])
        assert top.bounding_box == pytest.approx([0, 0, 1, 0.5])
        assert left.mask.shape == (30, 20)
        assert left.mask.all()
        assert left.confidence is None

    def test_decoding_settings_reach_the_release(self, release):
        model = _model(
            {
                "classes": ["car"],
                "max_dimension": 512,
                "segm_threshold": 0.3,
                "compile": False,
            }
        )

        model.predict(_image())

        ((_, _, kwargs),) = release.calls
        assert kwargs == {
            "max_new_tokens": 2048,
            "min_dimension": 256,
            "max_dimension": 512,
            "compile": False,
            "segm_threshold": 0.3,
        }

    def test_queries_are_decoded_in_passes(self, release):
        model = _model({"classes": ["a", "b", "c"], "queries_per_pass": 4})

        labels = model.predict_all([_image(40, 30), _image(60, 20)])

        sizes = [len(queries) for _, queries, _ in release.calls]
        assert sizes == [4, 2]
        assert [[d.label for d in l.detections] for l in labels] == [
            ["a", "b", "c"],
            ["a", "b", "c"],
        ]

    def test_filter_classes_limit_the_queries(self, release):
        model = _model({"classes": ["a", "b", "c"], "filter_classes": ["b"]})

        detections = model.predict(_image())

        ((_, queries, _),) = release.calls
        assert queries == ["b"]
        assert [d.label for d in detections.detections] == ["b"]

    def test_an_empty_mask_keeps_the_predicted_box(self, release):
        model = _model({"classes": ["nothing"]})

        detection = model.predict(_image()).detections[0]

        assert detection.mask is None
        assert detection.bounding_box == pytest.approx([0, 0, 1, 0.5])

    def test_arrays_and_tensors_become_images(self, release):
        model = _model({"classes": ["top"]})

        model.predict(np.zeros((30, 40, 3), dtype=np.uint8))
        model.predict(torch.zeros(3, 30, 40, dtype=torch.uint8))

        assert [sizes for sizes, _, _ in release.calls] == [
            [(40, 30)],
            [(40, 30)],
        ]


class TestFalconPerceptionApplyModel:
    """Test that apply_model labels samples in batches"""

    @drop_datasets
    def test_samples_are_labelled_in_batches(self, release, tmp_path):
        model = _model({"classes": ["top"]})

        dataset = fo.Dataset()
        for i in range(3):
            path = str(tmp_path / ("%d.png" % i))
            _image(20 + 10 * i, 16).save(path)
            dataset.add_sample(fo.Sample(filepath=path))

        dataset.apply_model(
            model,
            label_field="falcon",
            batch_size=2,
            num_workers=0,
            skip_failures=False,
        )

        assert [len(sizes) for sizes, _, _ in release.calls] == [2, 1]
        assert dataset.count("falcon.detections") == 3
        assert dataset.distinct("falcon.detections.label") == ["top"]


class TestFalconPerceptionHelpers:
    """Test image normalization and box fallbacks, which need no model"""

    def test_channel_first_tensor_is_transposed(self):
        img = torch.zeros(3, 40, 60, dtype=torch.uint8)

        assert fou_fp._prepare_image(img).size == (60, 40)

    def test_a_box_past_the_border_is_clipped(self, monkeypatch):
        monkeypatch.setattr(
            fou_fp, "mask_utils", SimpleNamespace(decode=_decode)
        )
        prediction = {
            "xy": {"x": 0.95, "y": 0.1},
            "hw": {"h": 0.4, "w": 0.2},
            "mask_rle": {"counts": "", "size": [10, 10]},
        }

        detection = fou_fp._to_detection(prediction, "edge")

        assert detection.bounding_box == pytest.approx([0.85, 0, 0.15, 0.3])
        assert isinstance(detection, fol.Detection)
