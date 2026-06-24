"""
FiftyOne Server samples pagination

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import collections

import strawberry as gql
import typing as t


from fiftyone.core.collections import SampleCollection
from fiftyone.core.dataset import Dataset
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.stages as fos
from fiftyone.core.utils import run_sync_task

from fiftyone.server.filters import SampleFilter
import fiftyone.server.metadata as fosm
from fiftyone.server.paginator import Connection, Edge, PageInfo
from fiftyone.server.scalars import BSON, JSON, BSONArray
from fiftyone.server.utils import from_dict
import fiftyone.server.view as fosv


# serialized class string for the dynamic-group stage the frontend sends in ``view``
GROUP_BY_CLS = "fiftyone.core.stages.GroupBy"


def strip_group_by(stages):
    """Pull any ``GroupBy`` stage out of a serialized view.

    Returns ``(kept_stages, field_or_expr, order_by)``. Removing the stage lets a
    by-id read compile an index-eligible ``$match`` instead of re-grouping the
    whole collection; the returned fields let the server rebuild ``_group``.
    """
    group_fields = None
    order_by = None
    kept = []
    for stage in stages or []:
        if stage.get("_cls") == GROUP_BY_CLS:
            kwargs = dict(stage.get("kwargs") or [])
            group_fields = kwargs.get("field_or_expr")
            order_by = kwargs.get("order_by")
            continue
        kept.append(stage)
    return kept, group_fields, order_by


def group_paths(group_fields, order_by):
    """Field paths a grouped read must project to rebuild ``_group``."""
    paths = []
    if isinstance(group_fields, (list, tuple)):
        paths.extend(group_fields)
    elif group_fields:
        paths.append(group_fields)
    if order_by:
        paths.append(order_by)
    return paths


def db_field(view, path):
    """Resolve a field path to its Mongo storage key (e.g. ``sample_id`` ->
    ``_sample_id``). This db-key knowledge stays in the backend."""
    try:
        field = view.get_field(path)
    except Exception:  # pragma: no cover - defensive: unknown path
        return path
    return (field.db_field or path) if field is not None else path


def assemble_group(view, docs, group_fields):
    """Set ``doc['_group']`` from the group-by field value(s): a scalar for a
    single field, a list for multiple. Idempotent and a no-op for flat views."""
    if not group_fields or not docs:
        return

    is_list = isinstance(group_fields, (list, tuple))
    fields = list(group_fields) if is_list else [group_fields]
    db_fields = [db_field(view, f) for f in fields]

    for doc in docs:
        values = [doc.get(f) for f in db_fields]
        doc["_group"] = values if is_list else values[0]


async def assemble_group_counts(
    dataset_name,
    degrouped_stages,
    filters,
    sort_by,
    desc,
    sample_filter,
    docs,
    group_fields,
):
    """Set ``doc['_group_count']`` = the number of samples in each group within
    the view, so the modal timeline opens at the right length. Skips docs that
    already carry a count (grouped reads emit it) and the multi-field case.
    """
    if not group_fields or isinstance(group_fields, (list, tuple)) or not docs:
        return

    pending = [d for d in docs if d.get("_group_count") is None]
    values = [d.get("_group") for d in pending if d.get("_group") is not None]
    if not values:
        return

    # count the whole group: drop any single-sample `id` filter but keep the
    # group slice, so the base view isn't narrowed to the one fetched sample
    count_filter = (
        SampleFilter(group=sample_filter.group)
        if sample_filter is not None and sample_filter.group
        else None
    )

    def _build_base():
        return fosv.get_view(
            dataset_name,
            stages=degrouped_stages,
            filters=filters,
            pagination_data=False,
            sort_by=sort_by,
            desc=bool(desc),
            sample_filter=count_filter,
        )

    base = await run_sync_task(_build_base)
    db = db_field(base, group_fields)
    pipeline = await get_samples_pipeline(base, count_filter)
    pipeline += [
        {"$match": {db: {"$in": values}}},
        {"$group": {"_id": f"${db}", "_n": {"$sum": 1}}},
    ]
    coll = foo.get_async_db_conn()[base._dataset._sample_collection_name]
    counts = {
        c["_id"]: c["_n"]
        for c in await foo.aggregate(coll, pipeline).to_list(None)
    }
    for doc in pending:
        doc["_group_count"] = counts.get(doc.get("_group"))


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
    skip_metadata: t.Optional[bool] = False,
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

    maxTimeMS = max_query_time * 1000 if max_query_time else None
    coll = foo.get_async_db_conn()[view._dataset._sample_collection_name]

    if int(after) > -1:
        view = view.skip(int(after) + 1)

    # emit per-group counts only for the top-level paginated grouped read
    if dynamic_group is None and pagination_data:
        for stage in getattr(view, "_stages", []):
            if isinstance(stage, fos.GroupBy):
                stage._include_count = True

    pipeline = await get_samples_pipeline(view, sample_filter)

    samples = await foo.aggregate(
        coll,
        pipeline,
        hint,
        maxTimeMS=maxTimeMS,
    ).to_list(first + 1)

    more = False
    if len(samples) > first:
        samples = samples[:first]
        more = True

    # attach group identity + size to every dynamic-group sample so the modal
    # resolves them on any fetch path; no-op for flat views
    degrouped, group_fields, _ = strip_group_by(stages)
    if group_fields and samples:
        assemble_group(view, samples, group_fields)
        await assemble_group_counts(
            dataset,
            degrouped,
            filters,
            sort_by,
            desc,
            sample_filter,
            samples,
            group_fields,
        )

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
                skip_dimensions=skip_metadata,
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
    *,
    additional_media_fields: t.Optional[t.Tuple] = None,
    skip_dimensions: bool = False,
) -> SampleItem:
    media_type = fom.get_media_type(sample["filepath"])
    cls = MEDIA_TYPES[media_type]

    metadata = await fosm.get_metadata(
        dataset,
        sample,
        media_type,
        metadata_cache,
        url_cache,
        additional_media_fields=additional_media_fields,
        skip_dimensions=skip_dimensions,
    )

    if cls == VideoSample:
        metadata = dict(**metadata, frame_number=sample.get("frame_number", 1))

    _id = sample["_id"]

    if not pagination_data:
        _id = f"{_id}-modal"

    return from_dict(cls, {"id": _id, "sample": sample, **metadata})


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
