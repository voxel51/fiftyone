"""
FiftyOne Server sample endpoints.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import datetime
import logging
import hashlib
from typing import Any, List

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

import fiftyone as fo
import fiftyone.core.odm.utils as fou

from fiftyone.server import utils
from fiftyone.server.decorators import route

logger = logging.getLogger(__name__)


def get_sample(request: Request) -> fo.Sample:
    """Retrieves a sample from a dataset.

    Args:
        request: The request object containing dataset ID and sample ID

    Returns:
        the sample

    Raises:
        HTTPException: if the dataset or sample is not found
    """

    dataset_id = request.path_params["dataset_id"]
    sample_id = request.path_params["sample_id"]

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

    if request.headers.get("If-Match"):
        etag, _ = utils.http.ETag.parse(request.headers["If-Match"])

        if etag == str(generate_sample_etag(sample)):
            return sample

        if etag == sample.last_modified_at.isoformat():
            return sample

        if etag == str(sample.last_modified_at.timestamp()):
            return sample

        raise HTTPException(status_code=412, detail="ETag does not match")

    return sample


def handle_json_patch(target: Any, patch_list: List[dict]) -> Any:
    """Applies a list of JSON patch operations to a target object."""
    try:
        patches = utils.json.parse_jsonpatch(
            patch_list, transform_fn=utils.json.deserialize
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse patches due to: {e}",
        )

    errors = {}
    for i, p in enumerate(patches):
        try:
            p.apply(target)
        except Exception as e:
            logger.error("Error applying patch %s: %s", p, e)
            errors[str(patch_list[i])] = str(e)

    if errors:
        raise HTTPException(
            status_code=400,
            detail=errors,
        )
    return target


def generate_sample_etag(sample: fo.Sample) -> str:
    """Generates an ETag for a sample."""
    # pylint:disable-next=protected-access
    content = f"{sample.last_modified_at.isoformat()}"
    hex_digest = hashlib.md5(content.encode("utf-8")).hexdigest()
    return int(hex_digest, 16)


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
        sample = get_sample(request)

        content_type = request.headers.get("Content-Type", "")
        ctype = content_type.split(";", 1)[0].strip().lower()
        if ctype == "application/json":
            result = self._handle_patch(sample, data)
        elif ctype == "application/json-patch+json":
            result = handle_json_patch(sample, data)
        else:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported Content-Type '{ctype}'",
            )

        result.save()

        return utils.json.JSONResponse(
            utils.json.serialize(result),
            headers={"ETag": f'"{generate_sample_etag(result)}"'},
        )

    def _handle_patch(self, sample: fo.Sample, data: dict) -> dict:
        errors = {}
        for field_name, value in data.items():
            try:
                if value is None:
                    sample.clear_field(field_name)
                    continue

                sample[field_name] = utils.json.deserialize(value)
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

        sample = get_sample(request)

        try:
            field_list = sample.get_field(path)
        except Exception as e:
            raise HTTPException(
                status_code=404,
                detail=f"Field '{path}' not found in sample '{sample_id}'",
            )

        if not isinstance(field_list, list):
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

        return utils.json.JSONResponse(
            utils.json.serialize(result),
            headers={"ETag": f'"{generate_sample_etag(sample)}"'},
        )


SampleRoutes = [
    ("/dataset/{dataset_id}/sample/{sample_id}", Sample),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/{field_path}/{field_id}",
        SampleField,
    ),
]
