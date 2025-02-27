from abc import ABC, abstractmethod
from typing import Iterator, Any


class MapBackend(ABC):
    """Abstract base class for execution backends used in map_samples."""

    @abstractmethod
    def map_samples(
        self,
        sample_collection,
        map_fcn,
        save=None,
        num_workers=None,
        shard_method="id",
        progress=None,
    ) -> Iterator[Any]:
        """
        Applies `map_fcn` to each sample and returns an iterator over the results.

        Returns:
            Iterator[Any]: An iterator that yields processed sample results.
        """
        pass

    @abstractmethod
    def update_samples(
        self,
        sample_collection,
        map_fcn,
        save=None,
        num_workers=None,
        shard_method="id",
        progress=None,
    ):
        """
        Applies `map_fcn` to each sample.

        Returns:
            Iterator[Any]: An iterator that yields processed sample results.
        """
        pass
