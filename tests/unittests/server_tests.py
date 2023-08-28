"""
FiftyOne server-related unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import math
import unittest

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos
import fiftyone.server.view as fosv
from fiftyone.server.samples import paginate_samples

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
        self.assertIn("_label_tags", sample)
        self.assertDictEqual(sample["_label_tags"], {"one": 1, "two": 2})

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
        self.assertIn("_label_tags", sample)
        self.assertDictEqual(sample["_label_tags"], {"one": 1, "two": 1})

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
        self.assertIn("_label_tags", sample)
        self.assertDictEqual(sample["_label_tags"], {"two": 1})

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
        self.assertIn("_label_tags", sample)
        self.assertDictEqual(sample["_label_tags"], {"one": 1, "two": 2})

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
        self.assertIn("_label_tags", sample)
        self.assertDictEqual(sample["_label_tags"], {"one": 1, "two": 1})

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
        self.assertIn("_label_tags", sample)
        self.assertDictEqual(sample["_label_tags"], {"two": 1})

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
        self.assertIn("_label_tags", sample)
        self.assertDictEqual(sample["_label_tags"], {"one": 1, "two": 2})

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
        self.assertIn("_label_tags", sample)
        self.assertDictEqual(sample["_label_tags"], {"one": 1, "two": 1})

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
        self.assertIn("_label_tags", sample)
        self.assertDictEqual(sample["_label_tags"], {"two": 1})

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
        )
        self.assertEqual(len(second_samples.edges), 1)
        self.assertEqual(second_samples.edges[0].node.id, second._id)
