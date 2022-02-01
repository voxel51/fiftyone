"""
FiftyOne Server sorting.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import tornado

import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.state as fos

from fiftyone.server.state import StateHandler
from fiftyone.server.utils import AsyncRequestHandler
import fiftyone.server.view as fosv


class SortHandler(AsyncRequestHandler):
    async def post_response(self):
        data = tornado.escape.json_decode(self.request.body)
        dataset = data.get("dataset", None)
        similarity = data.get("similarity", None)

        dataset = fod.load_dataset(dataset)
        dist_field = similarity.get("dist_field", None)

        if dist_field and not dataset.get_field(dist_field):
            dataset.add_sample_field(dist_field, fof.FloatField)

        return {
            "state": fos.StateDescription.from_dict(
                StateHandler.state
            ).serialize()
        }
