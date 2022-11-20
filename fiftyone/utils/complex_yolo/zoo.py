"""
Complex-YOLOv3 model wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
from pkg_resources import packaging
import warnings

import eta.core.web as etaw
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import math
import numpy as np
import open3d as o3d
import torch

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
Tensor = (
    torch.cuda.FloatTensor if torch.cuda.is_available() else torch.FloatTensor
)

from .model import build_model


logger = logging.getLogger(__name__)


class TorchComplexYOLOv3ModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`TorchComplexYOLOv3Model`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        config_base_filename: the filename in ``fo.config.model_zoo_dir`` in
            which to store the model's config file
        config_base_url: a URL from which the model's config can be downloaded,
            if necessary
        weights_base_filename: the filename in ``fo.config.model_zoo_dir`` in
            which to store the model's weights file
        weights_base_gid: a google drive ID from which the model's weights can be
            downloaded, if necessary
        classes (None): an optional list of custom classes to use for zero-shot
            prediction
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.config_base_filename = self.parse_string(
            d, "config_base_filename"
        )
        self.config_base_url = self.parse_string(d, "config_base_url")
        self.weights_base_filename = self.parse_string(
            d, "weights_base_filename"
        )
        self.weights_base_gid = self.parse_string(d, "weights_base_gid")
        self.weights_path = os.path.join(
            fo.config.model_zoo_dir, self.weights_base_filename
        )
        self.config_path = os.path.join(
            fo.config.model_zoo_dir, self.config_base_filename
        )
        self.device = device
        self.Tensor = Tensor
        self.labels = d["classes"].replace(" ", "").split(",")


class TorchComplexYOLOv3Model(fout.TorchImageModel):
    """Torch implementation of Complex-YOLOv3 from https://github.com/ghimiredhikura/Complex-YOLOv3.

    Args:
        config: a :class:`TorchComplexYOLOv3ModelConfig`
    """

    def __init__(self, config, args=dict()):
        self._device = device
        self.img_size = args.get("img_size", 608)
        self.nms_thresh = args.get("nms_thresh", 0.3)
        self.conf_thresh = args.get("conf_thresh", 0.9)
        super().__init__(config)
        self._labels = self.config.labels
        self._label_class_dict = {c: i for i, c in enumerate(self._labels)}

    def get_label(self, class_id):
        return (
            self._labels[class_id]
            if class_id < len(self._labels)
            else "DontCare"
        )

    def _download_weights_if_necessary(self, weights_base_gid, weights_path):
        if not os.path.isfile(weights_path):
            logger.info("Downloading YOLOv3 weights...")
            etaw.download_google_drive_file(
                weights_base_gid, path=weights_path
            )

    def _download_config_if_necessary(self, config_base_url, config_path):
        if not os.path.isfile(config_path):
            logger.info("Downloading YOLOv3 config...")
            etaw.download_file(config_base_url, path=config_path)

    def _download_model(self, config):
        self._download_config_if_necessary(
            config.config_base_url, config.config_path
        )
        self._download_weights_if_necessary(
            config.weights_base_gid, config.weights_path
        )

    def preprocess(self):
        return False

    def _load_network(self, config):
        m = build_model(config).to(device).float()
        self._model = m
        self._model._labels = self.config.labels
        self._model._label_class_dict = {
            c: i for i, c in enumerate(self._model._labels)
        }
        return m

    def set_class_heights(self, class_heights):
        self._model.class_heights = class_heights

    def set_class_zs(self, class_zs):
        self._model.class_zs = class_zs

    def _apply_non_maximum_suppression(self, preds):
        return self._model.nms(
            preds, conf_thresh=self.conf_thresh, nms_thresh=self.nms_thresh
        )

    def _get_bev_predictions(self, imgs):
        if self.device == "cuda":
            imgs = imgs.cuda()
        preds = self._model(imgs)
        preds = self._apply_non_maximum_suppression(preds)
        return preds

    def _convert_bev_to_pcd_detections(self, bev_preds, min_bound, max_bound):
        img_size = self.img_size
        detections = []

        ### Add in h and z info
        preds = self._model.compute_height(bev_preds)
        if len(preds) == 0:
            return None
        for i, pred in enumerate(preds[0]):
            ### Read in params
            y, x, l, w, im, re, conf, cls_conf, cls_pred, h, z = pred
            ### rescale x, y, w, l
            x, y, w, l = x / img_size, y / img_size, w / img_size, l / img_size
            w = w * (max_bound[1] - min_bound[1])
            l = l * (max_bound[0] - min_bound[0])
            y = y * (max_bound[1] - min_bound[1]) + min_bound[1]
            x = x * (max_bound[0] - min_bound[0]) + min_bound[0]

            ### Compute rotation angle r_y in [-pi/2, pi/2]
            yaw = np.arctan2(im, re)
            ry = 3 * np.pi / 2 + yaw
            if ry > np.pi:
                ry -= 2 * np.pi
            rotation = [0, ry, 0]

            label = self._labels[int(cls_pred)]
            dimensions = [h, l, w]

            ### Transform between coordinate systems
            x, y, z = -y, z, x
            location = [x, y, z]

            beta = np.arctan2(z, x)
            alpha = -np.sign(beta) * np.pi / 2 + beta + ry

            new_detection = fo.Detection(
                label=label,
                dimensions=dimensions,
                location=location,
                rotation=rotation,
                confidence=conf,
                alpha=alpha,
            )

            detections.append(new_detection)
        return detections

    def _get_group_pcd(self, sample, pcd_group_slice):
        group_id = sample.group.id
        dataset = sample._dataset
        pcd_sample_id = dataset.get_group(group_id)[pcd_group_slice].filepath
        dataset.group_slice = pcd_group_slice
        pcd_sample = dataset[pcd_sample_id]
        return pcd_sample

    def _get_bounds(self, min_bound, max_bound, pcd_sample):
        if min_bound is None or max_bound is None:
            pcd_path = pcd_sample.filepath
            pcd_points = np.array(o3d.io.read_point_cloud(pcd_path).points)
            min_bound = np.amin(pcd_points, axis=0)
            max_bound = np.amax(pcd_points, axis=0)
        return min_bound, max_bound

    def predict_all(
        self,
        dataset,
        feature_map_field="feature_map_filepath",
        pcd_group_slice="pcd",
        min_bound=None,
        max_bound=None,
    ):

        from torch.autograd import Variable

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        Tensor = (
            torch.cuda.FloatTensor
            if torch.cuda.is_available()
            else torch.FloatTensor
        )

        samples = dataset.select_group_slices("bev")

        with etau.ProgressBar() as pb:
            for sample in pb(samples):

                bev_map = np.einsum(
                    "jki -> ijk", np.load(sample[feature_map_field])
                )
                bev_maps = torch.tensor(np.array([bev_map]))
                input_imgs = Variable(bev_maps.type(Tensor))
                bev_preds = self._get_bev_predictions(input_imgs)

                pcd_sample = self._get_group_pcd(sample, pcd_group_slice)
                min_bound, max_bound = self._get_bounds(
                    min_bound, max_bound, pcd_sample
                )
                detections = self._convert_bev_to_pcd_detections(
                    bev_preds, min_bound, max_bound
                )
                pcd_sample["predictions"] = fo.Detections(
                    detections=detections
                )
                pcd_sample.save()


def apply_model(
    model,
    bev_samples,
    feature_map_field="feature_map_filepath",
    pcd_group_slice="pcd",
    min_bound=None,
    max_bound=None,
):
    """Wrapper for applying ComplexYOLOv3 model to a dataset or collection of samples and
        adding the generated 3d bbox detections to the corresponding point cloud (pcd)
        samples

    Args:
        model: a :class:`fiftyone.utils.complex_yolo.TorchComplexYOLOv3Model` object
        samples: a collection of :class:`fiftyone.core.sample.Sample` objects. Can be either a
            list, a Dataset, or a DatasetView. MUST be BEVs!
        feature_map_field: field on the samples in which to find the bird's eye view RGB maps
            that are inputs to model.predict_all(...)
        pcd_group_slice: group slice on which to add 3d bbox detections

    """
    from torch.autograd import Variable

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    Tensor = (
        torch.cuda.FloatTensor
        if torch.cuda.is_available()
        else torch.FloatTensor
    )

    model.predict_all(
        bev_samples, feature_map_field, pcd_group_slice, min_bound, max_bound
    )
