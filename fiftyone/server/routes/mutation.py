"""
FiftyOne Server mutation endpoints.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import typing as t

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import Response

import fiftyone.core.dataset as fod
import fiftyone.core.labels as fol
from fiftyone.server.decorators import route

logger = logging.getLogger(__name__)

LABEL_CLASS_MAP = {
    "Classification": fol.Classification,
    "Classifications": fol.Classifications,
    "Detection": fol.Detection,
    "Detections": fol.Detections,
    "Polyline": fol.Polyline,
    "Polylines": fol.Polylines,
}


class SampleMutation(HTTPEndpoint):
    @route
    async def patch(
        self, request: Request, data: list
    ) -> t.Union[dict, Response]:
        """Applies a list of field updates to a sample.

        Args:
            request: Starlette request with dataset_id and sample_id in path params
            data: A list of dicts mapping field names to values. Each dict can
                  contain one or more field updates. If the same field appears
                  multiple times, the last value wins.

        Field value handling:
        -   None: deletes the field
        -   dict with "_cls" key: deserializes as a FiftyOne label using from_dict
        -   other: assigns the value directly to the field

        Returns:
            dict with "status", "patched_sample_id", and "errors" keys
        """
        dataset_name = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]

        logger.info(
            "Received patch request for sample %s in dataset %s",
            sample_id,
            dataset_name,
        )

        if not isinstance(data, list):
            return Response(
                status_code=400,
                content="Request body must be a JSON array of patch operations",
            )

        try:
            dataset = fod.load_dataset(dataset_name)
        except ValueError:
            return Response(
                status_code=404,
                content=f"Dataset '{dataset_name}' not found",
            )

        try:
            sample = dataset[sample_id]
        except KeyError:
            return Response(
                status_code=404,
                content=f"Sample '{sample_id}' not found in dataset '{dataset_name}'",
            )

        errors = []
        patches = {}
        for patch in data:
            if isinstance(patch, dict):
                for field_name, value in patch.items():
                    patches[field_name] = value
            else:
                errors.append(f"Invalid patch operation format: {patch}")

        for field_name, value in patches.items():
            try:
                if value is None:
                    sample.clear_field(field_name)
                    continue

                if isinstance(value, dict) and "_cls" in value:
                    cls_name = value.get("_cls")
                    if cls_name in LABEL_CLASS_MAP:
                        label_cls = LABEL_CLASS_MAP[cls_name]
                        try:
                            sample[field_name] = label_cls.from_dict(value)
                        except Exception as e:
                            errors.append(
                                f"Failed to parse field '{field_name}': {str(e)}"
                            )
                    else:
                        errors.append(
                            f"Unsupported label class '{cls_name}' for field '{field_name}'"
                        )
                else:
                    sample[field_name] = value
            except Exception as e:
                errors.append(
                    f"Failed to update field '{field_name}': {str(e)}"
                )

        sample.save()

        return {
            "status": "ok",
            "patched_sample_id": str(sample.id),
            "errors": errors,
        }


MutationRoutes = [("/dataset/{dataset_id}/sample/{sample_id}", SampleMutation)]
