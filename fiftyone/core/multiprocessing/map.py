from abc import ABC, abstractmethod


class MapBackend(ABC):
    """Abstract base class for execution backends used in map_samples."""

    @abstractmethod
    def map_samples(
        self,
        sample_collection,
        map_fcn,
        reduce_fcn=None,
        save=None,
        num_workers=None,
        shard_size=None,
        shard_method="id",
        progress=None,
    ):
        """Executes a map function over samples."""
        pass
