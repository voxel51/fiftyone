import unittest

import fiftyone as fo
import fiftyone.utils.map as foum
import fiftyone.core.map as fomp


class TestMapBackendFactory(unittest.TestCase):
    """Unit tests for MapBackendFactory."""

    def test_get_backend_with_enum(self):
        """Test getting backend using MapBackendType enum."""
        backend = fomp.MapBackendFactory.get_backend(
            fomp.MapBackendType.sequential
        )
        self.assertIsInstance(backend, fomp.SequentialMapBackend)

        backend = fomp.MapBackendFactory.get_backend(
            fomp.MapBackendType.process
        )
        self.assertIsInstance(backend, fomp.ProcessMapBackend)

    def test_get_backend_with_string(self):
        """Test getting backend using string representation (case-insensitive)."""
        backend = fomp.MapBackendFactory.get_backend("sequential")
        self.assertIsInstance(backend, fomp.SequentialMapBackend)

        backend = fomp.MapBackendFactory.get_backend("PROCESS")
        self.assertIsInstance(backend, fomp.ProcessMapBackend)

    def test_get_backend_default(self):
        """Test default backend is SequentialMapBackend."""
        backend = fomp.MapBackendFactory.get_backend()
        self.assertIsInstance(backend, fomp.SequentialMapBackend)

    def test_get_backend_invalid(self):
        """Test providing an invalid backend string raises ValueError."""
        with self.assertRaises(ValueError) as context:
            fomp.MapBackendFactory.get_backend("invalid_backend")

        self.assertIn("Unknown map_samples backend", str(context.exception))
