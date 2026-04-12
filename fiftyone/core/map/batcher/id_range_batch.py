"""
ID range batching backend.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import List, Optional, TypeVar

from bson import ObjectId

import fiftyone.core.map.batcher.batch as fomb
import fiftyone.core.odm as foo
from fiftyone.core.odm.database import _make_id_range_filter
from fiftyone.core.map.typing import SampleCollection

T = TypeVar("T")


class SampleIdRangeBatch(fomb.SampleBatch):
    """Sample batch using _id range boundaries.

    Partitions a collection into contiguous _id ranges using MongoDB's
    ``$bucketAuto`` for even distribution. Each batch is defined by a
    ``[lo, hi)`` range on the ``_id`` index, avoiding the need to
    materialize all sample IDs.
    """

    @classmethod
    def split(
        cls,
        sample_collection: SampleCollection[T],
        num_workers: int,
        batch_size: Optional[int] = None,
    ) -> List["SampleIdRangeBatch"]:
        num_workers = max(num_workers, 1)

        n = len(sample_collection)
        if n == 0:
            return []

        if batch_size is not None:
            if batch_size <= 0:
                raise ValueError(
                    f"batch_size must be positive; got {batch_size}"
                )
            num_batches = max(1, -(-n // batch_size))  # ceil division
        else:
            num_batches = num_workers

        if num_batches <= 1:
            return [cls(None, None, n)]

        coll_name = sample_collection._dataset._sample_collection_name
        collection = foo.get_db_conn()[coll_name]
        boundaries = foo.get_id_boundaries(collection, num_batches)

        if not boundaries:
            return [cls(None, None, n)]

        all_bounds = [None] + boundaries + [None]
        num_partitions = len(all_bounds) - 1
        samples_per = n // num_partitions
        remainder = n % num_partitions

        batches = []
        for i in range(num_partitions):
            est = samples_per + (1 if i < remainder else 0)
            batches.append(cls(all_bounds[i], all_bounds[i + 1], est))

        return batches

    def __init__(
        self,
        lo: Optional[ObjectId],
        hi: Optional[ObjectId],
        estimated_total: int,
    ):
        self.lo = lo
        self.hi = hi
        self._estimated_total = estimated_total

    @property
    def total(self) -> int:
        return self._estimated_total

    def create_subset(
        self, sample_collection: SampleCollection[T]
    ) -> SampleCollection[T]:
        match = _make_id_range_filter(self.lo, self.hi)
        if match is None:
            return sample_collection

        view = sample_collection.view()
        view._prefix = [match]

        # Only hint _id when the view has no other $match stages that
        # might benefit from a different index
        pipeline = view._pipeline()
        has_other_match = any("$match" in stage for stage in pipeline)
        if not has_other_match:
            view._hint = {"_id": 1}

        return view
