"""
FiftyOne server index usage unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.server.explain as foe
import fiftyone.server.view as fosv

from decorators import drop_datasets


class ServerIndexTests(unittest.TestCase):
    @drop_datasets
    def test_image_labels_index(self):
        filters = {
            "detections.detections.label": {
                "values": ["carrot"],
                "exclude": False,
                "onlyMatch": True,
                "isMatching": False,
                "_CLS": "str",
            },
        }

        dataset = fod.Dataset("test")
        dataset.add_sample_field(
            "detections", fof.EmbeddedDocumentField, fol.Detections
        )
        dataset.create_index("detections.detections.label")

        foe.assert_index(
            fosv.get_view(
                "test",
                filters=filters,
            ),
            {"detections.detections.label": 1},
            ["detections.detections.label"],
        )

    @drop_datasets
    def test_group_labels_index(self):
        filters = {
            "detections.detections.label": {
                "values": ["carrot"],
                "exclude": False,
                "onlyMatch": True,
                "isMatching": False,
                "_CLS": "str",
            },
        }

        dataset = fod.Dataset("test")
        dataset.add_group_field("group", default="test")
        dataset.add_sample_field(
            "detections", fof.EmbeddedDocumentField, fol.Detections
        )
        dataset.create_index(
            [("group.name", 1), ("detections.detections.label", 1)]
        )

        foe.assert_index(
            fosv.get_view(
                "test",
                filters=filters,
            ),
            {"group.name": 1, "detections.detections.label": 1},
            ["detections.detections.label"],
        )
