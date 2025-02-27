from typing import Iterator, Any

from .map import MapBackend


class SequentialMapBackend(MapBackend):
    """Executes map_samples sequentially using iter_samples."""

    def map_samples(
        self,
        sample_collection,
        map_fcn,
        save=None,
        num_workers=None,
        shard_method="id",
        progress=None,
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
        save=None,
        num_workers=None,
        shard_method="id",
        progress=None,
    ):
        for sample in sample_collection.iter_samples(
            progress=progress, autosave=save
        ):
            map_fcn(sample)
