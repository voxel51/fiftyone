"""
FiftyOne Server camera endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from typing import Any, Dict, List, Optional

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

import fiftyone.core.odm.utils as fou
from fiftyone.server import utils

logger = logging.getLogger(__name__)


def _get_dataset(dataset_id: str):
    """Loads a dataset by ID.

    Args:
        dataset_id: The ID of the dataset

    Raises:
        HTTPException: If the dataset is not found

    Returns:
        The dataset
    """
    try:
        return fou.load_dataset(id=dataset_id)
    except ValueError as err:
        raise HTTPException(
            status_code=404,
            detail=f"Dataset '{dataset_id}' not found",
        ) from err


def _get_sample(dataset, sample_id: str):
    """Retrieves a sample from a dataset.

    Args:
        dataset: The dataset
        sample_id: The ID of the sample

    Raises:
        HTTPException: If the sample is not found

    Returns:
        The sample
    """
    try:
        return dataset[sample_id]
    except KeyError as err:
        raise HTTPException(
            status_code=404,
            detail=f"Sample '{sample_id}' not found in dataset "
            f"'{dataset.name}'",
        ) from err


class CameraIntrinsics(HTTPEndpoint):
    """Camera intrinsics endpoint."""

    async def get(self, request: Request) -> Dict[str, Any]:
        """Retrieves camera intrinsics for a sample.

        Args:
            request: Starlette request with dataset_id and sample_id in path
                params

        Returns:
            A dictionary containing the intrinsics data, or null if not found
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]

        logger.debug(
            "Received GET request for camera intrinsics for sample %s "
            "in dataset %s",
            sample_id,
            dataset_id,
        )

        dataset = _get_dataset(dataset_id)
        sample = _get_sample(dataset, sample_id)

        intrinsics = dataset.resolve_intrinsics(sample)

        if intrinsics is None:
            return utils.json.JSONResponse({"intrinsics": None})

        return utils.json.JSONResponse(
            {"intrinsics": utils.json.serialize(intrinsics)}
        )


class CameraExtrinsics(HTTPEndpoint):
    """Camera extrinsics endpoint."""

    async def get(self, request: Request) -> Dict[str, Any]:
        """Retrieves camera/sensor extrinsics for a sample.

        Args:
            request: Starlette request with dataset_id and sample_id in path
                params, and optional source_frame, target_frame, chain_via
                query params

        Returns:
            A dictionary containing the extrinsics data, or null if not found
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

        dataset = _get_dataset(dataset_id)
        sample = _get_sample(dataset, sample_id)

        extrinsics = dataset.resolve_extrinsics(
            sample,
            source_frame=source_frame,
            target_frame=target_frame,
            chain_via=chain_via,
        )

        if extrinsics is None:
            return utils.json.JSONResponse({"extrinsics": None})

        return utils.json.JSONResponse(
            {"extrinsics": utils.json.serialize(extrinsics)}
        )


CameraRoutes = [
    (
        "/dataset/{dataset_id}/sample/{sample_id}/intrinsics",
        CameraIntrinsics,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/extrinsics",
        CameraExtrinsics,
    ),
]
