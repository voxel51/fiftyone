"""
FiftyOne Server /tag route

| Copyright 2017-2022, Voxel51, Inc.
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
        active_label_fields = data.get("active_label_fields", [])
        hidden_labels = data.get("hidden_labels", None)
        changes = data.get("changes", {})
        modal = data.get("modal", False)
        extended = data.get("extended", None)
        current_frame = data.get("current_frame", None)
        slice = data.get("slice", None)
        group_id = data.get("group_id", None)

        view = fosv.get_view(
            dataset,
            stages=stages,
            filters=filters,
            extended_stages=extended,
            sample_filter=SampleFilter(
                group=GroupElementFilter(id=group_id, slice=slice)
            ),
        )

        sample_ids = set(sample_ids or [])
        if labels:
            for label in labels:
                sample_ids.add(label["sample_id"])

        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)
        elif view.media_type == fom.GROUP and not slice:
            view = view.select_group_slices(_allow_mixed=True)

        if target_labels:
            if labels:
                view = view.select_labels(labels)
            elif hidden_labels:
                view = view.exclude_labels(hidden_labels)

        if target_labels:
            fosu.change_label_tags(
                view, changes, label_fields=active_label_fields
            )
        else:
            fosu.change_sample_tags(view, changes)

        if not modal:
            return {"samples": []}

        view = fosv.get_view(
            dataset,
            stages=stages,
            filters=filters,
            sample_filter=SampleFilter(
                group=GroupElementFilter(id=group_id, slice=slice)
            ),
        )
        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)
        elif view.media_type == fom.GROUP and not slice:
            view = view.select_group_slices(_allow_mixed=True)

        if view.media_type == fom.VIDEO and current_frame is not None:
            default_filter = F("frame_number") == 1
            current_filter = F("frame_number").is_in([current_frame, 1])
            filter_frames = lambda f: F("frames").filter(f)
            expr = F.if_else(
                F(view._get_db_fields_map()["id"]).to_string() == modal,
                filter_frames(current_filter),
                filter_frames(default_filter),
            )
            view = view.set_field("frames", expr)

        samples = []
        async for document in foo.aggregate(
            foo.get_async_db_conn()[view._dataset._sample_collection_name],
            view._pipeline(attach_frames=True, detach_frames=False),
        ):
            samples.append(document)

        return {"samples": foj.stringify(samples)}
