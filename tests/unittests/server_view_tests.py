"""
FiftyOne Server view tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import inspect
import math
import unittest

import eta.core.utils as etau
import numpy as np

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.expression_ast as foea
import fiftyone.core.expression_catalog as focx
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos
import fiftyone.core.stages as fosg
from fiftyone.server.app import schema
import fiftyone.server.expressions as fose
from fiftyone.server.query import Dataset
from fiftyone.server.samples import paginate_samples
import fiftyone.server.stage_definitions as fosd
import fiftyone.server.view as fosv

from decorators import drop_datasets
from utils.groups import make_disjoint_groups_dataset


class ServerViewTests(unittest.TestCase):
    @drop_datasets
    def test_extended_image_sample(self):
        dataset = fod.Dataset("test")
        sample = fos.Sample(
            filepath="image.png",
            predictions=fol.Detections(
                detections=[
                    fol.Detection(
                        label="carrot", confidence=0.25, tags=["one", "two"]
                    ),
                    fol.Detection(
                        label="not_carrot", confidence=0.75, tags=["two"]
                    ),
                ]
            ),
            bool=True,
            int=1,
            str="str",
            list_bool=[True],
            list_int=[1, 2],
            list_str=["one", "two"],
        )
        dataset.add_sample(sample)
        filters = {
            "id": {
                "values": [dataset.first().id],
                "exclude": False,
            }
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)

        filters = {
            "id": {
                "values": [dataset.first().id],
                "exclude": True,
            }
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "predictions.detections.label": {
                "values": ["carrot"],
                "exclude": False,
                "isMatching": False,
            },
            "predictions.detections.confidence": {
                "range": [0.5, 1],
                "exclude": False,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "predictions.detections.label": {
                "values": ["carrot"],
                "exclude": False,
                "isMatching": False,
            },
            "predictions.detections.confidence": {
                "range": [0.0, 0.5],
                "exclude": False,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().predictions.detections), 1)

        filters = {
            "predictions.detections.confidence": {
                "range": [0.5, None],
                "exclude": False,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().predictions.detections), 1)

        filters = {
            "list_str": {
                "values": ["one"],
                "exclude": False,
            },
            "list_int": {
                "range": [0, 2],
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().list_str), 2)
        self.assertEqual(len(view.first().list_int), 2)

        filters = {
            "list_str": {
                "values": ["empty"],
                "exclude": False,
            },
            "list_int": {
                "range": [0, 2],
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "list_str": {
                "values": ["one"],
                "exclude": False,
            },
            "list_int": {
                "range": [3, 4],
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "list_bool": {
                "true": False,
                "false": True,
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "list_bool": {
                "true": False,
                "false": True,
                "exclude": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)

        filters = {
            "list_bool": {
                "true": True,
                "false": False,
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)

        view = fosv.get_view("test", pagination_data=True)
        (sample,) = list(
            foo.aggregate(
                foo.get_db_conn()[view._dataset._sample_collection_name],
                view._pipeline(),
            )
        )
        self.assertNotIn("_label_tags", sample)

        filters = {
            "_label_tags": {
                "values": ["two"],
                "exclude": False,
                "isMatching": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().predictions.detections), 2)

        filters = {
            "_label_tags": {
                "values": ["one"],
                "exclude": False,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().predictions.detections), 1)

        view = fosv.get_view("test", pagination_data=True, filters=filters)
        (sample,) = list(
            foo.aggregate(
                foo.get_db_conn()[view._dataset._sample_collection_name],
                view._pipeline(),
            )
        )
        self.assertNotIn("_label_tags", sample)

        filters = {
            "_label_tags": {
                "values": ["two"],
                "exclude": True,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().predictions.detections), 0)

        filters = {
            "_label_tags": {
                "values": ["one"],
                "exclude": True,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(
            view.first().predictions.detections[0].label, "not_carrot"
        )

        view = fosv.get_view("test", pagination_data=True, filters=filters)
        (sample,) = list(
            foo.aggregate(
                foo.get_db_conn()[view._dataset._sample_collection_name],
                view._pipeline(),
            )
        )
        self.assertNotIn("_label_tags", sample)

        filters = {
            "_label_tags": {
                "values": ["one"],
                "exclude": True,
                "isMatching": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

    @drop_datasets
    def test_pagination_data_excludes_exact_paths(self):
        dataset = fo.Dataset("test")
        dataset.add_sample(
            fo.Sample(
                filepath="image.png",
                clip=np.array([1.0, 2.0]),
                **{"clip-pred-test": fo.Classification(label="cat")},
            )
        )

        view = fosv.get_view("test", pagination_data=True)
        (sample,) = list(
            foo.aggregate(
                foo.get_db_conn()[view._dataset._sample_collection_name],
                view._pipeline(),
            )
        )

        # the vector field is excluded; a sibling field sharing its name
        # prefix is not
        self.assertNotIn("clip", sample)
        self.assertIn("clip-pred-test", sample)

    @drop_datasets
    def test_extended_frame_sample(self):
        dataset = fod.Dataset("test")
        sample = fos.Sample(
            filepath="video.mp4",
        )
        sample.frames[1] = fo.Frame(
            predictions=fol.Detections(
                detections=[
                    fol.Detection(
                        label="carrot", confidence=0.25, tags=["one", "two"]
                    ),
                    fol.Detection(
                        label="not_carrot", confidence=0.75, tags=["two"]
                    ),
                ]
            )
        )
        dataset.add_sample(sample)

        filters = {
            "frames.predictions.detections.label": {
                "values": ["carrot"],
                "exclude": False,
                "isMatching": False,
            },
            "frames.predictions.detections.confidence": {
                "range": [0.5, 1],
                "exclude": False,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "frames.predictions.detections.label": {
                "values": ["carrot"],
                "exclude": False,
                "isMatching": False,
            },
            "frames.predictions.detections.confidence": {
                "range": [0.0, 0.5],
                "exclude": False,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().frames[1].predictions.detections), 1)

        view = fosv.get_view("test", pagination_data=True)
        (sample,) = list(
            foo.aggregate(
                foo.get_db_conn()[view._dataset._sample_collection_name],
                view._pipeline(),
            )
        )
        self.assertNotIn("_label_tags", sample)

        filters = {
            "_label_tags": {
                "values": ["two"],
                "exclude": False,
                "isMatching": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().frames[1].predictions.detections), 2)

        filters = {
            "_label_tags": {
                "values": ["one"],
                "exclude": False,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().frames[1].predictions.detections), 1)

        view = fosv.get_view("test", pagination_data=True, filters=filters)
        (sample,) = list(
            foo.aggregate(
                foo.get_db_conn()[view._dataset._sample_collection_name],
                view._pipeline(),
            )
        )
        self.assertNotIn("_label_tags", sample)

        filters = {
            "_label_tags": {
                "values": ["two"],
                "exclude": True,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().frames[1].predictions.detections), 0)

        filters = {
            "_label_tags": {
                "values": ["one"],
                "exclude": True,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(
            view.first().frames[1].predictions.detections[0].label,
            "not_carrot",
        )

        view = fosv.get_view("test", pagination_data=True, filters=filters)
        (sample,) = list(
            foo.aggregate(
                foo.get_db_conn()[view._dataset._sample_collection_name],
                view._pipeline(),
            )
        )
        self.assertNotIn("_label_tags", sample)

        filters = {
            "_label_tags": {
                "values": ["one"],
                "exclude": True,
                "isMatching": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

    @drop_datasets
    def test_extended_dynamic_image_sample(self):
        dataset = fod.Dataset("test")
        sample = fos.Sample(
            filepath="image.png",
            dynamic=fo.DynamicEmbeddedDocument(
                predictions=fol.Detections(
                    detections=[
                        fol.Detection(
                            label="carrot",
                            confidence=0.25,
                            tags=["one", "two"],
                        ),
                        fol.Detection(
                            label="not_carrot", confidence=0.75, tags=["two"]
                        ),
                    ]
                ),
                bool=True,
                int=1,
                str="str",
                list_bool=[True],
                list_int=[1, 2],
                list_str=["one", "two"],
            ),
            dynamic_list=[
                fo.DynamicEmbeddedDocument(
                    bool=True,
                    int=1,
                    str="str",
                    list_bool=[True],
                    list_int=[1, 2],
                    list_str=["one", "two"],
                )
            ],
        )
        dataset.add_sample(sample)
        dataset.add_dynamic_sample_fields()

        filters = {
            "dynamic.predictions.detections.label": {
                "values": ["carrot"],
                "exclude": False,
                "isMatching": False,
            },
            "dynamic.predictions.detections.confidence": {
                "range": [0.5, 1],
                "exclude": False,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "dynamic.predictions.detections.label": {
                "values": ["carrot"],
                "exclude": False,
                "isMatching": False,
            },
            "dynamic.predictions.detections.confidence": {
                "range": [0.0, 0.5],
                "exclude": False,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().dynamic.predictions.detections), 1)

        filters = {
            "dynamic.list_str": {
                "values": ["one"],
                "exclude": False,
            },
            "dynamic.list_int": {
                "range": [0, 2],
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().dynamic.list_str), 2)
        self.assertEqual(len(view.first().dynamic.list_int), 2)

        filters = {
            "dynamic.list_str": {
                "values": ["empty"],
                "exclude": False,
            },
            "dynamic.list_int": {
                "range": [0, 2],
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "dynamic.list_str": {
                "values": ["one"],
                "exclude": False,
            },
            "dynamic.list_int": {
                "range": [3, 4],
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "dynamic.list_bool": {
                "true": False,
                "false": True,
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "dynamic.list_bool": {
                "true": False,
                "false": True,
                "exclude": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)

        filters = {
            "dynamic.list_bool": {
                "true": True,
                "false": False,
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)

        view = fosv.get_view("test", pagination_data=True)
        (sample,) = list(
            foo.aggregate(
                foo.get_db_conn()[view._dataset._sample_collection_name],
                view._pipeline(),
            )
        )
        self.assertNotIn("_label_tags", sample)

        filters = {
            "_label_tags": {
                "values": ["two"],
                "exclude": False,
                "isMatching": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().dynamic.predictions.detections), 2)

        filters = {
            "_label_tags": {
                "values": ["one"],
                "exclude": False,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().dynamic.predictions.detections), 1)

        view = fosv.get_view("test", pagination_data=True, filters=filters)
        (sample,) = list(
            foo.aggregate(
                foo.get_db_conn()[view._dataset._sample_collection_name],
                view._pipeline(),
            )
        )
        self.assertNotIn("_label_tags", sample)

        filters = {
            "_label_tags": {
                "values": ["two"],
                "exclude": True,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(len(view.first().dynamic.predictions.detections), 0)

        filters = {
            "_label_tags": {
                "values": ["one"],
                "exclude": True,
                "isMatching": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertEqual(
            view.first().dynamic.predictions.detections[0].label, "not_carrot"
        )

        view = fosv.get_view("test", pagination_data=True, filters=filters)
        (sample,) = list(
            foo.aggregate(
                foo.get_db_conn()[view._dataset._sample_collection_name],
                view._pipeline(),
            )
        )
        self.assertNotIn("_label_tags", sample)

        filters = {
            "_label_tags": {
                "values": ["one"],
                "exclude": True,
                "isMatching": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "dynamic_list.bool": {
                "true": False,
                "false": True,
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "dynamic_list.list_bool": {
                "true": False,
                "false": True,
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "dynamic_list.bool": {
                "true": True,
                "false": False,
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)

        filters = {
            "dynamic_list.list_bool": {
                "true": True,
                "false": False,
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)

        filters = {
            "dynamic_list.int": {
                "range": [-1, 0],
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "dynamic_list.list_int": {
                "range": [-1, 0],
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "dynamic_list.int": {
                "range": [0, 1],
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)

        filters = {
            "dynamic_list.list_int": {
                "range": [0, 1],
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)

        filters = {
            "dynamic_list.int": {
                "range": [0, 2],
                "exclude": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "dynamic_list.list_int": {
                "range": [0, 2],
                "exclude": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

    @drop_datasets
    def test_extended_keypoint_sample(self):
        dataset = fod.Dataset("test")
        dataset.default_skeleton = fo.KeypointSkeleton(
            labels=["top-left", "center", "bottom-right"], edges=[[0, 1, 2]]
        )
        sample = fos.Sample(
            filepath="video.mp4",
            keypoint=fo.Keypoint(
                label="keypoint",
                points=[[0, 0], [0.5, 0.5], [1, 1]],
                confidence=[0, 0.5, 1],
                dynamic=["one", "two", "three"],
                tags=["keypoint"],
            ),
            keypoints=fo.Keypoints(
                keypoints=[
                    fo.Keypoint(
                        label="keypoint",
                        points=[[0, 0], [0.5, 0.5], [1, 1]],
                        confidence=[0, 0.5, 1],
                        dynamic=["one", "two", "three"],
                        tags=["keypoint"],
                    )
                ]
            ),
        )

        dataset.add_sample(sample)
        dataset.add_dynamic_sample_fields()
        dataset.add_dynamic_frame_fields()

        filters = {
            "keypoint.label": {
                "values": ["empty"],
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "keypoint.label": {
                "values": ["keypoint"],
                "exclude": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "keypoint.points": {
                "values": ["top-left"],
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)
        self.assertListEqual(view.first().keypoint.points[0], [0, 0])
        for point in view.first().keypoint.points[1:]:
            self.assertTrue(math.isnan(point[0]))
            self.assertTrue(math.isnan(point[1]))

        filters = {
            "keypoint.points": {
                "values": ["top-left"],
                "exclude": False,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)

    def test_disjoint_groups(self):
        dataset, first, second = make_disjoint_groups_dataset()
        first_view = fosv.get_view(
            dataset.name,
            sample_filter=fosv.SampleFilter(
                group=fosv.GroupElementFilter(
                    slice="first", id=first.group.id, slices=["first"]
                )
            ),
        )
        self.assertEqual(first_view.first().id, first.id)

        second_view = fosv.get_view(
            dataset.name,
            sample_filter=fosv.SampleFilter(
                group=fosv.GroupElementFilter(
                    slice="second", id=second.group.id, slices=["second"]
                )
            ),
        )
        self.assertEqual(second_view.first().id, second.id)

    @drop_datasets
    def test_get_view_captures_all_parameters(self):
        dataset = fod.Dataset("test")
        dataset.add_group_field("group", default="first")
        group_one = fo.Group()
        group_two = fo.Group()
        sample_one = fos.Sample(
            filepath="image1.png",
            predictions=fol.Detections(
                detections=[
                    fol.Detection(
                        label="carrot", confidence=0.25, tags=["one", "two"]
                    ),
                    fol.Detection(
                        label="not_carrot", confidence=0.75, tags=["two"]
                    ),
                ]
            ),
            group=group_one.element(name="first"),
        )
        sample_two = fos.Sample(
            filepath="image2.png",
            predictions=fol.Detections(
                detections=[
                    fol.Detection(
                        label="carrot", confidence=0.25, tags=["one", "two"]
                    ),
                    fol.Detection(
                        label="not_carrot", confidence=0.75, tags=["two"]
                    ),
                ]
            ),
            group=group_two.element(name="second"),
        )
        dataset.add_sample(sample_one)
        dataset.add_sample(sample_two)

        view = fosv.get_view(
            dataset.name,
            sample_filter=fosv.SampleFilter(
                group=fosv.GroupElementFilter(
                    slice="first",
                    id=dataset.first().group.id,
                    slices=["first", "second"],
                )
            ),
            filters={
                "predictions.detections.label": {
                    "values": ["carrot"],
                    "exclude": False,
                    "isMatching": False,
                }
            },
        )
        self.assertEqual(len(view), 1)

    @drop_datasets
    def test_filter_embedded_documents(self):
        dataset = fod.Dataset("test")
        dataset.add_sample(
            fo.Sample(
                filepath="image.png",
                documents=[
                    fo.DynamicEmbeddedDocument(value="one"),
                    fo.DynamicEmbeddedDocument(value="two"),
                ],
            )
        )
        dataset.add_dynamic_sample_fields()

        # match and filter
        view = fosv.get_view(
            dataset.name,
            filters={
                "documents.value": {
                    "values": ["two"],
                    "exclude": False,
                    "isMatching": False,
                }
            },
        )
        self.assertEqual(len(view), 1)
        sample = view.first()
        self.assertEqual(len(sample.documents), 1)
        self.assertEqual(sample.documents[0].value, "two")

        # matching
        view = fosv.get_view(
            dataset.name,
            filters={
                "documents.value": {
                    "values": ["two"],
                    "exclude": False,
                    "isMatching": True,
                }
            },
        )
        self.assertEqual(len(view), 1)
        sample = view.first()
        self.assertEqual(len(sample.documents), 2)

        # excluded matching
        view = fosv.get_view(
            dataset.name,
            filters={
                "documents.value": {
                    "values": ["two"],
                    "exclude": True,
                    "isMatching": True,
                }
            },
        )
        self.assertEqual(len(view), 0)

        view = fosv.get_view(
            dataset.name,
            filters={
                "documents.value": {
                    "values": ["other"],
                    "exclude": True,
                    "isMatching": True,
                }
            },
        )
        self.assertEqual(len(view), 1)

        # excluded filtering
        view = fosv.get_view(
            dataset.name,
            filters={
                "documents.value": {
                    "values": ["other"],
                    "exclude": True,
                    "isMatching": False,
                }
            },
        )
        self.assertEqual(len(view), 1)

    @drop_datasets
    def test_dynamic_group_injects_group_field(self):
        dataset = fod.Dataset("test")
        dataset.add_samples(
            [
                fos.Sample(filepath="a.png", category="cat"),
                fos.Sample(filepath="b.png", category="$foo"),
            ]
        )

        stages = [fosg.GroupBy("category")._serialize()]

        for group_value in ("cat", "$foo"):
            with self.subTest(group_value=group_value):
                view = fosv.get_view(
                    "test", stages=stages, dynamic_group=group_value
                )
                (sample,) = foo.aggregate(
                    foo.get_db_conn()[view._dataset._sample_collection_name],
                    view._pipeline(),
                )
                self.assertEqual(sample["_group"], group_value)

    @drop_datasets
    def test_modal_group_filter_injects_group_field(self):
        dataset = fod.Dataset("test")
        dataset.add_group_field("group", default="left")
        group = fo.Group()
        dataset.add_samples(
            [
                fos.Sample(
                    filepath="a.png",
                    category="cat",
                    group=group.element(name="left"),
                ),
                fos.Sample(
                    filepath="b.png",
                    category="cat",
                    group=group.element(name="right"),
                ),
            ]
        )

        stages = [fosg.GroupBy("category")._serialize()]
        view = fosv.get_view(
            "test",
            stages=stages,
            sample_filter=fosv.SampleFilter(
                group=fosv.GroupElementFilter(slices=["left"])
            ),
        )

        samples = list(
            foo.aggregate(
                foo.get_db_conn()[view._dataset._sample_collection_name],
                view._pipeline(),
            )
        )
        self.assertGreater(len(samples), 0)
        for s in samples:
            self.assertEqual(s["_group"], "cat")

    @drop_datasets
    def test_sort_by(self):
        dataset = fod.Dataset("test")
        dataset.add_sample(fo.Sample(filepath="image.png", value="value"))

        view = fosv.get_view(dataset.name, sort_by="value")
        result = view._serialize()[0]["kwargs"]
        self.assertEqual(
            result,
            [
                ["field_or_expr", "value"],
                ["reverse", False],
                ["create_index", False],
            ],
        )

        view = fosv.get_view(dataset.name, sort_by="value", desc=True)
        result = view._serialize()[0]["kwargs"]
        self.assertEqual(
            result,
            [
                ["field_or_expr", "value"],
                ["reverse", True],
                ["create_index", False],
            ],
        )


class AysncServerViewTests(unittest.IsolatedAsyncioTestCase):
    @drop_datasets
    async def test_disjoint_groups(self):
        dataset, first, second = make_disjoint_groups_dataset()

        first_samples = await paginate_samples(
            dataset.name,
            [],
            {},
            first=1,
            sample_filter=fosv.SampleFilter(
                group=fosv.GroupElementFilter(
                    slice="first", id=first.group.id, slices=["first"]
                )
            ),
            pagination_data=True,
        )
        self.assertEqual(len(first_samples.edges), 1)
        self.assertEqual(first_samples.edges[0].node.id, first._id)

        second_samples = await paginate_samples(
            dataset.name,
            [],
            {},
            first=1,
            sample_filter=fosv.SampleFilter(
                group=fosv.GroupElementFilter(
                    slice="second", id=second.group.id, slices=["second"]
                )
            ),
            pagination_data=True,
        )
        self.assertEqual(len(second_samples.edges), 1)
        self.assertEqual(second_samples.edges[0].node.id, second._id)


class ServerDocTests(unittest.TestCase):
    def test_dataset_doc(self):
        doc = Dataset.modifier({"_id": "id"})
        self.assertIn("frame_collection_name", doc)
        self.assertEqual(doc["frame_collection_name"], None)


class MatchLabelTagsTests(unittest.TestCase):
    """Tests for _match_label_tags covering all four (exclude, matching) cases.

    Dataset layout used across all tests:
      - sample1: two detections, one tagged ["target"], one tagged ["other"]
      - sample2: one detection tagged ["other"]

    Filtering on tag "target" yields different results depending on the mode:

      exclude=False, matching=False → prefilter samples then select labels
      exclude=True,  matching=False → no prefilter, exclude matching labels
      exclude=False, matching=True  → prefilter samples, keep all labels
      exclude=True,  matching=True  → prefilter to *exclude* samples that match
    """

    def setUp(self):
        self.dataset = fod.Dataset()
        self.sample1 = fos.Sample(
            filepath="image1.png",
            predictions=fol.Detections(
                detections=[
                    fol.Detection(label="alpha", tags=["target"]),
                    fol.Detection(label="beta", tags=["other"]),
                ]
            ),
            # additional field which contains only non-target labels
            predictions2=fol.Detections(
                detections=[
                    fol.Detection(label="beta", tags=["other"]),
                ]
            ),
            # ground_truth also carries "target" so that a correct $nor must
            # cover both label fields to exclude this sample
            ground_truth=fol.Detections(
                detections=[
                    fol.Detection(label="delta", tags=["target"]),
                ]
            ),
        )
        self.sample2 = fos.Sample(
            filepath="image2.png",
            predictions=fol.Detections(
                detections=[
                    fol.Detection(label="gamma", tags=["other"]),
                ]
            ),
            ground_truth=fol.Detections(
                detections=[
                    fol.Detection(label="epsilon", tags=["other"]),
                ]
            ),
        )
        self.dataset.add_samples([self.sample1, self.sample2])

    def tearDown(self):
        self.dataset.delete()

    def _label_tags_filter(self, exclude, matching):
        return {
            "_label_tags": {
                "values": ["target"],
                "exclude": exclude,
                "isMatching": matching,
            }
        }

    def test_no_exclude_no_matching(self):
        """exclude=False, matching=False: prefilter samples with $or, then
        select_labels keeps only the tagged labels within those samples.

        Only sample1 has a "target" label, so it is the only sample returned.
        Within sample1 only the "alpha" (target-tagged) detection survives.
        """
        view = fosv.get_extended_view(
            self.dataset.view(),
            filters=self._label_tags_filter(exclude=False, matching=False),
        )
        self.assertEqual(len(view), 1)
        ground_truth = view.first().ground_truth.detections
        self.assertEqual(len(ground_truth), 1)
        self.assertEqual(ground_truth[0].label, "delta")
        predictions = view.first().predictions.detections
        self.assertEqual(len(predictions), 1)
        self.assertEqual(predictions[0].label, "alpha")
        predictions = view.first().predictions2.detections
        self.assertEqual(len(predictions), 0)

    def test_exclude_no_matching(self):
        """exclude=True, matching=False: no sample-level prefilter, then
        exclude_labels removes "target"-tagged labels from every sample.

        Both samples survive; sample1 loses its "alpha" detection and
        sample2 is unchanged.
        """
        view = fosv.get_extended_view(
            self.dataset.view(),
            filters=self._label_tags_filter(exclude=True, matching=False),
        )
        self.assertEqual(len(view), 2)
        ids_to_detections = lambda f: {
            str(s.id): s[f].detections for s in view
        }

        # ground truth
        sample1_ground_truth = ids_to_detections("ground_truth")[
            self.sample1.id
        ]
        self.assertEqual(len(sample1_ground_truth), 0)
        sample2_ground_truth = ids_to_detections("ground_truth")[
            self.sample2.id
        ]
        self.assertEqual(len(sample2_ground_truth), 1)
        self.assertEqual(sample2_ground_truth[0].label, "epsilon")

        # predictions
        sample1_predictions = ids_to_detections("predictions")[self.sample1.id]
        self.assertEqual(len(sample1_predictions), 1)
        self.assertEqual(sample1_predictions[0].label, "beta")
        sample2_predictions = ids_to_detections("predictions")[self.sample2.id]
        self.assertEqual(len(sample2_predictions), 1)
        self.assertEqual(sample2_predictions[0].label, "gamma")

        # predictions2
        sample1_predictions2 = ids_to_detections("predictions2")[
            self.sample1.id
        ]
        self.assertEqual(len(sample1_predictions2), 1)
        self.assertEqual(sample1_predictions2[0].label, "beta")

    def test_no_exclude_matching(self):
        """exclude=False, matching=True: $or prefilter keeps only samples that
        have at least one "target"-tagged label; all labels are preserved.

        Only sample1 passes the prefilter and both its detections are kept.
        """
        view = fosv.get_extended_view(
            self.dataset.view(),
            filters=self._label_tags_filter(exclude=False, matching=True),
        )
        self.assertEqual(len(view), 1)
        sample = view.first()

        # ground_truth
        ground_truth = sample.ground_truth.detections
        self.assertEqual(len(ground_truth), 1)
        self.assertEqual(ground_truth[0].label, "delta")

        # predictions
        predictions = sample.predictions.detections
        self.assertEqual(len(predictions), 2)
        labels = {d.label for d in predictions}
        self.assertEqual(labels, {"alpha", "beta"})
        predictions2 = sample.predictions2.detections
        self.assertEqual(len(predictions2), 1)
        self.assertEqual(predictions2[0].label, "beta")

    def test_exclude_matching(self):
        """exclude=True, matching=True: $nor prefilter keeps only samples that
        have *no* "target"-tagged label across *all* label fields; all labels
        in those samples are kept.

        sample1 carries "target" in both predictions and ground_truth.
        sample2 carries "target" in neither field.

        The $nor condition must cover every label path, if it regresses to
        $or, sample1 is returned instead of sample2. If any label field is
        omitted from the conditions, sample1 leaks through even with $nor
        (it would only be excluded via the one field that is checked).
        """
        view = fosv.get_extended_view(
            self.dataset.view(),
            filters=self._label_tags_filter(exclude=True, matching=True),
        )
        self.assertEqual(len(view), 1)
        sample = view.first()
        # ground_truth: also intact and carries no "target" tag
        self.assertEqual(len(sample.ground_truth.detections), 1)
        self.assertEqual(sample.ground_truth.detections[0].label, "epsilon")

        # predictions: only the "other"-tagged detection is present
        self.assertEqual(len(sample.predictions.detections), 1)
        self.assertEqual(sample.predictions.detections[0].label, "gamma")

        # predictions2: empty
        self.assertIsNone(sample.predictions2)


class GetExtendedViewTests(unittest.TestCase):
    def test_filter_invalid_id_returns_none(self):
        ds = fod.Dataset()
        ds.add_sample(fos.Sample(filepath="image.png"))
        view = fosv.get_extended_view(
            ds.view(),
            filters={
                "id": {
                    "values": ["invalidid"],
                    "exclude": False,
                    "isMatching": True,
                }
            },
        )
        self.assertEqual(len(view), 0)
        ds.delete()

    def test_filter_valid_id(self):
        ds = fod.Dataset()
        sample_id = ds.add_sample(
            fos.Sample(
                filepath="image.png",
            )
        )
        view = fosv.get_extended_view(
            ds.view(),
            filters={
                "id": {
                    "values": [str(sample_id)],
                    "exclude": False,
                    "isMatching": True,
                }
            },
        )
        self.assertEqual(len(view), 1)
        ds.delete()


def _choices():
    return {
        (definition.name, param.name): param.choices
        for definition in fosd.stage_definitions()
        for param in definition.params
    }


class StageDefinitionTests(unittest.TestCase):
    def test_type_alternatives_are_parsed(self):
        for definition in fosd.stage_definitions():
            for param in definition.params:
                self.assertEqual(param.tokens, param.type.split("|"))
                self.assertEqual(
                    param.nullable, "NoneType" in param.type.split("|")
                )

    def test_required_matches_the_stage_signature(self):
        stages = {stage.__name__: stage for stage in fosg._STAGES}
        for definition in fosd.stage_definitions():
            signature = inspect.signature(stages[definition.name].__init__)
            for param in definition.params:
                declared = signature.parameters.get(param.name)
                self.assertIsNotNone(
                    declared,
                    "%s declares %s, which __init__ does not take"
                    % (definition.name, param.name),
                )
                has_default = declared.default is not inspect.Parameter.empty
                self.assertEqual(
                    param.required,
                    not has_default,
                    "%s.%s" % (definition.name, param.name),
                )

    def test_declared_choices_are_well_formed(self):
        payloads = {
            "fields": "fields",
            "constants": "values",
            "group_slices": None,
            "evaluation_keys": None,
            "similarity_keys": None,
            "free_text": None,
        }
        levels = {"any", "sample", "frame"}
        existences = {"existing", "existing_root", "any"}

        for stage in fosg._STAGES:
            for param in stage._params():
                choices = param.get("choices")
                if choices is None:
                    continue

                where = "%s.%s" % (stage.__name__, param["name"])
                source = choices["source"]
                self.assertIn(source, payloads, where)

                payload = payloads[source]
                keys = set(choices) - {"source"}
                self.assertEqual(
                    keys, set() if payload is None else {payload}, where
                )

                for value in choices.get("values", []):
                    self.assertIsInstance(value, str, where)

                for field in choices.get("fields", []):
                    self.assertEqual(
                        set(field),
                        {"level", "existence", "ftypes", "label_types"},
                        where,
                    )
                    self.assertIn(field["level"], levels, where)
                    self.assertIn(field["existence"], existences, where)
                    for path in field["ftypes"] + field["label_types"]:
                        self.assertIsInstance(path, str, where)
                        self.assertTrue(etau.get_class(path), where)

                if source == "fields":
                    self.assertTrue(choices["fields"], where)

    def test_evaluation_key_choices(self):
        params = {
            param["name"]: param
            for param in fosg.ToEvaluationPatches._params()
        }
        self.assertEqual(
            params["eval_key"]["choices"], {"source": "evaluation_keys"}
        )

    def test_similarity_key_choices(self):
        params = {
            param["name"]: param for param in fosg.SortBySimilarity._params()
        }
        self.assertEqual(
            params["brain_key"]["choices"], {"source": "similarity_keys"}
        )

    def test_stage_descriptions(self):
        for definition in fosd.stage_definitions():
            self.assertTrue(definition.description, definition.name)
            self.assertTrue(
                definition.description.endswith("."), definition.name
            )

        flatten = next(
            d for d in fosd.stage_definitions() if d.name == "Flatten"
        )
        self.assertEqual(
            flatten.description,
            "Returns a flattened view that contains all samples in a "
            "dynamic grouped collection.",
        )

    def test_parameter_descriptions(self):
        filter_labels = next(
            d for d in fosd.stage_definitions() if d.name == "FilterLabels"
        )
        by_name = {p.name: p.description for p in filter_labels.params}
        self.assertEqual(by_name["field"], "the label field to filter")
        self.assertTrue(
            by_name["only_matches"].startswith(
                "whether to only include samples with at least one label"
            )
        )
        # a continuation line joins its parameter's entry
        self.assertIn(
            "Only applicable to video datasets", by_name["trajectories"]
        )

    def test_choices(self):
        choices = _choices()

        keypoints = choices[("FilterKeypoints", "field")]
        self.assertEqual(
            keypoints.source, fosd.StageParameterChoiceSource.FIELDS
        )
        self.assertEqual(
            [field.label_types for field in keypoints.fields],
            [
                [
                    "fiftyone.core.labels.Keypoint",
                    "fiftyone.core.labels.Keypoints",
                ]
            ],
        )

        label_fields = choices[("FilterLabels", "field")]
        self.assertEqual(
            label_fields.source, fosd.StageParameterChoiceSource.FIELDS
        )
        (label_field,) = label_fields.fields
        self.assertEqual(label_field.level, fosd.StageParameterFieldLevel.ANY)
        self.assertIn(
            "fiftyone.core.labels.Detections", label_field.label_types
        )
        self.assertEqual(label_field.ftypes, [])

        # a label list parameter offers only the label types that hold lists
        (limit_labels,) = choices[("LimitLabels", "field")].fields
        self.assertEqual(
            limit_labels.label_types,
            [
                "fiftyone.core.labels.Classifications",
                "fiftyone.core.labels.Detections",
                "fiftyone.core.labels.Keypoints",
                "fiftyone.core.labels.Polylines",
                "fiftyone.core.labels.TemporalDetections",
            ],
        )

        self.assertEqual(
            choices[("SelectGroupSlices", "slices")].source,
            fosd.StageParameterChoiceSource.GROUP_SLICES,
        )
        self.assertEqual(
            choices[("SelectGroupSlices", "media_type")].values,
            sorted(fom.MEDIA_TYPES),
        )

        # a parameter that accepts no field is typed in
        self.assertEqual(
            choices[("Match", "filter")].source,
            fosd.StageParameterChoiceSource.FREE_TEXT,
        )

    def test_unrestricted_field_choices(self):
        choices = _choices()

        for key in (
            ("SortBy", "field_or_expr"),
            ("GroupBy", "field_or_expr"),
            ("Exists", "field"),
            ("MapValues", "field"),
            ("SelectFields", "field_names"),
        ):
            parameter = choices[key]
            self.assertEqual(
                parameter.source,
                fosd.StageParameterChoiceSource.FIELDS,
                key,
            )
            (field,) = parameter.fields
            self.assertEqual(
                field.level, fosd.StageParameterFieldLevel.ANY, key
            )
            self.assertEqual(
                field.existence,
                fosd.StageParameterFieldExistence.EXISTING,
                key,
            )
            self.assertEqual(field.ftypes, [], key)
            self.assertEqual(field.label_types, [], key)

    def test_created_field_choices(self):
        choices = _choices()

        # the stage writes the distances, so a new name is accepted
        (dist_field,) = choices[("SortBySimilarity", "dist_field")].fields
        self.assertEqual(
            dist_field.existence, fosd.StageParameterFieldExistence.ANY
        )
        self.assertEqual(
            dist_field.ftypes, ["fiftyone.core.fields.FloatField"]
        )

        # a new embedded field may be set, but its root must already exist
        (set_field,) = choices[("SetField", "field")].fields
        self.assertEqual(
            set_field.existence,
            fosd.StageParameterFieldExistence.EXISTING_ROOT,
        )
        self.assertEqual(set_field.ftypes, [])
        self.assertEqual(set_field.label_types, [])

    def test_geo_location_choices(self):
        choices = _choices()

        for stage in ("GeoNear", "GeoWithin"):
            (field,) = choices[(stage, "location_field")].fields
            self.assertEqual(
                field.level, fosd.StageParameterFieldLevel.SAMPLE, stage
            )
            self.assertEqual(
                field.label_types, ["fiftyone.core.labels.GeoLocation"], stage
            )

    def test_patches_choices(self):
        (field,) = _choices()[("ToPatches", "field")].fields
        self.assertEqual(field.level, fosd.StageParameterFieldLevel.SAMPLE)
        self.assertEqual(
            field.label_types,
            [
                "fiftyone.core.labels.Detections",
                "fiftyone.core.labels.Keypoints",
                "fiftyone.core.labels.Polylines",
            ],
        )

    def test_trajectories_choices(self):
        (field,) = _choices()[("ToTrajectories", "field")].fields
        self.assertEqual(field.level, fosd.StageParameterFieldLevel.FRAME)
        self.assertEqual(
            field.label_types,
            [
                "fiftyone.core.labels.Detections",
                "fiftyone.core.labels.Keypoints",
                "fiftyone.core.labels.Polylines",
            ],
        )

    def test_clips_choices(self):
        fields = _choices()[("ToClips", "field_or_expr")].fields

        temporal, support, frame_labels = fields

        self.assertEqual(temporal.level, fosd.StageParameterFieldLevel.SAMPLE)
        self.assertEqual(
            temporal.label_types,
            [
                "fiftyone.core.labels.TemporalDetection",
                "fiftyone.core.labels.TemporalDetections",
            ],
        )

        self.assertEqual(support.level, fosd.StageParameterFieldLevel.SAMPLE)
        self.assertEqual(
            support.ftypes, ["fiftyone.core.fields.FrameSupportField"]
        )
        self.assertEqual(support.label_types, [])

        self.assertEqual(
            frame_labels.level, fosd.StageParameterFieldLevel.FRAME
        )
        self.assertIn(
            "fiftyone.core.labels.Classifications", frame_labels.label_types
        )
        self.assertNotIn(
            "fiftyone.core.labels.Detection", frame_labels.label_types
        )


class ViewExpressionQueryTests(unittest.TestCase):
    def test_operators(self):
        operators = {
            operator.name: operator
            for operator in fose.view_expression_operators()
        }
        self.assertEqual(len(operators), len(focx.build_catalog()))

        greater = operators["__gt__"]
        self.assertEqual(greater.display, ">")
        self.assertEqual(greater.returns, focx.Kind.BOOLEAN)
        self.assertEqual(greater.arg_kinds, [focx.Kind.ANY])

        length = operators["length"]
        self.assertEqual(length.self_kind, focx.Kind.ARRAY)
        self.assertEqual(length.returns, focx.Kind.NUMBER)

    def test_field_kinds(self):
        kinds = {
            field_kind.ftype: field_kind.kind
            for field_kind in fose.view_expression_field_kinds()
        }
        self.assertEqual(
            kinds["fiftyone.core.fields.FloatField"], focx.Kind.NUMBER
        )
        self.assertEqual(
            kinds["fiftyone.core.fields.ObjectIdField"], focx.Kind.ID
        )
        self.assertEqual(
            len(kinds),
            len(focx.field_kinds_by_ftype()),
        )

    def test_ast_version(self):
        self.assertEqual(fose.view_expression_ast_version(), foea.AST_VERSION)


class AsyncViewBarSchemaTests(unittest.IsolatedAsyncioTestCase):
    async def test_query_resolves(self):
        result = await schema.execute(
            """
            {
                viewExpressionAstVersion
                viewExpressionFieldKinds { ftype kind }
                viewExpressionOperators { name selfKind argKinds returns }
                stageDefinitions {
                    name
                    params {
                        name
                        type
                        tokens
                        nullable
                        required
                        default
                        placeholder
                        choices {
                            source
                            values
                            fields {
                                level
                                existence
                                ftypes
                                labelTypes
                            }
                        }
                    }
                }
            }
            """
        )
        self.assertIsNone(result.errors)
        self.assertEqual(
            result.data["viewExpressionAstVersion"], foea.AST_VERSION
        )

        operators = result.data["viewExpressionOperators"]
        self.assertEqual(
            next(o for o in operators if o["name"] == "__gt__")["returns"],
            "BOOLEAN",
        )

        stages = {d["name"]: d for d in result.data["stageDefinitions"]}
        param = next(
            p for p in stages["Match"]["params"] if p["name"] == "filter"
        )
        self.assertEqual(param["tokens"], ["expr"])
        self.assertTrue(param["required"])
        self.assertEqual(param["choices"]["source"], "FREE_TEXT")
