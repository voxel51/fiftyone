"""
FiftyOne Server sample endpoints.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.odm.utils as fou
from typing import List
from fiftyone.server.utils.json_patch import Operation, parse
from fiftyone.server.utils.transform_patch import transform
from fiftyone.server.decorators import route

logger = logging.getLogger(__name__)


class Sample(HTTPEndpoint):
    @route
    async def patch(self, request: Request, data: dict) -> dict:
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

        try:
            dataset = fou.load_dataset(id=dataset_id)
        except ValueError:
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{dataset_id}' not found",
            )

        try:
            sample = dataset[sample_id]
        except KeyError:
            raise HTTPException(
                status_code=404,
                detail=f"Sample '{sample_id}' not found in dataset '{dataset_id}'",
            )

        content_type = request.headers.get("Content-Type", "")
        if content_type == "application/json":
            return await self._handle_patch(sample, data)
        elif content_type == "application/json-patch+json":
            return await self._handle_json_patch(sample, data)
        else:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported Content-Type '{content_type}'",
            )

    async def _handle_patch(self, sample: fo.Sample, data: dict) -> dict:
        errors = {}
        for field_name, value in data.items():
            try:
                if value is None:
                    sample.clear_field(field_name)
                    continue

                sample[field_name] = transform(value)
            except Exception as e:
                errors[field_name] = str(e)

        if errors:
            raise HTTPException(
                status_code=400,
                detail=errors,
            )
        sample.save()
        return sample.to_dict(include_private=True)

    # TODO: FIX THIS IT DONT WORK
    async def _handle_json_patch(
        self, sample: fo.Sample, patch_list: List[dict]
    ) -> dict:
        """Applies a list of JSON patch operations to a sample."""
        try:
            patches = parse(*patch_list)
            if not isinstance(patches, list):
                patches = [patches]
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid patch format: {e}",
            )

        try:
            for p in patches:
                kwargs = {}
                if p.op in (Operation.ADD, Operation.REPLACE, Operation.TEST):
                    kwargs["transform"] = transform

                p.apply(sample, **kwargs)
        except (
            ValueError,
            AttributeError,
            IndexError,
            TypeError,
            RuntimeError,
        ) as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to apply patch: {e}",
            )

        sample.save()
        return sample.to_dict()
