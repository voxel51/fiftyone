"""
Dataset and sample helper utilities for FiftyOne server routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from typing import TYPE_CHECKING
import logging
from starlette.exceptions import HTTPException

import fiftyone.core.odm as foo

if TYPE_CHECKING:
    import fiftyone as fo

logger = logging.getLogger(__name__)


def get_dataset(dataset_identifier: str) -> fo.Dataset:
    """Loads a dataset by ID, falling back to name if not found.

    Args:
        dataset_identifier: The ID or name of the dataset

    Raises:
        HTTPException: If the dataset is not found

    Returns:
        The dataset
    """
    # Try loading by ID first
    try:
        return foo.load_dataset(id=dataset_identifier)
    except ValueError:
        pass

    # Fall back to loading by name (generated datasets)
    try:
        return foo.load_dataset(name=dataset_identifier)
    except ValueError as err:
        logger.debug(
            "Dataset not found with name or id `%s`", dataset_identifier
        )
        raise HTTPException(
            status_code=404,
            detail=f"Dataset '{dataset_identifier}' not found",
        ) from err


def get_sample_from_dataset(dataset, sample_id: str):
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
