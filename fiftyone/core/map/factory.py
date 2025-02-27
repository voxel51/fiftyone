from enum import Enum

from .map import MapBackend
from .sequential import SequentialMapBackend


class MapBackendType(Enum):
    """Enumeration of available map_samples execution backends."""

    sequential = "sequential"

    @classmethod
    def from_string(cls, backend_str: str) -> "MapBackendType":
        """Converts a string to a MapBackendType enum, case-insensitive."""
        backend_str = backend_str.strip().lower()
        try:
            return cls(backend_str)
        except ValueError:
            raise ValueError(f"Unknown map_samples backend '{backend_str}'")

    def to_string(self) -> str:
        """Returns the string representation of the Enum value."""
        return self.value


class MapBackendFactory:
    """Factory for creating MapBackend instances based on backend type."""

    _backends = {
        MapBackendType.sequential: SequentialMapBackend,
    }

    @classmethod
    def get_backend(
        cls, backend: str | MapBackendType = MapBackendType.sequential
    ) -> MapBackend:
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

        # Ensure backend is valid
        if backend not in cls._backends:
            raise ValueError(f"Unknown map_samples backend '{backend}'")

        return cls._backends[backend]()
