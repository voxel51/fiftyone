"""
FiftyOne Server tagging.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import tornado

from fiftyone.core.expressions import ViewField as F
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.view as fov

from fiftyone.server.json_util import convert
from fiftyone.server.state import catch_errors, StateHandler
import fiftyone.server.utils as fosu
import fiftyone.server.view as fosv


class TagHandler(fosu.AsyncRequestHandler):
    @catch_errors
    async def post_response(self):
        data = tornado.escape.json_decode(self.request.body)

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
        current_frame = data.get("current_frame", None)
        sample_id = data.get("sample_id", None)

        view = fosv.get_view(dataset, stages=stages, filters=filters)

        sample_ids = set(sample_ids or [])
        if labels:
            for label in labels:
                sample_ids.add(label["sample_id"])
        elif modal:
            sample_ids.add(sample_id)

        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)

        if target_labels:
            if labels:
                view = view.select_labels(labels)
            elif hidden_labels:
                view = view.exclude_labels(hidden_labels)

            fosu.change_label_tags(
                view, changes, label_fields=active_label_fields
            )
        else:
            fosu.change_sample_tags(view, changes)

        if modal and sample_ids:
            if view.media_type == fom.VIDEO and current_frame is not None:
                default_filter = F("frame_number") == 1
                current_filter = F("frame_number").is_in([current_frame, 1])
                filter_frames = lambda f: F("frames").filter(f)
                expr = F.if_else(
                    F(view._get_db_fields_map()["id"]).to_string()
                    == sample_id,
                    filter_frames(current_filter),
                    filter_frames(default_filter),
                )
                view = view.set_field("frames", expr)

            samples = await foo.aggregate(
                StateHandler.sample_collection(),
                view._pipeline(attach_frames=True, detach_frames=False),
            ).to_list(len(sample_ids))
            return {"samples": convert(samples)}

        else:
            return {"samples": []}
