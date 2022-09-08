"""
FiftyOne Server samples pagination

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
from dacite import Config, from_dict
import strawberry as gql
import strawberry.schema_directive as gqls
import typing as t


import fiftyone.core.clips as focl
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
from fiftyone.server.filters import GroupElementFilter, SampleFilter

import fiftyone.server.metadata as fosm
from fiftyone.server.paginator import Connection, Edge, PageInfo
import fiftyone.server.view as fosv
from fiftyone.server.scalars import BSON, JSON, BSONArray


@gql.interface
class Sample:
    sample: JSON


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
        only_matches=True,
        sample_filter=sample_filter,
    )

    root_view = fosv.get_view(
        dataset,
        stages=stages,
    )

    media = view.media_type
    if media == fom.MIXED:
        media = root_view.group_media_types[root_view.default_group_slice]

    has_video_slice = False
    if media == fom.GROUP:
        media = view.group_media_types[view.group_slice]
        has_video_slice = any(
            [slice == fom.VIDEO for slice in view.group_media_types.values()]
        )

    media_type = MEDIA_TYPES[media]

    if media == fom.VIDEO or has_video_slice:
        if isinstance(view, focl.ClipsView):
            expr = F("frame_number") == F("$support")[0]
        else:
            expr = F("frame_number") == 1

        view = view.set_field("frames", F("frames").filter(expr))

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
        ),
    ).to_list(first + 1)

    more = False
    if len(samples) > first:
        samples = samples[:first]
        more = True

    metadata_map = {s["filepath"]: s.get("metadata", None) for s in samples}
    media_types = {f: fom.get_media_type(f) for f in metadata_map}
    metadatas = await asyncio.gather(
        *[
            fosm.get_metadata(
                filepath, media_type, metadata=metadata_map[filepath]
            )
            for filepath, media_type in media_types.items()
        ]
    )
    metadata_map = {f: m for f, m in zip(media_types, metadatas)}

    edges = []
    for idx, doc in enumerate(samples):
        cls = (
            media_type
            if media_type is not None
            else VideoSample
            if media_types[doc["filepath"]] == fom.VIDEO
            else ImageSample
        )
        edges.append(
            Edge(
                node=from_dict(
                    cls,
                    {"sample": doc, **metadata_map[doc["filepath"]]},
                    Config(check_types=False),
                ),
                cursor=str(idx + int(after) + 1),
            )
        )

    results = []
    for sample in samples:
        filepath = sample["filepath"]
        sample_result = {"sample": sample}
        sample_result.update(metadata_map[filepath])
        results.append(sample_result)

    return Connection(
        page_info=PageInfo(
            has_previous_page=False,
            has_next_page=more,
            start_cursor=edges[0].cursor if edges else None,
            end_cursor=edges[-1].cursor if len(edges) > 1 else None,
        ),
        edges=edges,
    )
