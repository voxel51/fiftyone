"""
Complex-YOLOv3 model wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import numpy as np

import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.media as fom
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch
from torch.autograd import Variable

o3d = fou.lazy_import("open3d", callback=lambda: fou.ensure_import("open3d"))

from .model import ComplexYOLOv3


logger = logging.getLogger(__name__)


def apply_model(
    samples,
    model,
    feature_map_field,
    feature_group_slice=None,
    label_field="predictions",
    label_group_slice=None,
    bounds=None,
):
    """Wrapper for applying a :class:`TorchComplexYOLOv3Model` to a sample
    collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        model: a :class:`fiftyone.utils.complex_yolo.TorchComplexYOLOv3Model`
        feature_map_field: the field containing the feature maps to feed to the
            model
        feature_group_slice (None): the group slice containing the feature
            maps, if the collection is grouped
        label_field ("predictions"): the name of the field in which to store
            the model predictions
        label_group_slice (None): the group slice on which to store the
            predictions, if the collection is grouped
        bounds (None): optionl ``(min, max)`` bounds defining the field of view
            of the feature maps
    """
    model.predict_all(
        samples,
        feature_map_field,
        feature_group_slice=feature_group_slice,
        label_field=label_field,
        label_group_slice=label_group_slice,
        bounds=bounds,
    )


class TorchComplexYOLOv3ModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`TorchComplexYOLOv3Model`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        config_url: a URL from which the model's config can be downloaded,
            if necessary
        config_base_filename: the filename in ``fo.config.model_zoo_dir`` in
            which to store the model's config file
        nms_thresh (0.3) a non-maximum suppression threshold to use
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.config_url = self.parse_string(d, "config_url")
        self.config_base_filename = self.parse_string(
            d, "config_base_filename"
        )
        self.nms_thresh = self.parse_number(d, "nms_thresh", default=0.3)

        self._config_path = os.path.join(
            fo.config.model_zoo_dir, self.config_base_filename
        )

    @property
    def config_path(self):
        return self._config_path

    def download_config_if_necessary(self):
        if not os.path.isfile(self._config_path):
            logger.info("Downloading YOLOv3 config...")
            etaw.download_file(self.config_url, path=self._config_path)


class TorchComplexYOLOv3Model(fout.TorchImageModel):
    """Torch implementation of Complex-YOLOv3 from
    https://github.com/ghimiredhikura/Complex-YOLOv3.

    Args:
        config: a :class:`TorchComplexYOLOv3ModelConfig`
    """

    def __init__(self, config):
        super().__init__(config)

        self._Tensor = (
            torch.cuda.FloatTensor
            if torch.cuda.is_available()
            else torch.FloatTensor
        )
        self._device = torch.device(
            "cuda" if torch.cuda.is_available() else "cpu"
        )
        self._class_heights = None
        self._class_zs = None

    def _download_model(self, config):
        config.download_model_if_necessary()
        config.download_config_if_necessary()

    def _load_network(self, config):
        model = ComplexYOLOv3(config.config_path)
        model.load_state_dict(
            torch.load(
                config.model_path,
                map_location=torch.device(self._device),
            )
        )
        return model.eval().to(self._device).float()

    @property
    def preprocess(self):
        return False

    def set_class_heights(self, class_heights):
        self._class_heights = class_heights

    def set_class_zs(self, class_zs):
        self._class_zs = class_zs

    def predict_all(
        self,
        samples,
        feature_map_field,
        feature_group_slice=None,
        label_field="predictions",
        label_group_slice=None,
        bounds=None,
    ):
        is_grouped = samples.media_type == fom.GROUP
        if is_grouped:
            iter_samples = samples.iter_groups(progress=True)
        else:
            iter_samples = samples.iter_samples(progress=True)

        for sample_or_group in iter_samples:
            if is_grouped:
                feature_sample = sample_or_group[feature_group_slice]
                pred_sample = sample_or_group[label_group_slice]
            else:
                feature_sample = sample_or_group
                pred_sample = sample_or_group

            feature_map = np.einsum(
                "jki -> ijk",
                np.load(feature_sample[feature_map_field]),
            )
            feature_maps = torch.tensor(np.array([feature_map]))
            feature_maps = Variable(feature_maps.type(self._Tensor))
            preds = self._predict_all(feature_maps)

            bounds = self._get_bounds(bounds, pred_sample)
            detections = self._to_detections(preds, bounds)

            pred_sample[label_field] = fo.Detections(detections=detections)
            pred_sample.save()

    def _apply_non_maximum_suppression(self, preds):
        return self._model.nms(
            preds,
            self.config.confidence_thresh,
            self.config.nms_thresh,
        )

    def _predict_all(self, imgs):
        if self._device == "cuda":
            imgs = imgs.cuda()

        preds = self._model(imgs)
        return self._apply_non_maximum_suppression(preds)

    def _to_detections(self, preds, bounds):
        width, height = self.config.image_size
        min_bound, max_bound = bounds
        labels = self.classes

        # Add in h and z info
        preds = self._model.compute_height(
            preds,
            labels,
            class_height=self._class_heights,
            class_zs=self._class_zs,
        )
        if len(preds) == 0:
            return None

        detections = []
        for pred in preds[0]:
            # Read in params
            y, x, l, w, im, re, conf, cls_conf, cls_pred, h, z = pred

            # Rescale x, y, w, l
            x *= max_bound[0] / width
            y *= max_bound[1] / height
            w *= (max_bound[1] - min_bound[1]) / width
            l *= (max_bound[0] - min_bound[0]) / height

            # Compute rotation angle r_y in [-pi/2, pi/2]
            yaw = np.arctan2(im, re)
            ry = 3 * np.pi / 2 + yaw
            if ry > np.pi:
                ry -= 2 * np.pi

            rotation = [0, ry, 0]

            label = labels[int(cls_pred)]
            dimensions = [h, l, w]

            # Transform between coordinate systems
            x, y, z = -y, z, x
            location = [x, y, z]

            beta = np.arctan2(z, x)
            alpha = -np.sign(beta) * np.pi / 2 + beta + ry

            detection = fo.Detection(
                label=label,
                dimensions=dimensions,
                location=location,
                rotation=rotation,
                confidence=conf,
                alpha=alpha,
            )
            detections.append(detection)

        return detections

    def _get_bounds(self, bounds, pcd_sample):
        if bounds is None:
            bounds = (None, None)

        min_bound, max_bound = bounds

        if min_bound is None or max_bound is None:
            pcd_path = pcd_sample.filepath
            pcd_points = np.array(o3d.io.read_point_cloud(pcd_path).points)
            min_bound = np.amin(pcd_points, axis=0)
            max_bound = np.amax(pcd_points, axis=0)

        return min_bound, max_bound
