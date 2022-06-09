"""
FiftyOne Server /samples route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.clips as focl
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.json as foj
import fiftyone.core.media as fom
import fiftyone.core.odm as foo

from fiftyone.server.decorators import route
import fiftyone.server.metadata as fosm
import fiftyone.server.view as fosv


class Samples(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        page = data.get("page", 1)
        page_length = data.get("page_length", 20)
        similarity = data.get("similarity", None)

        view = fosv.get_view(
            dataset,
            stages=stages,
            filters=filters,
            count_label_tags=True,
            similarity=similarity,
        )

        if view.media_type == fom.VIDEO:
            if isinstance(view, focl.ClipsView):
                expr = F("frame_number") == F("$support")[0]
            else:
                expr = F("frame_number") == 1

            view = view.set_field("frames", F("frames").filter(expr))

        view = view.skip((page - 1) * page_length)

        samples = await foo.aggregate(
            foo.get_async_db_conn()[view._dataset._sample_collection_name],
            view._pipeline(attach_frames=True, detach_frames=False),
        ).to_list(page_length + 1)

        more = False
        if len(samples) > page_length:
            samples = samples[:page_length]
            more = page + 1

        results = await _generate_results(
            samples, view._dataset.app_config.media_fields
        )

        return {"results": foj.stringify(results), "more": more}


async def _generate_results(samples, media_fields):

    metadatas = await asyncio.gather(
        *[fosm.get_all_metadata(s, media_fields) for s in samples]
    )
    results = []
    for md in metadatas:
        sample = md["sample"]
        filepath = sample["filepath"]
        sample_result = {
            "sample": sample,
            "mediaFieldsMetadata": md["media_fields_metadata"],
        }
        sample_result.update(md["metadata"])
        results.append(sample_result)

    return results
