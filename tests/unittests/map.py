import unittest
import fiftyone as fo
from fiftyone.core.map import SequentialMapBackend


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

    def test_map_samples_sequential(self):
        """Test SequentialMapBackend with map_samples"""

        def map_fcn(sample):
            sample["field1"] = sample["input"] * 2
            return sample["field1"]

        # Run map_samples
        results = list(self.dataset.map_samples(map_fcn, save=True))

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
        self.dataset.update_samples(map_fcn, save=True)

        dataset = fo.load_dataset("test_sequential_map_backend")

        # Verify results
        for sample in dataset.iter_samples():
            self.assertEqual(sample["field2"], sample["input"] * 3)
