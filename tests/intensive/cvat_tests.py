"""
Tests for the :mod:`fiftyone.utils.cvat` module.

You must run these tests interactively as follows::

    pytest tests/intensive/cvat_tests.py -s -k <test_case>

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId
from collections import defaultdict
import unittest

import fiftyone as fo
import fiftyone.utils.cvat as fouc
import fiftyone.zoo as foz

from fiftyone.core.expressions import ViewField as F


def _find_shape(anno_json, label_id):
    for shape in anno_json["shapes"]:
        for attr in shape["attributes"]:
            if attr["value"] == label_id:
                return shape
    return None


def _get_shape(api, task_id, label_id):
    anno_json = api.get(api.task_annotation_url(task_id)).json()
    return _find_shape(anno_json, label_id)


def _delete_shape(api, task_id, label_id):
    anno_json = api.get(api.task_annotation_url(task_id)).json()
    shape = _find_shape(anno_json, label_id)
    if shape is not None:
        del_json = {"version": 1, "tags": [], "shapes": [shape], "tracks": []}
        del_url = api.task_annotation_url(task_id) + "?action=delete"
        api.patch(del_url, json=del_json)


def _create_shape(api, task_id, shape=None):
    if shape is None:
        attr_id_map, class_id_map = api._get_attr_class_maps(task_id)
        label = list(class_id_map.values())[0]
        shape = {
            "type": "rectangle",
            "frame": 0,
            "label_id": label,
            "group": 0,
            "attributes": [],
            "points": [10, 10, 10, 10],
            "occluded": False,
        }

    create_json = {"version": 1, "tags": [], "shapes": [shape], "tracks": []}
    create_url = api.task_annotation_url(task_id) + "?action=create"
    api.patch(create_url, json=create_json)


def _update_shape(
    api, task_id, label_id, points=None, attributes=None, occluded=None
):
    anno_json = api.get(api.task_annotation_url(task_id)).json()
    shape = _find_shape(anno_json, label_id)
    if shape is not None:
        if points is not None:
            shape["points"] = points
        if occluded is not None:
            shape["occluded"] = occluded
        if attributes is not None:
            label = shape["label_id"]
            attr_id_map, _ = api._get_attr_class_maps(task_id)
            attr_id_map = attr_id_map[label]
            for attr_name, attr_val in attributes:
                if attr_name in attr_id_map:
                    shape["attributes"].append(
                        {"spec_id": attr_id_map[attr_name], "value": attr_val}
                    )

        update_json = {
            "version": 1,
            "tags": [],
            "shapes": [shape],
            "tracks": [],
        }
        update_url = api.task_annotation_url(task_id) + "?action=update"
        api.patch(update_url, json=update_json)


class CVATTests(unittest.TestCase):
    def test_upload(self):
        dataset = foz.load_zoo_dataset("quickstart", max_samples=1).clone()

        anno_key = "anno_key"
        results = dataset.annotate(
            anno_key, backend="cvat", label_field="ground_truth",
        )
        api = results.connect_to_api()
        task_id = results.task_ids[0]
        shape_id = dataset.first().ground_truth.detections[0].id
        self.assertIsNotNone(_get_shape(api, task_id, shape_id))

        sample_id = list(list(results.frame_id_map.values())[0].values())[0][
            "sample_id"
        ]
        self.assertEqual(sample_id, dataset.first().id)

        dataset.load_annotations(anno_key, cleanup=True)

    def test_detection_labelling(self):
        dataset = (
            foz.load_zoo_dataset("quickstart", max_samples=2)
            .select_fields("ground_truth")
            .clone()
        )
        previous_dataset = dataset.clone()

        previous_label_ids = dataset.values(
            "ground_truth.detections.id", unwind=True
        )

        anno_key = "anno_key"
        attributes = {"test": {"type": "text"}}

        results = dataset.annotate(
            anno_key,
            backend="cvat",
            label_field="ground_truth",
            attributes=attributes,
        )

        api = results.connect_to_api()
        task_id = results.task_ids[0]
        deleted_label_id = previous_label_ids[0]
        updated_label_id = previous_label_ids[1]

        _delete_shape(api, task_id, deleted_label_id)
        _create_shape(api, task_id)
        _update_shape(
            api, task_id, updated_label_id, attributes=[("test", "1")]
        )

        dataset.load_annotations(anno_key, cleanup=True)
        label_ids = dataset.values("ground_truth.detections.id", unwind=True)

        self.assertEqual(len(label_ids), len(previous_label_ids))

        added_label_ids = list(set(label_ids) - set(previous_label_ids))
        self.assertEqual(len(added_label_ids), 1)
        deleted_label_ids = list(set(previous_label_ids) - set(label_ids))
        self.assertEqual(len(deleted_label_ids), 1)

        updated_sample = dataset.filter_labels(
            "ground_truth", F("_id") == ObjectId(updated_label_id)
        ).first()
        prev_updated_sample = previous_dataset.filter_labels(
            "ground_truth", F("_id") == ObjectId(updated_label_id)
        ).first()

        self.assertEqual(len(updated_sample.ground_truth.detections), 1)
        self.assertEqual(len(prev_updated_sample.ground_truth.detections), 1)
        self.assertEqual(
            updated_sample.ground_truth.detections[0].id,
            prev_updated_sample.ground_truth.detections[0].id,
        )
        self.assertEqual(updated_sample.ground_truth.detections[0].test, 1)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
