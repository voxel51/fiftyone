"""
FiftyOne Server samples pagination

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import strawberry as gql
import typing as t


from fiftyone.core.collections import SampleCollection
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
from fiftyone.core.utils import run_sync_task

from fiftyone.server.filters import SampleFilter
import fiftyone.server.metadata as fosm
from fiftyone.server.paginator import Connection, Edge, PageInfo
from fiftyone.server.scalars import BSON, JSON, BSONArray
from fiftyone.server.utils import from_dict
import fiftyone.server.view as fosv


@gql.type
class MediaURL:
    field: str
    url: t.Optional[str]


@gql.interface
class Sample:
    id: gql.ID
    sample: JSON
    urls: t.List[MediaURL]
    aspect_ratio: float


@gql.type
class ImageSample(Sample):
    pass


@gql.type
class PointCloudSample(Sample):
    pass


@gql.type
class ThreeDSample(Sample):
    pass


@gql.type
class VideoSample(Sample):
    frame_number: int
    frame_rate: float


SampleItem = gql.union(
    "SampleItem",
    types=(ImageSample, PointCloudSample, ThreeDSample, VideoSample),
)

MEDIA_TYPES = {
    fom.IMAGE: ImageSample,
    fom.POINT_CLOUD: PointCloudSample,
    fom.VIDEO: VideoSample,
    fom.THREE_D: ThreeDSample,
}


async def paginate_samples(
    dataset: str,
    stages: BSONArray,
    filters: JSON,
    first: int,
    after: t.Optional[str] = None,
    extended_stages: t.Optional[BSON] = None,
    sample_filter: t.Optional[SampleFilter] = None,
    pagination_data: t.Optional[bool] = False,
) -> Connection[t.Union[ImageSample, VideoSample], str]:
    run = lambda reload: fosv.get_view(
        dataset,
        stages=stages,
        filters=filters,
        pagination_data=pagination_data,
        extended_stages=extended_stages,
        sample_filter=sample_filter,
        reload=reload,
    )
    try:
        view = await run_sync_task(run, False)
    except:
        view = await run_sync_task(run, True)

    # check frame field schema explicitly, media type is not reliable for groups
    has_frames = view.get_frame_field_schema() is not None

    # TODO: Remove this once we have a better way to handle large videos. This
    # is a temporary fix to reduce the $lookup overhead for sample frames on
    # full datasets.
    full_lookup = has_frames and (filters or stages)
    support = [1, 1] if not full_lookup else None
    if after is None:
        after = "-1"

    if int(after) > -1:
        view = view.skip(int(after) + 1)

    pipeline = view._pipeline(
        attach_frames=has_frames,
        detach_frames=False,
        manual_group_select=sample_filter
        and sample_filter.group
        and (sample_filter.group.id and not sample_filter.group.slices),
        support=support,
    )

    # Only return the first frame of each video sample for the grid thumbnail
    if has_frames:
        pipeline.append({"$addFields": {"frames": {"$slice": ["$frames", 1]}}})

    samples = await foo.aggregate(
        foo.get_async_db_conn()[view._dataset._sample_collection_name],
        pipeline,
    ).to_list(first + 1)

    more = False
    if len(samples) > first:
        samples = samples[:first]
        more = True

    metadata_cache = {}
    url_cache = {}
    nodes = await asyncio.gather(
        *[
            _create_sample_item(
                view, sample, metadata_cache, url_cache, pagination_data
            )
            for sample in samples
        ]
    )

    edges = []
    for idx, node in enumerate(nodes):
        edges.append(
            Edge(
                node=node,
                cursor=str(idx + int(after) + 1),
            )
        )

    return Connection(
        page_info=PageInfo(
            has_previous_page=False,
            has_next_page=more,
            start_cursor=edges[0].cursor if edges else None,
            end_cursor=edges[-1].cursor if len(edges) > 1 else None,
        ),
        edges=edges,
    )


async def _create_sample_item(
    dataset: SampleCollection,
    sample: t.Dict,
    metadata_cache: t.Dict[str, t.Dict],
    url_cache: t.Dict[str, str],
    pagination_data: bool,
) -> SampleItem:
    media_type = fom.get_media_type(sample["filepath"])

    if media_type == fom.IMAGE:
        cls = ImageSample
    elif media_type == fom.VIDEO:
        cls = VideoSample
    elif media_type == fom.POINT_CLOUD:
        cls = PointCloudSample
    elif media_type == fom.THREE_D:
        cls = ThreeDSample
    else:
        raise ValueError(f"unknown media type '{media_type}'")

    metadata = await fosm.get_metadata(
        dataset, sample, media_type, metadata_cache, url_cache
    )

    if cls == VideoSample:
        metadata = dict(**metadata, frame_number=sample.get("frame_number", 1))

    _id = sample["_id"]

    if not pagination_data:
        _id = f"{_id}-modal"

    return from_dict(cls, {"id": _id, "sample": sample, **metadata})
