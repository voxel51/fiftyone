"""
FiftyOne Server /frames route

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

from bson import ObjectId
from starlette.endpoints import HTTPEndpoint
from starlette.responses import JSONResponse
from starlette.requests import Request

from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.json as foj
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
from fiftyone.core.utils import run_sync_task
import fiftyone.core.view as fov

from fiftyone.server.decorators import route
import fiftyone.server.view as fosv

logger = logging.getLogger(__name__)


_ALWAYS_FRAME = ("_id", "_sample_id", "frame_number", "filepath")


def _heavy_frame_paths(schema, prefix=""):
    # Collect paths to dicts, vectors, and per-label `logits` fields to exclude
    # from the projection since they aren't exposed in the app anyways. Descends
    # into label embedded docs to reach nested logits, but stops at any excluded
    # field so the $project exclusions can't overlap.
    paths = []
    for name, field in schema.items():
        path = f"{prefix}.{name}" if prefix else name

        if (
            isinstance(field, (fof.DictField, fof.VectorField))
            or name == "logits"
        ):
            paths.append(path)
            continue

        nested = field
        while isinstance(
            nested,
            (fof.ListField, fof.DictField, fof.EmbeddedDocumentListField),
        ):
            nested = nested.field

        if isinstance(nested, fof.EmbeddedDocumentField):
            paths.extend(_heavy_frame_paths(nested.get_field_schema(), path))

    return paths


def _frame_projection(fields, exclude, view):
    """Mongo projection from the client's ``fields``/``exclude``, else heavy-field exclusion."""
    if fields:
        return {
            **{p: True for p in fields},
            **{p: True for p in _ALWAYS_FRAME},
        }
    if exclude:
        return {p: False for p in exclude if p not in _ALWAYS_FRAME}
    heavy = _heavy_frame_paths(view.get_frame_field_schema())
    return {p: 0 for p in heavy} if heavy else None


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

        view = await fosv.get_view(
            dataset,
            stages=stages,
            extended_stages=extended,
            awaitable=True,
        )
        end_frame = min(num_frames + start_frame, frame_count)
        support = None if stages else [start_frame, end_frame]

        logger.info(
            "[fetch] video-frames sample=%s range=%s",
            sample_id,
            [start_frame, end_frame],
        )

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

        projection = _frame_projection(
            data.get("fields"), data.get("exclude"), view
        )
        _dataset = view._dataset
        limit = end_frame - start_frame + 1

        if (
            support is not None
            and sample_id is not None
            and _dataset.media_type == fom.VIDEO
            and not view._is_clips
        ):
            # Plain video, no view stages: query frames directly.
            frame_coll = foo.get_async_db_conn()[
                _dataset._frame_collection_name
            ]
            frames = (
                await frame_coll.find(
                    {
                        "_sample_id": ObjectId(sample_id),
                        "frame_number": {
                            "$gte": support[0],
                            "$lte": support[1],
                        },
                    },
                    projection,
                )
                .sort("frame_number", 1)
                .to_list(limit)
            )
        else:
            pipeline = view._pipeline(frames_only=True, support=support)
            if projection is not None:
                # Exclude inside the `$lookup` so heavy fields aren't joined.
                project = {"$project": projection}
                lookup = next(
                    (
                        stage
                        for stage in pipeline
                        if "$lookup" in stage
                        and stage["$lookup"].get("as") == "frames"
                    ),
                    None,
                )
                if lookup is not None:
                    lookup["$lookup"]["pipeline"].append(project)
                else:
                    pipeline.append(project)

            frames = await foo.aggregate(
                foo.get_async_db_conn()[_dataset._sample_collection_name],
                pipeline,
            ).to_list(limit)

        return JSONResponse(
            {
                "frames": foj.stringify(frames),
                "range": [start_frame, end_frame],
            }
        )
