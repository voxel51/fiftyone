"""
Identity-based grid navigation tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest.mock import patch

from bson import ObjectId

import fiftyone as fo
import fiftyone.server.selection as foss
import fiftyone.server.selection_navigation as fosn


class GridNavigationTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [
                fo.Sample(filepath="/tmp/reveal-%d.jpg" % i, score=i // 3)
                for i in range(65)
            ]
        )
        self.ids = self.dataset.values("id")

    def tearDown(self):
        self.dataset.delete()

    def navigate(self, sample_id, **kwargs):
        return fosn.sample_neighborhood(
            self.dataset, {"sampleId": sample_id, **kwargs}
        )[1]

    def test_seek_never_looks_up_rank_and_preserves_ties(self):
        request = {
            "view": self.dataset.sort_by(
                [("score", 1), ("id", 1)], create_index=False
            )._serialize()
        }
        with patch.object(foss, "sample_position", side_effect=AssertionError):
            result = self.navigate(self.ids[30], **request)
            self.assertEqual(result["kind"], "seek")
            self.assertEqual(result["ids"], self.ids[30:50])
            before = self.navigate(
                **request,
                **{
                    "sample_id": result["previous"]["sampleId"],
                    "direction": result["previous"]["direction"],
                }
            )
            self.assertEqual(before["ids"], self.ids[10:30])
            after = self.navigate(
                result["next"]["sampleId"], direction="after", **request
            )
            self.assertEqual(after["ids"], self.ids[50:])
            self.assertIsNone(after["next"])

    def test_descending_sort_and_filtered_scope(self):
        request = {
            "view": self.dataset.match(fo.ViewField("score") >= 8)
            .sort_by([("score", -1), ("id", 1)], create_index=False)
            ._serialize(),
        }
        view, _, _ = foss._scoped_view(self.dataset, request)
        ids = view.values("id")
        result = self.navigate(ids[15], **request)
        self.assertEqual(result["ids"], ids[15:35])
        missing = self.navigate(self.ids[0], **request)
        self.assertEqual(missing, {"kind": "missing"})

    def test_cursor_handles_first_last_and_short_previous_page(self):
        result = self.navigate(self.ids[7], sortBy="id", direction="before")
        self.assertEqual(result["ids"], self.ids[:7])
        self.assertIsNone(result["previous"])
        result = self.navigate(self.ids[0], sortBy="id", direction="before")
        self.assertEqual(result["ids"], [])
        self.assertIsNone(result["next"])
        result = self.navigate(self.ids[-1], sortBy="id")
        self.assertEqual(result["ids"], self.ids[-1:])
        self.assertIsNone(result["next"])

    def test_unsorted_order_is_preserved_by_fallback(self):
        self.assertEqual(
            self.navigate(self.ids[44]), {"kind": "offset", "index": 44}
        )

    def test_field_sort_without_id_tiebreaker_keeps_its_existing_order(self):
        request = {"sortBy": "score"}
        view, _, _ = foss._scoped_view(self.dataset, request)
        ids = view.values("id")
        self.assertEqual(
            self.navigate(ids[30], **request),
            {"kind": "offset", "index": 30},
        )

    def test_limit_after_sort_cannot_be_ignored(self):
        view = self.dataset.sort_by("id").limit(12)._serialize()
        self.assertEqual(
            self.navigate(self.ids[11], view=view),
            {"kind": "offset", "index": 11},
        )
        self.assertEqual(
            self.navigate(self.ids[12], view=view), {"kind": "missing"}
        )

    def test_continuations_do_not_switch_to_absolute_offsets(self):
        with self.assertRaises(ValueError):
            self.navigate(self.ids[0], direction="before", sortBy="score")

    def test_rejects_invalid_cursor(self):
        with self.assertRaises(ValueError):
            self.navigate("bad")
        with self.assertRaises(ValueError):
            self.navigate(self.ids[0], direction="arbitrary")
        self.assertEqual(
            self.navigate(str(ObjectId()), sortBy="id"), {"kind": "missing"}
        )

    def test_scrolls_through_null_and_missing_sort_values_in_both_directions(
        self,
    ):
        collection = self.dataset._sample_collection
        collection.update_many(
            {"_id": {"$in": [ObjectId(i) for i in self.ids[:20]]}},
            {"$set": {"score": None}},
        )
        collection.update_many(
            {"_id": {"$in": [ObjectId(i) for i in self.ids[20:45]]}},
            {"$unset": {"score": ""}},
        )
        for order in (1, -1):
            with self.subTest(order=order):
                view = self.dataset.sort_by(
                    [("score", order), ("id", 1)], create_index=False
                )
                request = {"view": view._serialize()}
                expected = view.values("id")
                for direction in ("before", "after"):
                    start = (
                        expected[-1] if direction == "before" else expected[0]
                    )
                    result = self.navigate(start, **request)
                    actual = result["ids"]
                    edge = "previous" if direction == "before" else "next"
                    for _ in range(10):
                        cursor = result[edge]
                        if not cursor:
                            break
                        result = self.navigate(
                            cursor["sampleId"], direction=direction, **request
                        )
                        actual = (
                            (result["ids"] + actual)
                            if direction == "before"
                            else (actual + result["ids"])
                        )
                    self.assertIsNone(result[edge])
                    self.assertEqual(actual, expected)

    def test_grouped_views_keep_normal_paging_after_the_jump(self):
        view = self.dataset.group_by("score", create_index=False)
        ids = view.values("id")
        self.assertEqual(
            self.navigate(ids[10], view=view._serialize()),
            {"kind": "offset", "index": 10},
        )

    def test_seeking_null_values_uses_the_compound_index(self):
        collection = self.dataset._sample_collection
        collection.update_many({}, {"$unset": {"score": ""}})
        collection.update_many(
            {"_id": {"$in": [ObjectId(i) for i in self.ids[:20]]}},
            {"$set": {"score": None}},
        )
        collection.create_index([("score", 1), ("_id", 1)])
        view = self.dataset.sort_by(
            [("score", 1), ("id", 1)], create_index=False
        )._serialize()
        for direction in ("at", "before"):
            with self.subTest(direction=direction):
                with patch.object(
                    fosn.foo, "aggregate", wraps=fosn.foo.aggregate
                ) as aggregate:
                    result = self.navigate(
                        self.ids[40], direction=direction, view=view
                    )
                self.assertEqual(result["kind"], "seek")
                pipeline = aggregate.call_args.args[1]
                explain = collection.database.command(
                    {
                        "explain": {
                            "aggregate": collection.name,
                            "pipeline": pipeline,
                            "cursor": {},
                        },
                        "verbosity": "executionStats",
                    }
                )
                stats = explain.get("executionStats")
                if stats is None:
                    stats = explain["stages"][0]["$cursor"]["executionStats"]
                self.assertLessEqual(stats["totalDocsExamined"], 21)

    def test_missing_final_sort_key_keeps_the_anchor(self):
        self.dataset._sample_collection.update_one(
            {"_id": ObjectId(self.ids[30])}, {"$unset": {"score": ""}}
        )
        view = self.dataset.sort_by(
            [("id", 1), ("score", 1)], create_index=False
        )._serialize()
        self.assertEqual(
            self.navigate(self.ids[30], view=view)["ids"], self.ids[30:50]
        )

    def test_field_projection_after_sort_keeps_the_original_seek_keys(self):
        view = self.dataset.sort_by(
            [("score", 1), ("id", 1)], create_index=False
        ).mongo([{"$project": {"filepath": 1}}])
        self.assertEqual(
            self.navigate(self.ids[30], view=view._serialize())["ids"],
            self.ids[30:50],
        )

    def test_computed_projection_after_sort_does_not_change_the_seek_anchor(
        self,
    ):
        view = self.dataset.sort_by(
            [("score", 1), ("id", 1)], create_index=False
        ).mongo(
            [{"$project": {"filepath": 1, "score": {"$add": ["$score", 100]}}}]
        )
        self.assertEqual(
            self.navigate(self.ids[30], view=view._serialize()),
            {"kind": "offset", "index": 30},
        )

    def test_array_sort_preserves_mongo_element_order_through_fallback(self):
        self.dataset.set_values("scores", [[65 - i, i] for i in range(65)])
        request = {
            "view": self.dataset.sort_by(
                [("scores", 1), ("id", 1)], create_index=False
            )._serialize()
        }
        view, _, _ = foss._scoped_view(self.dataset, request)
        ids = view.values("id")
        self.assertEqual(
            self.navigate(ids[30], **request),
            {"kind": "offset", "index": 30},
        )
