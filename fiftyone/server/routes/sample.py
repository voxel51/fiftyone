"""
FiftyOne Server sample endpoints.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import base64
import datetime
import logging
from typing import Any, List, Union

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

import fiftyone as fo
import fiftyone.core.odm.utils as fou

from fiftyone.server import utils
from fiftyone.server.decorators import route

logger = logging.getLogger(__name__)


def get_if_last_modified_at(
    request: Request,
) -> Union[datetime.datetime, None]:
    """Parses the If-Match header from the request, if present, and returns
    the last modified date.

    Args:
        request: The request

    Raises:
        HTTPException: If the If-Match header could not be parsed into a
          valid date

    Returns:
        The last modified date, or None if the header is not present
    """

    if_last_modified_at: Union[str, datetime.datetime, None] = None
    if request.headers.get("If-Match"):
        if_match, _ = utils.http.ETag.parse(request.headers["If-Match"])

        # As ETag - Currently this is just a based64 encode string of
        # last_modified_at
        try:
            if_last_modified_at = datetime.datetime.fromisoformat(
                base64.b64decode(if_match.encode("utf-8")).decode("utf-8")
            )
        except Exception:
            ...

        # As ISO date
        try:
            if_last_modified_at = datetime.datetime.fromisoformat(if_match)
        except Exception:
            ...

        # As Unix timestamp
        try:
            if_last_modified_at = datetime.datetime.fromtimestamp(
                float(if_match)
            )
        except ValueError:
            ...

        if if_last_modified_at is None:
            raise HTTPException(
                status_code=400, detail="Invalid If-Match header"
            )
    return if_last_modified_at


def get_sample(
    dataset_id: str,
    sample_id: str,
    if_last_modified_at: Union[datetime.datetime, None],
) -> fo.Sample:
    """Retrieves a sample from a dataset.

    Args:
        dataset_id: The ID of the dataset
        sample_id: The ID of the sample
        if_last_modified_at: The if last modified date, if it exists

    Raises:
        HTTPException: If the dataset or sample is not found or the if last
          modified date is present and does not match the sample

    Returns:
        The sample
    """

    try:
        dataset = fou.load_dataset(id=dataset_id)
    except ValueError as err:
        raise HTTPException(
            status_code=404,
            detail=f"Dataset '{dataset_id}' not found",
        ) from err

    try:
        sample = dataset[sample_id]
    except KeyError as err:
        raise HTTPException(
            status_code=404,
            detail=f"Sample '{sample_id}' not found in dataset '{dataset_id}'",
        ) from err

    # Fail early, if very out-of-date
    if if_last_modified_at is not None:
        if sample.last_modified_at != if_last_modified_at:
            raise HTTPException(
                status_code=412, detail="If-Match condition failed"
            )

    return sample


def generate_sample_etag(sample: fo.Sample) -> str:
    """Generates an ETag for a sample based on its last modified date.

    Args:
        sample: The sample
    Returns:
        The ETag
    """
    value = base64.b64encode(
        sample.last_modified_at.isoformat().encode("utf-8")
    ).decode("utf-8")
    return f'"{value}"'


def save_sample(
    sample: fo.Sample, if_last_modified_at: Union[datetime.datetime, None]
) -> str:
    """Saves a sample to the database.

    Args:
        sample: The sample to save
        if_last_modified_at: The if last modified date, if it exists

    Returns:
        The ETag of the saved sample
    """

    if if_last_modified_at is not None:
        d = sample.to_mongo_dict(include_id=True)

        # pylint:disable-next=protected-access
        update_result = sample.dataset._sample_collection.replace_one(
            {
                # pylint:disable-next=protected-access
                "_id": sample._id,
                "last_modified_at": {"$eq": if_last_modified_at},
            },
            d,
        )

        if update_result.matched_count == 0:
            raise HTTPException(
                status_code=412, detail="If-Match condition failed"
            )
    else:
        sample.save()

    # Ensure last_modified_at reflects persisted state before computing
    # ETag
    try:
        sample.reload(hard=True)
    except Exception:
        # best-effort; still return response
        ...

    return generate_sample_etag(sample)


def handle_json_patch(target: Any, patch_list: List[dict]) -> Any:
    """Applies a list of JSON patch operations to a target object."""
    try:
        patches = utils.json.parse_jsonpatch(
            patch_list, transform_fn=utils.json.deserialize
        )
    except Exception as err:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse patches due to: {err}",
        ) from err

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


class Sample(HTTPEndpoint):
    """Sample endpoints."""

    @route
    async def patch(self, request: Request, data: dict) -> dict:
        """Applies a list of field updates to a sample.

        See: https://datatracker.ietf.org/doc/html/rfc6902

        Args:
            request: Starlette request with dataset_id and sample_id in path
              params
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

        if_last_modified_at = get_if_last_modified_at(request)

        sample = get_sample(dataset_id, sample_id, if_last_modified_at)

        content_type = request.headers.get("Content-Type", "")
        ctype = content_type.split(";", 1)[0].strip().lower()
        if ctype == "application/json":
            self._handle_patch(sample, data)
        elif ctype == "application/json-patch+json":
            handle_json_patch(sample, data)
        else:
            raise HTTPException(
                status_code=415, detail=f"Unsupported Content-Type '{ctype}'"
            )

        etag = save_sample(sample, if_last_modified_at)

        return utils.json.JSONResponse(
            utils.json.serialize(sample), headers={"ETag": etag}
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
            raise HTTPException(status_code=400, detail=errors)
        return sample


class SampleField(HTTPEndpoint):
    """Sample field endpoints."""

    @route
    async def patch(self, request: Request, data: dict) -> dict:
        """Applies a list of field updates to a sample field in a list by id.

        See: https://datatracker.ietf.org/doc/html/rfc6902

        Args:
            request: Starlette request with dataset_id and sample_id in path
            params
            data: patch of type op, path, value.

        Returns:
            the final state of the sample as a dict
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]
        path = request.path_params["field_path"]
        field_id = request.path_params["field_id"]

        logger.info(
            (
                "Received patch request for field %s with ID %s on sample %s "
                "in dataset %s"
            ),
            path,
            field_id,
            sample_id,
            dataset_id,
        )

        if_last_modified_at = get_if_last_modified_at(request)

        sample = get_sample(dataset_id, sample_id, if_last_modified_at)

        try:
            field_list = sample.get_field(path)
        except Exception as err:
            raise HTTPException(
                status_code=404,
                detail=f"Field '{path}' not found in sample '{sample_id}'",
            ) from err

        if not isinstance(field_list, list):
            raise HTTPException(
                status_code=400, detail=f"Field '{path}' is not a list"
            )

        print(field_list)

        field = next((f for f in field_list if f.id == field_id), None)
        if field is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Field with id '{field_id}' not found in field "
                    f"'{path}'"
                ),
            )

        handle_json_patch(field, data)

        etag = save_sample(sample, if_last_modified_at)

        updated_field = next((f for f in field_list if f.id == field_id), None)

        return utils.json.JSONResponse(
            utils.json.serialize(updated_field), headers={"ETag": etag}
        )


SampleRoutes = [
    ("/dataset/{dataset_id}/sample/{sample_id}", Sample),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/{field_path}/{field_id}",
        SampleField,
    ),
]
