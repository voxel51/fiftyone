"""
FiftyOne Server /samples route

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import asdict
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request


from fiftyone.server.decorators import route
from fiftyone.server.filters import GroupElementFilter, SampleFilter
from fiftyone.server.samples import paginate_samples


class Samples(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        page = data.get("page", 1)
        page_length = data.get("page_length", 20)
        slice = data.get("slice", None)
        extended = data.get("extended", None)

        results = await paginate_samples(
            dataset,
            stages,
            filters,
            page_length,
            (page - 1) * page_length - 1,
            sample_filter=SampleFilter(group=GroupElementFilter(slice=slice)),
            extended_stages=extended,
        )

        return {
            "results": [asdict(edge.node) for edge in results.edges],
            "more": results.page_info.has_next_page,
        }
