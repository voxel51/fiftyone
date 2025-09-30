"""
FiftyOne Server mutation endpoints.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Any, List

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import Response

import fiftyone.core.dataset as fod
from fiftyone.core.sample import Sample
from fiftyone.server.decorators import route

logger = logging.getLogger(__name__)


class FieldType(str, Enum):
    DETECTIONS = "detections"
    CLASSIFICATIONS = "classifications"
    CLASSIFICATION = "classification"
    FIELD = "field"


class OpType(str, Enum):
    DELETE = "delete"
    UPSERT = "upsert"


@dataclass
class Patch:
    op: OpType
    path: str
    type: FieldType
    value: Dict[str, Any]

    def __post_init__(self):
        if not isinstance(self.op, OpType):
            self.op = OpType(self.op)

        if not isinstance(self.type, FieldType):
            self.type = FieldType(self.type)


class SampleMutation(HTTPEndpoint):
    _LABEL_LIST_ATTR_MAP = {
        FieldType.DETECTIONS: "detections",
        FieldType.CLASSIFICATIONS: "classifications",
    }

    @route
    async def patch(self, request: Request, data: list) -> dict:
        """Applies a list of patches to a sample.

        The "path" attribute of the patch must refer to a field of
        embedded documents, e.g., "ground_truth.detections".

        Supported ops:
        -   "delete": deletes the document with the given "id" from the list
        -   "upsert": updates the document with the given "id" in the list,
            or adds it if it does not exist
        """
        if not isinstance(data, list):
            return Response(
                status_code=400,
                content="Request body must be a JSON array of patch operations",
            )

        try:
            patches: List[Patch] = [Patch(**p) for p in data]
        except Exception as e:
            return Response(
                status_code=400,
                content=f"Invalid patch format: {e}",
            )

        dataset_name = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]

        logger.info(
            "Received patch request for sample %s in dataset %s",
            sample_id,
            dataset_name,
        )

        try:
            dataset = fod.load_dataset(dataset_name)
        except ValueError:
            return Response(
                status_code=404,
                content=f"Dataset '{dataset_name}' not found",
            )

        sample = dataset[sample_id]
        if sample is None:
            return Response(
                status_code=404,
                content=f"Sample '{sample_id}' not found in dataset",
            )

        errors = []
        for patch in patches:
            try:
                if patch.op == OpType.DELETE:
                    self._apply_delete(sample, patch)
                elif patch.op == OpType.UPSERT:
                    self._apply_upsert(sample, patch)
                else:
                    raise ValueError(f"Unsupported op '{patch.op}'")
            except Exception as e:
                logger.error("Error applying patch %s: %s", patch, e)
                errors.append(str(e))

        return {
            "status": "ok",
            "patched_sample_id": str(sample.id),
            "errors": errors,
        }

    def _apply_delete(self, sample: Sample, patch: Patch):
        logger.info("Applying delete patch: %s to sample %s", patch, sample.id)

        if patch.type in self._LABEL_LIST_ATTR_MAP:
            self._delete_label_from_list(sample, patch)
        else:
            if patch.type == FieldType.FIELD:
                setattr(sample, patch.path, None)
            else:
                sample.clear_field(patch.path)
            sample.save()

    def _delete_label_from_list(self, sample: Sample, patch: Patch):
        """Generic helper to delete a label from a list within a label field."""
        if "id" not in patch.value:
            raise ValueError(f"Deleting a {patch.type} requires an ID.")

        label_list = sample.get_field(patch.path)

        label_list = [
            label for label in label_list if label.id != patch.value["id"]
        ]

        setattr(
            sample,
            patch.path,
            label_list,
        )
        sample.save()

    def _apply_upsert(self, sample: Sample, patch: Patch):
        logger.info("Applying upsert patch: %s to sample %s", patch, sample.id)
        # TODO
        sample.save()


MutationRoutes = [("/dataset/{dataset_id}/sample/{sample_id}", SampleMutation)]
