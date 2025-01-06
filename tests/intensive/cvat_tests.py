"""
Tests for the :mod:`fiftyone.utils.cvat` module.

You must run these tests interactively as follows::

    python tests/intensive/cvat_tests.py

| Copyright 2017-2025, Voxel51, Inc.
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
    shape = _parse_shapes(anno_json["shapes"], label_id)
    if shape is not None:
        return shape

    for track in anno_json["tracks"]:
        shape = _parse_shapes(track["shapes"], label_id)
        if shape is not None:
            return shape


def _parse_shapes(shapes, label_id):
    for shape in shapes:
        for attr in shape["attributes"]:
            if attr["value"] == label_id:
                return shape


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
    api,
    task_id,
    shape=None,
    tag=None,
    track=None,
    points=None,
    _type=None,
    _label=None,
    group_id=0,
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
            if _label is None:
                label = _get_label(api, task_id, label=shape)
            else:
                label = _get_label(api, task_id, label=_label)

            shape = {
                "type": _type,
                "frame": 0,
                "label_id": label,
                "group": group_id,
                "attributes": [],
                "points": points,
                "occluded": False,
            }
        shapes = [shape]

    if tag is not None:
        if not isinstance(tag, dict):
            if _label is None:
                label = _get_label(api, task_id, label=tag)
            else:
                label = _get_label(api, task_id, label=_label)
            tag = {
                "frame": 0,
                "label_id": label,
                "group": group_id,
                "attributes": [],
            }
        tags = [tag]

    if track is not None:
        if not isinstance(track, dict):
            if _label is None:
                label = _get_label(api, task_id, label=track)
            else:
                label = _get_label(api, task_id, label=_label)
            if isinstance(track, tuple):
                start, end = track
            else:
                start, end = 0, -1
            track = {
                "frame": start,
                "label_id": label,
                "group": group_id,
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
    group_id=None,
):
    anno_json = api.get(api.task_annotation_url(task_id)).json()
    shape = _find_shape(anno_json, label_id)
    if shape is not None:
        if points is not None:
            shape["points"] = points
        if occluded is not None:
            shape["occluded"] = occluded
        if group_id is not None:
            shape["group"] = group_id
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
    def test_upload(self):
        # Test images
        dataset = foz.load_zoo_dataset("quickstart", max_samples=1).clone()

        prev_ids = dataset.values("ground_truth.detections.id", unwind=True)

        anno_key = "anno_key"
        results = dataset.annotate(
            anno_key,
            backend="cvat",
            label_field="ground_truth",
        )
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            shape_id = dataset.first().ground_truth.detections[0].id
            self.assertIsNotNone(_get_shape(api, task_id, shape_id))

            sample_id = list(list(results.frame_id_map.values())[0].values())[
                0
            ]["sample_id"]
            self.assertEqual(sample_id, dataset.first().id)

        dataset.reload()
        dataset.load_annotations(anno_key, cleanup=True)

        self.assertListEqual(
            prev_ids,
            dataset.values("ground_truth.detections.id", unwind=True),
        )

        # Test Videos
        dataset = foz.load_zoo_dataset(
            "quickstart-video", max_samples=1
        ).clone()

        prev_ids = dataset.values(
            "frames.detections.detections.id", unwind=True
        )

        anno_key = "anno_key"
        results = dataset.annotate(
            anno_key,
            backend="cvat",
            label_field="frames.detections",
        )
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            shape_id = dataset.first().frames[1].detections.detections[0].id
            self.assertIsNotNone(_get_shape(api, task_id, shape_id))

            sample_id = list(list(results.frame_id_map.values())[0].values())[
                0
            ]["sample_id"]
            self.assertEqual(sample_id, dataset.first().id)

        dataset.reload()
        dataset.load_annotations(anno_key, cleanup=True)

        self.assertListEqual(
            prev_ids,
            dataset.values("frames.detections.detections.id", unwind=True),
        )

    def test_detection_labelling(self):
        dataset = (
            foz.load_zoo_dataset("quickstart")
            .select_fields("ground_truth")
            .clone()
        )
        # Get a subset that contains at least 2 objects
        dataset = dataset.match(F("ground_truth.detections").length() > 1)[
            :2
        ].clone()

        previous_dataset = dataset.clone()

        previous_label_ids = dataset.values(
            "ground_truth.detections.id", unwind=True
        )

        anno_key = "anno_key"
        attributes = {"test": {"type": "text", "values": []}}

        results = dataset.annotate(
            anno_key,
            backend="cvat",
            label_field="ground_truth",
            attributes=attributes,
            segment_size=1,
        )

        with results:
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
            label_ids = dataset.values(
                "ground_truth.detections.id", unwind=True
            )

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
            self.assertEqual(
                len(prev_updated_sample.ground_truth.detections), 1
            )
            self.assertEqual(
                updated_sample.ground_truth.detections[0].id,
                prev_updated_sample.ground_truth.detections[0].id,
            )
            self.assertEqual(updated_sample.ground_truth.detections[0].test, 1)

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

        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]

            dataset.load_annotations(anno_key, cleanup=True)

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
        dataset = (
            foz.load_zoo_dataset("quickstart", max_samples=4)
            .select_fields("ground_truth")
            .clone()
        )
        user = fo.annotation_config.backends.get("cvat", {})
        user = user.get("username", None)
        users = [user] if user is not None else None

        anno_key = "anno_key"
        bug_tracker = "test_tracker"
        task_name = "test_task"
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
            task_name=task_name,
        )
        task_ids = results.task_ids
        with results:
            api = results.connect_to_api()
            self.assertEqual(len(task_ids), 2)
            for idx, task_id in enumerate(task_ids):
                task_json = api.get(api.task_url(task_id)).json()
                self.assertEqual(task_json["bug_tracker"], bug_tracker)
                self.assertEqual(task_json["segment_size"], 1)
                self.assertEqual(task_json["name"], f"{task_name}_{idx + 1}")
                if user is not None:
                    self.assertEqual(task_json["assignee"]["username"], user)
                jobs_json = api.get(api.jobs_url(task_id)).json()
                if "results" in jobs_json:
                    jobs_json = jobs_json["results"]
                for job in jobs_json:
                    job_json = api.get(job["url"]).json()
                    if user is not None:
                        self.assertEqual(
                            job_json["assignee"]["username"], user
                        )
                        if api.server_version == 1:
                            self.assertEqual(
                                job_json["reviewer"]["username"], user
                            )

            results.print_status()
            status = results.get_status()
            self.assertEqual(
                status["ground_truth"][task_ids[0]]["assignee"]["username"],
                user,
            )
            dataset.load_annotations(anno_key, cleanup=True)

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
        with results:
            api = results.connect_to_api()
            project_id = api.get_project_id(project_name)
            self.assertIsNotNone(project_id)
            if project_id not in results.project_ids:
                # Delete project if it exists
                api.delete_project(project_id)
                anno_key_retry = "anno_key_retry"
                results = dataset.annotate(
                    anno_key_retry,
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

            # Test upload without schema
            anno_key3 = "anno_key3"
            results3 = dataset.annotate(
                anno_key3,
                backend="cvat",
                project_name=project_name,
            )

            with self.assertRaises(ValueError):
                label_schema = {
                    "ground_truth": {
                        "attributes": {"occluded": {"type": "occluded"}}
                    }
                }
                anno_key3 = "occluded_failure"
                dataset.annotate(
                    anno_key3,
                    label_schema=label_schema,
                    project_name=project_name,
                )

            with self.assertRaises(ValueError):
                label_schema = {
                    "ground_truth": {
                        "attributes": {"group_id": {"type": "group_id"}}
                    }
                }
                anno_key4 = "group_id_failure"
                dataset.annotate(
                    anno_key4,
                    label_schema=label_schema,
                    project_name=project_name,
                )

            dataset.load_annotations(anno_key, cleanup=True)
            project_id = api.get_project_id(project_name)
            self.assertIsNotNone(project_id)

            project_tasks = api.get_project_tasks(project_id)
            task_ids = results.task_ids + results2.task_ids + results3.task_ids
            self.assertListEqual(sorted(project_tasks), sorted(task_ids))

            dataset.load_annotations(anno_key2, cleanup=True)
            self.assertIsNotNone(api.get_project_id(project_name))
            api.delete_project(project_id)

        with results:
            api = results.connect_to_api()
            self.assertIsNone(api.get_project_id(project_name))

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

        with results:
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

        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            _create_annotation(api, task_id, tag="person")

            dataset.load_annotations(anno_key, cleanup=True)
            tags = view.first().new_classifications_2.classifications
            num_tags = len(tags)
            self.assertEqual(num_tags, 1)
            self.assertEqual(tags[0].label, "person")

            dataset.load_annotations(anno_key, cleanup=True)

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
            "sex": {
                "type": "select",
                "values": ["male", "female"],
            },
            "age": {
                "type": "text",
                "values": [],
            },
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
        with results:
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

        labels = view.values("ground_truth.detections", unwind=True)
        person_labels = view.filter_labels(
            "ground_truth", F("label") == "person"
        ).values("ground_truth.detections", unwind=True)
        self.assertListEqual(
            [d.label for d in labels],
            [d.label for d in previous_labels],
        )
        self.assertListEqual(
            [d.bounding_box for d in labels],
            [d.bounding_box for d in previous_labels],
        )
        self.assertListEqual(
            [d.id for d in labels],
            [d.id for d in previous_labels],
        )
        self.assertEqual(
            len(dataset.filter_labels("ground_truth", F("sex") == "male")),
            1,
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
        with results:
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
                api,
                task_id,
                track=(20, 40),
            )

        imported_dataset = fo.Dataset()
        with etau.TempDir() as tmp:
            fouc.import_annotations(
                imported_dataset,
                task_ids=[task_id],
                data_path=tmp,
                download_media=True,
            )
            imported_dataset.compute_metadata()
            self.assertEqual(
                imported_dataset.first().metadata.total_frame_count,
                dataset.first().metadata.total_frame_count,
            )
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
                dataset_dir=tmp,
                dataset_type=fo.types.CVATVideoDataset,
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

    def test_deleted_tasks(self):
        dataset = foz.load_zoo_dataset("quickstart", max_samples=1).clone()

        prev_ids = dataset.values("ground_truth.detections.id", unwind=True)

        anno_key = "anno_key"
        results = dataset.annotate(
            anno_key,
            backend="cvat",
            label_field="ground_truth",
        )
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            api.delete_task(task_id)

            status = results.get_status()

        dataset.load_annotations(anno_key, cleanup=True)
        self.assertListEqual(
            dataset.values("ground_truth.detections.id", unwind=True),
            prev_ids,
        )

    def test_occluded_attr(self):
        dataset = foz.load_zoo_dataset("quickstart", max_samples=1).clone()

        anno_key = "cvat_occluded_widget"

        # Populate a new `occluded` attribute on the existing `ground_truth` labels
        # using CVAT's occluded widget
        label_schema = {
            "ground_truth": {
                "attributes": {
                    "occluded": {
                        "type": "occluded",
                    }
                }
            }
        }

        results = dataset.annotate(
            anno_key, label_schema=label_schema, backend="cvat"
        )

        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            shape_id = dataset.first().ground_truth.detections[0].id

            _update_shape(api, task_id, shape_id, occluded=True)

            dataset.load_annotations(anno_key, cleanup=True)

            id_occ_map = dict(
                zip(
                    *dataset.values(
                        [
                            "ground_truth.detections.id",
                            "ground_truth.detections.occluded",
                        ],
                        unwind=True,
                    )
                )
            )
            self.assertTrue(id_occ_map.pop(shape_id))
            self.assertFalse(any(id_occ_map.values()))

    def test_map_view_stage(self):
        dataset = (
            foz.load_zoo_dataset("quickstart")
            .select_fields("ground_truth")
            .clone()
        )
        # Get a subset that contains at least 2 objects
        dataset = dataset.match(F("ground_truth.detections").length() > 1)[
            :1
        ].clone()

        prev_ids = dataset.values("ground_truth.detections.id", unwind=True)

        # Set one of the detections to upper case
        sample = dataset.first()
        label = sample.ground_truth.detections[0].label
        sample.ground_truth.detections[0].label = label.upper()
        sample.save()

        prev_unchanged_label = dataset.select_labels(ids=prev_ids[1]).values(
            "ground_truth.detections.label", unwind=True
        )[0]

        labels = dataset.distinct("ground_truth.detections.label")
        label_map = {l: l.upper() for l in labels}

        view = dataset.map_labels("ground_truth", label_map)

        anno_key = "anno_key"
        results = view.annotate(
            anno_key,
            backend="cvat",
            label_field="ground_truth",
        )
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            deleted_id = prev_ids[0]

            self.assertIsNotNone(_get_shape(api, task_id, deleted_id))
            _create_annotation(api, task_id, shape=labels[0].upper())
            _delete_shape(api, task_id, deleted_id)

        dataset.load_annotations(anno_key, cleanup=True)
        loaded_ids = dataset.values("ground_truth.detections.id", unwind=True)
        self.assertEqual(len(loaded_ids), len(prev_ids))

        # We expect existing labels to have been updated according to the
        # mapping
        unchanged_label = dataset.select_labels(ids=prev_ids[1]).values(
            "ground_truth.detections.label", unwind=True
        )[0]
        self.assertNotEqual(unchanged_label, prev_unchanged_label)

        # Expect newly created labels to retain whatever class they were
        # annotated as
        new_id = list(set(loaded_ids) - set(prev_ids))[0]
        new_label = dataset.select_labels(ids=new_id).values(
            "ground_truth.detections.label", unwind=True
        )[0]
        self.assertEqual(labels[0].upper(), new_label)

    def test_dest_field(self):
        # Test images
        dataset = foz.load_zoo_dataset("quickstart", max_samples=2).clone()

        prev_labels = dataset.values("ground_truth", unwind=True)

        anno_key = "test_dest_field"
        results = dataset.annotate(anno_key, label_field="ground_truth")

        dataset.load_annotations(
            anno_key,
            cleanup=True,
            dest_field="test_field",
        )
        self.assertListEqual(
            prev_labels,
            dataset.values("ground_truth", unwind=True),
        )
        self.assertListEqual(
            sorted(dataset.values("ground_truth.detections.id", unwind=True)),
            sorted(dataset.values("test_field.detections.id", unwind=True)),
        )

        # Test dict
        dataset = foz.load_zoo_dataset("quickstart", max_samples=2).clone()

        prev_labels = dataset.values("ground_truth", unwind=True)

        anno_key = "test_dest_field"

        label_schema = {
            "ground_truth": {},
            "new_points": {
                "type": "keypoints",
                "classes": ["test"],
            },
            "new_polygon": {
                "type": "polygons",
                "classes": ["test2"],
            },
        }
        results = dataset.annotate(anno_key, label_schema=label_schema)
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            _create_annotation(
                api,
                task_id,
                shape="test",
                _type="points",
                points=[10, 20, 40, 30, 50, 60],
            )
            _create_annotation(
                api,
                task_id,
                shape="test2",
                _type="polygon",
                points=[10, 20, 40, 30, 50, 60],
            )

        dest_field = {
            "ground_truth": "test_field_1",
            "new_points": "test_field_2",
        }

        dataset.load_annotations(
            anno_key,
            cleanup=True,
            dest_field=dest_field,
        )
        self.assertFalse(dataset.has_sample_field("new_points"))
        self.assertTrue(dataset.has_sample_field("new_polygon"))
        self.assertTrue(dataset.has_sample_field("test_field_1"))
        self.assertTrue(dataset.has_sample_field("test_field_2"))
        self.assertListEqual(
            prev_labels,
            dataset.values("ground_truth", unwind=True),
        )
        self.assertListEqual(
            sorted(dataset.values("ground_truth.detections.id", unwind=True)),
            sorted(dataset.values("test_field_1.detections.id", unwind=True)),
        )
        self.assertEqual(
            len(dataset.values("test_field_2.keypoints.id", unwind=True)),
            1,
        )
        self.assertEqual(
            len(dataset.values("new_polygon.polylines.id", unwind=True)),
            1,
        )

        # Test modification
        dataset = foz.load_zoo_dataset("quickstart", max_samples=2).clone()

        prev_ids = dataset.values("ground_truth.detections.id", unwind=True)

        anno_key = "test_dest_field"
        results = dataset.annotate(anno_key, label_field="ground_truth")

        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            shape_id = dataset.first().ground_truth.detections[0].id

            _delete_shape(api, task_id, shape_id)
            _create_annotation(api, task_id, shape=True)
            _create_annotation(
                api,
                task_id,
                shape=True,
                _type="points",
                points=[10, 20, 40, 30, 50, 60],
            )

        dataset.load_annotations(
            anno_key,
            cleanup=True,
            dest_field="test_field",
            unexpected="keep",
        )

        self.assertListEqual(
            sorted(prev_ids),
            sorted(dataset.values("ground_truth.detections.id", unwind=True)),
        )

        test_ids = dataset.values("test_field.detections.id", unwind=True)
        self.assertEqual(len(set(test_ids) - set(prev_ids)), 1)
        self.assertEqual(len(set(prev_ids) - set(test_ids)), 1)

        # Test videos
        dataset = foz.load_zoo_dataset(
            "quickstart-video", max_samples=1
        ).clone()

        prev_labels = dataset.values("frames.detections", unwind=True)

        anno_key = "test_dest_field"
        results = dataset.annotate(anno_key, label_field="frames.detections")

        dataset.load_annotations(
            anno_key,
            cleanup=True,
            dest_field="frames.test_field",
        )
        self.assertListEqual(
            prev_labels,
            dataset.values("frames.detections", unwind=True),
        )
        self.assertListEqual(
            sorted(
                dataset.values("frames.detections.detections.id", unwind=True)
            ),
            sorted(
                dataset.values("frames.test_field.detections.id", unwind=True)
            ),
        )

    def test_group_id_image(self):
        dataset = (
            foz.load_zoo_dataset("quickstart", max_samples=2)
            .select_fields("ground_truth")
            .clone()
        )
        group_id_attr_name = "group_id_attr"

        # Set group id attribute
        sample = dataset.first()
        for det in sample.ground_truth.detections:
            det["group_id_attr"] = 1
        sample.save()

        anno_key = "cvat_group_ids"

        # Populate a new `group_id` attribute on the existing `ground_truth` labels
        label_schema = {
            "ground_truth": {
                "attributes": {
                    group_id_attr_name: {
                        "type": "group_id",
                    }
                }
            }
        }

        results = dataset.annotate(
            anno_key, label_schema=label_schema, backend="cvat"
        )

        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            shape_id = dataset.first().ground_truth.detections[0].id

            test_group_id = 2
            _update_shape(api, task_id, shape_id, group_id=test_group_id)

        dataset.load_annotations(anno_key, cleanup=True)

        id_group_map = dict(
            zip(
                *dataset.values(
                    [
                        "ground_truth.detections.id",
                        "ground_truth.detections.%s" % group_id_attr_name,
                    ],
                    unwind=True,
                )
            )
        )
        self.assertEqual(id_group_map.pop(shape_id), test_group_id)
        self.assertFalse(
            any([gid == test_group_id for gid in id_group_map.values()])
        )

    def test_group_id_video(self):
        dataset = (
            foz.load_zoo_dataset("quickstart-video", max_samples=1)
            .select_fields("frames.detections")
            .clone()
        )
        group_id_attr_name = "group_id_attr"

        prev_ids = dataset.values(
            "frames.detections.detections.id", unwind=True
        )

        # Set group id attribute
        sample = dataset.first()
        for det in sample.frames[1].detections.detections:
            det["group_id_attr"] = 1
        sample.save()

        anno_key = "cvat_group_ids"

        # Populate a new `group_id` attribute on the existing `ground_truth` labels
        label_schema = {
            "frames.detections": {
                "attributes": {
                    group_id_attr_name: {
                        "type": "group_id",
                    }
                }
            }
        }

        results = dataset.annotate(
            anno_key, label_schema=label_schema, backend="cvat"
        )

        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]

            test_group_id = 2
            _create_annotation(
                api,
                task_id,
                track=(0, 1),
                group_id=test_group_id,
            )

        dataset.load_annotations(anno_key, cleanup=True)

        new_id = list(
            set(dataset.values("frames.detections.detections.id", unwind=True))
            - set(prev_ids)
        )[0]

        id_group_map = dict(
            zip(
                *dataset.values(
                    [
                        "frames.detections.detections.id",
                        "frames.detections.detections.%s" % group_id_attr_name,
                    ],
                    unwind=True,
                )
            )
        )
        self.assertEqual(id_group_map.pop(new_id), test_group_id)
        self.assertFalse(
            any([gid == test_group_id for gid in id_group_map.values()])
        )

    def test_task_exists(self):
        dataset = (
            foz.load_zoo_dataset("quickstart", max_samples=20)
            .select_fields("ground_truth")
            .clone()
        )

        anno_key = "task_exists"
        results = dataset.annotate(
            anno_key,
            label_field="ground_truth",
            backend="cvat",
            task_size=1,
        )

        tasks_exist = []
        with results:
            api = results.connect_to_api()
            for task_id in results.task_ids:
                tasks_exist.append(api.task_exists(task_id))

        dataset.load_annotations(anno_key, cleanup=True)

        self.assertNotIn(False, tasks_exist)

        view = dataset.take(1)

        anno_key = "task_not_exists"
        results = view.annotate(
            anno_key,
            label_field="ground_truth",
            backend="cvat",
        )

        task_id = results.task_ids[0]
        with results:
            api = results.connect_to_api()
            api.delete_task(task_id)
            self.assertFalse(api.task_exists(task_id))

        dataset.load_annotations(anno_key, cleanup=True)

    def test_project_exists(self):
        dataset = (
            foz.load_zoo_dataset("quickstart", max_samples=1)
            .select_fields("ground_truth")
            .clone()
        )

        all_results = []
        for i in range(20):
            anno_key = "project_exists"
            results = dataset.annotate(
                anno_key + str(i),
                label_field="ground_truth",
                backend="cvat",
                project_name="fo_cvat_test_" + str(i),
            )
            all_results.append(results)

        projects_exist = []
        for i, results in enumerate(all_results):
            with results:
                api = results.connect_to_api()
                for project_id in results.project_ids:
                    projects_exist.append(api.project_exists(project_id))

            dataset.load_annotations(anno_key + str(i), cleanup=True)

        self.assertNotIn(False, projects_exist)

        view = dataset.take(1)

        anno_key = "project_not_exists"
        results = view.annotate(
            anno_key,
            label_field="ground_truth",
            backend="cvat",
            project_name="fo_cvat_project_test",
        )

        project_id = results.project_ids[0]
        with results:
            api = results.connect_to_api()
            api.delete_project(project_id)
            self.assertFalse(api.project_exists(project_id))

        dataset.load_annotations(anno_key, cleanup=True)

    def test_deleted_label_field(self):
        dataset = foz.load_zoo_dataset("quickstart", max_samples=1).clone()
        view = dataset.select_fields("ground_truth")
        prev_ids = dataset.values("ground_truth.detections.id", unwind=True)

        anno_key = "anno_key"
        results = view.annotate(
            anno_key,
            backend="cvat",
            label_field="ground_truth",
        )
        dataset.delete_sample_field("ground_truth")
        dataset.reload()

        dataset.load_annotations(anno_key, cleanup=True)
        self.assertListEqual(
            sorted(dataset.values("ground_truth.detections.id", unwind=True)),
            sorted(prev_ids),
        )

        # Test scalar
        view = dataset.select_fields("uniqueness")
        anno_key = "anno_key2"
        results = view.annotate(
            anno_key,
            backend="cvat",
            label_field="uniqueness",
        )
        dataset.delete_sample_field("uniqueness")
        dataset.reload()

        dataset.load_annotations(anno_key, cleanup=True)

    def test_frame_start_stop_step(self):
        dataset = foz.load_zoo_dataset(
            "quickstart-video", max_samples=1
        ).clone()

        prev_ids = dataset.values(
            "frames.detections.detections.id", unwind=True
        )

        with self.assertRaises(ValueError):
            # Attempting to upload existing tracks with a frame_step
            anno_key = "anno_key_1"
            results = dataset.annotate(
                anno_key,
                backend="cvat",
                label_field="frames.detections",
                frame_start=10,
                frame_stop=100,
                frame_step=5,
            )

        with self.assertRaises(ValueError):
            # Frame step must be greater than 1
            anno_key = "anno_key_2"
            results = dataset.annotate(
                anno_key,
                backend="cvat",
                label_field="frames.new_detections",
                label_type="detections",
                classes=["test"],
                frame_start=10,
                frame_stop=100,
                frame_step=0,
            )

        # Test successful upload and download of annotations
        anno_key = "anno_key_3"
        results = dataset.annotate(
            anno_key,
            backend="cvat",
            label_field="frames.detections",
            frame_start=10,
            frame_stop=100,
        )
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            shape_id = dataset.first().frames[11].detections.detections[0].id
            self.assertIsNotNone(_get_shape(api, task_id, shape_id))

            sample_id = list(list(results.frame_id_map.values())[0].values())[
                0
            ]["sample_id"]
            self.assertEqual(sample_id, dataset.first().id)

        dataset.reload()
        dataset.load_annotations(anno_key, cleanup=True)

        self.assertListEqual(
            prev_ids,
            dataset.values("frames.detections.detections.id", unwind=True),
        )

        # Test creating new shapes, tags and tracks
        anno_key = "anno_key_4"
        results = dataset.annotate(
            anno_key,
            backend="cvat",
            label_schema={
                "frames.detections_new": {
                    "type": "detections",
                    "classes": ["test_track", "test_shape"],
                },
                "frames.tags_new": {
                    "type": "classification",
                    "classes": ["test_tag"],
                },
            },
            frame_start=10,
            frame_stop=100,
            frame_step=5,
        )
        track_start = 5
        track_end = 10
        shape_frame = 1
        tag_frame = 1
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            _create_annotation(
                api,
                task_id,
                track=(track_start, track_end),
                _label="test_track",
            )
            shape = {
                "type": "rectangle",
                "frame": shape_frame,
                "label_id": _get_label(api, task_id, label="test_shape"),
                "group": 0,
                "attributes": [],
                "points": [10, 20, 30, 40],
                "occluded": False,
            }
            _create_annotation(api, task_id, shape=shape)
            tag = {
                "frame": tag_frame,
                "label_id": _get_label(api, task_id, label="test_tag"),
                "group": 0,
                "attributes": [],
            }
            _create_annotation(api, task_id, tag=tag)

        dataset.load_annotations(anno_key, cleanup=True)

        start = 10
        step = 5
        remapped_track_start = start + (track_start * step) + 1
        remapped_track_end = start + (track_end * step) + 1
        remapped_track_ids = list(
            range(remapped_track_start, remapped_track_end)
        )

        remapped_shape_ids = [shape_frame * step + start + 1]
        remapped_tag_ids = [tag_frame * step + start + 1]

        track_view = dataset.filter_labels(
            "frames.detections_new", F("label") == "test_track"
        )
        shape_view = dataset.filter_labels(
            "frames.detections_new", F("label") == "test_shape"
        )

        self.assertListEqual(
            remapped_track_ids,
            track_view.match_frames(
                F("detections_new.detections").length() > 0
            ).values("frames.frame_number", unwind=True),
        )

        self.assertListEqual(
            remapped_shape_ids,
            shape_view.match_frames(
                F("detections_new.detections").length() > 0
            ).values("frames.frame_number", unwind=True),
        )

        self.assertListEqual(
            remapped_tag_ids,
            dataset.match_frames(F("tags_new").exists()).values(
                "frames.frame_number", unwind=True
            ),
        )

        # Test deleting shapes with a frame step (not tracks which are not
        # allowed)

        shape_start = 10
        shape_end = 51
        sample = dataset.first()
        for frame_number, frame in sample.frames.items():
            if frame_number >= shape_start and frame_number < shape_end:
                frame["delete_shapes"] = fo.Detections(
                    detections=[
                        fo.Detection(
                            label="test", bounding_box=[0.1, 0.1, 0.1, 0.1]
                        )
                    ]
                )
        sample.save()

        frame_start = 5
        frame_stop = 35
        frame_step = 5
        delete_shape_frame = 2
        remapped_delete_shape_frame = (
            (delete_shape_frame * frame_step) + frame_start + 1
        )
        shape_id = (
            sample.frames[remapped_delete_shape_frame]
            .delete_shapes.detections[0]
            .id
        )

        all_shape_ids = dataset.values(
            "frames.delete_shapes.detections.id", unwind=True
        )

        anno_key = "anno_key_5"
        results = dataset.annotate(
            anno_key,
            backend="cvat",
            label_field="frames.delete_shapes",
            frame_start=frame_start,
            frame_stop=frame_stop,
            frame_step=frame_step,
        )
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            _delete_shape(api, task_id, shape_id)

        dataset.load_annotations(anno_key, cleanup=True)

        remaining_shape_ids = sorted(set(all_shape_ids) - {shape_id})

        self.assertListEqual(
            remaining_shape_ids,
            sorted(
                dataset.values(
                    "frames.delete_shapes.detections.id", unwind=True
                )
            ),
        )

        # Test list args
        start = 10
        step = 5
        anno_key = "anno_key_6"
        results = dataset.annotate(
            anno_key,
            backend="cvat",
            label_field="frames.detections_new_2",
            label_type="detections",
            classes=["test"],
            frame_start=[start],
            frame_stop=[100],
            frame_step=[step],
        )
        track_start = 5
        track_end = 10
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            _create_annotation(
                api,
                task_id,
                track=(track_start, track_end),
            )

        dataset.load_annotations(anno_key, cleanup=True)

        remapped_track_start = start + (track_start * step) + 1
        remapped_track_end = start + (track_end * step) + 1
        remapped_track_ids = list(
            range(remapped_track_start, remapped_track_end)
        )

        self.assertListEqual(
            remapped_track_ids,
            dataset.match_frames(
                F("detections_new_2.detections").length() > 0
            ).values("frames.frame_number", unwind=True),
        )

        # Test dict args
        start = 10
        step = 5
        fp = dataset.first().filepath
        anno_key = "anno_key_7"
        results = dataset.annotate(
            anno_key,
            backend="cvat",
            label_field="frames.detections_new_3",
            label_type="detections",
            classes=["test"],
            frame_start={fp: start},
            frame_stop={fp: 100},
            frame_step={fp: step},
        )
        track_start = 5
        track_end = 10
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            _create_annotation(
                api,
                task_id,
                track=(track_start, track_end),
            )

        dataset.load_annotations(anno_key, cleanup=True)

        remapped_track_start = start + (track_start * step) + 1
        remapped_track_end = start + (track_end * step) + 1
        remapped_track_ids = list(
            range(remapped_track_start, remapped_track_end)
        )

        self.assertListEqual(
            remapped_track_ids,
            dataset.match_frames(
                F("detections_new_3.detections").length() > 0
            ).values("frames.frame_number", unwind=True),
        )

    def test_frames_view(self):
        dataset = foz.load_zoo_dataset(
            "quickstart-video", max_samples=1
        ).clone()

        view = dataset.to_frames(sample_frames=True)

        prev_ids = dataset.values(
            "frames.detections.detections.id", unwind=True
        )

        # Test successful upload and download of annotations
        anno_key = "anno_key_1"
        results = view.annotate(
            anno_key,
            backend="cvat",
            label_field="detections",
        )
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            shape_id = view.first().detections.detections[0].id
            self.assertIsNotNone(_get_shape(api, task_id, shape_id))

            frame_id = list(list(results.frame_id_map.values())[0].values())[
                0
            ]["sample_id"]
            self.assertEqual(frame_id, view.first().id)
            sample_id = results.id_map["_frames"][frame_id]
            self.assertEqual(sample_id, view.first().sample_id)

        dataset.reload()
        view.load_annotations(anno_key, cleanup=True)

        self.assertListEqual(
            prev_ids,
            dataset.values("frames.detections.detections.id", unwind=True),
        )

        # Test creating new shapes, tags and tracks
        anno_key = "anno_key_2"
        results = view.annotate(
            anno_key,
            backend="cvat",
            label_schema={
                "detections_new": {
                    "type": "detections",
                    "classes": ["test_shape"],
                },
                "tags_new": {
                    "type": "classification",
                    "classes": ["test_tag"],
                },
            },
        )
        shape_frame = 0
        tag_frame = 0
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            shape = {
                "type": "rectangle",
                "frame": shape_frame,
                "label_id": _get_label(api, task_id, label="test_shape"),
                "group": 0,
                "attributes": [],
                "points": [10, 20, 30, 40],
                "occluded": False,
            }
            _create_annotation(api, task_id, shape=shape)
            tag = {
                "frame": tag_frame,
                "label_id": _get_label(api, task_id, label="test_tag"),
                "group": 0,
                "attributes": [],
            }
            _create_annotation(api, task_id, tag=tag)

        dataset.load_annotations(anno_key, cleanup=True)

        shape_view = dataset.filter_labels(
            "frames.detections_new", F("label") == "test_shape"
        )

        self.assertListEqual(
            [shape_frame + 1],
            shape_view.match_frames(
                F("detections_new.detections").length() > 0
            ).values("frames.frame_number", unwind=True),
        )

        self.assertListEqual(
            [tag_frame + 1],
            dataset.match_frames(F("tags_new").exists()).values(
                "frames.frame_number", unwind=True
            ),
        )

    def test_clips_view(self):
        dataset = foz.load_zoo_dataset(
            "quickstart-video", max_samples=2
        ).clone()

        sample = dataset.first()

        def gen_temp_dets():
            temp_dets = [
                fo.TemporalDetection(label="test", support=[10, 20]),
                fo.TemporalDetection(label="test2", support=[30, 40]),
            ]
            return fo.TemporalDetections(detections=temp_dets)

        dataset.set_values(
            "clips", [gen_temp_dets() for _ in range(len(dataset))]
        )
        view = dataset.to_clips("clips")

        prev_ids = dataset.values(
            "frames.detections.detections.id", unwind=True
        )

        # Test successful upload and download of annotations
        anno_key = "anno_key_1"
        results = view.annotate(
            anno_key,
            backend="cvat",
            label_field="frames.detections",
        )
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            shape_id = dataset.first().frames[11].detections.detections[0].id
            self.assertIsNotNone(_get_shape(api, task_id, shape_id))

            clip_id = list(list(results.frame_id_map.values())[0].values())[0][
                "sample_id"
            ]
            self.assertEqual(clip_id, view.first().id)

            sample_id = results.id_map["_clips"][clip_id]
            self.assertEqual(sample_id, view.first().sample_id)

            frame_id = list(list(results.frame_id_map.values())[0].values())[
                0
            ]["frame_id"]
            self.assertEqual(frame_id, view.values("frames.id")[0][0])

        dataset.reload()
        view.load_annotations(anno_key, cleanup=True)

        self.assertListEqual(
            prev_ids,
            dataset.values("frames.detections.detections.id", unwind=True),
        )

        # Test creating new shapes, tags and tracks
        anno_key = "anno_key_2"
        results = view.annotate(
            anno_key,
            backend="cvat",
            label_schema={
                "frames.detections_new": {
                    "type": "detections",
                    "classes": ["test_track", "test_shape"],
                },
                "frames.tags_new": {
                    "type": "classification",
                    "classes": ["test_tag"],
                },
            },
        )
        track_start = 5
        track_end = 10
        shape_frame = 1
        tag_frame = 1
        with results:
            api = results.connect_to_api()
            task_id = results.task_ids[0]
            _create_annotation(
                api,
                task_id,
                track=(track_start, track_end),
                _label="test_track",
            )
            shape = {
                "type": "rectangle",
                "frame": shape_frame,
                "label_id": _get_label(api, task_id, label="test_shape"),
                "group": 0,
                "attributes": [],
                "points": [10, 20, 30, 40],
                "occluded": False,
            }
            _create_annotation(api, task_id, shape=shape)
            tag = {
                "frame": tag_frame,
                "label_id": _get_label(api, task_id, label="test_tag"),
                "group": 0,
                "attributes": [],
            }
            _create_annotation(api, task_id, tag=tag)

        dataset.load_annotations(anno_key, cleanup=True)

        start = 10
        remapped_track_start = start + track_start
        remapped_track_end = start + track_end
        remapped_track_ids = list(
            range(remapped_track_start, remapped_track_end)
        )

        remapped_shape_ids = [shape_frame + start]
        remapped_tag_ids = [tag_frame + start]

        track_view = dataset.filter_labels(
            "frames.detections_new", F("label") == "test_track"
        )
        shape_view = dataset.filter_labels(
            "frames.detections_new", F("label") == "test_shape"
        )

        self.assertListEqual(
            remapped_track_ids,
            track_view.match_frames(
                F("detections_new.detections").length() > 0
            ).values("frames.frame_number", unwind=True),
        )

        self.assertListEqual(
            remapped_shape_ids,
            shape_view.match_frames(
                F("detections_new.detections").length() > 0
            ).values("frames.frame_number", unwind=True),
        )

        self.assertListEqual(
            remapped_tag_ids,
            dataset.match_frames(F("tags_new").exists()).values(
                "frames.frame_number", unwind=True
            ),
        )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
