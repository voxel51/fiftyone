import unittest

import fiftyone as fo
import fiftyone.utils.map as foum
import fiftyone.core.map as fomp


class TestSequentialMapBackend(unittest.TestCase):
    """Unit test for SequentialMapBackend with a real FiftyOne dataset."""

    @classmethod
    def setUpClass(cls):
        """Set up a temporary FiftyOne dataset for testing."""
        cls.dataset = fo.Dataset(name="test_sequential_map_backend")
        cls.dataset.persistent = True

        # Add five samples with an "input" field
        for i in range(5):
            sample = fo.Sample(filepath=f"/tmp/sample_{i}.jpg")
            sample["input"] = i
            cls.dataset.add_sample(sample)

    @classmethod
    def tearDownClass(cls):
        """Cleanup: Delete the dataset after the test."""
        cls.dataset.delete()

    def setUp(self):
        self.seq_backend = fomp.SequentialMapBackend()

    def test_map_samples_sequential(self):
        """Test SequentialMapBackend with map_samples"""

        def map_fcn(sample):
            sample["field1"] = sample["input"] * 2
            return sample["field1"]

        # Run map_samples
        results = list(
            self.seq_backend.map_samples(self.dataset, map_fcn, save=True)
        )

        # Verify results
        for sample_id, output in results:
            sample = self.dataset[sample_id]
            expected_output = sample["input"] * 2

            # Ensure the function applied correctly
            self.assertEqual(output, expected_output)

            # Ensure the value was saved in the dataset
            self.assertEqual(sample["field1"], expected_output)

    def test_update_samples_sequential(self):
        """Test SequentialMapBackend with update_samples"""

        def map_fcn(sample):
            sample["field2"] = sample["input"] * 3

        # Run update_samples
        self.seq_backend.update_samples(self.dataset, map_fcn)

        dataset = fo.load_dataset("test_sequential_map_backend")

        # Verify results
        for sample in dataset.iter_samples():
            self.assertEqual(sample["field2"], sample["input"] * 3)


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


class TestProcessMapBackend(unittest.TestCase):
    """Unit test for ProcessMapBackend with a real FiftyOne dataset."""

    def setUp(self):
        self.process_backend = fomp.ProcessMapBackend()

    @classmethod
    def setUpClass(cls):
        """Set up a temporary FiftyOne dataset for testing."""
        cls.dataset = fo.Dataset(name="test_process_map_backend")
        cls.dataset.persistent = True

        # Add five samples with an "input" field
        for i in range(50):
            sample = fo.Sample(filepath=f"/tmp/sample_{i}.jpg")
            sample["input"] = i
            cls.dataset.add_sample(sample)

    @classmethod
    def tearDownClass(cls):
        """Cleanup: Delete the dataset after the test."""
        cls.dataset.delete()

    def test_map_samples_process(self):
        """Test ProcessMapBackend with map_samples"""

        def map_fcn(sample):
            sample["field1"] = sample["input"] * 2
            return sample["field1"]

        # Run map_samples
        results = list(
            self.process_backend.map_samples(self.dataset, map_fcn, save=True)
        )

        # Verify results
        for sample_id, output in results:
            sample = self.dataset[sample_id]
            expected_output = sample["input"] * 2

            # Ensure the function applied correctly
            self.assertEqual(output, expected_output)

            # Ensure the value was saved in the dataset
            self.assertEqual(sample["field1"], expected_output)

    def test_update_samples_process(self):
        """Test ProcessMapBackend with update_samples"""

        def map_fcn(sample):
            sample["field2"] = sample["input"] * 3

        # Run update_samples
        self.process_backend.update_samples(self.dataset, map_fcn)

        dataset = fo.load_dataset("test_process_map_backend")

        # Verify results
        for sample in dataset.iter_samples():
            self.assertEqual(sample["field2"], sample["input"] * 3)
