"""
Core type definitions and result containers.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Optional, Union
from pymongo.results import BulkWriteResult


class AggregatedBulkWriteResult:
    """Aggregated result from multiple bulk write operations."""

    def __init__(self):
        self.inserted_count = 0
        self.matched_count = 0
        self.modified_count = 0
        self.deleted_count = 0
        self.upserted_count = 0

    def __repr__(self):
        return (
            f"AggregatedBulkWriteResult("
            f"matched={self.matched_count}, "
            f"modified={self.modified_count}, "
            f"inserted={self.inserted_count}, "
            f"upserted={self.upserted_count}, "
            f"deleted={self.deleted_count})"
        )

    @classmethod
    def from_results(cls, results: list[BulkWriteResult]):
        agg = cls()
        for result in results:
            agg.add(result)
        return agg

    def add(
        self, result: Optional[BulkWriteResult]
    ) -> "AggregatedBulkWriteResult":
        if result is None:
            return self
        self.inserted_count += result.inserted_count
        self.matched_count += result.matched_count
        self.modified_count += result.modified_count
        self.deleted_count += result.deleted_count
        self.upserted_count += result.upserted_count
        return self


class EditLabelTagsResult:
    """Result of label tag edit operations."""

    def __init__(
        self,
        *,
        ids: Optional[list[str]] = None,
        label_ids: Optional[list[str]] = None,
        bulk_write_result: Optional[
            Union[BulkWriteResult, AggregatedBulkWriteResult]
        ] = None,
    ):
        self.ids = ids
        self.label_ids = label_ids
        self.bulk_write_result = bulk_write_result

    def __iter__(self):
        return iter((self.ids, self.label_ids))
