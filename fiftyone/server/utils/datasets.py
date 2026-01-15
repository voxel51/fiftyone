"""
Dataset and sample helper utilities for FiftyOne server routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import Any, Dict, List
import logging
from starlette.exceptions import HTTPException

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.core.labels as fol

from fiftyone.server.utils.json.jsonpatch import apply as apply_jsonpatch
from fiftyone.server.utils.json.serialization import deserialize

logger = logging.getLogger(__name__)


def get_dataset(dataset_identifier: str):
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


def sync_to_generated_dataset(
    generated_dataset: fo.Dataset,
    generated_sample: fo.Sample,
    field_path: str,
    label_id: str,
    patch_operations: List[Dict[str, Any]],
) -> None:
    """Sync annotation changes to a generated dataset sample.

    Args:
        generated_dataset: The generated dataset
        generated_sample: The sample in the generated dataset
        field_path: Path to the field being modified (in source dataset terms)
        label_id: The ID of the label being modified
        patch_operations: JSON patch operations to apply
    """
    # Generated datasets flatten field paths to base field name
    generated_field_path = field_path.split(".")[0]

    # Check if this is a delete operation
    is_delete = (
        len(patch_operations) == 1
        and patch_operations[0].get("op") == "remove"
        and patch_operations[0].get("path") == "/"
    )

    if is_delete:
        # Delete the generated sample (each sample represents a single label)
        generated_dataset.delete_samples(str(generated_sample._id))
        logger.info("Deleted generated sample %s", generated_sample._id)
    else:
        # Apply patches to the appropriate label in the generated sample
        field_value = generated_sample.get_field(generated_field_path)

        # Determine the target for patch operations
        if isinstance(field_value, fol._HasLabelList):
            # Update list label fields by id
            list_field = field_value._LABEL_LIST_FIELD
            label_list = getattr(field_value, list_field, [])
            target = next(
                (lbl for lbl in label_list if str(lbl.id) == label_id), None
            )
            if target is None:
                logger.warning(
                    "Label %s not found in %s.%s",
                    label_id,
                    generated_field_path,
                    list_field,
                )
                return
        else:
            # Update single label fields directly
            target = field_value

        _, errors = apply_jsonpatch(
            target, patch_operations, transform_fn=deserialize
        )
        if errors:
            for error in errors:
                logger.error(error)
            raise HTTPException(status_code=400, detail=errors)

        generated_sample.save()
        logger.info(
            "Synced changes to generated sample %s", generated_sample._id
        )
