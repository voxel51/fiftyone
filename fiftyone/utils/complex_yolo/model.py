"""
Complex-YOLOv3 model adapted from
https://github.com/ghimiredhikura/Complex-YOLOv3.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import math
import numpy as np

import fiftyone.core.utils as fou

fou.ensure_torch()
import torch
from torch import nn
import torch.nn.functional as F

sg = fou.lazy_import(
    "shapely.geometry", callback=lambda: fou.ensure_package("shapely")
)


class ComplexYOLOv3(nn.Module):
    """Complex-YOLOv3 object detection model."""

    def __init__(self, config_path):
        super().__init__()
        self.module_defs = parse_model_config(config_path)
        self.hyperparams, self.module_list = create_modules(self.module_defs)
        self.yolo_layers = [
            layer[0]
            for layer in self.module_list
            if hasattr(layer[0], "metrics")
        ]
        self.seen = 0
        self.header_info = np.array([0, 0, 0, self.seen, 0], dtype=np.int32)

    def forward(self, x, targets=None):
        img_dim = x.shape[2]
        loss = 0
        layer_outputs, yolo_outputs = [], []
        for module_def, module in zip(self.module_defs, self.module_list):
            if module_def["type"] in ["convolutional", "upsample", "maxpool"]:
                x = module(x)
            elif module_def["type"] == "route":
                x = torch.cat(
                    [
                        layer_outputs[int(layer_i)]
                        for layer_i in module_def["layers"].split(",")
                    ],
                    1,
                )
            elif module_def["type"] == "shortcut":
                layer_i = int(module_def["from"])
                x = layer_outputs[-1] + layer_outputs[layer_i]
            elif module_def["type"] == "yolo":
                x, layer_loss = module[0](x, targets, img_dim)
                loss += layer_loss
                yolo_outputs.append(x)

            layer_outputs.append(x)

        yolo_outputs = (torch.cat(yolo_outputs, 1)).detach().cpu()
        return yolo_outputs if targets is None else (loss, yolo_outputs)

    def _get_box_corners(self, x, y, w, l, yaw):
        corners = np.zeros((4, 2), dtype=np.float32)
        sy2, cy2 = np.sin(yaw) / 2, np.cos(yaw) / 2

        # # front left
        corners[0, 0] = x - w * cy2 - l * sy2
        corners[0, 1] = y - w * sy2 + l * cy2

        # rear left
        corners[1, 0] = x - w * cy2 + l * sy2
        corners[1, 1] = y - w * sy2 - l * cy2

        # rear right
        corners[2, 0] = x + w * cy2 + l * sy2
        corners[2, 1] = y + w * sy2 - l * cy2

        # front right
        corners[3, 0] = x + w * cy2 - l * sy2
        corners[3, 1] = y + w * sy2 + l * cy2
        return corners

    def _convert_boxes_to_shapely(self, boxes_array):
        return np.array(
            [
                sg.Polygon([(box[i, 0], box[i, 1]) for i in range(4)])
                for box in boxes_array
            ]
        )

    def _compute_iou(self, box, boxes):
        iou = [
            box.intersection(b).area / (box.union(b).area + 1e-12)
            for b in boxes
        ]
        return np.array(iou, dtype=np.float32)

    def _rotated_bbox_iou_polygon(self, box1, box2):
        box1 = box1.detach().cpu().numpy()
        box2 = box2.detach().cpu().numpy()

        x, y, w, l, im, re = box1
        angle = np.arctan2(im, re)
        box_corners = self._get_box_corners(x, y, w, l, angle)
        bbox1 = np.array(box_corners).reshape((-1, 4, 2))
        bbox1 = self._convert_boxes_to_shapely(bbox1)

        bbox2 = []
        for i in range(box2.shape[0]):
            x, y, w, l, im, re = box2[i, :]
            angle = np.arctan2(im, re)
            bev_corners = self._get_box_corners(x, y, w, l, angle)
            bbox2.append(bev_corners)

        bbox2 = self._convert_boxes_to_shapely(np.array(bbox2))

        return self._compute_iou(bbox1[0], bbox2)

    def nms(self, prediction, conf_thresh, nms_thresh):
        """Removes detections with lower object confidence score than
        `conf_thresh` and performs non-maximum suppression to further filter
        detections.

        Returns detections with shape::

            (x, y, w, l, im, re, object_conf, class_score, class_pred)
        """
        output = [None for _ in range(len(prediction))]
        for image_i, image_pred in enumerate(prediction):
            # Filter out confidence scores below threshold
            image_pred = image_pred[image_pred[:, 6] >= conf_thresh]

            # If none are remaining => process next image
            if not image_pred.size(0):
                continue

            # Object confidence times class confidence
            score = image_pred[:, 6] * image_pred[:, 7:].max(1)[0]

            # Sort by it
            image_pred = image_pred[(-score).argsort()]

            class_confs, class_preds = image_pred[:, 7:].max(1, keepdim=True)
            detections = torch.cat(
                (
                    image_pred[:, :7].float(),
                    class_confs.float(),
                    class_preds.float(),
                ),
                1,
            )

            keep_boxes = []
            while detections.size(0):
                large_overlap = (
                    self._rotated_bbox_iou_polygon(
                        detections[0, :6], detections[:, :6]
                    )
                    > nms_thresh
                )
                large_overlap = torch.from_numpy(large_overlap)
                label_match = detections[0, -1] == detections[:, -1]

                # Indices of boxes with lower confidence scores, large IOUs and
                # matching labels
                invalid = large_overlap & label_match
                weights = detections[invalid, 6:7]

                # Merge overlapping bboxes by order of confidence
                detections[0, :6] = (weights * detections[invalid, :6]).sum(
                    0
                ) / weights.sum()
                keep_boxes += [detections[0]]
                detections = detections[~invalid]

            if keep_boxes:
                output[image_i] = torch.stack(keep_boxes)

        return output

    def compute_height(
        self, predictions, classes, class_heights=None, class_zs=None
    ):
        if class_heights is None:
            class_heights = {}

        if class_zs is None:
            class_zs = {}

        new_preds = []
        for img in predictions:
            if img is None:
                continue

            img_with_height = np.copy(np.array(img))
            class_ids = img_with_height[:, -1].astype(int)
            labels = [classes[cid] for cid in class_ids]

            detection_heights = np.array(
                [[class_heights.get(label, 1.6) for label in labels]]
            )
            detection_zs = np.array(
                [[class_zs.get(label, 1.55) for label in labels]]
            )

            new_preds.append(
                np.hstack(
                    (img_with_height, detection_heights.T, detection_zs.T)
                )
            )

        return new_preds


class YOLOLayer(nn.Module):
    def __init__(self, anchors, num_classes, img_dim=416):
        super().__init__()
        self.anchors = anchors
        self.num_anchors = len(anchors)
        self.num_classes = num_classes
        self.ignore_thres = 0.5
        self.mse_loss = nn.MSELoss()
        self.bce_loss = nn.BCELoss()
        self.obj_scale = 1
        self.noobj_scale = 100
        self.metrics = {}
        self.img_dim = img_dim
        self.grid_size = 0  # grid size

    def compute_grid_offsets(self, grid_size, cuda=True):
        self.grid_size = grid_size
        g = self.grid_size
        FloatTensor = torch.cuda.FloatTensor if cuda else torch.FloatTensor
        self.stride = self.img_dim / self.grid_size

        # Calculate offsets for each grid
        self.grid_x = (
            torch.arange(g).repeat(g, 1).view([1, 1, g, g]).type(FloatTensor)
        )
        self.grid_y = (
            torch.arange(g)
            .repeat(g, 1)
            .t()
            .view([1, 1, g, g])
            .type(FloatTensor)
        )
        self.scaled_anchors = FloatTensor(
            [
                (a_w / self.stride, a_h / self.stride, im, re)
                for a_w, a_h, im, re in self.anchors
            ]
        )
        self.anchor_w = self.scaled_anchors[:, 0:1].view(
            (1, self.num_anchors, 1, 1)
        )
        self.anchor_h = self.scaled_anchors[:, 1:2].view(
            (1, self.num_anchors, 1, 1)
        )

    def forward(self, x, targets=None, img_dim=None):
        # Tensors for cuda support
        FloatTensor = (
            torch.cuda.FloatTensor if x.is_cuda else torch.FloatTensor
        )

        self.img_dim = img_dim
        num_samples = x.size(0)
        grid_size = x.size(2)

        prediction = (
            x.view(
                num_samples,
                self.num_anchors,
                self.num_classes + 7,
                grid_size,
                grid_size,
            )
            .permute(0, 1, 3, 4, 2)
            .contiguous()
        )

        # Get outputs
        x = torch.sigmoid(prediction[..., 0])  # Center x
        y = torch.sigmoid(prediction[..., 1])  # Center y
        w = prediction[..., 2]  # Width
        h = prediction[..., 3]  # Height
        im = prediction[..., 4]  # angle imaginary part
        re = prediction[..., 5]  # angle real part
        pred_conf = torch.sigmoid(prediction[..., 6])  # Conf
        pred_cls = torch.sigmoid(prediction[..., 7:])  # Cls pred.

        # If grid size does not match current we compute new offsets
        if grid_size != self.grid_size:
            self.compute_grid_offsets(grid_size, cuda=x.is_cuda)

        # Add offset and scale with anchors
        pred_boxes = FloatTensor(prediction[..., :6].shape)
        pred_boxes[..., 0] = x.data + self.grid_x
        pred_boxes[..., 1] = y.data + self.grid_y
        pred_boxes[..., 2] = torch.exp(w.data) * self.anchor_w
        pred_boxes[..., 3] = torch.exp(h.data) * self.anchor_h
        pred_boxes[..., 4] = im
        pred_boxes[..., 5] = re

        output = torch.cat(
            (
                pred_boxes[..., :4].view(num_samples, -1, 4) * self.stride,
                pred_boxes[..., 4:].view(num_samples, -1, 2),
                pred_conf.view(num_samples, -1, 1),
                pred_cls.view(num_samples, -1, self.num_classes),
            ),
            -1,
        )

        return output, 0


class Upsample(nn.Module):
    def __init__(self, scale_factor, mode="nearest"):
        super().__init__()
        self.scale_factor = scale_factor
        self.mode = mode

    def forward(self, x):
        x = F.interpolate(x, scale_factor=self.scale_factor, mode=self.mode)
        return x


class EmptyLayer(nn.Module):
    pass


def parse_model_config(path):
    with open(path, "r") as f:
        lines = f.read().split("\n")
        lines = [x.strip() for x in lines if x and not x.startswith("#")]

    module_defs = []
    for line in lines:
        if line.startswith("["):  # This marks the start of a new block
            module_defs.append({})
            module_defs[-1]["type"] = line[1:-1].rstrip()
            if module_defs[-1]["type"] == "convolutional":
                module_defs[-1]["batch_normalize"] = 0
        else:
            key, value = line.split("=")
            value = value.strip()
            module_defs[-1][key.rstrip()] = value.strip()

    return module_defs


def create_modules(module_defs):
    hyperparams = module_defs.pop(0)
    output_filters = [int(hyperparams["channels"])]
    module_list = nn.ModuleList()
    for module_i, module_def in enumerate(module_defs):
        modules = nn.Sequential()

        if module_def["type"] == "convolutional":
            bn = int(module_def["batch_normalize"])
            filters = int(module_def["filters"])
            kernel_size = int(module_def["size"])
            pad = (kernel_size - 1) // 2
            modules.add_module(
                f"conv_{module_i}",
                nn.Conv2d(
                    in_channels=output_filters[-1],
                    out_channels=filters,
                    kernel_size=kernel_size,
                    stride=int(module_def["stride"]),
                    padding=pad,
                    bias=not bn,
                ),
            )
            if bn:
                modules.add_module(
                    f"batch_norm_{module_i}",
                    nn.BatchNorm2d(filters, momentum=0.9, eps=1e-5),
                )

            if module_def["activation"] == "leaky":
                modules.add_module(f"leaky_{module_i}", nn.LeakyReLU(0.1))
        elif module_def["type"] == "maxpool":
            kernel_size = int(module_def["size"])
            stride = int(module_def["stride"])
            if kernel_size == 2 and stride == 1:
                modules.add_module(
                    f"_debug_padding_{module_i}", nn.ZeroPad2d((0, 1, 0, 1))
                )

            maxpool = nn.MaxPool2d(
                kernel_size=kernel_size,
                stride=stride,
                padding=int((kernel_size - 1) // 2),
            )
            modules.add_module(f"maxpool_{module_i}", maxpool)
        elif module_def["type"] == "upsample":
            upsample = Upsample(
                scale_factor=int(module_def["stride"]), mode="nearest"
            )
            modules.add_module(f"upsample_{module_i}", upsample)
        elif module_def["type"] == "route":
            layers = [int(x) for x in module_def["layers"].split(",")]
            filters = sum([output_filters[1:][i] for i in layers])
            modules.add_module(f"route_{module_i}", EmptyLayer())
        elif module_def["type"] == "shortcut":
            filters = output_filters[1:][int(module_def["from"])]
            modules.add_module(f"shortcut_{module_i}", EmptyLayer())
        elif module_def["type"] == "yolo":
            anchor_idxs = [int(x) for x in module_def["mask"].split(",")]

            # Extract anchors
            anchors = [float(x) for x in module_def["anchors"].split(",")]
            anchors = [
                (
                    anchors[i],
                    anchors[i + 1],
                    math.sin(anchors[i + 2]),
                    math.cos(anchors[i + 2]),
                )
                for i in range(0, len(anchors), 3)
            ]
            anchors = [anchors[i] for i in anchor_idxs]
            num_classes = int(module_def["classes"])
            img_size = int(hyperparams["height"])

            # Define detection layer
            yolo_layer = YOLOLayer(anchors, num_classes, img_size)
            modules.add_module(f"yolo_{module_i}", yolo_layer)

        # Register module list and number of output filters
        module_list.append(modules)
        output_filters.append(filters)

    return hyperparams, module_list
