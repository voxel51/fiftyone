"""
FiftyOne Server ``/embeddings`` route.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.fields as fof

from fiftyone.server.decorators import route
import fiftyone.server.utils as fosu


MAX_CATEGORIES = 100
DYNAMIC_GROUP_TYPES = (
    fof.StringField,
    fof.BooleanField,
    fof.IntField,
    fof.FloatField,
    fof.FrameNumberField,
    fof.ObjectIdField,
)


class DynamicGroupFieldChoices(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        """Generates a list of field choices for dynamic groups."""
        dataset_name = data["datasetName"]

        dataset = fosu.load_and_cache_dataset(dataset_name)

        dataset_schema = dataset.get_field_schema(flat=True)
        group_field = dataset.group_field

        nested_fields = set(
            k
            for k, v in dataset_schema.items()
            if isinstance(v, fof.ListField)
        )

        fields = [
            k
            for k, v in dataset_schema.items()
            if (
                isinstance(v, DYNAMIC_GROUP_TYPES)
                and not any(
                    k == "id"
                    or k == "filepath"
                    or (
                        group_field is not None
                        and (
                            k == f"{group_field}.name"
                            or k == f"{group_field}.id"
                        )
                    )
                    or k == r
                    or k.startswith(r + ".")
                    for r in nested_fields
                )
            )
        ]

        # Remove fields with no values
        counts = dataset.count(fields)
        fields = [f for f, c in zip(fields, counts) if c > 0]

        return {"fields": fields}


DynamicGroupsRoutes = [
    ("/dynamic-groups/field-choices", DynamicGroupFieldChoices),
]
