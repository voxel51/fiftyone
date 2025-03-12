"""
Abstract mapping backend

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Dict, List, Optional, Type, TypeVar, Union


import fiftyone.core.map.batcher.batch as fomb
import fiftyone.core.map.batcher.id_batch as fomi
import fiftyone.core.map.batcher.slice_batch as foms
from fiftyone.core.map.typing import SampleCollection

T = TypeVar("T")


class SampleBatcher:
    """Manage mapper implementations"""

    __BATCH_CLASSES: Dict[str, Type[fomb.SampleBatch]] = {
        # Adding built-in batch classes by default
        "id": fomi.SampleIdBatch,
        "slice": foms.SampleSliceBatch,
    }

    __DEFAULT_KEY = "id"

    @classmethod
    def available(cls) -> List[str]:
        """Get available batch class keys"""
        return [k for k, _ in cls.__BATCH_CLASSES.items()]

    @classmethod
    def default(cls) -> str:
        """Get default batch class key"""
        # Using method to get default to allow for programmatic way to
        # determine default.
        return cls.__DEFAULT_KEY

    @classmethod
    def get(cls, key: str) -> Union[Type[fomb.SampleBatch], None]:
        """Get batch class"""
        return cls.__BATCH_CLASSES.get(key)

    @classmethod
    def split(
        cls,
        key: Optional[str],
        sample_collection: SampleCollection[T],
        workers: Optional[int],
        batch_size: Optional[int] = None,
    ) -> List[fomb.SampleBatch]:
        """Get a mapper instance"""

        if key is None:
            key = cls.default()

        if key not in cls.__BATCH_CLASSES:
            raise ValueError(
                f"Unable to split into batches. Unknown key: '{key}'"
            )

        return cls.__BATCH_CLASSES[key].split(
            sample_collection, workers, batch_size
        )
