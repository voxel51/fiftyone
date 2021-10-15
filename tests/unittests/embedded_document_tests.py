"""
FiftyOne patches-related unit tests.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
from fiftyone import ViewField as F

from decorators import drop_datasets


class EmbeddedDocumentTests(unittest.TestCase):
    @drop_datasets
    def test_(self):
        sample = fo.Sample(filepath="/path/to/image.jpg", detection=fo.Detection())
        dataset = fo.Dataset()
        dataset.add_sample(sample)
        sample.detection["attr"] = "string"


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
