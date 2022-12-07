"""
Complex-YOLOv3 model wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import math
import logging
import warnings
from pkg_resources import packaging

import numpy as np
import torch

import eta.core.web as etaw
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.media as fom
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm
import fiftyone.core.validation as fov
from .model import _build_model

o3d = fou.lazy_import("open3d", callback=lambda: fou.ensure_package("open3d"))

fou.ensure_torch()
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
Tensor = (
    torch.cuda.FloatTensor if torch.cuda.is_available() else torch.FloatTensor
)


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
        args needs to include
            z_dict and height_dict specifying by class info
            about the dimension perpendicular to BEV plane
    """

    def __init__(self, config, args=dict()):
        self._device = device
        img_size = args.get("img_size", (608, 608))
        self.img_width, self.img_height = img_size

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
        m = _build_model(config).to(device).float()
        self._model = m
        self._model._labels = self.config.labels
        self._model._label_class_dict = {
            c: i for i, c in enumerate(self._model._labels)
        }
        return m

    def set_class_heights(self, class_heights):
        """
        set width of bbox in z dimension by class.

        Input should by a dict with one entry per class label.
        """
        self._model.class_heights = class_heights

    def set_class_zs(self, class_zs):
        """
        set location of bbox on z axis by class.

        Input should by a dict with one entry per class label.
        """
        self._model.class_zs = class_zs

    def _apply_non_maximum_suppression(self, preds):
        return self._model._nms(
            preds, conf_thresh=self.conf_thresh, nms_thresh=self.nms_thresh
        )

    def _get_bev_predictions(self, imgs):
        if self.device == "cuda":
            imgs = imgs.cuda()
        preds = self._model(imgs)
        preds = self._apply_non_maximum_suppression(preds)
        return preds

    def _convert_bev_to_pcd_detections(self, bev_preds, min_bound, max_bound):
        detections = []

        ### Add in h and z info
        preds = self._model._compute_height(bev_preds)
        if len(preds) == 0:
            return None
        for i, pred in enumerate(preds[0]):
            ### Read in params
            y, x, l, w, im, re, conf, cls_conf, cls_pred, h, z = pred
            ### rescale x, y, w, l
            x, y, w, l = (
                x / self.img_width,
                y / self.img_height,
                w / self.img_width,
                l / self.img_height,
            )
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

    def _get_bounds(self, min_bound, max_bound, pcd_sample):
        if min_bound is None or max_bound is None:
            pcd_path = pcd_sample.filepath
            pcd_points = np.array(o3d.io.read_point_cloud(pcd_path).points)
            min_bound = np.amin(pcd_points, axis=0)
            max_bound = np.amax(pcd_points, axis=0)
        return min_bound, max_bound

    def predict_all(
        self,
        samples,
        in_map_field,
        in_group_slice=None,
        out_group_slice=None,
        out_field=None,
        bounds=None,
    ):

        from torch.autograd import Variable

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        Tensor = (
            torch.cuda.FloatTensor
            if torch.cuda.is_available()
            else torch.FloatTensor
        )

        if bounds is None:
            min_bound, max_bound = None, None
        else:
            min_bound, max_bound = bounds

        if out_field is None:
            out_field = "predictions"

        if in_group_slice is not None or out_group_slice is not None:
            fov.validate_collection(samples, media_type=fom.GROUP)

        if samples.media_type == fom.GROUP:
            if out_group_slice is None:
                out_group_slice = _get_point_cloud_slice(samples)
            point_cloud_view = samples.select_group_slices(out_group_slice)
            group_field = samples.group_field
        else:
            point_cloud_view = samples
            group_field = None

        if in_group_slice is None and samples.media_type == fom.GROUP:
            in_group_slice = "bev"
            in_group_view = samples.select_group_slices(in_group_slice)
        else:
            in_group_view = samples

        def _get_feature_map_filepath(sample):
            if samples.media_type != fom.GROUP:
                return sample[in_map_field]
            else:
                return samples.get_group(sample[group_field].id)[
                    in_group_slice
                ][in_map_field]

        with fou.ProgressBar(total=point_cloud_view.count()) as pb:
            for sample in pb(point_cloud_view):
                feature_map_filepath = _get_feature_map_filepath(sample)

                bev_map = np.einsum(
                    "jki -> ijk", np.load(feature_map_filepath)
                )
                bev_maps = torch.tensor(np.array([bev_map]))
                input_imgs = Variable(bev_maps.type(Tensor))
                bev_preds = self._get_bev_predictions(input_imgs)

                curr_min_bound, curr_max_bound = self._get_bounds(
                    min_bound, max_bound, sample
                )
                detections = self._convert_bev_to_pcd_detections(
                    bev_preds, curr_min_bound, curr_max_bound
                )
                sample[out_field] = fo.Detections(detections=detections)
                sample.save()


def _get_point_cloud_slice(samples):
    point_cloud_slices = {
        s for s, m in samples.group_media_types.items() if m == fom.POINT_CLOUD
    }
    if not point_cloud_slices:
        raise ValueError("%s has no point cloud slices" % type(samples))

    slice_name = next(iter(point_cloud_slices))

    if len(point_cloud_slices) > 1:
        logger.warning(
            "Found multiple point cloud slices; using '%s'", slice_name
        )

    return slice_name


def apply_model(
    model,
    samples,
    in_map_field,
    in_group_slice=None,
    out_group_slice=None,
    out_field=None,
    bounds=None,
):
    """Wrapper for applying ComplexYOLOv3 model to a dataset or collection of samples and
        adding the generated 3d bbox detections to the corresponding point cloud (pcd)
        samples

    Args:
        model: a :class:`fiftyone.utils.complex_yolo.TorchComplexYOLOv3Model` object
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        in_map_field: the name of the field containing the BEV map filepaths. If
            none is provided, "bev" is used.
        in_group_slice (None): the name of the group slice containing the BEV images/maps. If
            none is provided, "bev" is used.
        out_group_slice (None): the name of a group slice to which to add the predictions. If
            none is provided, the first "pcd" slice will be used.
        out_field (None): the name of the field containing detections to add. If
            none provided, "predictions" is used.
        bounds (None): an optional ``([xmin, ymin, zmin], [xmax, ymax, zmax])``
            tuple defining the field of view used to convert predictions from BEV to pcd.

    Examples::

        import fiftyone as fo
        import fiftyone.zoo as foz
        import fiftyone.utils.utils3d as fou3d
        import fiftyone.utils.complex_yolo as foucy

        dataset = foz.load_zoo_dataset("quickstart-groups")

        min_bound = (0, 0, 0)
        max_bound = (100, 100, 100)
        size = (600, 600)

        map_path = "feature_map_filepath"
        bev_slice = "bev"

        fou3d.compute_birds_eye_view_maps(
            dataset,
            size,
            "/tmp/bev",
            out_group_slice=bev_slice,
            out_map_field=map_path,
            bounds = (min_bound, max_bound)
        )

        class_list = ["Car", "Pedestrian", "Cyclist"]
        z_dict = {c: 1 for c in class_list}
        height_dict = {c: 2 for c in class_list}

        model = foz.load_zoo_model("complex-yolo-v3-torch", args = args)
        model.set_class_heights(height_dict)
        model.set_class_zs(z_dict)

        foucy.apply_model(
            model,
            dataset,
            map_path,
            in_group_slice=bev_slice,
            out_group_slice="pcd",
            out_field="predictions",
            bounds=bounds
        )

    """
    from torch.autograd import Variable

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    Tensor = (
        torch.cuda.FloatTensor
        if torch.cuda.is_available()
        else torch.FloatTensor
    )

    model.predict_all(
        samples,
        in_map_field,
        in_group_slice=in_group_slice,
        out_group_slice=out_group_slice,
        out_field=out_field,
        bounds=bounds,
    )
