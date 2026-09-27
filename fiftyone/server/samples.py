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
    before: t.Optional[str] = None,
    extended_stages: t.Optional[BSON] = None,
    sample_filter: t.Optional[SampleFilter] = None,
    pagination_data: t.Optional[bool] = False,
    sort_by: t.Optional[str] = None,
    desc: t.Optional[bool] = False,
    hint: t.Optional[str] = None,
    dynamic_group: t.Optional[BSON] = None,
    max_query_time: t.Optional[int] = None,
    cursor_pagination: t.Optional[bool] = False,
) -> Connection[t.Union[ImageSample, VideoSample], str]:
    """Paginates samples in the given view.

    Two cursor strategies are supported:

    -   **Skip-based** (default, ``cursor_pagination=False``): ``after`` is
        the 0-based index of the last sample returned on the prior page,
        and the next page is fetched via ``$skip``. Used by the grid's
        infinite scroll.
    -   **Cursor-based** (``cursor_pagination=True``): ``after`` is the
        sort-field value of the last sample on the prior page, serialized
        as a string, and the next page is fetched via
        ``$match {field: {$gt: value}}`` (or ``$lt`` when ``desc``). Used
        by the grid scrubber to seek to a target sort-field value without
        counting the rows before it. Requires ``sort_by`` to be set.
    """
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

    # Backward cursor seek: `before` is the next-page-going-backward
    # cursor (encoded sort-field value). We invert the comparison and the
    # view's sort direction, fetch the same way, then reverse the
    # in-memory result so the caller still sees ascending (or `desc`)
    # ordering. Mutually exclusive with `after`.
    backward = cursor_pagination and bool(sort_by) and before is not None
    if backward:
        op = "$gt" if desc else "$lt"
        value = _decode_cursor_value(before)
        view = view.match({sort_by: {op: value}})
        # Re-sort opposite to the user-requested direction so the
        # nearest-to-cursor samples come first; we'll reverse at the end.
        view = view.sort_by(sort_by, reverse=not desc)
    elif cursor_pagination and sort_by and after != "-1":
        # Value-cursor strategy: `after` is the previous page's last
        # sort-field value, encoded as a string. Filter rather than skip.
        op = "$lt" if desc else "$gt"
        value = _decode_cursor_value(after)
        view = view.match({sort_by: {op: value}})
    elif not cursor_pagination and int(after) > -1:
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

    if backward:
        # Restore the caller-facing sort order (the matched set was
        # fetched reverse-sorted to put the nearest-cursor samples first).
        samples = list(reversed(samples))

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
                (
                    {**asset, "src": media_srcs[asset["id"]]}
                    if asset["id"] in media_srcs
                    else asset
                )
                for asset in media.assets
            ],
            "poster": media.poster_id,
        }

    edges = []
    for idx, node in enumerate(nodes):
        if cursor_pagination and sort_by:
            # Encode the sort-field value of this sample as the cursor so
            # subsequent pages can seek past it.
            cursor = _encode_cursor_value(samples[idx].get(sort_by))
        else:
            cursor = str(idx + int(after) + 1)
        edges.append(Edge(node=node, cursor=cursor))

    return Connection(
        page_info=PageInfo(
            # For a backward fetch, `more` describes whether more rows
            # exist on the still-earlier side (the cursor seek's
            # "previous"). Forward fetches don't know — the client uses
            # the field's `[min, max]` bounds to decide whether to walk
            # backward from the seeked origin, so we report False here
            # rather than making an extra query just to guess.
            has_previous_page=more if backward else False,
            has_next_page=False if backward else more,
            start_cursor=edges[0].cursor if edges else None,
            end_cursor=edges[-1].cursor if edges else None,
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


def _encode_cursor_value(value: t.Any) -> str:
    """Encodes a sort-field value as a stable string cursor. Numerics use
    their string repr; everything else falls back to ``str()`` and the
    decoder mirrors that."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "1" if value else "0"
    return str(value)


def _decode_cursor_value(cursor: str) -> t.Any:
    """Inverse of {@link _encode_cursor_value}. Tries numeric parsing
    first; falls back to the raw string."""
    if cursor == "":
        return None
    try:
        return int(cursor)
    except ValueError:
        pass
    try:
        return float(cursor)
    except ValueError:
        pass
    return cursor


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
