from .process import ProcessMapBackend
from .sequential import SequentialMapBackend
from .thread import ThreadMapBackend


class MapBackendFactory:
    """Factory for creating MapBackend instances based on a backend name."""

    _backends = {
        "threading": ThreadMapBackend,
        "multiprocessing": ProcessMapBackend,
        "sequential": SequentialMapBackend,
    }

    @classmethod
    def get_backend(cls, backend_name):
        """Returns an instance of the requested backend."""
        if backend_name is None:
            backend_name = "multiprocessing"
        backend_class = cls._backends.get(backend_name.lower())
        if backend_class is None:
            raise ValueError(f"Unknown map_samples backend '{backend_name}'")
        return backend_class()
