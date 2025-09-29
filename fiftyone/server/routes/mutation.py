"""
FiftyOne Server mutation endpoints.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Any, List

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import Response

import fiftyone.core.dataset as fod

from fiftyone.server.decorators import route


class FieldType(str, Enum):
    LABEL = "label"
    DETECTIONS = "detections"


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


class Sample(HTTPEndpoint):
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

        schema = dataset.get_field_schema(flat=True)

        print(schema)
        print(dataset)
        print(sample)
        print(patches)

        return {"status": "ok", "patched_sample_id": str(sample.id)}


MutationRoutes = [("/dataset/{dataset_id}/sample/{sample_id}", Sample)]
