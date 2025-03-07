import itertools
import numpy as np
import fiftyone.core.utils as fou
from abc import ABC, abstractmethod


class Batcher(ABC):
    """
    Abstract base class for batch initialization strategies.

    This class defines the interface for creating batches from a sample collection
    for parallel processing.
    """

    def initialize_batches(self, sample_collection, num_workers):
        """
        Create processing batches for parallel execution.

        Args:
            sample_collection: A FiftyOne sample collection
            num_workers (int): Number of worker processes to use.

        Returns:
            tuple: (batches, num_workers, n)
                - batches: List of batch tuples (shard_idx, num_shards, slice_or_ids)
                - num_workers: Actual number of workers to use
                - n: Total number of samples
        """
        # Get total count and calculate shards
        n = self._get_sample_count(sample_collection)

        # Split collection into shards
        edges = [int(round(b)) for b in np.linspace(0, n, num_workers + 1)]

        # Create batch slices based on the sharding method
        slices = self._create_slices(sample_collection, edges, n)

        num_shards = len(slices)

        # Create the final batch structure
        batches = list(
            zip(
                range(num_shards),
                itertools.repeat(num_shards),
                slices,
            )
        )

        # Adjust workers if needed
        num_workers = min(num_workers, num_shards)

        return batches, num_workers, n

    @abstractmethod
    def _get_sample_count(self, sample_collection):
        """
        Get the total number of samples based on the batching strategy.

        Args:
            sample_collection: A FiftyOne sample collection

        Returns:
            int: The total number of samples
        """
        pass

    @abstractmethod
    def _create_slices(self, sample_collection, edges, n):
        """
        Create slices based on the batching strategy.

        Args:
            sample_collection: A FiftyOne sample collection
            edges (list): List of shard boundaries
            n (int): Total number of samples

        Returns:
            list: List of slices (either index tuples or ID lists)
        """
        pass


class SliceBatcher(Batcher):
    """
    Batcher implementation that creates batches using slice indices.
    """

    def _get_sample_count(self, sample_collection):
        """
        Get the total number of samples based on collection length.

        Args:
            sample_collection: A FiftyOne sample collection

        Returns:
            int: The total number of samples
        """
        return len(sample_collection)

    def _create_slices(self, sample_collection, edges, n):
        """
        Create slices using index ranges.

        Args:
            sample_collection: A FiftyOne sample collection
            edges (list): List of shard boundaries
            n (int): Total number of samples

        Returns:
            list: List of (start, end) index tuples
        """
        return list(zip(edges[:-1], edges[1:]))


class IDBatcher(Batcher):
    """
    Batcher implementation that creates batches using sample IDs.
    """

    def _get_sample_count(self, sample_collection):
        """
        Get the total number of samples by counting IDs.

        Args:
            sample_collection: A FiftyOne sample collection

        Returns:
            int: The total number of samples
        """
        self.ids = sample_collection.values("id")
        return len(self.ids)

    def _create_slices(self, sample_collection, edges, n):
        """
        Create slices using sample IDs.

        Args:
            sample_collection: A FiftyOne sample collection
            edges (list): List of shard boundaries
            n (int): Total number of samples

        Returns:
            list: List of ID sublists
        """
        # IDs are already cached from _get_sample_count
        return [self.ids[i:j] for i, j in zip(edges[:-1], edges[1:])]


def initialize_batches(sample_collection, shard_method="id", num_workers=None):
    """
    High-level function to get batches from a sample collection.

    This function handles the selection of the appropriate batcher and
    initializes the batches with the provided parameters.

    Args:
        sample_collection: A FiftyOne sample collection
        shard_method (str): Method to shard the collection, either "id" or "slice"
        num_workers (int, optional): Number of worker processes to use.
            If None, a recommended number is determined automatically.

    Returns:
        tuple: (batches, num_workers, n)
            - batches: List of batch tuples (shard_idx, num_shards, slice_or_ids)
            - num_workers: Actual number of workers to use
            - n: Total number of samples
    """
    # Get the appropriate batcher
    if shard_method == "slice":
        batcher = SliceBatcher()
    elif shard_method == "id":
        batcher = IDBatcher()
    else:
        raise ValueError(f"Unsupported shard method: {shard_method}")

    # Determine number of workers if not specified
    if num_workers is None:
        num_workers = fou.recommend_process_pool_workers()

    # Initialize batches
    return batcher.initialize_batches(sample_collection, num_workers)
