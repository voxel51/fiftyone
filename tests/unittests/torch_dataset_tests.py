"""
FiftyOne torch dataset unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import unittest

import fiftyone as fo
from fiftyone.utils.torch import FiftyOneTorchDataset


def id_get_item(sample):
    return sample["id"]


class ShortLivedDataset:
    def __init__(self, num_samples=10, **kwargs):
        super().__init__()
        self._dataset = fo.Dataset(**kwargs)

        self._dataset.add_samples(
            [fo.Sample(filepath=f"image{i}.png") for i in range(num_samples)]
        )

        self._dataset.persistent = True

    def __enter__(self):
        return self._dataset

    def __exit__(self, *args):
        self._dataset.persistent = False
        self._dataset.delete()


class FiftyOneTorchDatasetTests(unittest.TestCase):
    def test_ids_correct(self):
        with ShortLivedDataset() as dataset:
            torch_dataset = dataset.to_torch(id_get_item)
            self.assertEqual(
                [torch_dataset.ids[i] for i in range(len(torch_dataset))],
                dataset.values("id"),
            )

    def test_cached_fields_correct(self):
        with ShortLivedDataset() as dataset:
            cfs = ["filepath", "metadata"]

            torch_dataset = dataset.to_torch(
                id_get_item, cache_field_names=cfs
            )
            for cf in cfs:
                self.assertTrue(
                    cf in torch_dataset.cached_fields,
                    f"Cached field {cf} not found in cached fields",
                )

                self.assertEqual(
                    [
                        torch_dataset.cached_fields[cf][i]
                        for i in range(len(torch_dataset))
                    ],
                    dataset.values(cf),
                    f"Cached field {cf} not equal to dataset values",
                )

    def test_ids_correct_cached_fields(self):
        with ShortLivedDataset() as dataset:
            torch_dataset = dataset.to_torch(
                id_get_item, cache_field_names=["filepath", "id"]
            )
            self.assertTrue(
                "id" in torch_dataset.cached_fields,
                "ID field not found in cached fields",
            )
            self.assertEqual(
                [torch_dataset.ids[i] for i in range(len(torch_dataset))],
                dataset.values("id"),
            )
            self.assertEqual(
                [
                    torch_dataset.cached_fields["id"][i]
                    for i in range(len(torch_dataset))
                ],
                dataset.values("id"),
                "ID field not equal to dataset values",
            )

    def test_ids_correct_cached_fields_no_ids(self):
        with ShortLivedDataset() as dataset:
            torch_dataset = dataset.to_torch(
                id_get_item, cache_field_names=["filepath"]
            )
            self.assertEqual(
                [torch_dataset.ids[i] for i in range(len(torch_dataset))],
                dataset.values("id"),
            )

            self.assertTrue(
                "id" not in torch_dataset.cached_fields,
                "ID field found in cached fields",
            )

    def test_getitems(self):
        with ShortLivedDataset(100) as dataset:
            torch_dataset = dataset.to_torch(id_get_item)

            indices = [12, 35, 66, 21, 4, 15]

            ids = dataset.values("id")
            ids = [ids[i] for i in indices]

            _ids = torch_dataset.__getitems__(indices)

            self.assertEqual(
                _ids,
                ids,
                "Torch dataset getitem not equal to dataset values",
            )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
