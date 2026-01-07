"""
Policy layer for controlling which collections can be watched.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod
from fnmatch import fnmatch
from typing import List, Optional


class PolicyViolationError(Exception):
    """Raised when an operation violates the collection watch policy."""

    pass


class CollectionWatchPolicy(ABC):
    """Abstract base class for collection watch policies.

    Implement this class to define custom policies for controlling which
    MongoDB collections can be watched by the notification service.
    """

    @abstractmethod
    def is_collection_allowed(self, collection_name: str) -> bool:
        """Check if a collection is allowed to be watched.

        Args:
            collection_name: The name of the collection to check.

        Returns:
            True if the collection is allowed to be watched, False otherwise.
        """
        pass


class DenylistWatchPolicy(CollectionWatchPolicy):
    """Policy that denies watching collections matching specified patterns.

    Uses glob-style pattern matching (via fnmatch) to determine which
    collections are denied. A collection is allowed if it does not match
    any of the denied patterns.

    Example patterns:
        - "internal.*" - Blocks collections starting with "internal."
        - "system.*" - Blocks collections starting with "system."
        - "_*" - Blocks collections starting with underscore
        - "*.backup" - Blocks collections ending with ".backup"

    Example:
        policy = DenylistWatchPolicy(["internal.*", "system.*"])
        policy.is_collection_allowed("samples.xyz")  # True
        policy.is_collection_allowed("internal.secrets")  # False
    """

    def __init__(self, denied_patterns: Optional[List[str]] = None):
        """Initialize the denylist policy.

        Args:
            denied_patterns: Optional list of glob patterns for denied
                collections. Defaults to empty list (all collections allowed).
        """
        self._denied_patterns: List[str] = (
            list(denied_patterns) if denied_patterns else []
        )

    @property
    def denied_patterns(self) -> List[str]:
        """Get a copy of the current denied patterns."""
        return list(self._denied_patterns)

    def add_pattern(self, pattern: str) -> None:
        """Add a glob pattern to the denylist.

        Args:
            pattern: The glob pattern to add.
        """
        if pattern not in self._denied_patterns:
            self._denied_patterns.append(pattern)

    def remove_pattern(self, pattern: str) -> bool:
        """Remove a pattern from the denylist.

        Args:
            pattern: The glob pattern to remove.

        Returns:
            True if the pattern was removed, False if it wasn't in the list.
        """
        if pattern in self._denied_patterns:
            self._denied_patterns.remove(pattern)
            return True
        return False

    def clear_patterns(self) -> None:
        """Remove all patterns from the denylist."""
        self._denied_patterns.clear()

    def is_collection_allowed(self, collection_name: str) -> bool:
        """Check if a collection is allowed to be watched.

        A collection is allowed if it does not match any denied pattern.

        Args:
            collection_name: The name of the collection to check.

        Returns:
            True if the collection is allowed, False if it matches a
            denied pattern.
        """
        return not any(
            fnmatch(collection_name, pattern)
            for pattern in self._denied_patterns
        )
