"""
FiftyOne torch dataset unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import unittest

import fiftyone as fo
from fiftyone.utils.torch import FiftyOneTorchDataset, GetItem


class IdentityGetItem(GetItem):
    def __init__(self, required_keys=["filepath"], **kwargs):
        self._required_keys = required_keys
        super().__init__(**kwargs)

    def __call__(self, d):
        return [d[k] for k in self.required_keys]

    @property
    def required_keys(self):
        return self._required_keys


class IntIdentityGetItem(GetItem):
    def __init__(self, required_key="foo", **kwargs):
        self._required_key = required_key
        super().__init__(**kwargs)

    def __call__(self, d):
        return d[self._required_key] * 1

    @property
    def required_keys(self):
        return [self._required_key]


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
            torch_dataset = dataset.to_torch(
                IdentityGetItem(["id", "filepath"])
            )
            self.assertEqual(
                [torch_dataset.ids[i] for i in range(len(torch_dataset))],
                dataset.values("id"),
            )

    def test_vectorize_correct(self):
        with ShortLivedDataset() as dataset:

            torch_dataset = dataset.to_torch(
                IdentityGetItem(["id", "filepath"]), vectorize=True
            )
            for cf in ["filepath", "id"]:
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

    def test_ids_correct_vectorize_no_ids(self):
        with ShortLivedDataset() as dataset:
            torch_dataset = dataset.to_torch(
                IdentityGetItem(["filepath"]), vectorize=True
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
            torch_dataset = dataset.to_torch(IdentityGetItem(["id"]))

            indices = [12, 35, 66, 21, 4, 15]

            ids = dataset.values("id")
            ids = [[ids[i]] for i in indices]

            _ids = torch_dataset.__getitems__(indices)

            self.assertEqual(
                _ids,
                ids,
                "Torch dataset getitem not equal to dataset values",
            )

    def test_skip_failures(self):
        with ShortLivedDataset() as dataset:
            for i, sample in enumerate(dataset):
                sample["foo"] = 1 if i % 2 == 0 else None
                sample.save()

            gi_foo = IntIdentityGetItem("foo")
            torch_dataset = dataset.to_torch(
                gi_foo,
                skip_failures=False,
            )

            # single get item, no skip
            for i in range(len(torch_dataset)):
                if i % 2 == 0:
                    self.assertEqual(torch_dataset[i], 1)
                else:
                    with self.assertRaises(Exception):
                        _ = torch_dataset[i]

            # batch get items, no skip
            indices = list(range(len(torch_dataset)))
            with self.assertRaises(Exception):
                _ = torch_dataset.__getitems__(indices)

            # single get item, skip
            torch_dataset = dataset.to_torch(
                gi_foo,
                skip_failures=True,
            )
            for i in range(len(torch_dataset)):
                if i % 2 == 0:
                    self.assertEqual(torch_dataset[i], 1)
                else:
                    res = torch_dataset[i]
                    self.assertTrue(isinstance(res, Exception))

            # batch get items, skip
            indices = list(range(len(torch_dataset)))
            res = torch_dataset.__getitems__(indices)
            for i in range(len(res)):
                if i % 2 == 0:
                    self.assertEqual(res[i], 1)
                else:
                    self.assertTrue(isinstance(res[i], Exception))


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
