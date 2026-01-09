"""
Dataset and sample helper utilities for FiftyOne server routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.exceptions import HTTPException

import fiftyone.core.odm as foo


def get_dataset(dataset_id: str):
    """Loads a dataset by ID.

    Args:
        dataset_id: The ID of the dataset

    Raises:
        HTTPException: If the dataset is not found

    Returns:
        The dataset
    """
    try:
        return foo.load_dataset(id=dataset_id)
    except ValueError as err:
        raise HTTPException(
            status_code=404,
            detail=f"Dataset '{dataset_id}' not found",
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
