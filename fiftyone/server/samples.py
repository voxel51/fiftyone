"""
FiftyOne Server samples pagination

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import collections
import logging

import strawberry as gql
import typing as t


from fiftyone.core.collections import SampleCollection
from fiftyone.core.dataset import Dataset
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.stages as fos
import fiftyone.core.storage as focs
from fiftyone.core.utils import run_sync_task

from fiftyone.server.filters import SampleFilter
import fiftyone.server.metadata as fosm
from fiftyone.multimodal.media_reference.field_model import (
    resolve_sample_media,
)
from fiftyone.server.paginator import Connection, Edge, PageInfo
from fiftyone.server.scalars import BSON, JSON, BSONArray
from fiftyone.server.utils import from_dict
import fiftyone.server.view as fosv

logger = logging.getLogger(__name__)


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
class UnknownSample(Sample):
    pass


@gql.type
class VideoSample(Sample):
    frame_number: int
    frame_rate: float


SampleItem = t.Annotated[
    t.Union[
        ImageSample, PointCloudSample, ThreeDSample, VideoSample, UnknownSample
    ],
    gql.union("SampleItem"),
]


MEDIA_TYPES = collections.defaultdict(lambda: UnknownSample)
MEDIA_TYPES.update(
    {
        fom.IMAGE: ImageSample,
        fom.POINT_CLOUD: PointCloudSample,
        fom.VIDEO: VideoSample,
        fom.THREE_D: ThreeDSample,
    }
)


async def paginate_samples(
    dataset: str,
    stages: BSONArray,
    filters: JSON,
    first: int,
    after: t.Optional[str] = None,
    extended_stages: t.Optional[BSON] = None,
    sample_filter: t.Optional[SampleFilter] = None,
    pagination_data: t.Optional[bool] = False,
    sort_by: t.Optional[str] = None,
    desc: t.Optional[bool] = False,
    hint: t.Optional[str] = None,
    dynamic_group: t.Optional[BSON] = None,
    max_query_time: t.Optional[int] = None,
) -> Connection[t.Union[ImageSample, VideoSample], str]:
    run = lambda: fosv.get_view(
        dataset,
        stages=stages,
        filters=filters,
        pagination_data=pagination_data,
        extended_stages=extended_stages,
        sample_filter=sample_filter,
        sort_by=sort_by,
        desc=desc,
        dynamic_group=dynamic_group,
    )
    view = await run_sync_task(run)

    if after is None:
        after = "-1"

    if int(after) > -1:
        view = view.skip(int(after) + 1)

    pipeline = await get_samples_pipeline(view, sample_filter)
    maxTimeMS = max_query_time * 1000 if max_query_time else None
    samples = await foo.aggregate(
        foo.get_async_db_conn()[view._dataset._sample_collection_name],
        pipeline,
        hint,
        maxTimeMS=maxTimeMS,
    ).to_list(first + 1)

    more = False
    if len(samples) > first:
        samples = samples[:first]
        more = True

    metadata_cache = {}
    url_cache = {}
    additional_media_fields = (
        fosm._get_additional_media_fields(view) if samples else None
    )
    nodes = await asyncio.gather(
        *[
            _create_sample_item(
                view,
                sample,
                metadata_cache,
                url_cache,
                pagination_data,
                additional_media_fields=additional_media_fields,
            )
            for sample in samples
        ]
    )

    media_by_sample, located = await resolve_sample_media(view, nodes)
    # An object under a source this server reads is reached through where the
    # source is, which the dataset names once; only the rest needs a location
    # of its own on this page
    unaddressable = {
        asset_id: path
        for asset_id, path in located.items()
        if focs.get_file_system(path) is not focs.FileSystem.LOCAL
    }
    media_srcs = (
        await run_sync_task(_media_asset_srcs, unaddressable)
        if unaddressable
        else {}
    )
    for node in nodes:
        media = media_by_sample.get(str(node.sample["_id"]))
        if media is None:
            continue

        # Everything the sample's media is made of, so nothing it is
        # opened in has to ask the server for what it was already given.
        # Only an object the browser cannot reach on its own carries a
        # location; the rest are composed from where their source is
        node.sample["_media"] = {
            "assets": [
                {**asset, "src": media_srcs[asset["id"]]}
                if asset["id"] in media_srcs
                else asset
                for asset in media.assets
            ],
            "poster": media.poster_id,
        }

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


def _media_asset_srcs(unaddressable):
    """A location for each object on the page the browser cannot reach on its
    own, by asset id. This server reaches every object it is asked for, so
    there are none.
    """
    srcs = {}
    return srcs


async def _create_sample_item(
    dataset: SampleCollection,
    sample: t.Dict,
    metadata_cache: t.Dict[str, t.Dict],
    url_cache: t.Dict[str, str],
    pagination_data: bool,
    *,
    additional_media_fields: t.Optional[t.Tuple] = None,
) -> SampleItem:
    transported_sample = sample
    if sample.get("media_reference") is not None:
        # Transported as stored; the page resolves media for all of its
        # reference-backed samples at once afterwards
        media_type = sample["_media_type"]
        metadata = {"urls": [], "aspect_ratio": 1}
        cls = MEDIA_TYPES[media_type]
    else:
        media_type = fom.get_media_type(sample["filepath"])
        metadata = await fosm.get_metadata(
            dataset,
            sample,
            media_type,
            metadata_cache,
            url_cache,
            additional_media_fields=additional_media_fields,
            skip_metadata_read=(
                pagination_data and media_type == fom.MULTIMODAL
            ),
        )
        cls = MEDIA_TYPES[media_type]

    if cls == VideoSample:
        metadata = dict(**metadata, frame_number=sample.get("frame_number", 1))

    _id = sample["_id"]

    if not pagination_data:
        _id = f"{_id}-modal"

    return from_dict(
        cls,
        {
            "id": _id,
            "sample": transported_sample,
            **metadata,
        },
    )


async def get_samples_pipeline(
    view: SampleCollection,
    sample_filter: t.Optional[SampleFilter],
):
    frames, frames_pipeline = _handle_frames(view)
    groups = _handle_groups(sample_filter)
    pipeline = view._pipeline(
        **groups,
        **frames,
    )

    if frames_pipeline:
        pipeline.extend(frames_pipeline)

    return pipeline


def _handle_frames(
    view: SampleCollection,
):
    # check frame field schema explicitly, media type is not reliable for
    # groups
    attach_frames = view.get_frame_field_schema() is not None

    # Only return the first frame of each video sample for the grid thumbnail
    if attach_frames:
        return dict(
            attach_frames=attach_frames,
            detach_frames=False,
            limit_frames=None if _needs_full_lookup(view) else 1,
        ), [{"$addFields": {"frames": {"$slice": ["$frames", 1]}}}]

    return dict(), []


def _needs_full_lookup(view: SampleCollection):
    if isinstance(view, Dataset):
        return False

    for stage in view._stages:
        if isinstance(
            stage,
            (
                fos.ExcludeFields,
                fos.ExcludeFrames,
                fos.ExcludeLabels,
                fos.SelectFields,
                fos.SelectFrames,
                fos.SelectLabels,
            ),
        ):
            # these stages do not directly impact matched results
            continue

        if isinstance(stage, fos.SetField) and stage._allow_limit:
            # manually override to support first frame label tag counts
            continue

        if stage._needs_frames(view):
            return True

    return False


def _handle_groups(sample_filter: t.Optional[SampleFilter]):
    return dict(
        manual_group_select=sample_filter
        and sample_filter.group
        and (sample_filter.group.id and not sample_filter.group.slices)
    )
