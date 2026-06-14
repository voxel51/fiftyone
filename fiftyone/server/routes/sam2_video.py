"""
FiftyOne Server SAM2 video propagation endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import traceback

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

from fiftyone.core.utils import run_sync_task
from fiftyone.server.decorators import route
from fiftyone.server.services.sam2_video_propagation import (
    DEFAULT_MODEL_NAME,
    Sam2VideoPropagationError,
    propagate_in_video_for_objects,
)
from fiftyone.server.utils.datasets import get_dataset, get_sample_from_dataset

logger = logging.getLogger(__name__)


class Sam2VideoPropagate(HTTPEndpoint):
    """``POST /sam2-video/propagate`` — native SAM2 ``propagate_in_video``."""

    @route
    async def post(self, request: Request, data: dict) -> dict:
        """Run video propagation for one or more objects on a sample."""
        try:
            return await run_sync_task(self._post_sync, data)
        except HTTPException:
            raise
        except Exception as e:
            msg = "SAM2 video propagation failed"
            logger.error("%s: %s", msg, e)
            logger.error(traceback.format_exc())
            return {"error": msg, "details": str(e)}

    def _post_sync(self, data: dict) -> dict:
        dataset_name = data.get("datasetName")
        sample_id = data.get("sampleId")
        objects = data.get("objects") or []
        model_name = data.get("modelName") or DEFAULT_MODEL_NAME

        if not dataset_name or not sample_id:
            raise HTTPException(
                status_code=400,
                detail="datasetName and sampleId are required",
            )
        if not objects:
            raise HTTPException(
                status_code=400,
                detail="At least one object spec is required",
            )

        try:
            dataset = get_dataset(dataset_name)
            sample = get_sample_from_dataset(dataset, sample_id)
            frames = propagate_in_video_for_objects(
                sample,
                objects,
                model_name=model_name,
            )
            return {"frames": frames}
        except Sam2VideoPropagationError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except ImportError as e:
            raise HTTPException(
                status_code=501,
                detail=(
                    "SAM2 video propagation requires the `sam2` package and "
                    "a SAM2 video zoo model. Install sam2 and download "
                    "segment-anything-2-hiera-tiny-video-torch."
                ),
            ) from e


Sam2VideoRoutes = [
    ("/sam2-video/propagate", Sam2VideoPropagate),
]
