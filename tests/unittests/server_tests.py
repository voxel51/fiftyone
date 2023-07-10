"""
FiftyOne server-related unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos
import fiftyone.server.view as fosv

from decorators import drop_datasets


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
            "predictions.detections.label": {
                "values": ["carrot"],
                "exclude": False,
                "isMatching": False,
                "_CLS": "str",
            },
            "predictions.detections.confidence": {
                "range": [0.5, 1],
                "_CLS": "numeric",
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
                "_CLS": "str",
            },
            "predictions.detections.confidence": {
                "range": [0.0, 0.5],
                "_CLS": "numeric",
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
                "isMatching": True,
                "_CLS": "str",
            },
            "list_int": {
                "range": [0, 2],
                "_CLS": "numeric",
                "exclude": False,
                "isMatching": True,
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
                "isMatching": True,
                "_CLS": "str",
            },
            "list_int": {
                "range": [0, 2],
                "_CLS": "numeric",
                "exclude": False,
                "isMatching": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "list_str": {
                "values": ["one"],
                "exclude": False,
                "isMatching": True,
                "_CLS": "str",
            },
            "list_int": {
                "range": [3, 4],
                "_CLS": "numeric",
                "exclude": False,
                "isMatching": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "list_bool": {
                "true": False,
                "false": True,
                "exclude": False,
                "isMatching": True,
                "_CLS": "str",
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "list_bool": {
                "true": False,
                "false": True,
                "exclude": True,
                "isMatching": True,
                "_CLS": "str",
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)

        filters = {
            "list_bool": {
                "true": True,
                "false": False,
                "exclude": False,
                "isMatching": True,
                "_CLS": "str",
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
                "_CLS": "str",
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
                "_CLS": "str",
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
                "_CLS": "str",
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
                "_CLS": "str",
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
                "_CLS": "str",
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
                "_CLS": "str",
            },
            "frames.predictions.detections.confidence": {
                "range": [0.5, 1],
                "_CLS": "numeric",
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
                "_CLS": "str",
            },
            "frames.predictions.detections.confidence": {
                "range": [0.0, 0.5],
                "_CLS": "numeric",
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
                "_CLS": "str",
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
                "_CLS": "str",
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
                "_CLS": "str",
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
                "_CLS": "str",
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
                "_CLS": "str",
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
        )
        dataset.add_sample(sample)
        dataset.add_dynamic_sample_fields()

        filters = {
            "dynamic.predictions.detections.label": {
                "values": ["carrot"],
                "exclude": False,
                "isMatching": False,
                "_CLS": "str",
            },
            "dynamic.predictions.detections.confidence": {
                "range": [0.5, 1],
                "_CLS": "numeric",
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
                "_CLS": "str",
            },
            "dynamic.predictions.detections.confidence": {
                "range": [0.0, 0.5],
                "_CLS": "numeric",
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
                "isMatching": True,
                "_CLS": "str",
            },
            "dynamic.list_int": {
                "range": [0, 2],
                "_CLS": "numeric",
                "exclude": False,
                "isMatching": True,
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
                "isMatching": True,
                "_CLS": "str",
            },
            "dynamic.list_int": {
                "range": [0, 2],
                "_CLS": "numeric",
                "exclude": False,
                "isMatching": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "dynamic.list_str": {
                "values": ["one"],
                "exclude": False,
                "isMatching": True,
                "_CLS": "str",
            },
            "dynamic.list_int": {
                "range": [3, 4],
                "_CLS": "numeric",
                "exclude": False,
                "isMatching": True,
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "dynamic.list_bool": {
                "true": False,
                "false": True,
                "exclude": False,
                "isMatching": True,
                "_CLS": "str",
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)

        filters = {
            "dynamic.list_bool": {
                "true": False,
                "false": True,
                "exclude": True,
                "isMatching": True,
                "_CLS": "str",
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 1)

        filters = {
            "dynamic.list_bool": {
                "true": True,
                "false": False,
                "exclude": False,
                "isMatching": True,
                "_CLS": "str",
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
                "_CLS": "str",
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
                "_CLS": "str",
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
                "_CLS": "str",
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
                "_CLS": "str",
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
                "_CLS": "str",
            },
        }
        view = fosv.get_view("test", filters=filters)
        self.assertEqual(len(view), 0)
