# fiftyone/server/sample.py
"""
FiftyOne Server /sample endpoint.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

import fiftyone.core.dataset as fod

from fiftyone.server.decorators import route


class Sample(HTTPEndpoint):
    @route
    async def patch(self, request: Request, data: dict) -> dict:
        """Applies a list of patches to a sample.

        The "path" attribute of the patch must refer to a field of
        embedded documents, e.g., "ground_truth.detections".

        Supported ops:
        -   "delete": deletes the document with the given "id" from the list
        -   "upsert": updates the document with the given "id" in the list,
            or adds it if it does not exist
        """
        patches = data
        dataset_name = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]

        if not isinstance(patches, list):
            raise HTTPException(
                status_code=400,
                detail="Request body must be a JSON array of patch operations",
            )

        try:
            dataset = fod.load_dataset(dataset_name)
        except ValueError:
            raise HTTPException(
                status_code=404, detail=f"Dataset '{dataset_name}' not found"
            )

        sample = dataset[sample_id]
        if sample is None:
            raise HTTPException(
                status_code=404,
                detail=f"Sample '{sample_id}' not found in dataset",
            )

        schema = dataset.get_field_schema(flat=True)

        print(dataset)
        print(sample)
        print(schema)

        return {"status": "ok", "patched_sample_id": str(sample.id)}


MutationRoutes = [("/dataset/{dataset_id}/sample/{sample_id}", Sample)]
