"""
FiftyOne Server samples pagination

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
from dacite import Config, from_dict
import strawberry as gql
import typing as t


import fiftyone.core.clips as focl
from fiftyone.core.collections import SampleCollection
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
from fiftyone.server.filters import SampleFilter

import fiftyone.server.metadata as fosm
from fiftyone.server.paginator import Connection, Edge, PageInfo
import fiftyone.server.view as fosv
from fiftyone.server.scalars import BSON, JSON, BSONArray


@gql.type
class MediaURL:
    field: str
    url: t.Optional[str]


@gql.interface
class Sample:
    id: gql.ID
    sample: JSON
    urls: t.List[MediaURL]


@gql.type
class ImageSample(Sample):
    aspect_ratio: float


@gql.type
class PointCloudSample(Sample):
    pass


@gql.type
class VideoSample(Sample):
    aspect_ratio: float
    frame_rate: float


SampleItem = gql.union(
    "SampleItem", types=(ImageSample, PointCloudSample, VideoSample)
)

MEDIA_TYPES = {
    fom.IMAGE: ImageSample,
    fom.POINT_CLOUD: PointCloudSample,
    fom.VIDEO: VideoSample,
}


async def paginate_samples(
    dataset: str,
    stages: BSONArray,
    filters: BSON,
    first: int,
    after: t.Optional[str] = None,
    extended_stages: t.Optional[BSON] = None,
    sample_filter: t.Optional[SampleFilter] = None,
) -> Connection[t.Union[ImageSample, VideoSample], str]:
    view = fosv.get_view(
        dataset,
        stages=stages,
        filters=filters,
        count_label_tags=True,
        extended_stages=extended_stages,
        sort=True,
        sample_filter=sample_filter,
    )

    root_view = fosv.get_view(dataset, stages=stages)

    media = view.media_type
    if media == fom.MIXED:
        media = root_view.group_media_types[root_view.default_group_slice]

    if media == fom.GROUP:
        media = view.group_media_types[view.group_slice]

    if after is None:
        after = "-1"

    view = view.skip(int(after) + 1)

    samples = await foo.aggregate(
        foo.get_async_db_conn()[view._dataset._sample_collection_name],
        view._pipeline(
            attach_frames=True,
            detach_frames=False,
            manual_group_select=sample_filter
            and sample_filter.group
            and (sample_filter.group.id and not sample_filter.group.slice),
            support=[1, 1],
        ),
    ).to_list(first + 1)

    more = False
    if len(samples) > first:
        samples = samples[:first]
        more = True

    metadata_cache = {}
    url_cache = {}
    nodes = await asyncio.gather(
        *[
            _create_sample_item(view, sample, metadata_cache, url_cache)
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
) -> SampleItem:
    media_type = fom.get_media_type(sample["filepath"])

    if media_type == fom.IMAGE:
        cls = ImageSample
    elif media_type == fom.VIDEO:
        cls = VideoSample
    elif media_type == fom.POINT_CLOUD:
        cls = PointCloudSample
    else:
        raise ValueError(f"unknown media type '{media_type}'")

    metadata = await fosm.get_metadata(
        dataset, sample, media_type, metadata_cache, url_cache
    )

    return from_dict(
        cls,
        {"id": sample["_id"], "sample": sample, **metadata},
        Config(check_types=False),
    )
