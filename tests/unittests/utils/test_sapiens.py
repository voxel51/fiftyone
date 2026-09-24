"""
Tests for fiftyone/utils/sapiens.py Sapiens2 pose wrapper.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
from unittest.mock import MagicMock

import numpy as np
import pytest

import fiftyone.core.labels as fol
import fiftyone.utils.sapiens as fus


@pytest.fixture(autouse=True)
def _mock_sapiens_deps():
    """Replace lazy-import proxies so tests never trigger the git install."""
    orig = (fus.sapiens, fus._sapiens_pose_models, fus._sapiens_pose_datasets)
    fus.sapiens = MagicMock()
    fus._sapiens_pose_models = MagicMock()
    fus._sapiens_pose_datasets = MagicMock()
    yield
    fus.sapiens, fus._sapiens_pose_models, fus._sapiens_pose_datasets = orig


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


class TestSapiens2PoseModelConfig:
    def test_default_repo(self):
        config = fus.Sapiens2PoseModelConfig({})
        assert config.hf_repo == "facebook/sapiens2-pose-1b"

    def test_default_keypoint_thresh(self):
        config = fus.Sapiens2PoseModelConfig({})
        assert config.keypoint_thresh == 0.3

    def test_raw_inputs(self):
        config = fus.Sapiens2PoseModelConfig({})
        assert config.raw_inputs is True

    def test_custom_repo(self):
        config = fus.Sapiens2PoseModelConfig(
            {"hf_repo": "facebook/sapiens2-pose-0.4b"}
        )
        assert config.hf_repo == "facebook/sapiens2-pose-0.4b"

    def test_custom_keypoint_thresh(self):
        config = fus.Sapiens2PoseModelConfig({"keypoint_thresh": 0.5})
        assert config.keypoint_thresh == 0.5

    def test_invalid_repo_raises(self):
        with pytest.raises(ValueError, match="Unsupported hf_repo"):
            fus.Sapiens2PoseModelConfig(
                {"hf_repo": "facebook/not-a-real-repo"}
            )

    @pytest.mark.parametrize("thresh", [-0.1, 1.1])
    def test_out_of_range_keypoint_thresh_raises(self, thresh):
        with pytest.raises(ValueError, match="keypoint_thresh"):
            fus.Sapiens2PoseModelConfig({"keypoint_thresh": thresh})

    @pytest.mark.parametrize("thresh", [0.0, 1.0])
    def test_boundary_keypoint_thresh_accepted(self, thresh):
        config = fus.Sapiens2PoseModelConfig({"keypoint_thresh": thresh})
        assert config.keypoint_thresh == thresh

    def test_all_known_repos_accepted(self):
        for repo in fus._POSE_REPOS:
            assert (
                fus.Sapiens2PoseModelConfig({"hf_repo": repo}).hf_repo == repo
            )

    def test_type_inheritance(self):
        import fiftyone.utils.torch as fout
        import fiftyone.zoo.models as fozm

        config = fus.Sapiens2PoseModelConfig({})
        assert isinstance(config, fout.TorchImageModelConfig)
        assert isinstance(config, fozm.HasZooModel)

    def test_default_box_batch_size(self):
        assert fus.Sapiens2PoseModelConfig({}).box_batch_size == 8

    def test_custom_box_batch_size(self):
        config = fus.Sapiens2PoseModelConfig({"box_batch_size": 2})
        assert config.box_batch_size == 2

    @pytest.mark.parametrize("size", [0, -1])
    def test_non_positive_box_batch_size_raises(self, size):
        with pytest.raises(ValueError, match="box_batch_size"):
            fus.Sapiens2PoseModelConfig({"box_batch_size": size})


# ---------------------------------------------------------------------------
# GetItem (box prompt extraction)
# ---------------------------------------------------------------------------


class TestSapiens2PoseGetItem:
    def test_required_keys_without_prompt(self):
        item = fus.Sapiens2PoseGetItem()
        assert item.required_keys == ["filepath"]
        assert "prompt_field" not in item.field_mapping

    def test_required_keys_with_prompt(self):
        item = fus.Sapiens2PoseGetItem(
            field_mapping={"prompt_field": "persons"}
        )
        assert item.required_keys == ["filepath", "prompt_field"]
        assert item.field_mapping["prompt_field"] == "persons"

    def _write_image(self, tmp_path, w=100, h=80):
        import cv2

        path = str(tmp_path / "img.png")
        cv2.imwrite(path, np.zeros((h, w, 3), dtype=np.uint8))
        return path, w, h

    def test_boxes_from_prompt_field(self, tmp_path):
        path, w, h = self._write_image(tmp_path)
        prompt = fol.Detections(
            detections=[
                fol.Detection(
                    label="person", bounding_box=[0.1, 0.2, 0.3, 0.4]
                ),
                fol.Detection(
                    label="person", bounding_box=[0.5, 0.5, 0.25, 0.25]
                ),
            ]
        )
        out = fus.Sapiens2PoseGetItem()(
            {"filepath": path, "prompt_field": prompt}
        )
        assert out["image"].shape == (h, w, 3)
        assert out["boxes"].shape == (2, 4)
        # First box: x1,y1,x2,y2 in pixels
        np.testing.assert_allclose(
            out["boxes"][0],
            [0.1 * w, 0.2 * h, 0.4 * w, 0.6 * h],
            rtol=1e-5,
        )

    def test_whole_image_fallback_when_no_prompt(self, tmp_path):
        path, w, h = self._write_image(tmp_path)
        out = fus.Sapiens2PoseGetItem()(
            {"filepath": path, "prompt_field": None}
        )
        assert out["boxes"].shape == (1, 4)
        np.testing.assert_allclose(out["boxes"][0], [0, 0, w - 1, h - 1])

    def test_whole_image_fallback_when_empty_detections(self, tmp_path):
        path, w, h = self._write_image(tmp_path)
        out = fus.Sapiens2PoseGetItem()(
            {"filepath": path, "prompt_field": fol.Detections()}
        )
        assert out["boxes"].shape == (1, 4)

    def test_unreadable_image_raises(self):
        with pytest.raises(ValueError, match="Could not read image"):
            fus.Sapiens2PoseGetItem()(
                {"filepath": "/no/such/file.png", "prompt_field": None}
            )


# ---------------------------------------------------------------------------
# _predict_all output (mocked per-box inference)
# ---------------------------------------------------------------------------


class TestSapiens2PosePredict:
    def _bare_model(self, thresh=0.3):
        model = fus.Sapiens2PoseModel.__new__(fus.Sapiens2PoseModel)
        model._keypoint_thresh = thresh
        return model

    def test_outputs_keypoints_label(self):
        model = self._bare_model()
        # 4 keypoints: two strong, one weak, one strong
        kpts = np.array(
            [[10.0, 20.0], [30.0, 40.0], [50.0, 60.0], [70.0, 80.0]]
        )
        scores = np.array([0.9, 0.8, 0.1, 0.95])
        model._keypoints_for_boxes = lambda image, boxes: (
            [kpts] * len(boxes),
            [scores] * len(boxes),
        )

        imgs = [
            {
                "image": np.zeros((100, 100, 3), np.uint8),
                "boxes": np.array([[0, 0, 99, 99]], dtype=np.float32),
            }
        ]
        out = model._predict_all(imgs)

        assert len(out) == 1
        assert isinstance(out[0], fol.Keypoints)
        assert len(out[0].keypoints) == 1
        kp = out[0].keypoints[0]
        assert kp.label == "person"
        assert len(kp.points) == 4
        assert len(kp.confidence) == 4

    def test_normalization_and_thresholding(self):
        model = self._bare_model(thresh=0.3)
        kpts = np.array([[10.0, 20.0], [50.0, 60.0]])
        scores = np.array([0.9, 0.1])  # second below threshold
        model._keypoints_for_boxes = lambda image, boxes: (
            [kpts] * len(boxes),
            [scores] * len(boxes),
        )

        imgs = [
            {
                "image": np.zeros((80, 100, 3), np.uint8),  # h=80, w=100
                "boxes": np.array([[0, 0, 99, 79]], dtype=np.float32),
            }
        ]
        kp = model._predict_all(imgs)[0].keypoints[0]

        # First point normalized by (w, h)
        assert kp.points[0][0] == pytest.approx(0.1)
        assert kp.points[0][1] == pytest.approx(0.25)
        # Second point below threshold -> NaN, but confidence preserved
        assert np.isnan(kp.points[1][0]) and np.isnan(kp.points[1][1])
        assert kp.confidence[0] == pytest.approx(0.9)
        assert kp.confidence[1] == pytest.approx(0.1)

    def test_one_keypoint_object_per_box(self):
        model = self._bare_model()
        kpts = np.array([[1.0, 1.0]])
        scores = np.array([0.9])
        model._keypoints_for_boxes = lambda image, boxes: (
            [kpts] * len(boxes),
            [scores] * len(boxes),
        )

        imgs = [
            {
                "image": np.zeros((10, 10, 3), np.uint8),
                "boxes": np.array(
                    [[0, 0, 4, 4], [5, 5, 9, 9]], dtype=np.float32
                ),
            }
        ]
        out = model._predict_all(imgs)
        assert len(out[0].keypoints) == 2

    def test_single_dict_wrapped(self):
        model = self._bare_model()
        model._keypoints_for_boxes = lambda image, boxes: (
            [np.array([[1.0, 1.0]])] * len(boxes),
            [np.array([0.9])] * len(boxes),
        )
        item = {
            "image": np.zeros((10, 10, 3), np.uint8),
            "boxes": np.array([[0, 0, 9, 9]], dtype=np.float32),
        }
        out = model._predict_all(item)
        assert len(out) == 1


# ---------------------------------------------------------------------------
# Batched inference through the sapiens model boundary
# ---------------------------------------------------------------------------


class _FakePoseNet:
    """Stands in for the sapiens top-down estimator: each crop is filled with
    its box's index, and each crop's heatmaps carry that index."""

    def __init__(self, num_keypoints=2):
        self.num_keypoints = num_keypoints
        self.batch_sizes = []
        self.metas = []

    def pipeline(self, data_info):
        import torch

        x1, y1, x2, y2 = (float(v) for v in data_info["bbox"][0])
        meta = {
            "input_size": np.array([[768.0, 1024.0]]),
            "bbox_center": np.array([[(x1 + x2) / 2, (y1 + y2) / 2]]),
            "bbox_scale": np.array([[x2 - x1, y2 - y1]]),
        }
        index = len(self.metas)
        self.metas.append(meta)
        return {
            "inputs": torch.full((3, 4, 3), index, dtype=torch.uint8),
            "data_samples": {"meta": meta},
        }

    def data_preprocessor(self, data):
        return {
            "inputs": data["inputs"].float()[None],
            "data_samples": data["data_samples"],
        }

    def __call__(self, inputs):
        self.batch_sizes.append(inputs.shape[0])
        index = inputs.mean(dim=(1, 2, 3))
        return (
            index[:, None, None, None]
            .expand(-1, self.num_keypoints, 2, 2)
            .clone()
        )


class _FakeCodec:
    """Decodes a crop's heatmaps to two crop points: the crop centre shifted
    right by the box index, and the crop origin."""

    def decode(self, heatmaps):
        index = float(heatmaps[0, 0, 0])
        kpts = np.array([[[384.0 + index, 512.0], [0.0, 0.0]]])
        scores = np.array([[0.9, 0.1]])
        return kpts, scores


class TestSapiens2PoseBatchedInference:
    def _model(self, box_batch_size=8, thresh=0.3):
        model = fus.Sapiens2PoseModel.__new__(fus.Sapiens2PoseModel)
        model._model = _FakePoseNet()
        model._codec = _FakeCodec()
        model._device = "cpu"
        model._box_batch_size = box_batch_size
        model._keypoint_thresh = thresh
        return model

    def test_crop_points_map_back_to_each_box(self):
        model = self._model()
        boxes = np.array(
            [[10, 20, 110, 220], [300, 40, 340, 120]], dtype=np.float32
        )
        image = np.zeros((400, 500, 3), np.uint8)

        keypoints, scores = model._keypoints_for_boxes(image, boxes)

        # The crop origin lands on each box's top-left corner
        np.testing.assert_allclose(keypoints[0][1], [10, 20])
        np.testing.assert_allclose(keypoints[1][1], [300, 40])
        # The crop centre lands on each box's centre, shifted by the index
        np.testing.assert_allclose(keypoints[0][0], [60, 120])
        np.testing.assert_allclose(keypoints[1][0], [320 + 40 / 768, 80])
        np.testing.assert_allclose(scores[0], [0.9, 0.1])
        np.testing.assert_allclose(scores[1], [0.9, 0.1])

    def test_one_forward_pass_for_all_boxes(self):
        model = self._model(box_batch_size=8)
        boxes = np.array([[0, 0, 10, 10]] * 3, dtype=np.float32)

        model._keypoints_for_boxes(np.zeros((20, 20, 3), np.uint8), boxes)

        assert model._model.batch_sizes == [3]

    def test_boxes_run_in_chunks_and_keep_their_order(self):
        model = self._model(box_batch_size=2)
        boxes = np.array(
            [[10 * i, 5 * i, 10 * i + 40, 5 * i + 80] for i in range(5)],
            dtype=np.float32,
        )

        keypoints, _ = model._keypoints_for_boxes(
            np.zeros((200, 200, 3), np.uint8), boxes
        )

        assert model._model.batch_sizes == [2, 2, 1]
        for i, (x1, y1, x2, y2) in enumerate(boxes):
            np.testing.assert_allclose(keypoints[i][1], [x1, y1])
            np.testing.assert_allclose(
                keypoints[i][0][0], (x1 + x2) / 2 + i * 40 / 768
            )

    def test_predict_all_normalizes_and_thresholds(self):
        model = self._model(thresh=0.3)
        item = {
            "image": np.zeros((400, 500, 3), np.uint8),
            "boxes": np.array([[10, 20, 110, 220]], dtype=np.float32),
        }

        kp = model._predict_all([item])[0].keypoints[0]

        assert kp.points[0][0] == pytest.approx(60 / 500)
        assert kp.points[0][1] == pytest.approx(120 / 400)
        # The second point scores 0.1, under the threshold
        assert np.isnan(kp.points[1][0]) and np.isnan(kp.points[1][1])
        assert kp.confidence == pytest.approx([0.9, 0.1])


class TestSapiens2PoseCodec:
    def test_codec_built_from_config_without_type(self):
        model = fus.Sapiens2PoseModel.__new__(fus.Sapiens2PoseModel)
        codec_cfg = {
            "type": "UDPHeatmap",
            "input_size": (768, 1024),
            "heatmap_size": (192, 256),
            "sigma": 6,
        }
        model._model = MagicMock()
        model._model.cfg.codec = codec_cfg

        codec = model._build_codec()

        udp = fus._sapiens_pose_datasets.UDPHeatmap
        udp.assert_called_once_with(
            input_size=(768, 1024), heatmap_size=(192, 256), sigma=6
        )
        assert codec is udp.return_value
        assert codec_cfg["type"] == "UDPHeatmap"


class TestSapiens2PoseLoadModel:
    def _package(self, tmp_path, config_dirs):
        root = tmp_path / "sapiens"
        for sub, name in config_dirs:
            path = root / "pose" / "configs" / "keypoints308" / sub
            path.mkdir(parents=True, exist_ok=True)
            (path / name).write_text("")
        fus.sapiens.__file__ = str(root / "__init__.py")
        return root

    def _load(self, monkeypatch, repo="facebook/sapiens2-pose-0.4b"):
        import huggingface_hub

        downloads = []

        def fake_download(repo_id, filename, revision=None):
            downloads.append((repo_id, filename, revision))
            return "ckpt.safetensors"

        monkeypatch.setattr(huggingface_hub, "hf_hub_download", fake_download)
        model = fus.Sapiens2PoseModel.__new__(fus.Sapiens2PoseModel)
        model._device = "cpu"
        config = fus.Sapiens2PoseModelConfig({"hf_repo": repo})
        return model, model._load_model(config), downloads

    def test_pinned_checkpoint_and_first_sorted_config(
        self, tmp_path, monkeypatch
    ):
        root = self._package(
            tmp_path,
            [
                ("b_set", "sapiens2_0.4b_keypoints308_b-1024x768.py"),
                ("a_set", "sapiens2_0.4b_keypoints308_a-1024x768.py"),
                ("a_set", "sapiens2_1b_keypoints308_a-1024x768.py"),
            ],
        )

        model, loaded, downloads = self._load(monkeypatch)

        arch, filename, revision = fus._POSE_REPOS[
            "facebook/sapiens2-pose-0.4b"
        ]
        assert downloads == [
            ("facebook/sapiens2-pose-0.4b", filename, revision)
        ]
        expected = str(
            root
            / "pose"
            / "configs"
            / "keypoints308"
            / "a_set"
            / "sapiens2_0.4b_keypoints308_a-1024x768.py"
        )
        assert os.path.normcase(model._config_path) == os.path.normcase(
            expected
        )
        init_model = fus._sapiens_pose_models.init_model
        init_model.assert_called_once_with(
            model._config_path, "ckpt.safetensors", device="cpu"
        )
        assert loaded is init_model.return_value

    def test_missing_config_raises(self, tmp_path, monkeypatch):
        self._package(
            tmp_path, [("a_set", "sapiens2_1b_keypoints308_a-1024x768.py")]
        )

        with pytest.raises(ValueError, match="keypoints308 config"):
            self._load(monkeypatch)


class TestSapiens2PoseCollate:
    def test_collate_is_passthrough(self):
        batch = [{"image": 1}, {"image": 2}]
        assert fus.Sapiens2PoseModel.collate_fn(batch) is batch


# ---------------------------------------------------------------------------
# Manifest entry
# ---------------------------------------------------------------------------

_POSE_MODELS = [
    ("sapiens2-0.4b-pose-torch", "facebook/sapiens2-pose-0.4b"),
    ("sapiens2-0.8b-pose-torch", "facebook/sapiens2-pose-0.8b"),
    ("sapiens2-1b-pose-torch", "facebook/sapiens2-pose-1b"),
    ("sapiens2-5b-pose-torch", "facebook/sapiens2-pose-5b"),
]


class TestManifestEntry:
    @pytest.fixture(scope="class")
    def entries(self):
        import json
        import fiftyone

        path = os.path.join(
            os.path.dirname(fiftyone.__file__),
            "zoo",
            "models",
            "manifest-torch.json",
        )
        with open(path) as f:
            data = json.load(f)
        return {m["base_name"]: m for m in data["models"]}

    def test_all_four_registered(self, entries):
        for name, _ in _POSE_MODELS:
            assert name in entries, name
        # The wrapper must support every registered repo.
        assert set(fus._POSE_REPOS) == {repo for _, repo in _POSE_MODELS}

    @pytest.mark.parametrize("name,repo", _POSE_MODELS)
    def test_type_path(self, entries, name, repo):
        assert (
            entries[name]["default_deployment_config_dict"]["type"]
            == "fiftyone.utils.sapiens.Sapiens2PoseModel"
        )

    @pytest.mark.parametrize("name,repo", _POSE_MODELS)
    def test_keypoints_tag(self, entries, name, repo):
        assert "keypoints" in entries[name]["tags"]

    @pytest.mark.parametrize("name,repo", _POSE_MODELS)
    def test_repo_wired(self, entries, name, repo):
        cfg = entries[name]["default_deployment_config_dict"]["config"]
        assert cfg["hf_repo"] == repo
        assert repo in entries[name]["source"]

    @pytest.mark.parametrize("name,repo", _POSE_MODELS)
    def test_size_bytes_reasonable(self, entries, name, repo):
        assert 1_000_000_000 < entries[name]["size_bytes"] < 30_000_000_000


if __name__ == "__main__":
    import sys

    sys.exit(pytest.main([__file__, "-v"]))
