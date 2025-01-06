"""
FiftyOne OpenLABEL test utils

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import os

import eta.core.serial as etas

import fiftyone.core.odm.dataset as fod


class OpenLABELLabels(object):
    def __init__(self):
        self.base_labels = {
            "openlabel": {
                "actions": {},
                "contexts": {},
                "coordinate_systems": {},
                "events": {},
                "frame_intervals": [],
                "frames": {},
                "metadata": {},
                "objects": {},
                "ontologies": {},
                "relations": {},
                "resources": {},
                "streams": {},
                "tags": {},
            }
        }

        self._frame_intervals = []

    @property
    def frames(self):
        return self.base_labels["openlabel"]["frames"]

    def _update_frame_interval(self, frame_interval):
        if frame_interval and frame_interval not in self._frame_intervals:
            fs, fe = frame_interval
            self.base_labels["openlabel"]["frame_intervals"].append(
                {"frame_start": fs, "frame_end": fe}
            )
            self._frame_intervals.append(frame_interval)

    def update_metadata(self, metadata_dict):
        self.base_labels["openlabel"]["metadata"].update(metadata_dict)

    def add_stream(self, stream_name, stream_dict):
        self.base_labels["openlabel"]["streams"][stream_name] = stream_dict

    def add_frame_properties(self, frame_number, properties_dict):
        fn_str = str(frame_number)
        fn_int = int(frame_number)
        if fn_str not in self.frames:
            self.frames[fn_str] = {}
        self.frames[fn_str]["frame_properties"] = properties_dict

    @property
    def next_object_id(self):
        object_ids = [
            int(oid) for oid in self.base_labels["openlabel"]["objects"].keys()
        ]
        if not object_ids:
            return "0"
        return str(max(object_ids) + 1)

    def add_object(self, o):
        object_id = self.next_object_id
        frame_object_dict = o.frame_object_dict
        self._update_frame_interval(o.frame_interval)
        for frame_num, frame_dict in frame_object_dict.items():
            if frame_num not in self.base_labels["openlabel"]["frames"]:
                self.base_labels["openlabel"]["frames"][frame_num] = {
                    "objects": {}
                }
            self.base_labels["openlabel"]["frames"][frame_num]["objects"][
                object_id
            ] = frame_dict

        self.base_labels["openlabel"]["objects"][object_id] = o.object_dict

    def write_labels(self, labels_path):
        etas.write_json(self.base_labels, labels_path)


class OpenLABELObject(object):
    def __init__(self, name, type, frame_interval=None):
        self.object_dict = {
            "name": name,
            "type": type,
            "object_data": {},
            "object_data_pointers": {},
            "frame_intervals": [],
        }
        self.frame_object_dict = {}
        self.frame_interval = frame_interval
        if frame_interval:
            self.object_dict["frame_intervals"] = [
                {
                    "frame_start": frame_interval[0],
                    "frame_end": frame_interval[1],
                },
            ]

    def add_object_data(self, object_data, is_frame=False):
        data_dict = object_data.to_dict()
        if is_frame:
            for frame_num in range(
                self.frame_interval[0], self.frame_interval[1] + 1
            ):
                self.frame_object_dict[str(frame_num)] = {
                    "object_data": data_dict
                }
        else:
            self.object_dict["object_data"] = data_dict


class OpenLABELObjectData(object):
    def __init__(self, name, val, object_type, as_list=True):
        self._data_dict = {
            "name": name,
            "val": val,
        }
        self.object_type = object_type
        self.as_list = as_list

    def to_dict(self):
        if self.as_list:
            return {self.object_type: [self._data_dict]}

        return {self.object_type: self._data_dict}

    def add_attribute(self, attr, val, as_property=False):
        if not as_property:
            self._data_dict[attr] = val
        else:
            val_type = type(val).__name__
            if "attributes" not in self._data_dict:
                self._data_dict["attributes"] = {}
            if val_type not in self._data_dict["attributes"]:
                self._data_dict["attributes"][val_type] = []

            attr_dict = {"name": attr, "val": val}
            self._data_dict["attributes"][val_type].append(attr_dict)

    def add_attributes(self, attrs, as_property=False):
        for attr_tuple in attrs:
            _as_property = as_property
            if len(attr_tuple) == 3:
                _as_property = attr_tuple[2]
            self.add_attribute(
                attr_tuple[0], attr_tuple[1], as_property=_as_property
            )

    @classmethod
    def from_dict(cls, d):
        if d:
            object_type = list(d.keys())[0]
            obj_data = cls(None, None, object_type, as_list=False)
            obj_data._data_dict = d.pop(object_type, {})
            return obj_data
        else:
            return None


def _merge_object_datas(object_datas, object_type=None):
    data_dict = defaultdict(list)
    if object_type is None and object_datas:
        object_type = object_datas[0].object_type

    for obj_data in object_datas:
        obj_data_dict = obj_data.to_dict()[obj_data.object_type]
        data_dict[object_type].append(obj_data_dict)

    return OpenLABELObjectData.from_dict(dict(data_dict))


def _make_skeleton():
    skeleton = fod.KeypointSkeleton(
        labels=["point1", "point2", "nanpoint"],
        edges=[[0, 1], [1, 2]],
    )

    skeleton_key = "skeleton_key"
    return skeleton, skeleton_key


def _make_image_labels(tmp_dir):
    labels = OpenLABELLabels()
    labels.update_metadata(
        {
            "annotation_id": 51,
            "input_uuid": "0",
            "project": "FiftyOne Test",
            "schema_version": "1.0.0",
            "uri": "https://annotation.provider",
            "uuid": "5151",
        }
    )
    labels.add_stream(
        "camera1",
        {
            "description": "image camera",
            "stream_properties": {"height": 480, "width": 640},
            "type": "camera",
        },
    )

    kp_obj_data = OpenLABELObjectData(
        "2d_point", [10, 20], "point2d", as_list=False
    )
    kp_obj = OpenLABELObject("keypoints1", "Keypoints")
    kp_obj.add_object_data(kp_obj_data)
    labels.add_object(kp_obj)

    pose_obj_data_2 = OpenLABELObjectData(
        "pose_point2", [20, 30], "point2d", as_list=False
    )
    pose_obj_data_2.add_attribute("skeleton_key", "point2")
    pose_obj_data_2.add_attribute("str_attr", "test")
    pose_obj_data_2.add_attribute("int_attr", 51)
    pose_obj_data_2.add_attribute("float_attr", 51.51)
    pose_obj_data_2.add_attribute("bool_attr", True)
    pose_obj_data_1 = OpenLABELObjectData(
        "pose_point1", [10, 20], "point2d", as_list=False
    )
    pose_obj_data_1.add_attribute("skeleton_key", "point1")
    pose_obj_data_1.add_attribute("str_attr", "test")
    pose_obj_data_1.add_attribute("int_attr", 51)
    pose_obj_data_1.add_attribute("float_attr", 51.51)
    pose_obj_data_1.add_attribute("bool_attr", True)
    pose_obj_datas = [pose_obj_data_2, pose_obj_data_1]
    pose_obj_data = _merge_object_datas(pose_obj_datas)
    pose_obj = OpenLABELObject("pose1", "Keypoints")
    pose_obj.add_object_data(pose_obj_data)
    labels.add_object(pose_obj)

    poly_obj_data = OpenLABELObjectData(
        "poly2d-0",
        [100, 200, 200, 200, 200, 100, 100, 100],
        "poly2d",
    )
    poly_obj_data.add_attributes(
        [
            ("closed", True),
            ("mode", "MODE_POLY2D_ABOSLUTE"),
        ]
    )
    poly_obj_data.add_attributes(
        [
            ("is_hole", False),
            ("polygon_id", "0"),
            ("stream", "camera1"),
        ],
        as_property=True,
    )
    poly_obj = OpenLABELObject(
        "polyname",
        "objectlabel1",
        frame_interval=(0, 0),
    )
    poly_obj.add_object_data(poly_obj_data, is_frame=True)
    labels.add_object(poly_obj)

    line_obj_data = OpenLABELObjectData(
        "poly2d-1",
        [100, 200, 200, 200, 200, 100],
        "poly2d",
    )
    line_obj_data.add_attributes(
        [
            ("closed", False),
            ("mode", "MODE_POLY2D_ABOSLUTE"),
        ]
    )
    line_obj_data.add_attributes(
        [
            ("stream", "camera1"),
        ],
        as_property=True,
    )
    line_obj = OpenLABELObject(
        "polyname2",
        "objectlabel1",
        frame_interval=(0, 0),
    )
    line_obj.add_object_data(line_obj_data, is_frame=True)
    labels.add_object(line_obj)

    bbox_obj_data = OpenLABELObjectData(
        "shape", [436.0, 303.5, 52, 47], "bbox"
    )
    bbox_obj = OpenLABELObject("car1", "Car")
    bbox_obj.add_object_data(bbox_obj_data)
    labels.add_object(bbox_obj)

    labels.add_stream(
        "camera1",
        {
            "description": "",
            "stream_properties": {"height": 480, "width": 640},
            "type": "camera",
        },
    )

    labels_path = os.path.join(tmp_dir, "openlabel_test.json")
    labels.write_labels(labels_path)
    return labels_path


def _make_segmentation_labels(tmp_dir):
    labels = OpenLABELLabels()
    labels.update_metadata(
        {
            "annotation_id": 51,
            "annotation_type": "semantic segmentation",
            "input_uuid": "0",
            "project": "FiftyOne Test",
            "schema_version": "1.0.0",
            "uri": "https://annotation.provider",
            "uuid": "5151",
        }
    )
    poly_obj_data = OpenLABELObjectData(
        "poly2d-0",
        [100, 200, 200, 200, 200, 100, 100, 100],
        "poly2d",
    )
    poly_obj_data.add_attributes(
        [
            ("closed", True),
            ("mode", "MODE_POLY2D_ABOSLUTE"),
        ]
    )
    poly_obj_data.add_attributes(
        [("is_hole", False), ("polygon_id", "0")],
        as_property=True,
    )
    poly_obj = OpenLABELObject(
        "polyname",
        "objectlabel1",
        frame_interval=(0, 0),
    )
    poly_obj.add_object_data(poly_obj_data, is_frame=True)
    labels.add_object(poly_obj)

    line_obj_data = OpenLABELObjectData(
        "poly2d-1",
        [100, 200, 200, 200, 200, 100],
        "poly2d",
    )
    line_obj_data.add_attributes(
        [
            ("closed", False),
            ("mode", "MODE_POLY2D_ABOSLUTE"),
        ]
    )
    line_obj_data.add_attributes(
        [
            ("stream", "camera1"),
        ],
        as_property=True,
    )
    line_obj = OpenLABELObject(
        "polyname2",
        "objectlabel1",
        frame_interval=(0, 0),
    )
    line_obj.add_object_data(line_obj_data, is_frame=True)
    labels.add_object(line_obj)

    labels_path = os.path.join(tmp_dir, "openlabel_test.json")
    labels.write_labels(labels_path)
    return labels_path


def _make_video_labels(tmp_dir):
    labels = OpenLABELLabels()
    poly_obj_data = OpenLABELObjectData(
        "poly2d-0",
        [100, 200, 200, 200, 200, 100, 100, 100],
        "poly2d",
    )
    poly_obj_data.add_attributes(
        [
            ("closed", True),
            ("mode", "MODE_POLY2D_ABOSLUTE"),
        ]
    )
    poly_obj_data.add_attributes(
        [("is_hole", False), ("polygon_id", "0")],
        as_property=True,
    )
    poly_obj = OpenLABELObject(
        "polyname",
        "objectlabel1",
        frame_interval=(0, 4),
    )
    poly_obj.add_object_data(poly_obj_data, is_frame=True)
    labels.add_object(poly_obj)

    points_obj_data = OpenLABELObjectData(
        "points2d-0",
        [100, 200],
        "point2d",
    )
    points_obj = OpenLABELObject(
        "pointsname",
        "objectlabel1",
        frame_interval=(0, 4),
    )
    points_obj.add_object_data(points_obj_data, is_frame=True)
    labels.add_object(points_obj)

    bbox_obj_data = OpenLABELObjectData(
        "bbox2d-0",
        [100, 200, 200, 100],
        "bbox",
    )
    bbox_obj = OpenLABELObject(
        "bboxname",
        "objectlabel1",
        frame_interval=(0, 4),
    )
    bbox_obj.add_object_data(bbox_obj_data, is_frame=True)
    labels.add_object(bbox_obj)

    labels_path = os.path.join(tmp_dir, "openlabel_test.json")
    labels.write_labels(labels_path)
    return labels_path
