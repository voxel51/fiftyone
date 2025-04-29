"""
Abstract mapping backend

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import functools
from typing import List, Optional, TypeVar

import bson

import fiftyone.core.utils as fou
import fiftyone.core.map.batcher.batch as fomb
import fiftyone.core.map.batcher.slice_batch as foms
from fiftyone.core.map.typing import SampleCollection

fov = fou.lazy_import("fiftyone.core.view")

T = TypeVar("T")


class SampleIdBatch(fomb.SampleBatch):
    """Sample batch using ids"""

    @classmethod
    @functools.cache
    def get_max_batch_size(cls):
        """Get max batch size"""
        return fou.recommend_batch_size_for_value(
            bson.ObjectId(), max_size=100000
        )

    @classmethod
    def split(
        cls,
        sample_collection: SampleCollection[T],
        num_workers: int,
        batch_size: Optional[int] = None,
    ) -> List["SampleIdBatch"]:
        num_workers = max(num_workers, 1)

        ids = sample_collection.values("id", _enforce_natural_order=False)

        # Must cap size of select(ids) stages
        max_batch_size = cls.get_max_batch_size()
        if batch_size is not None:
            batch_size = min(batch_size, max_batch_size)
        elif len(ids) > num_workers * max_batch_size:
            batch_size = max_batch_size

        return [
            cls(*ids[batch.start_idx : batch.stop_idx])
            for batch in foms.SampleSliceBatch.split(
                sample_collection, num_workers, batch_size
            )
        ]

    def __init__(self, *sample_ids: bson.ObjectId):
        self.sample_ids = sample_ids

    @property
    def total(self) -> int:
        return len(self.sample_ids)

    def create_subset(
        self, sample_collection: SampleCollection[T]
    ) -> SampleCollection[T]:
        return fov.make_optimized_select_view(
            sample_collection, self.sample_ids
        )
