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
from fiftyone.server.filters import SampleFilter

import fiftyone.server.metadata as fosm
from fiftyone.server.paginator import Connection, Edge, PageInfo
import fiftyone.server.view as fosv
from fiftyone.server.scalars import BSON, BSONArray


@gql.interface
class Sample:
    width: int
    height: int
    sample: BSON


@gql.type
class ImageSample(Sample):
    pass


@gql.type
class VideoSample(Sample):
    frame_rate: float


SampleItem = gql.union("SampleItem", types=(ImageSample, VideoSample))


async def paginate_samples(
    dataset: str,
    stages: BSONArray,
    filters: BSON,
    similarity: BSON,
    first: int,
    after: t.Optional[str] = None,
    sample_filter: t.Optional[SampleFilter] = None,
) -> Connection[t.Union[ImageSample, VideoSample], str]:
    view = fosv.get_view(
        dataset,
        stages=stages,
        filters=filters,
        count_label_tags=True,
        similarity=similarity,
        only_matches=True,
        sample_filter=sample_filter,
    )

    if view.media_type == fom.VIDEO:
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
        view._pipeline(attach_frames=True, detach_frames=False),
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
            VideoSample
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
