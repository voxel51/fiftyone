import unittest

import fiftyone as fo
import fiftyone.utils.map as foum
import fiftyone.core.map as fomp


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

        cls.empty_dataset = fo.Dataset(name="empty_dataset_process_backend")

    @classmethod
    def tearDownClass(cls):
        """Cleanup: Delete the dataset after the test."""
        cls.dataset.delete()
        cls.empty_dataset.delete()

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

    def test_empty_dataset(self):
        """Test ProcessMapBackend with an empty dataset."""

        def map_fcn(sample):
            sample["field1"] = sample["input"] * 2
            return sample["field1"]

        with self.assertRaises(StopIteration):
            self.process_backend.map_samples(self.empty_dataset, map_fcn)
