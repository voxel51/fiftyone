"""
FiftyOne Repository Factory

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from enum import Enum


class DelegatedOpPagingParams(object):
    class SortByField(Enum):
        QUEUED_AT = "queued_at"
        COMPLETED_AT = "completed_at"
        STARTED_AT = "started_at"
        FAILED_At = "failed_at"
        OPERATOR_NAME = "operator"

    class SortDirection(Enum):
        ASCENDING = 1
        DESCENDING = -1

    def __init__(
        self,
        skip: int = 0,
        limit: int = 10,
        sort_by: SortByField = SortByField.QUEUED_AT,
        sort_direction: SortDirection = SortDirection.DESCENDING,
    ):
        self.skip = skip
        self.limit = limit
        self.sort_by = sort_by
        self.sort_direction = sort_direction
