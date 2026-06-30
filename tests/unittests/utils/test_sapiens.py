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
            fus.Sapiens2PoseModelConfig({"hf_repo": "facebook/not-a-real-repo"})

    def test_all_known_repos_accepted(self):
        for repo in fus._POSE_REPOS:
            assert fus.Sapiens2PoseModelConfig({"hf_repo": repo}).hf_repo == repo

    def test_type_inheritance(self):
        import fiftyone.utils.torch as fout
        import fiftyone.zoo.models as fozm

        config = fus.Sapiens2PoseModelConfig({})
        assert isinstance(config, fout.TorchImageModelConfig)
        assert isinstance(config, fozm.HasZooModel)


# ---------------------------------------------------------------------------
# GetItem (box prompt extraction)
# ---------------------------------------------------------------------------

class TestSapiens2PoseGetItem:
    def test_required_keys(self):
        item = fus.Sapiens2PoseGetItem()
        assert item.required_keys == ["filepath", "prompt_field"]

    def _write_image(self, tmp_path, w=100, h=80):
        import cv2

        path = str(tmp_path / "img.png")
        cv2.imwrite(path, np.zeros((h, w, 3), dtype=np.uint8))
        return path, w, h

    def test_boxes_from_prompt_field(self, tmp_path):
        path, w, h = self._write_image(tmp_path)
        prompt = fol.Detections(
            detections=[
                fol.Detection(label="person", bounding_box=[0.1, 0.2, 0.3, 0.4]),
                fol.Detection(label="person", bounding_box=[0.5, 0.5, 0.25, 0.25]),
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
        kpts = np.array([[10.0, 20.0], [30.0, 40.0], [50.0, 60.0], [70.0, 80.0]])
        scores = np.array([0.9, 0.8, 0.1, 0.95])
        model._keypoints_for_box = lambda image, bbox: (kpts, scores)

        imgs = [{"image": np.zeros((100, 100, 3), np.uint8),
                 "boxes": np.array([[0, 0, 99, 99]], dtype=np.float32)}]
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
        model._keypoints_for_box = lambda image, bbox: (kpts, scores)

        imgs = [{"image": np.zeros((80, 100, 3), np.uint8),  # h=80, w=100
                 "boxes": np.array([[0, 0, 99, 79]], dtype=np.float32)}]
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
        model._keypoints_for_box = lambda image, bbox: (kpts, scores)

        imgs = [{"image": np.zeros((10, 10, 3), np.uint8),
                 "boxes": np.array([[0, 0, 4, 4], [5, 5, 9, 9]], dtype=np.float32)}]
        out = model._predict_all(imgs)
        assert len(out[0].keypoints) == 2

    def test_single_dict_wrapped(self):
        model = self._bare_model()
        model._keypoints_for_box = lambda image, bbox: (
            np.array([[1.0, 1.0]]), np.array([0.9])
        )
        item = {"image": np.zeros((10, 10, 3), np.uint8),
                "boxes": np.array([[0, 0, 9, 9]], dtype=np.float32)}
        out = model._predict_all(item)
        assert len(out) == 1


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
            "zoo", "models", "manifest-torch.json",
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
        assert entries[name]["default_deployment_config_dict"]["type"] == \
            "fiftyone.utils.sapiens.Sapiens2PoseModel"

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
