from typing import Iterator, Any, Optional

from .map import MapBackend


class SequentialMapBackend(MapBackend):
    """Executes map_samples sequentially using iter_samples."""

    def map_samples(
        self,
        sample_collection,
        map_fcn,
        save: Optional[bool] = None,
        num_workers: Optional[int] = None,
        shard_method: str = "id",
        progress: Optional[bool] = None,
        queue_batch_size: int = 1,
    ) -> Iterator[Any]:
        for sample in sample_collection.iter_samples(
            progress=progress, autosave=save
        ):
            result = map_fcn(sample)
            yield sample.id, result

    def update_samples(
        self,
        sample_collection,
        map_fcn,
        num_workers: Optional[int] = None,
        shard_method: str = "id",
        progress: Optional[bool] = None,
    ):
        for sample in sample_collection.iter_samples(
            progress=progress, autosave=True
        ):
            map_fcn(sample)
