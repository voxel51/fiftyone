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


class CameraExtrinsics(HTTPEndpoint):
    """Camera extrinsics endpoint."""

    async def get(self, request: Request) -> JSONResponse:
        """Retrieves camera/sensor extrinsics for a sample.

        Args:
            request: Starlette request with dataset_id and sample_id in path
                params, and optional source_frame, target_frame, chain_via
                query params

        Returns:
            JSON response containing the extrinsics data, or null if not found
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]

        source_frame = request.query_params.get("source_frame")
        target_frame = request.query_params.get("target_frame")
        chain_via_param = request.query_params.get("chain_via")

        chain_via: Optional[List[str]] = None
        if chain_via_param:
            chain_via = [
                f.strip() for f in chain_via_param.split(",") if f.strip()
            ]

        logger.debug(
            "Received GET request for camera extrinsics for sample %s "
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
            extrinsics = dataset.resolve_extrinsics(
                sample,
                source_frame=source_frame,
                target_frame=target_frame,
                chain_via=chain_via,
            )
        except ValueError as err:
            # ValueError can occur when chain_via frames don't chain
            raise HTTPException(status_code=400, detail=str(err)) from err

        if extrinsics is None:
            return utils.json.JSONResponse({"extrinsics": None})

        return utils.json.JSONResponse(
            {"extrinsics": utils.json.serialize(extrinsics)}
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


class BatchCameraIntrinsics(HTTPEndpoint):
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


class BatchCameraExtrinsics(HTTPEndpoint):
    """Batch camera extrinsics endpoint."""

    async def get(self, request: Request) -> JSONResponse:
        """Retrieves camera/sensor extrinsics for multiple samples.

        Args:
            request: Starlette request with dataset_id in path params,
                sample_ids as comma-separated query param, and optional
                source_frame, target_frame, chain_via query params

        Returns:
            JSON response containing results dict mapping sample_id to
            extrinsics data, null, or error message
        """
        dataset_id = request.path_params["dataset_id"]
        sample_ids = _parse_sample_ids(request)

        source_frame = request.query_params.get("source_frame")
        target_frame = request.query_params.get("target_frame")
        chain_via_param = request.query_params.get("chain_via")

        chain_via: Optional[List[str]] = None
        if chain_via_param:
            chain_via = [
                f.strip() for f in chain_via_param.split(",") if f.strip()
            ]

        logger.debug(
            "Received GET request for batch camera extrinsics for %d samples "
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
                extrinsics = dataset.resolve_extrinsics(
                    sample,
                    source_frame=source_frame,
                    target_frame=target_frame,
                    chain_via=chain_via,
                )
            except ValueError as err:
                # ValueError can occur when chain_via frames don't chain
                results[sample_id] = {"error": str(err)}
                continue

            if extrinsics is None:
                results[sample_id] = {"extrinsics": None}
            else:
                results[sample_id] = {
                    "extrinsics": utils.json.serialize(extrinsics)
                }

        return utils.json.JSONResponse({"results": results})


CameraRoutes = [
    (
        "/dataset/{dataset_id}/sample/{sample_id}/intrinsics",
        CameraIntrinsics,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/extrinsics",
        CameraExtrinsics,
    ),
    (
        "/dataset/{dataset_id}/samples/intrinsics",
        BatchCameraIntrinsics,
    ),
    (
        "/dataset/{dataset_id}/samples/extrinsics",
        BatchCameraExtrinsics,
    ),
]
