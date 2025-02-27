from enum import Enum

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
    """Factory for creating MapBackend instances based on a backend name."""

    _backends = {
        "sequential": SequentialMapBackend,
    }

    @classmethod
    def get_backend(cls, backend_name="sequential"):
        """Returns an instance of the requested backend."""
        backend_class = cls._backends.get(backend_name.lower())
        if backend_class is None:
            raise ValueError(f"Unknown map_samples backend '{backend_name}'")
        return backend_class()
