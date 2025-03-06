"""
Factory for mapping backends

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from enum import Enum
from typing import Union

import fiftyone.core.map.map as fomm
import fiftyone.core.map.sequential as foms
import fiftyone.core.map.threading as fomt


class MapBackendType(Enum):
    """Enumeration of available map_samples execution backends."""

    sequential = "sequential"
    threading = "threading"

    @classmethod
    def from_string(cls, backend_str: str) -> "MapBackendType":
        """Converts a string to a MapBackendType enum, case-insensitive."""
        backend_str = backend_str.strip().lower()
        try:
            return cls(backend_str)
        except ValueError as err:
            raise ValueError(
                f"Unknown map_samples backend '{backend_str}'"
            ) from err

    def to_string(self) -> str:
        """Returns the string representation of the Enum value."""
        return self.value


class MapBackendFactory:
    """Factory for creating MapBackend instances based on backend type."""

    _backends = {
        MapBackendType.sequential: foms.SequentialMapBackend,
        MapBackendType.threading: fomt.ThreadingMapBackend,
    }

    @classmethod
    def get_backend(
        cls, backend: Union[str, MapBackendType] = MapBackendType.sequential
    ) -> fomm.MapBackend:
        """
        Returns an instance of the requested backend.

        Args:
            backend (MapBackendType.sequential): Backend execution strategy.
                - If a string, it is converted to `MapBackendType`.
                - If not provided, defaults to `sequential`.

        Returns:
            MapBackend: An instance of the selected backend.

        Raises:
            ValueError: If the backend is unknown.
        """
        # Convert string backend to Enum
        if isinstance(backend, str):
            backend = MapBackendType.from_string(backend)

        return cls._backends[backend]()
