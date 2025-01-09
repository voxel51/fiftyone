"""
FiftyOne repository factory.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


class SortByField(object):
    """Sort by enum for delegated operations."""

    UPDATED_AT = "updated_at"
    SCHEDULED_AT = "scheduled_at"
    QUEUED_AT = "queued_at"
    COMPLETED_AT = "completed_at"
    STARTED_AT = "started_at"
    FAILED_AT = "failed_at"
    OPERATOR = "operator"


class SortDirection(object):
    """Sort direction enum for delegated operations."""

    ASCENDING = 1
    DESCENDING = -1


class DelegatedOperationPagingParams(object):
    """Paging parameters for delegated operations."""

    def __init__(
        self,
        sort_by: SortByField = SortByField.QUEUED_AT,
        sort_direction: SortDirection = SortDirection.DESCENDING,
        skip: int = 0,
        limit: int = 10,
    ):
        self.sort_by = sort_by
        self.sort_direction = sort_direction
        self.skip = skip
        self.limit = limit
