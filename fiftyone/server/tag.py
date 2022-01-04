"""
FiftyOne Server tagging.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import tornado

import fiftyone.core.view as fov

from fiftyone.server.state import catch_errors
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

        view = fosv.get_view(dataset, stages=stages, filters=filters)

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

        return {}
