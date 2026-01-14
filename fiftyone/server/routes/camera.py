"""
FiftyOne Server camera endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from typing import List, Optional

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse

from fiftyone.server import utils
from fiftyone.server.utils.datasets import get_dataset, get_sample_from_dataset

logger = logging.getLogger(__name__)


class CameraIntrinsics(HTTPEndpoint):
    """Camera intrinsics endpoint."""

    async def get(self, request: Request) -> JSONResponse:
        """Retrieves camera intrinsics for a sample.

        Args:
            request: Starlette request with dataset_id and sample_id in path
                params

        Returns:
            JSON response containing the intrinsics data, or null if not found
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]

        logger.debug(
            "Received GET request for camera intrinsics for sample %s "
            "in dataset %s",
            sample_id,
            dataset_id,
        )

        dataset = get_dataset(dataset_id)
        sample = get_sample_from_dataset(dataset, sample_id)

        intrinsics = dataset.resolve_intrinsics(sample)

        if intrinsics is None:
            return utils.json.JSONResponse({"intrinsics": None})

        return utils.json.JSONResponse(
            {"intrinsics": utils.json.serialize(intrinsics)}
        )


class StaticTransforms(HTTPEndpoint):
    """Static transforms endpoint."""

    async def get(self, request: Request) -> JSONResponse:
        """Retrieves a static transform for a sample.

        Args:
            request: Starlette request with dataset_id and sample_id in path
                params, and optional source_frame, target_frame, chain_via
                query params

        Returns:
            JSON response containing the transform data, or null if not found
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]
        source_frame, target_frame, chain_via = _parse_extrinsics_params(
            request
        )

        logger.debug(
            "Received GET request for static transform for sample %s "
            "in dataset %s (source_frame=%s, target_frame=%s, chain_via=%s)",
            sample_id,
            dataset_id,
            source_frame,
            target_frame,
            chain_via,
        )

        dataset = get_dataset(dataset_id)
        sample = get_sample_from_dataset(dataset, sample_id)

        try:
            transform = dataset.resolve_transformation(
                sample,
                source_frame=source_frame,
                target_frame=target_frame,
                chain_via=chain_via,
            )
        except ValueError as err:
            # ValueError can occur when chain_via frames don't chain
            raise HTTPException(status_code=400, detail=str(err)) from err

        if transform is None:
            return utils.json.JSONResponse({"transform": None})

        return utils.json.JSONResponse(
            {"transform": utils.json.serialize(transform)}
        )


def _parse_sample_ids(request: Request) -> List[str]:
    """Parses sample_ids from query params.

    Args:
        request: Starlette request with sample_ids query param

    Raises:
        HTTPException: If sample_ids is missing or empty

    Returns:
        List of sample IDs
    """
    sample_ids_param = request.query_params.get("sample_ids")
    if not sample_ids_param:
        raise HTTPException(
            status_code=400,
            detail="Missing required query parameter 'sample_ids'",
        )

    sample_ids = [s.strip() for s in sample_ids_param.split(",") if s.strip()]
    if not sample_ids:
        raise HTTPException(
            status_code=400,
            detail="No valid sample IDs provided",
        )

    return sample_ids


def _parse_extrinsics_params(request: Request):
    """Parses extrinsics-related query params.

    Args:
        request: Starlette request

    Returns:
        Tuple of (source_frame, target_frame, chain_via)
    """
    source_frame = request.query_params.get("source_frame")
    target_frame = request.query_params.get("target_frame")
    chain_via_param = request.query_params.get("chain_via")

    chain_via: Optional[List[str]] = None
    if chain_via_param:
        chain_via = [
            f.strip() for f in chain_via_param.split(",") if f.strip()
        ]

    return source_frame, target_frame, chain_via


def _parse_slices(request: Request) -> List[str]:
    """Parses optional slices from query params.

    Args:
        request: Starlette request

    Returns:
        List of slice names, or empty list if not provided
    """
    slices_param = request.query_params.get("slices")
    if slices_param:
        return [s.strip() for s in slices_param.split(",") if s.strip()]
    return []


def _get_group_info(sample, sample_id: str):
    """Gets group info from a sample, validating it belongs to a group.

    Args:
        sample: The sample to get group info from
        sample_id: The sample ID (for error messages)

    Raises:
        HTTPException: If sample does not belong to a group

    Returns:
        The group info object
    """
    try:
        group_info = sample.group
    except AttributeError:
        group_info = None

    if group_info is None:
        raise HTTPException(
            status_code=400,
            detail=f"Sample '{sample_id}' does not belong to a group",
        )

    return group_info


def _get_group_slices(dataset, slices: List[str]) -> List[str]:
    """Gets the list of slices to query for a group.

    Args:
        dataset: The dataset
        slices: User-provided slices (may be empty)

    Raises:
        HTTPException: If no slices available

    Returns:
        List of slice names to query
    """
    if slices:
        return slices

    slices = dataset.group_slices or []
    if not slices:
        raise HTTPException(
            status_code=400,
            detail="No slices available for this group",
        )

    return slices


def _get_slice_sample(dataset, group_id: str, slice_name: str):
    """Gets a sample for a specific slice in a group.

    Args:
        dataset: The dataset
        group_id: The group ID
        slice_name: The slice name

    Returns:
        Tuple of (slice_sample, error_dict). If successful, error_dict is None.
        If failed, slice_sample is None and error_dict contains the error.
    """
    try:
        group_samples = dataset.get_group(group_id, group_slices=[slice_name])
        slice_sample = group_samples.get(slice_name)
    except KeyError:
        return None, {"error": f"Slice '{slice_name}' not found in group"}

    if slice_sample is None:
        return None, {"error": f"Slice '{slice_name}' not found in group"}

    return slice_sample, None


class BatchIntrinsics(HTTPEndpoint):
    """Batch camera intrinsics endpoint."""

    async def get(self, request: Request) -> JSONResponse:
        """Retrieves camera intrinsics for multiple samples.

        Args:
            request: Starlette request with dataset_id in path params and
                sample_ids as comma-separated query param

        Returns:
            JSON response containing results dict mapping sample_id to
            intrinsics data, null, or error message
        """
        dataset_id = request.path_params["dataset_id"]
        sample_ids = _parse_sample_ids(request)

        logger.debug(
            "Received GET request for batch camera intrinsics for %d samples "
            "in dataset %s",
            len(sample_ids),
            dataset_id,
        )

        dataset = get_dataset(dataset_id)

        results = {}
        for sample_id in sample_ids:
            try:
                sample = dataset[sample_id]
            except KeyError:
                results[sample_id] = {
                    "error": f"Sample '{sample_id}' not found"
                }
                continue

            intrinsics = dataset.resolve_intrinsics(sample)
            if intrinsics is None:
                results[sample_id] = {"intrinsics": None}
            else:
                results[sample_id] = {
                    "intrinsics": utils.json.serialize(intrinsics)
                }

        return utils.json.JSONResponse({"results": results})


class BatchStaticTransforms(HTTPEndpoint):
    """Batch static transforms endpoint."""

    async def get(self, request: Request) -> JSONResponse:
        """Retrieves static transforms for multiple samples.

        Args:
            request: Starlette request with dataset_id in path params,
                sample_ids as comma-separated query param, and optional
                source_frame, target_frame, chain_via query params

        Returns:
            JSON response containing results dict mapping sample_id to
            transform data, null, or error message
        """
        dataset_id = request.path_params["dataset_id"]
        sample_ids = _parse_sample_ids(request)
        source_frame, target_frame, chain_via = _parse_extrinsics_params(
            request
        )

        logger.debug(
            "Received GET request for batch static transforms for %d samples "
            "in dataset %s (source_frame=%s, target_frame=%s, chain_via=%s)",
            len(sample_ids),
            dataset_id,
            source_frame,
            target_frame,
            chain_via,
        )

        dataset = get_dataset(dataset_id)

        results = {}
        for sample_id in sample_ids:
            try:
                sample = dataset[sample_id]
            except KeyError:
                results[sample_id] = {
                    "error": f"Sample '{sample_id}' not found"
                }
                continue

            try:
                transform = dataset.resolve_transformation(
                    sample,
                    source_frame=source_frame,
                    target_frame=target_frame,
                    chain_via=chain_via,
                )
            except ValueError as err:
                # ValueError can occur when chain_via frames don't chain
                results[sample_id] = {"error": str(err)}
                continue

            if transform is None:
                results[sample_id] = {"transform": None}
            else:
                results[sample_id] = {
                    "transform": utils.json.serialize(transform)
                }

        return utils.json.JSONResponse({"results": results})


class GroupIntrinsics(HTTPEndpoint):
    """Group camera intrinsics endpoint.

    Retrieves intrinsics for multiple slices belonging to a group.
    """

    async def get(self, request: Request) -> JSONResponse:
        """Retrieves camera intrinsics for slices in a sample's group.

        Args:
            request: Starlette request with dataset_id and sample_id in path
                params, and optional slices query param

        Returns:
            JSON response containing results dict mapping slice name to
            intrinsics data, null, or error message
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]

        dataset = get_dataset(dataset_id)
        sample = get_sample_from_dataset(dataset, sample_id)

        group_info = _get_group_info(sample, sample_id)
        group_id = group_info.id
        slices = _get_group_slices(dataset, _parse_slices(request))

        logger.debug(
            "Received GET request for group camera intrinsics for sample %s "
            "in dataset %s (group_id=%s, slices=%s)",
            sample_id,
            dataset_id,
            group_id,
            slices,
        )

        results = {}
        for slice_name in slices:
            slice_sample, error = _get_slice_sample(
                dataset, group_id, slice_name
            )
            if error:
                results[slice_name] = error
                continue

            intrinsics = dataset.resolve_intrinsics(slice_sample)

            if intrinsics is None:
                results[slice_name] = {"intrinsics": None}
            else:
                results[slice_name] = {
                    "intrinsics": utils.json.serialize(intrinsics)
                }

        return utils.json.JSONResponse(
            {"group_id": group_id, "results": results}
        )


class GroupExtrinsics(HTTPEndpoint):
    """Group camera extrinsics endpoint.

    Retrieves extrinsics for multiple slices belonging to a group.
    """

    async def get(self, request: Request) -> JSONResponse:
        """Retrieves camera/sensor extrinsics for slices in a sample's group.

        Args:
            request: Starlette request with dataset_id and sample_id in path
                params, and optional slices, source_frame, target_frame,
                chain_via query params

        Returns:
            JSON response containing results dict mapping slice name to
            extrinsics data, null, or error message
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]
        source_frame, target_frame, chain_via = _parse_extrinsics_params(
            request
        )

        dataset = get_dataset(dataset_id)
        sample = get_sample_from_dataset(dataset, sample_id)

        group_info = _get_group_info(sample, sample_id)
        group_id = group_info.id
        slices = _get_group_slices(dataset, _parse_slices(request))

        logger.debug(
            "Received GET request for group camera extrinsics for sample %s "
            "in dataset %s (group_id=%s, slices=%s, source_frame=%s, "
            "target_frame=%s, chain_via=%s)",
            sample_id,
            dataset_id,
            group_id,
            slices,
            source_frame,
            target_frame,
            chain_via,
        )

        results = {}
        for slice_name in slices:
            slice_sample, error = _get_slice_sample(
                dataset, group_id, slice_name
            )
            if error:
                results[slice_name] = error
                continue

            try:
                extrinsics = dataset.resolve_extrinsics(
                    slice_sample,
                    source_frame=source_frame,
                    target_frame=target_frame,
                    chain_via=chain_via,
                )
            except ValueError as err:
                results[slice_name] = {"error": str(err)}
                continue

            if extrinsics is None:
                results[slice_name] = {"extrinsics": None}
            else:
                results[slice_name] = {
                    "extrinsics": utils.json.serialize(extrinsics)
                }

        return utils.json.JSONResponse(
            {"group_id": group_id, "results": results}
        )


CameraRoutes = [
    (
        "/dataset/{dataset_id}/sample/{sample_id}/intrinsics",
        CameraIntrinsics,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/static_transforms",
        StaticTransforms,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/group/intrinsics",
        GroupIntrinsics,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/group/extrinsics",
        GroupExtrinsics,
    ),
    (
        "/dataset/{dataset_id}/samples/intrinsics",
        BatchIntrinsics,
    ),
    (
        "/dataset/{dataset_id}/samples/static_transforms",
        BatchStaticTransforms,
    ),
]
