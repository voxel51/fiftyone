"""
FiftyOne Server samples pagination

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
import pprint

import strawberry as gql
import typing as t

from pymongo.errors import OperationFailure

from fiftyone.core.collections import SampleCollection
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
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
    print("stages=", stages)
    print("filters=", filters)
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
    frame_filters = [
        s._filter for s in root_view._stages if s._needs_frames(root_view)
    ]
    frame_filters = [str(s).replace("$this.", "") for s in frame_filters]

    media = view.media_type
    if media == fom.MIXED:
        media = root_view.group_media_types[root_view.default_group_slice]

    if media == fom.GROUP:
        media = view.group_media_types[view.group_slice]

    # TODO: Remove this once we have a better way to handle large videos. This
    # is a temporary fix to reduce the $lookup overhead for sample frames on
    # full datasets.
    # support = (
    #     [1, 1] if ((media == fom.VIDEO) and ~(len(view._stages) > 1)) else None
    # )

    if after is None:
        after = "-1"

    if int(after) > -1:
        view = view.skip(int(after) + 1)
    # try:
    pipeline = view._pipeline(
        attach_frames=False,
        detach_frames=True,
        manual_group_select=sample_filter
        and sample_filter.group
        and (sample_filter.group.id and not sample_filter.group.slice),
        # support=support,
    )
    print("=" * 80)
    print(pipeline)
    sample_pipeline = []
    frame_pipeline = []
    for agg in pipeline:
        if "frame" in str(agg):
            print("new frame agg=", agg)
            if "$project" not in agg:
                frame_pipeline.append(agg)
                # frame_pipeline.append(agg.replace('frames', '$this'))

        else:
            sample_pipeline.append(agg)
    print("-" * 80)
    print("sample_pipeline=", sample_pipeline)
    # Only return the first frame of each video sample for the grid thumbnail
    # if media == fom.VIDEO:
    #     pipeline.append({"$set": {"frames": {"$slice": ["$frames", 1]}}})
    samples = []
    async for sample in foo.get_async_db_conn()[
        view._dataset._sample_collection_name
    ].aggregate(sample_pipeline):
        if media == fom.VIDEO:
            match_expr = {
                "$and": [
                    {"$eq": [sample["_id"], "$_sample_id"]},
                    *frame_filters,
                ]
            }
            sample_frame_pipeline = [
                {"$match": {"$expr": match_expr}},
            ]  # {"_sample_id": sample["_id"],
            # "frame_number": 1
            # }
            # },
            # "$facet":{"$frames": { {'$group': {'_id': {'sample_id': '$_sample_id',
            # 'frame_id': "$_id"}}
            # ] + frame_pipeline
            print("+" * 80)
            print("sample_frame_pipeline=", sample_frame_pipeline)
            frame = (
                await foo.get_async_db_conn()[
                    view._dataset._frame_collection_name
                ]
                .aggregate(sample_frame_pipeline, allowDiskUse=True)
                .to_list(1)
            )
            # frame = await foo.get_async_db_conn()[
            #     view._dataset._frame_collection_name].find(
            #         {"_sample_id": {"$eq": samples[0]["_id"]},
            #          "frame_number": {"$eq": 1}}).to_list(
            #         None)
            if frame:
                print("^" * 80)
                print(len(frame))
                # print(frame[0])
                sample["frames"] = frame
                samples.append(sample)
        else:
            samples.append(sample)
    # samples = await foo.aggregate(
    #     foo.get_async_db_conn()[view._dataset._sample_collection_name],
    #     pipeline,
    # ).to_list(first + 1)
    # async for sample in foo.get_async_db_conn()[view._dataset._sample_collection_name].aggregate(pipeline):
    #     if media == fom.VIDEO:
    #         frame = await foo.get_async_db_conn()[
    #             view._dataset._frame_collection_name].aggregate([{
    #             "$match": {"_sample_id": sample["_id"],
    #                        "frame_number": 1}}]).to_list(
    #                 length=1)
    #         # frame = await foo.get_async_db_conn()[
    #         #     view._dataset._frame_collection_name].find(
    #         #         {"_sample_id": {"$eq": samples[0]["_id"]},
    #         #          "frame_number": {"$eq": 1}}).to_list(
    #         #         None)
    #         sample["frames"] = [frame]
    #
    # samples = await foo.get_async_db_conn()[view._dataset._sample_collection_name].aggregate(
    #     pipeline).to_list(first + 1)
    # if media == fom.VIDEO:
    #     for sample in samples:
    #         frame = await foo.get_async_db_conn()[
    #             view._dataset._frame_collection_name].aggregate([{
    # "$match":{"_sample_id":sample["_id"], "frame_number":1}}]).to_list(
    #     length=1)
    #         # frame = await foo.get_async_db_conn()[
    #         #     view._dataset._frame_collection_name].find(
    #         #         {"_sample_id": {"$eq": samples[0]["_id"]},
    #         #          "frame_number": {"$eq": 1}}).to_list(
    #         #         None)
    #         sample["frames"] = [frame]
    #         # frames = await foo.get_async_db_conn()[view._dataset._frame_collection_name].findOne({"_sample_id": sample["_id"], "frame_number": "1"}).to_list(length=1)

    # print("-" * 80)
    # pprint.pprint(samples[0])
    # print("=" * 80)
    # except OperationFailure as e:
    #
    #     pipeline = view._pipeline(
    #             attach_frames=False,
    #             detach_frames=True,
    #             manual_group_select=sample_filter
    #                                 and sample_filter.group
    #                                 and (
    #                                             sample_filter.group.id and not sample_filter.group.slice),
    #             # support=support,
    #     )
    #     # Only return the first frame of each video sample for the grid thumbnail
    #     if media == fom.VIDEO:
    #         pipeline.append({"$set": {"frames": {"$slice": ["$frames", 1]}}})
    #
    #     samples = await foo.aggregate(
    #             foo.get_async_db_conn()[view._dataset._sample_collection_name],
    #             pipeline,
    #     ).to_list(first + 1)
    # except Exception as e:
    #     raise ValueError

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

    return from_dict(cls, {"id": sample["_id"], "sample": sample, **metadata})
