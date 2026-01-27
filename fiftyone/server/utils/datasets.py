"""
Dataset and sample helper utilities for FiftyOne server routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Any, Union
import logging
from starlette.exceptions import HTTPException

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou

from fiftyone.server.utils.json.jsonpatch import apply as apply_jsonpatch
from fiftyone.server.utils.json.serialization import deserialize

logger = logging.getLogger(__name__)


async def get_dataset(dataset_identifier: str) -> fo.Dataset:
    """Loads a dataset by ID, falling back to name if not found.

    Args:
        dataset_identifier: The ID or name of the dataset

    Raises:
        HTTPException: If the dataset is not found

    Returns:
        The dataset
    """

    def run():
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

    return await fou.run_sync_task(run)


async def get_sample_from_dataset(dataset, sample_id: str):
    """Retrieves a sample from a dataset.

    Args:
        dataset: The dataset
        sample_id: The ID of the sample

    Raises:
        HTTPException: If the sample is not found

    Returns:
        The sample
    """

    def run():
        try:
            return dataset[sample_id]
        except KeyError as err:
            raise HTTPException(
                status_code=404,
                detail=f"Sample '{sample_id}' not found in dataset "
                f"'{dataset.name}'",
            ) from err

    return await fou.run_sync_task(run)


async def sync_to_generated_dataset(
    generated_dataset_name: str,
    generated_sample_id: str,
    field_path: str,
    label_id: str,
    patch_operations: list[dict[str, Any]],
    *,
    delete: bool = False,
) -> Union[fo.Sample, None]:
    """Sync annotation changes to a generated dataset sample.

    Resolves the generated dataset and sample, then applies the changes.

    Args:
        generated_dataset_name: Name of the generated dataset
        generated_sample_id: ID of the sample in the generated dataset
        field_path: Path to the field being modified (in source dataset terms)
        label_id: The ID of the label being modified
        patch_operations: List of JSON patch operations
        delete: Whether this is a delete operation (pre-computed by caller)

    Returns:
        The updated generated sample, or None if deleted
    """
    generated_dataset = await get_dataset(generated_dataset_name)
    generated_sample = await get_sample_from_dataset(
        generated_dataset, generated_sample_id
    )

    def run():
        # Generated datasets flatten field paths to base field name
        generated_field_path = field_path.split(".")[0]

        if delete:
            # Delete the generated sample when deleting the src label field
            generated_dataset.delete_samples(str(generated_sample._id))
            logger.info("Deleted generated sample %s", generated_sample._id)
            return None

        field_value = generated_sample.get_field(generated_field_path)

        if isinstance(field_value, fol._HasLabelList):
            # Must locate the specific label within lists because changes to
            # EvaluationPatches samples may still include list label fields
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
                return generated_sample
        else:
            # Update single label fields directly
            target = field_value

        # Apply patches
        _, errors = apply_jsonpatch(
            target, patch_operations, transform_fn=deserialize
        )
        if errors:
            logger.error(
                "Failed to apply patches, generated sample not saved: %s",
                errors,
            )
            return generated_sample

        # Applying changes to a sample field modifies the sample in place,
        # so we just need to save the sample to persist the changes
        generated_sample.save()
        logger.info(
            "Synced changes to generated sample %s", generated_sample._id
        )

        return generated_sample

    return await fou.run_sync_task(run)
