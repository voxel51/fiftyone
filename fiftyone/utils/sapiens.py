"""
`Sapiens2 <https://github.com/facebookresearch/sapiens2>`_ wrapper for the
FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import glob
import logging
import os

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)

DEFAULT_SAPIENS2_POSE_REPO = "facebook/sapiens2-pose-1b"

# Maps each pose repo to (backbone arch token, checkpoint filename, revision).
# The arch token selects the shipped keypoints308 config inside the installed
# package; the revision pins the weights this wrapper was validated against.
_POSE_REPOS = {
    "facebook/sapiens2-pose-0.4b": (
        "sapiens2_0.4b",
        "sapiens2_0.4b_pose.safetensors",
        "73572e121602e8a6eb40eb841732e88f386d250b",
    ),
    "facebook/sapiens2-pose-0.8b": (
        "sapiens2_0.8b",
        "sapiens2_0.8b_pose.safetensors",
        "76f06b9854d04bb1e59e0624de39b1e8921b12aa",
    ),
    "facebook/sapiens2-pose-1b": (
        "sapiens2_1b",
        "sapiens2_1b_pose.safetensors",
        "f5fed8b97b99698d5eea1d14ff0855d0b4c3f000",
    ),
    "facebook/sapiens2-pose-5b": (
        "sapiens2_5b",
        "sapiens2_5b_pose.safetensors",
        "ada1f29aa1fd454ca28665c700923a0101b6b24f",
    ),
}

# Pinned so the installed code is the revision this wrapper was built against
_SAPIENS_REV = "7e5bae88456ac418ff0e58e74106c9fe192055d4"
_SAPIENS_REQ = (
    "sapiens @ git+https://github.com/facebookresearch/sapiens2.git@%s"
    % _SAPIENS_REV
)


def _ensure_sapiens():
    if not fou.ensure_package("sapiens", error_level=2):
        fou.install_package(_SAPIENS_REQ)


sapiens = fou.lazy_import("sapiens", callback=_ensure_sapiens)
_sapiens_pose_models = fou.lazy_import(
    "sapiens.pose.models", callback=_ensure_sapiens
)
_sapiens_pose_datasets = fou.lazy_import(
    "sapiens.pose.datasets", callback=_ensure_sapiens
)


class Sapiens2PoseGetItem(fout.GetItem):
    """Loads the raw image and person box prompts for Sapiens2 pose.

    Sapiens2 pose is top-down: it estimates keypoints inside person boxes.
    Boxes come from a ``prompt_field`` of :class:`fiftyone.core.labels.Detections`;
    when none are present the full image is used as a single box, matching the
    upstream demo's detector fallback.
    """

    def __init__(self, field_mapping=None, **kwargs):
        # Only require the prompt field when the caller supplies one; without
        # it the whole image is used as a single box
        self._has_prompt = bool(
            field_mapping and "prompt_field" in field_mapping
        )
        super().__init__(field_mapping=field_mapping, **kwargs)

    @property
    def required_keys(self):
        if self._has_prompt:
            return ["filepath", "prompt_field"]

        return ["filepath"]

    def __call__(self, d):
        import cv2

        image = cv2.imread(d["filepath"])  # BGR uint8, sapiens' expected input
        if image is None:
            raise ValueError("Could not read image '%s'" % d["filepath"])

        h, w = image.shape[:2]
        boxes = []
        prompt = d.get("prompt_field")
        if prompt is not None and getattr(prompt, "detections", None):
            for det in prompt.detections:
                x, y, bw, bh = det.bounding_box
                boxes.append([x * w, y * h, (x + bw) * w, (y + bh) * h])

        if not boxes:
            boxes = [[0.0, 0.0, w - 1.0, h - 1.0]]

        return {"image": image, "boxes": np.asarray(boxes, dtype=np.float32)}


class Sapiens2PoseModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`Sapiens2PoseModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        hf_repo ("facebook/sapiens2-pose-1b"): the HuggingFace pose repo to load
        keypoint_thresh (0.3): per-keypoint confidence below which a point is
            marked not-visible (NaN)
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.hf_repo = self.parse_string(
            d, "hf_repo", default=DEFAULT_SAPIENS2_POSE_REPO
        )
        if self.hf_repo not in _POSE_REPOS:
            raise ValueError(
                "Unsupported hf_repo '%s'; expected one of %s"
                % (self.hf_repo, ", ".join(sorted(_POSE_REPOS)))
            )
        self.keypoint_thresh = self.parse_number(
            d, "keypoint_thresh", default=0.3
        )
        if not 0.0 <= self.keypoint_thresh <= 1.0:
            raise ValueError(
                "keypoint_thresh must be in [0, 1]; got %s"
                % self.keypoint_thresh
            )

        # Sapiens runs its own preprocessing pipeline on raw image + boxes
        self.raw_inputs = True


class Sapiens2PoseModel(fout.TorchImageModel, fom.SupportsGetItem):
    """Wrapper for `Sapiens2 <https://github.com/facebookresearch/sapiens2>`_
    308-keypoint whole-body pose estimation.

    Sapiens2 is a family of human-centric vision transformers pretrained on 1B
    human images. This wrapper runs the top-down pose head, producing 308
    whole-body keypoints (body, face, hands, feet) per person.

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=10)

        detector = foz.load_zoo_model("yolov8n-coco-torch")
        dataset.apply_model(detector, label_field="persons")

        model = foz.load_zoo_model("sapiens2-1b-pose-torch")
        dataset.apply_model(
            model, label_field="pose", prompt_field="persons"
        )

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`Sapiens2PoseModelConfig`
    """

    def __init__(self, config):
        super().__init__(config)
        self._keypoint_thresh = config.keypoint_thresh
        self._codec = self._build_codec()

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        from huggingface_hub import hf_hub_download

        arch, filename, revision = _POSE_REPOS[config.hf_repo]
        ckpt = hf_hub_download(config.hf_repo, filename, revision=revision)

        pkg_dir = os.path.dirname(sapiens.__file__)
        pose_dir = os.path.join(pkg_dir, "pose")
        pattern = os.path.join(
            pose_dir,
            "configs",
            "keypoints308",
            "**",
            "%s_keypoints308_*-1024x768.py" % arch,
        )
        matches = glob.glob(pattern, recursive=True)
        if not matches:
            raise ValueError(
                "Could not find a keypoints308 config for '%s' in the "
                "installed sapiens package" % arch
            )
        self._config_path = matches[0]

        return _sapiens_pose_models.init_model(
            self._config_path, ckpt, device=str(self._device)
        )

    def _build_codec(self):
        codec_cfg = dict(self._model.cfg.codec)
        codec_cfg.pop("type", None)
        return _sapiens_pose_datasets.UDPHeatmap(**codec_cfg)

    @property
    def media_type(self):
        return "image"

    @property
    def ragged_batches(self):
        return False

    @property
    def has_collate_fn(self):
        return True

    @staticmethod
    def collate_fn(batch):
        # Keep raw per-sample dicts as a list; sapiens runs its own pipeline.
        return batch

    def build_get_item(self, field_mapping=None):
        return Sapiens2PoseGetItem(field_mapping=field_mapping)

    def _keypoints_for_box(self, image, bbox):
        data_info = dict(
            img=image,
            bbox=bbox[None],
            bbox_score=np.ones(1, dtype=np.float32),
        )
        data = self._model.data_preprocessor(self._model.pipeline(data_info))
        inputs = data["inputs"]
        if inputs.ndim == 3:
            inputs = inputs[None]
        data_samples = data["data_samples"]

        with torch.no_grad():
            pred = self._model(inputs.to(self._device)).cpu().numpy()

        kpts, scores = self._codec.decode(pred[0])
        meta = data_samples["meta"]
        kpts = (
            kpts / meta["input_size"] * meta["bbox_scale"]
            + meta["bbox_center"]
            - 0.5 * meta["bbox_scale"]
        )
        return kpts[0], scores[0]

    def _predict_all(self, imgs):
        if not isinstance(imgs, list):
            imgs = [imgs]

        results = []
        for item in imgs:
            image = item["image"]
            h, w = image.shape[:2]
            boxes = item["boxes"]

            keypoints = []
            for bbox in boxes:
                kpts, scores = self._keypoints_for_box(image, bbox)
                points = []
                confs = []
                for (x, y), s in zip(kpts, scores):
                    if s < self._keypoint_thresh:
                        points.append((float("nan"), float("nan")))
                    else:
                        points.append((float(x) / w, float(y) / h))
                    confs.append(float(s))
                keypoints.append(
                    fol.Keypoint(
                        label="person",
                        points=points,
                        confidence=confs,
                    )
                )

            results.append(fol.Keypoints(keypoints=keypoints))

        return results
