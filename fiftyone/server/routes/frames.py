"""
FiftyOne Server /frames route

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import pprint

from bson import ObjectId
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

from fiftyone.core.expressions import ViewField as F
import fiftyone.core.json as foj
import fiftyone.core.odm as foo
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

        view = fosv.get_view(dataset, stages=stages, extended_stages=extended)
        view = fov.make_optimized_select_view(view, sample_id)
        print("=" * 80)
        print("/frames route")
        print("view =", view)
        print("view._pipeline = ", view._pipeline(frames_only=True))

        end_frame = min(num_frames + start_frame, frame_count)
        frame_filters = [
            getattr(s, "_filter", None)
            for s in view._stages
            if s._needs_frames(view)
        ]

        # Hacky way to fix aggregation stage when switching root to frames collection
        frame_filters = [
            str(s).replace("$this.", "")
            for s in frame_filters
            if s is not None
        ]
        print("frame_filters =", frame_filters)
        match_expr = {
            "$and": [
                {"$eq": ["$_sample_id", ObjectId(sample_id)]},
                {"$gte": ["$frame_number", start_frame]},
                {"$lte": ["$frame_number", end_frame]},
                *frame_filters,
            ]
        }
        sample_frame_pipeline = [
            {"$match": {"$expr": match_expr}},
            {"$sort": {"frame_number": 1}},
        ]
        print("-" * 80)
        print("sample_frame_pipeline =", sample_frame_pipeline)
        frames = (
            await foo.get_async_db_conn()[view._dataset._frame_collection_name]
            .aggregate(sample_frame_pipeline, allowDiskUse=True)
            .to_list(None)
        )

        print(
            f"len(frames)={len(frames)}\nend_frame - start_frame + 1 = {end_frame - start_frame + 1}"
        )

        return {
            "frames": foj.stringify(frames),
            "range": [start_frame, end_frame],
        }
