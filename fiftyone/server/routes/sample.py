"""
FiftyOne Server sample endpoints.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import typing as t
import json

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import Response

import fiftyone.core.labels as fol
import fiftyone.core.odm.utils as fou
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


class Sample(HTTPEndpoint):
    @route
    async def patch(
        self, request: Request, data: dict
    ) -> t.Union[dict, Response]:
        """Applies a list of field updates to a sample.

        Args:
            request: Starlette request with dataset_id and sample_id in path params
            data: A dict mapping field names to values.

        Field value handling:
        -   None: deletes the field
        -   dict with "_cls" key: deserializes as a FiftyOne label using from_dict
        -   other: assigns the value directly to the field

        Returns:
            the final state of the sample as a dict
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]

        logger.info(
            "Received patch request for sample %s in dataset %s",
            sample_id,
            dataset_id,
        )

        if not isinstance(data, dict):
            return Response(
                status_code=400,
                content="Request body must be a JSON object mapping field names to values",
            )

        try:
            dataset = fou.load_dataset(id=dataset_id)
        except ValueError:
            return Response(
                status_code=404,
                content=f"Dataset '{dataset_id}' not found",
            )

        try:
            sample = dataset[sample_id]
        except KeyError:
            return Response(
                status_code=404,
                content=f"Sample '{sample_id}' not found in dataset '{dataset_id}'",
            )

        errors = {}
        for field_name, value in data.items():
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
                            errors[field_name] = str(e)
                    else:
                        errors[
                            field_name
                        ] = f"Unsupported label class '{cls_name}'"
                else:
                    sample[field_name] = value
            except Exception as e:
                errors[field_name] = {str(e)}

        if errors:
            return Response(
                status_code=400,
                content=json.dumps(errors),
            )
        sample.save()

        return sample.to_dict(include_private=True)
