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
import fiftyone.core.odm.utils as fou
from typing import List
from fiftyone.server.utils.json_patch import parse
from fiftyone.server.utils import transform_json
from fiftyone.server.decorators import route
from typing import Any

logger = logging.getLogger(__name__)


def get_sample(dataset_id: str, sample_id: str) -> fo.Sample:
    """Retrieves a sample from a dataset.

    Args:
        dataset_id: the dataset ID
        sample_id: the sample ID

    Returns:
        the sample

    Raises:
        HTTPException: if the dataset or sample is not found
    """
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

    return sample


def handle_json_patch(target: Any, patch_list: List[dict]) -> Any:
    """Applies a list of JSON patch operations to a target object."""
    errors = {}
    for p in patch_list:
        try:
            if "value" in p:
                p["value"] = transform_json(p["value"])
            patch = parse(p)
            patch.apply(target)
        except Exception as e:
            logger.error("Error applying patch %s: %s", p, e)
            errors[str(p)] = str(e)
    if errors:
        raise HTTPException(
            status_code=400,
            detail=errors,
        )
    return target


class Sample(HTTPEndpoint):
    @route
    async def patch(self, request: Request, data: dict) -> dict:
        """Applies a list of field updates to a sample.

        See: https://datatracker.ietf.org/doc/html/rfc6902

        Args:
            request: Starlette request with dataset_id and sample_id in path params
            data: A dict mapping field names to values.

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

        sample = get_sample(dataset_id, sample_id)

        content_type = request.headers.get("Content-Type", "")
        if content_type == "application/json":
            result = self._handle_patch(sample, data)
        elif content_type == "application/json-patch+json":
            result = handle_json_patch(sample, data)
        else:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported Content-Type '{content_type}'",
            )
        sample.save()
        return result.to_dict(include_private=True)

    def _handle_patch(self, sample: fo.Sample, data: dict) -> dict:
        errors = {}
        for field_name, value in data.items():
            try:
                if value is None:
                    sample.clear_field(field_name)
                    continue

                sample[field_name] = transform_json(value)
            except Exception as e:
                errors[field_name] = str(e)

        if errors:
            raise HTTPException(
                status_code=400,
                detail=errors,
            )
        return sample


class SampleField(HTTPEndpoint):
    @route
    async def patch(self, request: Request, data: dict) -> dict:
        """Applies a list of field updates to a sample field in a list by id.

        See: https://datatracker.ietf.org/doc/html/rfc6902

        Args:
            request: Starlette request with dataset_id and sample_id in path params
            data: patch of type op, path, value.

        Returns:
            the final state of the sample as a dict
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]
        path = request.path_params["field_path"]
        field_id = request.path_params["field_id"]

        logger.info(
            "Received patch request for field %s with ID %s on sample %s in dataset %s",
            path,
            field_id,
            sample_id,
            dataset_id,
        )

        sample = get_sample(dataset_id, sample_id)
        field_list = sample.get_field(path)

        if field_list is None:
            raise HTTPException(
                status_code=404,
                detail=f"Field '{path}' not found in sample '{sample_id}'",
            )

        if not isinstance(field_list, (list, dict)):
            raise HTTPException(
                status_code=400,
                detail=f"Field '{path}' is not a list",
            )

        field = next((f for f in field_list if f.id == field_id), None)
        if field is None:
            raise HTTPException(
                status_code=404,
                detail=f"Field with id '{field_id}' not found in field '{path}'",
            )

        result = handle_json_patch(field, data)
        sample.save()
        return result.to_dict(include_private=True)


SampleRoutes = [
    ("/dataset/{dataset_id}/sample/{sample_id}", Sample),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/{field_path}/{field_id}",
        SampleField,
    ),
]
