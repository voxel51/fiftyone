"""
Tests for the :mod:`fiftyone.utils.cvat` module.

You must run these tests interactively as follows::

    CVAT_TEST_USERNAME=<valid_cvat_user> python tests/intensive/cvat_tests.py

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId
from collections import defaultdict
import numpy as np
import os
import unittest

import eta.core.utils as etau

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


def _get_label(api, task_id, label=None):
    attr_id_map, class_id_map = api._get_attr_class_maps(task_id)
    if isinstance(label, str):
        label = class_id_map[label]
    else:
        label = list(class_id_map.values())[0]
    return label


def _create_annotation(
    api, task_id, shape=None, tag=None, track=None, points=None, _type=None
):
    if points is None:
        points = [10, 20, 30, 40]
    if _type is None:
        _type = "rectangle"
    shapes = []
    tags = []
    tracks = []
    if shape is not None:
        if not isinstance(shape, dict):
            label = _get_label(api, task_id, label=shape)

            shape = {
                "type": _type,
                "frame": 0,
                "label_id": label,
                "group": 0,
                "attributes": [],
                "points": points,
                "occluded": False,
            }
        shapes = [shape]

    if tag is not None:
        if not isinstance(tag, dict):
            label = _get_label(api, task_id, label=tag)
            tag = {
                "frame": 0,
                "label_id": label,
                "group": 0,
                "attributes": [],
            }
        tags = [tag]

    if track is not None:
        if not isinstance(track, dict):
            label = _get_label(api, task_id, label=track)
            if isinstance(track, tuple):
                start, end = track
            else:
                start, end = 0, -1
            track = {
                "frame": start,
                "label_id": label,
                "group": 0,
                "shapes": [
                    {
                        "type": _type,
                        "occluded": False,
                        "points": points,
                        "frame": start,
                        "outside": False,
                        "attributes": [],
                        "z_order": 0,
                    }
                ],
                "attributes": [],
            }
            if end > start:
                track["shapes"].append(
                    {
                        "type": _type,
                        "occluded": False,
                        "points": points,
                        "frame": end,
                        "outside": True,
                        "attributes": [],
                        "z_order": 0,
                    }
                )
            tracks.append(track)

    create_json = {
        "version": 1,
        "tags": tags,
        "shapes": shapes,
        "tracks": tracks,
    }
    create_url = api.task_annotation_url(task_id) + "?action=create"
    api.patch(create_url, json=create_json)


def _update_shape(
    api,
    task_id,
    label_id,
    label=None,
    points=None,
    attributes=None,
    occluded=None,
):
    anno_json = api.get(api.task_annotation_url(task_id)).json()
    shape = _find_shape(anno_json, label_id)
    if shape is not None:
        if points is not None:
            shape["points"] = points
        if occluded is not None:
            shape["occluded"] = occluded
        if attributes is not None:
            attr_id_map, class_id_map = api._get_attr_class_maps(task_id)
            if label is None:
                label_id = shape["label_id"]
                attr_id_map = attr_id_map[label_id]
            else:
                label_id = class_id_map[label]
                prev_attr_id_map = attr_id_map[shape["label_id"]]
                prev_attr_id_map = {v: k for k, v in prev_attr_id_map.items()}
                attr_id_map = attr_id_map[label_id]
                shape["label_id"] = label_id
                for attr in shape["attributes"]:
                    spec = prev_attr_id_map[attr["spec_id"]]
                    attr["spec_id"] = attr_id_map[spec]
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
    USERNAME = None

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
        api.close()

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
        _create_annotation(api, task_id, shape=True)
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
        api.close()

    def test_multiple_fields(self):
        dataset = foz.load_zoo_dataset(
            "open-images-v6",
            split="validation",
            label_types=["detections", "segmentations", "classifications"],
            classes=["Person"],
            max_samples=10,
        ).clone()

        prev_dataset = dataset.clone()

        anno_key = "anno_key"
        label_schema = {
            "detections": {},
            "segmentations": {"type": "instances"},
            "positive_labels": {},
            "negative_labels": {},
        }

        results = dataset.annotate(
            anno_key,
            backend="cvat",
            label_schema=label_schema,
            classes=["Person"],
        )

        api = results.connect_to_api()
        task_id = results.task_ids[0]

        dataset.load_annotations(anno_key, cleanup=True)
        api.close()

        def _remove_bbox(dataset, label_field):
            view = dataset.set_field(
                "%s.detections" % label_field,
                F("detections").map(
                    F().set_field("bounding_box", []).set_field("mask", None)
                ),
            )
            return view

        # Ensure ids and attrs are equal
        view = _remove_bbox(dataset, "detections")
        prev_view = _remove_bbox(prev_dataset, "detections")
        self.assertListEqual(
            view.values("detections", unwind=True),
            prev_view.values("detections", unwind=True),
        )

        view = _remove_bbox(dataset, "segmentations")
        prev_view = _remove_bbox(prev_dataset, "segmentations")
        self.assertListEqual(
            view.values("segmentations", unwind=True),
            prev_view.values("segmentations", unwind=True),
        )

        self.assertListEqual(
            dataset.values("positive_labels", unwind=True),
            prev_dataset.values("positive_labels", unwind=True),
        )

        self.assertListEqual(
            dataset.values("negative_labels", unwind=True),
            prev_dataset.values("negative_labels", unwind=True),
        )

    def test_task_creation_arguments(self):
        user = self.USERNAME
        users = [user] if user is not None else None
        dataset = (
            foz.load_zoo_dataset("quickstart", max_samples=4)
            .select_fields("ground_truth")
            .clone()
        )

        anno_key = "anno_key"
        bug_tracker = "test_tracker"
        results = dataset.annotate(
            anno_key,
            backend="cvat",
            label_field="ground_truth",
            task_size=2,
            segment_size=1,
            task_assignee=users,
            job_assignees=users,
            job_reviewers=users,
            issue_tracker=bug_tracker,
        )
        task_ids = results.task_ids
        api = results.connect_to_api()
        self.assertEqual(len(task_ids), 2)
        for task_id in task_ids:
            task_json = api.get(api.task_url(task_id)).json()
            self.assertEqual(task_json["bug_tracker"], bug_tracker)
            self.assertEqual(task_json["segment_size"], 1)
            if user is not None:
                self.assertEqual(task_json["assignee"]["username"], user)
            for job in api.get(api.jobs_url(task_id)).json():
                job_json = api.get(job["url"]).json()
                if user is not None:
                    self.assertEqual(job_json["assignee"]["username"], user)
                    if api._version == 1:
                        self.assertEqual(
                            job_json["reviewer"]["username"], user
                        )

        dataset.load_annotations(anno_key, cleanup=True)
        api.close()

    def test_project(self):
        dataset = (
            foz.load_zoo_dataset("quickstart", max_samples=2)
            .select_fields("ground_truth")
            .clone()
        )

        anno_key = "anno_key"
        project_name = "cvat_unittest_project"

        results = dataset.annotate(
            anno_key,
            backend="cvat",
            label_field="ground_truth",
            project_name=project_name,
        )
        api = results.connect_to_api()
        project_id = api.get_project_id(project_name)
        self.assertIsNotNone(project_id)
        self.assertIn(project_id, results.project_ids)

        anno_key2 = "anno_key2"
        results2 = dataset.annotate(
            anno_key2,
            backend="cvat",
            label_field="ground_truth",
            project_name=project_name,
        )
        self.assertNotIn(project_id, results2.project_ids)
        self.assertIsNotNone(api.get_project_id(project_name))

        dataset.load_annotations(anno_key, cleanup=True)
        self.assertIsNotNone(api.get_project_id(project_name))

        dataset.load_annotations(anno_key2, cleanup=True)
        self.assertIsNotNone(api.get_project_id(project_name))
        api.delete_project(project_id)
        api.close()
        api = results.connect_to_api()
        self.assertIsNone(api.get_project_id(project_name))
        api.close()

    def test_example_add_new_label_fields(self):

        # Test label field arguments

        dataset = foz.load_zoo_dataset("quickstart", max_samples=10).clone()
        view = dataset.take(1)

        anno_key = "cvat_new_field"

        results = view.annotate(
            anno_key,
            label_field="new_classifications",
            label_type="classifications",
            classes=["dog", "cat", "person"],
        )
        self.assertIsNotNone(dataset.get_annotation_info(anno_key))

        api = results.connect_to_api()
        task_id = results.task_ids[0]
        _create_annotation(api, task_id, tag="dog")

        dataset.load_annotations(anno_key, cleanup=True)
        tags = view.first().new_classifications.classifications
        num_tags = len(tags)
        self.assertEqual(num_tags, 1)
        self.assertEqual(tags[0].label, "dog")

        # Test label schema

        anno_key = "cvat_new_field_schema"

        label_schema = {
            "new_classifications_2": {
                "type": "classifications",
                "classes": ["dog", "cat", "person"],
            }
        }

        results = view.annotate(anno_key, label_schema=label_schema)
        self.assertIsNotNone(dataset.get_annotation_info(anno_key))
        api.close()

        api = results.connect_to_api()
        task_id = results.task_ids[0]
        _create_annotation(api, task_id, tag="person")

        dataset.load_annotations(anno_key, cleanup=True)
        tags = view.first().new_classifications_2.classifications
        num_tags = len(tags)
        self.assertEqual(num_tags, 1)
        self.assertEqual(tags[0].label, "person")

        dataset.load_annotations(anno_key, cleanup=True)
        api.close()

    def test_example_restricting_label_edits(self):
        dataset = foz.load_zoo_dataset("quickstart").clone()

        # Grab a sample that contains at least 2 people
        view = dataset.match(
            F("ground_truth.detections")
            .filter(F("label") == "person")
            .length()
            > 1
        ).limit(1)

        previous_labels = view.values("ground_truth.detections", unwind=True)
        previous_person_labels = view.filter_labels(
            "ground_truth", F("label") == "person"
        ).values("ground_truth.detections", unwind=True)

        anno_key = "cvat_edit_restrictions"

        # The new attributes that we want to populate
        attributes = {
            "sex": {"type": "select", "values": ["male", "female"],},
            "age": {"type": "text",},
        }

        results = view.annotate(
            anno_key,
            label_field="ground_truth",
            classes=["person", "test"],
            attributes=attributes,
            allow_additions=False,
            allow_deletions=False,
            allow_label_edits=False,
            allow_spatial_edits=False,
        )
        self.assertIsNotNone(dataset.get_annotation_info(anno_key))

        task_id = results.task_ids[0]
        api = results.connect_to_api()

        # Delete label
        deleted_id = previous_person_labels[0].id
        _delete_shape(api, task_id, deleted_id)

        # Add label
        _create_annotation(api, task_id, shape="person")

        # Edit label and bounding box
        edited_id = previous_person_labels[1].id
        _update_shape(
            api,
            task_id,
            edited_id,
            label="test",
            points=[10, 20, 30, 40],
            attributes=[("sex", "male")],
        )

        dataset.load_annotations(anno_key, cleanup=True)
        api.close()
        labels = view.values("ground_truth.detections", unwind=True)
        person_labels = view.filter_labels(
            "ground_truth", F("label") == "person"
        ).values("ground_truth.detections", unwind=True)
        self.assertListEqual(
            [d.label for d in labels], [d.label for d in previous_labels],
        )
        self.assertListEqual(
            [d.bounding_box for d in labels],
            [d.bounding_box for d in previous_labels],
        )
        self.assertListEqual(
            [d.id for d in labels], [d.id for d in previous_labels],
        )
        self.assertEqual(
            len(dataset.filter_labels("ground_truth", F("sex") == "male")), 1,
        )

    def test_issue_1634(self):
        # tests: https://github.com/voxel51/fiftyone/issues/1634
        dataset = (
            foz.load_zoo_dataset("quickstart-video", max_samples=1)
            .select_fields("frames.detections")
            .clone()
        )

        anno_key = "issue_1634_test"
        results = dataset.annotate(
            anno_key,
            label_field="frames.ground_truth",
            label_type="detections",
            classes=["test"],
        )

        task_id = results.task_ids[0]
        api = results.connect_to_api()

        # Create overlapping tracks of different type
        _create_annotation(
            api,
            task_id,
            track=(0, 30),
            _type="polygon",
            points=[10, 20, 40, 30, 50, 60],
        )
        _create_annotation(
            api, task_id, track=(20, 40),
        )

        api.close()
        data_path = os.path.dirname(dataset.first().filepath)
        imported_dataset = fo.Dataset()
        fouc.import_annotations(
            imported_dataset,
            task_ids=[task_id],
            download_media=False,
            data_path=data_path,
        )
        with etau.TempDir() as tmp:
            imported_dataset.export(
                export_dir=tmp, dataset_type=fo.types.CVATVideoDataset
            )
            filename = os.path.splitext(
                os.path.basename(imported_dataset.first().filepath)
            )[0]
            labels_filepath = os.path.join(tmp, "labels", "%s.xml" % filename)
            with open(labels_filepath, "r") as f:
                label_file_info = f.read()
                track_1 = '<track id="1" label="test">'
                track_2 = '<track id="2" label="test">'
                polygon_frame_0 = '<polygon frame="0"'
                polygon_frame_30 = '<polygon frame="30"'
                box_frame_20 = '<box frame="20"'
                box_frame_40 = '<box frame="40"'
                self.assertTrue(track_1 in label_file_info)
                self.assertTrue(track_2 in label_file_info)
                self.assertTrue(polygon_frame_0 in label_file_info)
                self.assertTrue(polygon_frame_30 in label_file_info)
                self.assertTrue(box_frame_20 in label_file_info)
                self.assertTrue(box_frame_40 in label_file_info)

            cvat_video_dataset = fo.Dataset.from_dir(
                dataset_dir=tmp, dataset_type=fo.types.CVATVideoDataset,
            )
            detections = cvat_video_dataset.values(
                "frames.detections", unwind=True
            )
            detections = [i for i in detections if i is not None]
            self.assertEqual(len(detections), 20)
            polylines = cvat_video_dataset.values(
                "frames.polylines", unwind=True
            )
            polylines = [i for i in polylines if i is not None]
            self.assertEqual(len(polylines), 30)

        dataset.load_annotations(anno_key, cleanup=True)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    CVATTests.USERNAME = os.environ.get(
        "CVAT_TEST_USERNAME", CVATTests.USERNAME
    )
    unittest.main(verbosity=2)
