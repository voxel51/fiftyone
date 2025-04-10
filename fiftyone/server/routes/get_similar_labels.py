"""
FiftyOne Server /frames route

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse

import fiftyone.core.odm as foo
import fiftyone.core.view as fov
import fiftyone.server.view as fosv
from fiftyone.core.expressions import ViewField as F
from fiftyone.core.utils import run_sync_task
from fiftyone.server.decorators import route
from bson import ObjectId


# assume only works for video for now
class GetSimilarLabels(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        instance_id = data.get("instanceId")
        # frame number to start processing
        start_frame = int(data.get("frameNumber", 1))
        # number of frames to process
        frame_count = int(data.get("frameCount", 1))
        # total number of frames for a given video sample
        num_frames = int(data.get("numFrames"))
        dataset = data.get("dataset")
        stages = data.get("view", [])
        sample_id = data.get("sampleId")
        extended = data.get("extended", None)

        end_frame = min(num_frames, start_frame + frame_count)
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

        view = await fosv.get_view(
            dataset, stages=stages, extended_stages=extended, awaitable=True
        )

        view = await run_sync_task(run, view)

        """
        1. Aggregate number of "similar" labels in the video across all frames
        2. Return data in the form of:
            {
                "label": "label_name",
                "count": 10,
                "instance_id": "instance_id",
                # map from label id to frame number
                "label_ids": {
                    "label_id_1": 10,
                    "label_id_2": 20,
                    "label_id_3": 30,
                },
                "range": [start_frame, end_frame],
            }

        To do this, something like following (but might differ):
        - need to get all frames in the video for a sample (look up frame collection by sample_id)
        - need to get all labels in the video (iterate through all labels for selected _cls classes)
          with a filter for instance_id. store in a dict
        - return the data
        """

        # If no instance_id provided, return empty response
        if not instance_id:
            return JSONResponse(
                {
                    "label": "",
                    "count": 0,
                    "instance_id": instance_id,
                    "label_ids": {},
                    "range": [start_frame, end_frame],
                }
            )

        obj_instance_id = ObjectId(instance_id)

        # Get the base pipeline using view's pipeline
        post_pipeline = [
            # Add a filter step to find labels with matching instance ID
            {
                "$project": {
                    "frame_number": 1,
                    "detections": {
                        "$filter": {
                            "input": "$detections.detections",
                            "as": "detection",
                            "cond": {
                                "$eq": [
                                    "$$detection.instance._id",
                                    obj_instance_id,
                                ]
                            },
                        }
                    },
                    "classifications": {
                        "$filter": {
                            "input": "$classifications.classifications",
                            "as": "classification",
                            "cond": {
                                "$eq": [
                                    "$$classification.instance._id",
                                    obj_instance_id,
                                ]
                            },
                        }
                    },
                }
            }
        ]

        # Use the view's pipeline to handle the frames extraction and filtering
        pipeline = view._pipeline(
            frames_only=True, support=support, post_pipeline=post_pipeline
        )

        # Execute the aggregation pipeline
        conn = foo.get_db_conn()
        collection = conn[view._dataset._sample_collection_name]
        results = list(foo.aggregate(collection, pipeline))

        # Process results
        label_name = ""
        label_ids = {}
        count = 0

        for result in results:
            frame_number = result.get("frame_number")

            # Process detections
            detections = result.get("detections", [])
            if isinstance(detections, list) and detections:
                for detection in detections:
                    if detection:
                        count += 1
                        detection_id = str(detection.get("_id"))
                        label_name = detection.get("label", "")
                        label_ids[detection_id] = frame_number

            # Process classifications
            classifications = result.get("classifications", [])
            if isinstance(classifications, list) and classifications:
                for classification in classifications:
                    if classification:
                        count += 1
                        classification_id = str(classification.get("_id"))
                        label_name = classification.get("label", "")
                        label_ids[classification_id] = frame_number

        return JSONResponse(
            {
                "label": label_name,
                "count": count,
                "instance_id": instance_id,
                "label_ids": label_ids,
                "range": [start_frame, end_frame],
            }
        )
