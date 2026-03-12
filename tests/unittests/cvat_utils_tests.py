"""
Unit tests for ``fiftyone.utils.cvat`` helpers.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import unittest

import fiftyone as fo
from fiftyone.utils.cvat import _BasenameLookup


class TestBasenameLookup(unittest.TestCase):
    """Tests for :class:`_BasenameLookup`."""

    # ------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------

    def test_empty(self):
        lookup = _BasenameLookup([])
        self.assertEqual(len(lookup), 0)
        self.assertFalse(lookup)

    def test_single_file(self):
        lookup = _BasenameLookup(["/data/images/cat.jpg"])
        self.assertEqual(len(lookup), 1)
        self.assertTrue(lookup)

    # ------------------------------------------------------------------
    # .get() — unique basenames
    # ------------------------------------------------------------------

    def test_get_bare_basename(self):
        lookup = _BasenameLookup(["/data/images/cat.jpg"])
        self.assertEqual(lookup.get("cat.jpg"), "/data/images/cat.jpg")

    def test_get_with_subdir(self):
        lookup = _BasenameLookup(["/data/images/train/cat.jpg"])
        self.assertEqual(
            lookup.get("train/cat.jpg"), "/data/images/train/cat.jpg"
        )

    def test_get_missing_returns_default(self):
        lookup = _BasenameLookup(["/data/images/cat.jpg"])
        self.assertIsNone(lookup.get("dog.jpg"))
        self.assertEqual(lookup.get("dog.jpg", "fallback"), "fallback")

    # ------------------------------------------------------------------
    # .get() — disambiguation (multiple files with same basename)
    # ------------------------------------------------------------------

    def test_get_disambiguates_by_subdir(self):
        paths = [
            "/data/images/train/cat.jpg",
            "/data/images/val/cat.jpg",
        ]
        lookup = _BasenameLookup(paths)
        self.assertEqual(
            lookup.get("train/cat.jpg"), "/data/images/train/cat.jpg"
        )
        self.assertEqual(lookup.get("val/cat.jpg"), "/data/images/val/cat.jpg")

    def test_get_ambiguous_bare_basename_returns_default(self):
        paths = [
            "/data/images/train/cat.jpg",
            "/data/images/val/cat.jpg",
        ]
        lookup = _BasenameLookup(paths)
        # bare basename is ambiguous — should return default
        self.assertIsNone(lookup.get("cat.jpg"))

    def test_get_ambiguous_suffix_returns_default(self):
        paths = [
            "/data/project/images/train/cat.jpg",
            "/data/archive/images/train/cat.jpg",
        ]
        lookup = _BasenameLookup(paths)
        # "images/train/cat.jpg" matches both — ambiguous
        self.assertIsNone(lookup.get("images/train/cat.jpg"))

    # ------------------------------------------------------------------
    # __getitem__
    # ------------------------------------------------------------------

    def test_getitem_found(self):
        lookup = _BasenameLookup(["/data/images/cat.jpg"])
        self.assertEqual(lookup["cat.jpg"], "/data/images/cat.jpg")

    def test_getitem_missing_raises_keyerror(self):
        lookup = _BasenameLookup(["/data/images/cat.jpg"])
        with self.assertRaises(KeyError):
            _ = lookup["dog.jpg"]

    def test_getitem_ambiguous_raises_keyerror(self):
        paths = [
            "/data/images/train/cat.jpg",
            "/data/images/val/cat.jpg",
        ]
        lookup = _BasenameLookup(paths)
        with self.assertRaises(KeyError):
            _ = lookup["cat.jpg"]

    # ------------------------------------------------------------------
    # __contains__ (``in`` operator)
    # ------------------------------------------------------------------

    def test_contains_found(self):
        lookup = _BasenameLookup(["/data/images/cat.jpg"])
        self.assertIn("cat.jpg", lookup)

    def test_contains_missing(self):
        lookup = _BasenameLookup(["/data/images/cat.jpg"])
        self.assertNotIn("dog.jpg", lookup)

    def test_contains_ambiguous(self):
        paths = [
            "/data/images/train/cat.jpg",
            "/data/images/val/cat.jpg",
        ]
        lookup = _BasenameLookup(paths)
        self.assertNotIn("cat.jpg", lookup)
        self.assertIn("train/cat.jpg", lookup)

    # ------------------------------------------------------------------
    # __len__, __bool__
    # ------------------------------------------------------------------

    def test_len(self):
        paths = ["/data/a.jpg", "/data/b.jpg", "/data/c.jpg"]
        lookup = _BasenameLookup(paths)
        self.assertEqual(len(lookup), 3)

    def test_bool_empty(self):
        self.assertFalse(_BasenameLookup([]))

    def test_bool_nonempty(self):
        self.assertTrue(_BasenameLookup(["/data/a.jpg"]))

    # ------------------------------------------------------------------
    # Iteration, keys, values, items
    # ------------------------------------------------------------------

    def test_iter(self):
        paths = ["/data/a.jpg", "/data/b.jpg"]
        lookup = _BasenameLookup(paths)
        self.assertEqual(list(lookup), paths)

    def test_keys(self):
        paths = ["/data/a.jpg", "/data/b.jpg"]
        lookup = _BasenameLookup(paths)
        self.assertEqual(list(lookup.keys()), paths)

    def test_values(self):
        paths = ["/data/a.jpg", "/data/b.jpg"]
        lookup = _BasenameLookup(paths)
        self.assertEqual(list(lookup.values()), paths)

    def test_items(self):
        paths = ["/data/a.jpg", "/data/b.jpg"]
        lookup = _BasenameLookup(paths)
        self.assertEqual(list(lookup.items()), [(p, p) for p in paths])

    # ------------------------------------------------------------------
    # Edge cases
    # ------------------------------------------------------------------

    @unittest.skipUnless(os.sep == "\\", "backslash separator is Windows-only")
    def test_backslash_separator(self):
        """On Windows, backslash separators in queries are normalized."""
        lookup = _BasenameLookup(["/data/images/train/cat.jpg"])
        self.assertEqual(
            lookup.get("train\\cat.jpg"), "/data/images/train/cat.jpg"
        )

    def test_deeply_nested_path(self):
        path = "/data/a/b/c/d/e/f/img.jpg"
        lookup = _BasenameLookup([path])
        self.assertEqual(lookup.get("d/e/f/img.jpg"), path)
        self.assertEqual(lookup.get("img.jpg"), path)


if __name__ == "__main__":
    unittest.main()
