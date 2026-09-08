"""
FiftyOne Server /frames route

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.responses import JSONResponse
from starlette.requests import Request

from fiftyone.core.expressions import ViewField as F
import fiftyone.core.json as foj
import fiftyone.core.odm as foo
from fiftyone.core.utils import run_sync_task
import fiftyone.core.view as fov

from fiftyone.server.decorators import route
import fiftyone.server.view as fosv


class Frames(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        start_frame = int(data.get("frameNumber", 1))
        frame_count = int(data.get("frameCount", 1))
        num_frames = int(data.get("numFrames"))
        extended = data.get("extended", None)
        dataset = data.get("dataset")
        stages = data.get("view")
        sample_id = data.get("sampleId")
        # Optional field projection: callers that need only a few frame fields
        # (e.g. the ImaVid image stream wants just `filepath`) pass them here to
        # avoid shipping the whole frame document.
        fields = data.get("fields")
        # When set, the clip's "frames" are the ordered samples of this dynamic
        # group rather than a video sample's `frames` field. This is the ImaVid
        # case for an image dataset dynamically grouped into a video, which has
        # no `frames` field to unwind.
        dynamic_group = data.get("dynamicGroup")

        # `end_frame` is served inclusively, so the window's last frame is
        # `start_frame + num_frames - 1` (clamped to the clip)
        end_frame = min(start_frame + num_frames - 1, frame_count)
        if end_frame < start_frame:
            # an empty range would produce a to_list() length < 1, which
            # pymongo rejects
            return JSONResponse(
                {"frames": [], "range": [start_frame, end_frame]}
            )

        if dynamic_group is not None:
            return await self._post_dynamic_group(
                dataset=dataset,
                stages=stages,
                extended=extended,
                dynamic_group=dynamic_group,
                start_frame=start_frame,
                end_frame=end_frame,
                fields=fields,
            )

        view = await fosv.get_view(
            dataset, stages=stages, extended_stages=extended, awaitable=True
        )
        support = None if stages else [start_frame, end_frame]

        def run(view):
            view = fov.make_optimized_select_view(
                view, sample_id, flatten=True
            )

            if not support:
                view = view.set_field(
                    "frames",
                    F("frames").filter(
                        (F("frame_number") >= start_frame)
                        & (F("frame_number") <= end_frame)
                    ),
                )

            return view

        view = await run_sync_task(run, view)

        post_pipeline = None
        if fields:
            projection = {"frame_number": True}
            for field in fields:
                projection[field] = True

            post_pipeline = [{"$project": projection}]

        cursor = await foo.aggregate(
            foo.get_async_db_conn()[view._dataset._sample_collection_name],
            view._pipeline(
                frames_only=True, support=support, post_pipeline=post_pipeline
            ),
        )
        frames = await cursor.to_list(end_frame - start_frame + 1)

        return JSONResponse(
            {
                "frames": foj.stringify(frames),
                "range": [start_frame, end_frame],
            }
        )

    async def _post_dynamic_group(
        self,
        dataset,
        stages,
        extended,
        dynamic_group,
        start_frame,
        end_frame,
        fields,
    ):
        """Serves a window of a dynamic group's ordered samples as "frames".

        For an image dataset dynamically grouped into a video (ImaVid), the
        clip has no `frames` field — each "frame" is a sample of the dynamic
        group. ``get_view(dynamic_group=...)`` selects that group's ordered
        samples; we window and project them like the video path does.
        """
        view = await fosv.get_view(
            dataset,
            stages=stages,
            extended_stages=extended,
            dynamic_group=dynamic_group,
            awaitable=True,
        )

        count = end_frame - start_frame + 1

        def run(view):
            # 1-indexed frames → 0-indexed skip; window to the request.
            return view.skip(start_frame - 1).limit(count)

        view = await run_sync_task(run, view)

        post_pipeline = None
        if fields:
            projection = {field: True for field in fields}
            post_pipeline = [{"$project": projection}]

        cursor = await foo.aggregate(
            foo.get_async_db_conn()[view._dataset._sample_collection_name],
            view._pipeline(post_pipeline=post_pipeline),
        )
        samples = await cursor.to_list(count)

        # The dynamic group is ordered, so the i-th sample is frame
        # `start_frame + i`. Stamp it so the client keys frames the same way as
        # the video `frames` path.
        for offset, sample in enumerate(samples):
            sample["frame_number"] = start_frame + offset

        return JSONResponse(
            {
                "frames": foj.stringify(samples),
                "range": [start_frame, end_frame],
            }
        )
