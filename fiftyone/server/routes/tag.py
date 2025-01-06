"""
FiftyOne Server /tag route

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

from fiftyone.core.expressions import ViewField as F
import fiftyone.core.json as foj
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.view as fov

from fiftyone.server.decorators import route
from fiftyone.server.filters import GroupElementFilter, SampleFilter
import fiftyone.server.tags as fost
import fiftyone.server.utils as fosu
import fiftyone.server.view as fosv


class Tag(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        sample_ids = data.get("sample_ids", None)
        labels = data.get("labels", None)
        target_labels = data.get("target_labels", False)
        label_fields = data.get("label_fields", None)
        hidden_labels = data.get("hidden_labels", None)
        changes = data.get("changes", {})
        modal = data.get("modal", False)
        extended = data.get("extended", None)
        current_frame = data.get("current_frame", None)
        slices = data.get("slices", None)
        slice = data.get("slice", None)
        group_id = data.get("group_id", None)
        view = await fost.get_tag_view(
            dataset,
            stages=stages,
            filters=filters,
            extended_stages=extended,
            labels=labels,
            hidden_labels=hidden_labels,
            sample_filter=SampleFilter(
                group=(
                    GroupElementFilter(slice=slice, id=group_id, slices=slices)
                    if not sample_ids
                    else None
                )
            ),
            target_labels=target_labels,
            sample_ids=sample_ids,
        )

        if target_labels:
            fosu.change_label_tags(view, changes, label_fields=label_fields)
        else:
            fosu.change_sample_tags(view, changes)

        if not modal:
            return {"samples": []}

        view = await fost.get_tag_view(
            dataset,
            stages=stages,
            filters={},
            sample_filter=SampleFilter(
                group=(
                    GroupElementFilter(id=group_id, slices=slices)
                    if not sample_ids
                    else None
                )
            ),
            sample_ids=sample_ids,
            target_labels=False,
        )

        is_video = view.media_type == fom.VIDEO
        if is_video and current_frame is not None:
            default_filter = F("frame_number") == 1
            current_filter = F("frame_number").is_in([current_frame, 1])
            filter_frames = lambda f: F("frames").filter(f)
            expr = F.if_else(
                F("_id").to_string() == modal,
                filter_frames(current_filter),
                filter_frames(default_filter),
            )
            view = view.set_field("frames", expr)

        samples = []
        async for document in foo.aggregate(
            foo.get_async_db_conn()[view._dataset._sample_collection_name],
            view._pipeline(attach_frames=is_video, detach_frames=is_video),
        ):
            samples.append(document)

        return {"samples": foj.stringify(samples)}
