"""
FiftyOne Server order tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import datetime
import json
import random
import string
import time
import unittest
from unittest.mock import patch

from bson import ObjectId
from graphql import GraphQLError
from pymongo.collection import Collection

import fiftyone as fo
from fiftyone import ViewField as F
import fiftyone.core.odm as foo
import fiftyone.core.utils as fou

from fiftyone.server.context import get_context
from fiftyone.server.indexes import from_dict
from fiftyone.server.order.backend import (
    Bounds,
    Budget,
    BudgetExceeded,
    Cancelled,
    Direction,
    Mode,
    OrderSpec,
    Reason,
    Scale,
    SeekNotAllowed,
    SeekTarget,
)
from fiftyone.server.order.cancel import run_bounded
from fiftyone.server.order.explain import explain_serves
import fiftyone.server.order.mongo as fosom
from fiftyone.server.order.positions import decode_token
from fiftyone.server.order.rail import (
    calendar_numbers,
    nice_numbers,
    offset_ticks,
    value_ticks,
)
from fiftyone.server.order.service import OrderService
import fiftyone.server.samples as foss

N = 400
PAGE = 7
FIELDS = ["u", "t", "s", "n", "str", "d"]
FORBIDDEN = ("$count", "$skip", "$setWindowFields")

# a stage that takes SLEEP_MS per document it reads
SLEEP_MS = 50
SLEEP = {
    "$match": {
        "$expr": {
            "$function": {
                "body": "function() { sleep(%d); return true; }" % SLEEP_MS,
                "args": [],
                "lang": "js",
            }
        }
    }
}


def _make_dataset():
    rnd = random.Random(51)
    base = datetime.datetime(2020, 1, 1)
    samples = []
    for i in range(N):
        sample = fo.Sample(
            filepath="/tmp/order_%04d.jpg" % i,
            u=rnd.random(),
            t=rnd.randrange(10),
            # skew: one sample below a block of every other sample
            s=1 if i == N // 2 else 1000000,
            str="".join(rnd.choice(string.ascii_lowercase) for _ in range(6)),
            d=base + datetime.timedelta(days=rnd.randrange(3000)),
            bucket=i % 2,
            w=rnd.random(),
        )
        r = rnd.random()
        if r < 0.6:
            sample["n"] = rnd.randrange(5)
        elif r < 0.8:
            sample["n"] = None
        samples.append(sample)

    dataset = fo.Dataset()
    dataset.add_samples(samples)
    for field in FIELDS + ["bucket"]:
        dataset.create_index(field)

    return dataset


def _expected(view, field, desc):
    """The order's contract, computed in memory: value then id, None first
    ascending, both reversed when descending."""
    ids = [ObjectId(_id) for _id in view.values("id")]
    if field is None:
        return sorted(ids, reverse=desc)

    values = view.values(field)
    rows = []
    for _id, value in zip(ids, values):
        segment = 0 if value is None else 1
        rows.append(((segment, value if value is not None else 0, _id), _id))

    rows.sort(key=lambda row: row[0], reverse=desc)
    return [_id for _, _id in rows]


def _values(view, field):
    return dict(
        zip([ObjectId(i) for i in view.values("id")], view.values(field))
    )


def _first_past(expected, values, value, desc):
    """The offset of the first sample at or past ``value`` in view order."""
    for offset, _id in enumerate(expected):
        v = values[_id]
        if value is None:
            if desc and v is None or not desc:
                return offset
        elif v is None:
            if desc:
                return offset
        elif (v <= value) if desc else (v >= value):
            return offset

    return len(expected)


def _budget():
    return Budget(comment="fiftyone.order.test")


def _large():
    """Treats every collection as larger than the SMALL limit."""
    return patch.object(fosom, "SMALL_COLLECTION_SIZE", 0)


class _Backend(object):
    dataset = None

    def setUp(self):
        self.backend = fosom.MongoOrderBackend()

    def _spec(self, sort_by=None, desc=False, stages=None):
        return OrderSpec(
            dataset=self.dataset.name,
            stages=stages or [],
            sort_by=sort_by,
            desc=desc,
        )

    def _open(self, sort_by=None, desc=False, stages=None):
        return self.backend.open(self._spec(sort_by, desc, stages), _budget())

    def _page(self, handle, position, direction, limit=PAGE):
        return self.backend.page(handle, position, direction, limit, _budget())

    def _seek(self, handle, **target):
        return self.backend.seek(handle, SeekTarget(**target), _budget())

    def _walk_forward(self, handle, position=None):
        ids, offsets = [], []
        while True:
            page = self._page(handle, position, Direction.FORWARD)
            ids += page.ids
            offsets += page.offsets or [None] * len(page.ids)
            if not page.has_more:
                return ids, offsets

            position = page.positions[-1]

    def _walk_backward(self, handle, position=None):
        ids, offsets = [], []
        while True:
            page = self._page(handle, position, Direction.BACKWARD)
            ids = page.ids + ids
            offsets = (page.offsets or [None] * len(page.ids)) + offsets
            if not page.has_more:
                return ids, offsets

            position = page.positions[0]


class ModeTests(_Backend, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = _make_dataset()
        cls.dataset.create_index([("bucket", 1), ("t", 1)])

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def _mode(self, sort_by=None, stages=None, desc=False):
        return self._open(sort_by, desc, stages).plan.mode

    def test_small_up_to_the_limit(self):
        with patch.object(fosom, "SMALL_COLLECTION_SIZE", N):
            self.assertEqual(self._mode("w"), Mode.SMALL)
            self.assertEqual(self._mode("u"), Mode.SMALL)

        with patch.object(fosom, "SMALL_COLLECTION_SIZE", N - 1):
            self.assertEqual(self._mode("w"), Mode.SCROLL)
            self.assertEqual(self._mode("u"), Mode.INDEXED)

    def test_small_size_is_the_collection_not_the_view(self):
        stages = self.dataset.limit(3)._serialize()
        with patch.object(fosom, "SMALL_COLLECTION_SIZE", N - 1):
            self.assertEqual(self._mode("w", stages), Mode.SCROLL)

    def test_indexed_and_scroll(self):
        bucket = self.dataset.match(F("bucket") == 1)._serialize()
        u = self.dataset.match(F("u") > 0.5)._serialize()
        fields = self.dataset.select_fields("u")._serialize()
        cases = [
            ("u", None, Mode.INDEXED),
            ("d", None, Mode.INDEXED),
            ("str", None, Mode.INDEXED),
            (None, None, Mode.INDEXED),
            ("w", None, Mode.SCROLL),
            # an index serves the sort but not the filter
            ("u", bucket, Mode.SCROLL),
            (None, bucket, Mode.SCROLL),
            # a filter on the sort field narrows the index scan
            ("u", u, Mode.INDEXED),
            # a compound index serves a filter on its first key
            ("t", bucket, Mode.INDEXED),
            ("u", fields, Mode.INDEXED),
        ]
        with _large():
            for sort_by, stages, mode in cases:
                for desc in (False, True):
                    with self.subTest(sort_by=sort_by, s=stages, desc=desc):
                        self.assertEqual(
                            self._mode(sort_by, stages, desc), mode
                        )

    def test_unsupported(self):
        handle = self._open(None, stages=self.dataset.shuffle()._serialize())
        self.assertIsNone(handle.plan.mode)
        self.assertEqual(handle.plan.reason, Reason.UNSUPPORTED_STAGE)

    def test_indexed_sort_fields(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="/tmp/a.jpg",
                x=1,
                gt=fo.Detections(detections=[fo.Detection(label="a")]),
            )
        )
        dataset.create_index("x")
        dataset.create_index("gt.detections.label")
        dataset.create_index([("x", 1), ("filepath", 1)])
        sample_indexes, _ = from_dict(
            dataset.get_index_information(_keep_index_names=True)
        )
        fields = fosom.indexed_sort_fields(dataset, sample_indexes)
        dataset.delete()
        self.assertEqual(
            sorted(fields),
            ["created_at", "filepath", "id", "last_modified_at", "x"],
        )

    def test_explain_filters_must_be_on_index_keys(self):
        explain = lambda f: {
            "queryPlanner": {
                "winningPlan": {
                    "stage": "FETCH",
                    "filter": {f: {"$eq": 1}},
                    "inputStage": {
                        "stage": "IXSCAN",
                        "keyPattern": {"a": 1, "b": 1},
                    },
                }
            }
        }
        self.assertEqual(explain_serves(explain("b"), "a"), True)
        self.assertEqual(explain_serves(explain("a"), "b"), True)
        self.assertEqual(explain_serves(explain("c"), "a"), False)


class GroupSliceTests(_Backend, unittest.TestCase):
    """The query performance index of a grouped dataset: the field first,
    the slice last."""

    SLICE = "right"

    @classmethod
    def setUpClass(cls):
        dataset = fo.Dataset()
        dataset.add_group_field("group", default="left")
        rnd = random.Random(51)
        samples = []
        for i in range(60):
            group = fo.Group()
            for name in ("left", "right"):
                value = rnd.randrange(8)
                samples.append(
                    fo.Sample(
                        filepath="/tmp/slice_%d_%s.jpg" % (i, name),
                        group=group.element(name),
                        k=None if value == 0 else value,
                        c=i % 3,
                    )
                )

        dataset.add_samples(samples)
        dataset.create_index([("k", 1), ("group.name", 1)])
        cls.dataset = dataset
        cls.view = dataset.select_group_slices(cls.SLICE)

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def _slice_spec(self, sort_by="k", desc=False, stages=None):
        return OrderSpec(
            dataset=self.dataset.name,
            stages=stages or [],
            group_slice=self.SLICE,
            sort_by=sort_by,
            desc=desc,
        )

    def _slice_open(self, **kwargs):
        with _large():
            return self.backend.open(self._slice_spec(**kwargs), _budget())

    def test_modes(self):
        on_slice = self.dataset.match(F("group.name") == self.SLICE)
        on_c = self.dataset.match(F("c") == 1)
        for stages, mode in (
            (None, Mode.INDEXED),
            # the slice as a filter on the index's last key
            (on_slice._serialize(), Mode.INDEXED),
            (on_c._serialize(), Mode.SCROLL),
        ):
            for desc in (False, True):
                with self.subTest(stages=stages, desc=desc):
                    handle = self._slice_open(desc=desc, stages=stages)
                    self.assertEqual(handle.plan.mode, mode)

    def test_bounds_walks_and_seeks_stay_in_the_slice(self):
        values = _values(self.view, "k")
        present = [v for v in values.values() if v is not None]
        for desc in (False, True):
            with self.subTest(desc=desc):
                handle = self._slice_open(desc=desc)
                bounds = handle.bounds
                self.assertEqual(
                    (bounds.min, bounds.max), (min(present), max(present))
                )
                self.assertEqual(bounds.has_none, None in values.values())

                expected = _expected(self.view, "k", desc)
                ids, _ = self._walk_forward(handle)
                self.assertEqual(ids, expected)
                ids, _ = self._walk_backward(handle)
                self.assertEqual(ids, expected)

                for value in (None, 3, 4.5):
                    position = self._seek(handle, value=value, has_value=True)
                    page = self._page(handle, position, Direction.FORWARD)
                    offset = _first_past(expected, values, value, desc)
                    self.assertEqual(
                        page.ids, expected[offset : offset + PAGE]
                    )

                position = self._seek(handle, fraction=0.5)
                page = self._page(handle, position, Direction.FORWARD)
                middle = (bounds.min + bounds.max) / 2
                offset = _first_past(expected, values, middle, desc)
                self.assertEqual(page.ids, expected[offset : offset + PAGE])


class WalkTests(_Backend, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = _make_dataset()

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def test_small_walks_carry_offsets(self):
        for field in FIELDS + [None]:
            for desc in (False, True):
                with self.subTest(field=field, desc=desc):
                    handle = self._open(field, desc)
                    self.assertEqual(handle.plan.mode, Mode.SMALL)
                    self.assertEqual(handle.total, N)
                    expected = _expected(self.dataset, field, desc)

                    ids, offsets = self._walk_forward(handle)
                    self.assertEqual(ids, expected)
                    self.assertEqual(offsets, list(range(N)))

                    ids, offsets = self._walk_backward(handle)
                    self.assertEqual(ids, expected)
                    self.assertEqual(offsets, list(range(N)))

    def test_indexed_walks(self):
        with _large():
            for field in FIELDS + [None]:
                for desc in (False, True):
                    with self.subTest(field=field, desc=desc):
                        handle = self._open(field, desc)
                        self.assertEqual(handle.plan.mode, Mode.INDEXED)
                        self.assertIsNone(handle.total)
                        expected = _expected(self.dataset, field, desc)

                        ids, offsets = self._walk_forward(handle)
                        self.assertEqual(ids, expected)
                        self.assertEqual(offsets, [None] * N)

                        ids, _ = self._walk_backward(handle)
                        self.assertEqual(ids, expected)

    def test_scroll_walks_in_order_only(self):
        with _large():
            for desc in (False, True):
                handle = self._open("w", desc)
                self.assertEqual(handle.plan.mode, Mode.SCROLL)
                expected = _expected(self.dataset, "w", desc)
                ids, _ = self._walk_forward(handle)
                self.assertEqual(ids, expected)

                page = self._page(handle, None, Direction.FORWARD, 100)
                ids, _ = self._walk_backward(handle, page.positions[-1])
                self.assertEqual(ids, expected[:99])

                with self.assertRaises(SeekNotAllowed):
                    self._page(handle, None, Direction.BACKWARD)

                for target in (
                    {"offset": 3},
                    {"fraction": 0.5},
                    {"value": 0.5, "has_value": True},
                ):
                    with self.assertRaises(SeekNotAllowed):
                        self._seek(handle, **target)

    def test_page_values(self):
        with _large():
            handle = self._open("n")
            page = self._page(handle, None, Direction.FORWARD, N)
            values = _values(self.dataset, "n")
            self.assertEqual(page.values, [values[i] for i in page.ids])

            handle = self._open(None)
            page = self._page(handle, None, Direction.FORWARD, 3)
            self.assertEqual(page.values, page.ids)


class SeekTests(_Backend, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = _make_dataset()

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    VALUES = [
        ("t", 4),
        ("t", 3.5),
        ("t", -1),
        ("t", 100),
        ("s", 1000000),
        ("s", 2),
        ("n", None),
        ("n", 2),
        ("str", "m"),
        ("u", 0.25),
    ]

    def _check_landing(self, handle, position, expected, offset, small):
        page = self._page(handle, position, Direction.FORWARD)
        stop = min(offset + PAGE, N)
        self.assertEqual(page.ids, expected[offset:stop])
        if small:
            self.assertEqual(page.offsets, list(range(offset, stop)))
        else:
            self.assertIsNone(page.offsets)

        page = self._page(handle, position, Direction.BACKWARD)
        start = max(offset - PAGE, 0)
        self.assertEqual(page.ids, expected[start:offset])
        self.assertEqual(page.has_more, start > 0)

    def test_value_seeks(self):
        for small in (True, False):
            for field, value in self.VALUES:
                for desc in (False, True):
                    with self.subTest(
                        small=small, field=field, value=value, desc=desc
                    ), patch.object(
                        fosom, "SMALL_COLLECTION_SIZE", N if small else 0
                    ):
                        handle = self._open(field, desc)
                        expected = _expected(self.dataset, field, desc)
                        values = _values(self.dataset, field)
                        offset = _first_past(expected, values, value, desc)
                        position = self._seek(
                            handle, value=value, has_value=True
                        )
                        self._check_landing(
                            handle, position, expected, offset, small
                        )

    def test_id_value_seek(self):
        expected = _expected(self.dataset, None, False)
        for small in (True, False):
            with patch.object(
                fosom, "SMALL_COLLECTION_SIZE", N if small else 0
            ):
                handle = self._open(None)
                position = self._seek(
                    handle, value=str(expected[123]), has_value=True
                )
                self._check_landing(handle, position, expected, 123, small)

    def test_date_value_seek(self):
        expected = _expected(self.dataset, "d", False)
        values = _values(self.dataset, "d")
        when = datetime.datetime(2023, 1, 1)
        offset = _first_past(expected, values, when, False)
        with _large():
            handle = self._open("d")
            for value in (
                fou.datetime_to_timestamp(when),
                {"_cls": "DateTime", "datetime": 1672531200000.0},
            ):
                position = self._seek(handle, value=value, has_value=True)
                self._check_landing(handle, position, expected, offset, False)

    def test_offset_seeks_are_small_only(self):
        for field in ("t", "n", "str", None):
            for desc in (False, True):
                with self.subTest(field=field, desc=desc):
                    handle = self._open(field, desc)
                    expected = _expected(self.dataset, field, desc)
                    for offset in (0, 1, 19, 201, N - 1, N + 50, -3):
                        position = self._seek(handle, offset=offset)
                        landed = min(max(offset, 0), N - 1)
                        self._check_landing(
                            handle, position, expected, landed, True
                        )

        with _large():
            with self.assertRaises(SeekNotAllowed):
                self._seek(self._open("t"), offset=3)

    def test_small_fraction_seek_is_an_offset(self):
        handle = self._open("u")
        expected = _expected(self.dataset, "u", False)
        for f, offset in ((0.0, 0), (0.5, 200), (1.0, N - 1), (2.0, N - 1)):
            position = self._seek(handle, fraction=f)
            self._check_landing(handle, position, expected, offset, True)

    def test_indexed_fraction_seeks_a_value(self):
        cases = [
            (
                "u",
                self.dataset.bounds("u"),
                lambda lo, hi, f: lo + f * (hi - lo),
            ),
            ("t", (0, 9), lambda lo, hi, f: lo + f * (hi - lo)),
        ]
        with _large():
            for field, (lo, hi), at in cases:
                for desc in (False, True):
                    for f in (0.25, 0.5, 0.9, 1.0):
                        with self.subTest(field=field, desc=desc, f=f):
                            handle = self._open(field, desc)
                            expected = _expected(self.dataset, field, desc)
                            values = _values(self.dataset, field)
                            value = at(lo, hi, 1 - f if desc else f)
                            offset = _first_past(expected, values, value, desc)
                            position = self._seek(handle, fraction=f)
                            self._check_landing(
                                handle, position, expected, offset, False
                            )

    def test_indexed_fraction_zero_starts_the_order(self):
        with _large():
            for desc in (False, True):
                handle = self._open("n", desc)
                position = self._seek(handle, fraction=0.0)
                page = self._page(handle, position, Direction.FORWARD)
                expected = _expected(self.dataset, "n", desc)
                self.assertEqual(page.ids, expected[:PAGE])
                self.assertEqual(page.from_start, True)

    def test_indexed_fraction_on_dates_and_ids(self):
        with _large():
            handle = self._open("d")
            lo, hi = self.dataset.bounds("d")
            when = lo + (hi - lo) / 2
            expected = _expected(self.dataset, "d", False)
            offset = _first_past(
                expected, _values(self.dataset, "d"), when, False
            )
            position = self._seek(handle, fraction=0.5)
            # dates interpolate in milliseconds
            page = self._page(handle, position, Direction.FORWARD)
            self.assertEqual(page.ids[0], expected[offset])

            handle = self._open(None)
            self.assertEqual(handle.bounds.scale, Scale.ID)
            position = self._seek(handle, fraction=1.0)
            page = self._page(handle, position, Direction.FORWARD)
            # ids are seconds apart at most; the last second's ids remain
            self.assertTrue(page.ids)

    def test_string_sorts_seek_by_value_only(self):
        with _large():
            handle = self._open("str")
            self.assertIsNone(handle.bounds.scale)
            with self.assertRaises(SeekNotAllowed):
                self._seek(handle, fraction=0.5)


class BoundsTests(_Backend, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = _make_dataset()

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def test_bounds(self):
        ids = sorted(ObjectId(i) for i in self.dataset.values("id"))
        with _large():
            for field, scale, has_none in (
                ("u", Scale.NUMBER, False),
                ("n", Scale.NUMBER, True),
                ("d", Scale.DATE, False),
                ("str", None, False),
            ):
                with self.subTest(field=field):
                    bounds = self._open(field).bounds
                    lo, hi = self.dataset.bounds(field)
                    self.assertEqual((bounds.min, bounds.max), (lo, hi))
                    self.assertEqual(bounds.scale, scale)
                    self.assertEqual(bounds.has_none, has_none)

            bounds = self._open(None).bounds
            self.assertEqual((bounds.min, bounds.max), (ids[0], ids[-1]))

            stages = self.dataset.match(F("u") > 0.5)._serialize()
            bounds = self._open("u", stages=stages).bounds
            view = self.dataset.match(F("u") > 0.5)
            self.assertEqual((bounds.min, bounds.max), view.bounds("u"))

    def test_nonfinite_values_are_outside_the_bounds(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="/tmp/%d.jpg" % i, f=v)
                for i, v in enumerate(
                    [float("-inf"), 1.0, 2.0, float("inf"), float("nan")]
                )
            ]
        )
        dataset.create_index("f")
        try:
            with _large():
                handle = self.backend.open(
                    OrderSpec(dataset=dataset.name, stages=[], sort_by="f"),
                    Budget(),
                )
            self.assertEqual((handle.bounds.min, handle.bounds.max), (1, 2))
        finally:
            dataset.delete()

    def test_ticks(self):
        self.assertEqual(
            nice_numbers(0.03, 0.97, 6, False), [0.2, 0.4, 0.6, 0.8]
        )
        self.assertEqual(nice_numbers(0, 399, 6, True), [0, 100, 200, 300])
        self.assertEqual(nice_numbers(3, 5, 6, True), [3, 4, 5])

        lo = fou.datetime_to_timestamp(datetime.datetime(2020, 1, 15))
        hi = fou.datetime_to_timestamp(datetime.datetime(2020, 7, 2))
        _, labels = calendar_numbers(lo, hi, 6)
        self.assertEqual(
            labels,
            [
                "Feb 2020",
                "Mar 2020",
                "Apr 2020",
                "May 2020",
                "Jun 2020",
                "Jul 2020",
            ],
        )
        hi = fou.datetime_to_timestamp(datetime.datetime(2028, 3, 1))
        _, labels = calendar_numbers(lo, hi, 6)
        self.assertEqual(labels, ["2022", "2024", "2026", "2028"])

        ticks = offset_ticks(N)
        self.assertEqual([t.value for t in ticks], [0, 100, 200, 300])
        self.assertEqual([t.fraction for t in ticks], [0, 0.25, 0.5, 0.75])
        self.assertEqual([t.label for t in ticks], ["1", "101", "201", "301"])

        with _large():
            for desc in (False, True):
                handle = self._open("d", desc)
                ticks = value_ticks(handle.bounds, desc)
                self.assertTrue(0 < len(ticks) <= 6)
                fractions = [t.fraction for t in ticks]
                self.assertEqual(fractions, sorted(fractions, reverse=desc))
                self.assertTrue(all(0 <= f <= 1 for f in fractions))

            self.assertEqual(value_ticks(self._open("str").bounds, False), [])

        first = ObjectId.from_datetime(datetime.datetime(2021, 1, 1))
        last = ObjectId.from_datetime(datetime.datetime(2021, 4, 1))
        bounds = Bounds(min=first, max=last, has_none=False, scale=Scale.ID)
        ticks = value_ticks(bounds, False)
        self.assertEqual(
            [t.label for t in ticks],
            ["Jan 2021", "Feb 2021", "Mar 2021", "Apr 2021"],
        )
        self.assertEqual(ticks[0].value, first)
        self.assertEqual(ticks[-1].fraction, 1.0)


def _is_samples(coll):
    return coll.name.startswith("samples.")


class _Spy(object):
    """Records the pipelines and options of every aggregation and find on a
    sample collection."""

    def __init__(self):
        self.calls = []
        aggregate = Collection.aggregate
        find = Collection.find

        def spy_aggregate(coll, pipeline, *args, **kwargs):
            if _is_samples(coll):
                self.calls.append(("aggregate", pipeline, kwargs))
            return aggregate(coll, pipeline, *args, **kwargs)

        def spy_find(coll, *args, **kwargs):
            if _is_samples(coll):
                self.calls.append(("find", args, kwargs))
            return find(coll, *args, **kwargs)

        self._patches = [
            patch.object(Collection, "aggregate", spy_aggregate),
            patch.object(Collection, "find", spy_find),
        ]

    def __enter__(self):
        for p in self._patches:
            p.start()
        return self

    def __exit__(self, *args):
        for p in self._patches:
            p.stop()

    def stages(self):
        return {
            next(iter(stage))
            for kind, pipeline, _ in self.calls
            if kind == "aggregate"
            for stage in pipeline
        }


class LargeQueryTests(_Backend, unittest.TestCase):
    """What reaches the database in INDEXED and SCROLL modes."""

    @classmethod
    def setUpClass(cls):
        cls.dataset = _make_dataset()
        cls.first_id = cls.dataset.first().id

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def _exercise(self, sort_by, desc):
        handle = self._open(sort_by, desc)
        page = self._page(handle, None, Direction.FORWARD)
        self._page(handle, page.positions[-1], Direction.FORWARD)
        self._page(handle, page.positions[-1], Direction.BACKWARD)
        if handle.plan.mode == Mode.INDEXED:
            self._page(handle, None, Direction.BACKWARD)
            if sort_by is None:
                values = [self.first_id]
            else:
                values = [3, None]

            targets = [{"value": v, "has_value": True} for v in values]
            if handle.bounds.scale is not None:
                targets.append({"fraction": 0.5})

            for target in targets:
                position = self._seek(handle, **target)
                self._page(handle, position, Direction.FORWARD)
                self._page(handle, position, Direction.BACKWARD)

        self.backend.version(handle, _budget())
        return handle

    def test_no_counts_skips_or_windows(self):
        with _large():
            for sort_by, mode in (
                ("n", Mode.INDEXED),
                ("str", Mode.INDEXED),
                (None, Mode.INDEXED),
                ("w", Mode.SCROLL),
            ):
                for desc in (False, True):
                    with self.subTest(
                        sort_by=sort_by, desc=desc
                    ), _Spy() as spy:
                        handle = self._exercise(sort_by, desc)
                        self.assertEqual(handle.plan.mode, mode)
                        self.assertTrue(spy.calls)
                        for stage in FORBIDDEN:
                            self.assertNotIn(stage, spy.stages())

                        for kind, _, kwargs in spy.calls:
                            if kind == "aggregate":
                                self.assertIn("maxTimeMS", kwargs)
                                self.assertIn("comment", kwargs)
                            else:
                                self.assertIn("max_time_ms", kwargs)

    def test_page_reads_are_bounded(self):
        with _large():
            handle = self._open("n")
            with _Spy() as spy:
                self._page(handle, None, Direction.FORWARD, 50)

        for _, pipeline, _ in spy.calls:
            self.assertIn("$limit", {next(iter(s)) for s in pipeline})


class CancelTests(_Backend, unittest.IsolatedAsyncioTestCase):
    """An abandoned request stops its database operations."""

    @classmethod
    def setUpClass(cls):
        cls.dataset = fo.Dataset()
        cls.dataset.add_samples(
            [
                fo.Sample(filepath="/tmp/cancel_%d.jpg" % i, w=i)
                for i in range(200)
            ]
        )

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def _slow_handle(self):
        stages = self.dataset.mongo([SLEEP])._serialize()
        with _large():
            handle = self._open("w", stages=stages)

        self.assertEqual(handle.plan.mode, Mode.SCROLL)
        return handle

    def _ops(self):
        ns = "%s.%s" % (
            foo.get_db_conn().name,
            self.dataset._sample_collection_name,
        )
        return list(
            foo.get_db_client().admin.aggregate(
                [
                    {"$currentOp": {"localOps": True}},
                    {
                        "$match": {
                            "ns": ns,
                            "command.comment": {"$exists": True},
                        }
                    },
                ]
            )
        )

    async def _wait_for_ops(self, present, timeout=5.0):
        start = time.time()
        while time.time() - start < timeout:
            if bool(self._ops()) == present:
                return time.time() - start

            await asyncio.sleep(0.05)

        self.fail(
            "operations %s" % ("never started" if present else "kept running")
        )

    def _slow_page(self, handle):
        return lambda budget: self.backend.page(
            handle, None, Direction.FORWARD, 5, budget
        )

    async def test_cancelled_task_kills_its_operations(self):
        handle = self._slow_handle()
        task = asyncio.ensure_future(
            run_bounded(None, self._slow_page(handle))
        )
        await self._wait_for_ops(True)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task

        # the page alone would read for 200 * SLEEP_MS = 10 seconds
        self.assertLess(await self._wait_for_ops(False), 2.0)

    async def test_disconnected_request_kills_its_operations(self):
        handle = self._slow_handle()

        gone = asyncio.Event()

        class Request(object):
            scope = {"type": "http"}

            async def receive(self):
                await gone.wait()
                return {"type": "http.disconnect"}

        request = Request()
        task = asyncio.ensure_future(
            run_bounded(request, self._slow_page(handle))
        )
        await self._wait_for_ops(True)
        gone.set()
        with self.assertRaises(Cancelled):
            await task

        self.assertLess(await self._wait_for_ops(False), 2.0)

    async def test_http_disconnect_kills_the_page_query(self):
        """Through the App's ASGI stack: the client goes away after
        sending a page request."""
        from fiftyone.server.app import app

        stages = self.dataset.mongo([SLEEP])._serialize()
        with _large():
            opened = foss.get_service().open(
                OrderSpec(
                    dataset=self.dataset.name, stages=stages, sort_by="w"
                ),
                Budget(),
            )

        query = """
            query Page($dataset: String!, $view: BSONArray!, $order: OrderToken) {
              samples(dataset: $dataset, view: $view, order: $order, first: 5) {
                __typename
              }
            }
        """
        body = json.dumps(
            {
                "query": query,
                "variables": {
                    "dataset": self.dataset.name,
                    "view": stages,
                    "order": opened.token,
                },
            }
        ).encode()
        gone = asyncio.Event()
        sent = []

        async def receive():
            if not sent:
                sent.append(True)
                return {
                    "type": "http.request",
                    "body": body,
                    "more_body": False,
                }

            await gone.wait()
            return {"type": "http.disconnect"}

        async def send(message):
            pass

        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/graphql",
            "raw_path": b"/graphql",
            "query_string": b"",
            "root_path": "",
            "headers": [
                (b"content-type", b"application/json"),
                (b"host", b"localhost"),
            ],
            "client": ("127.0.0.1", 1),
            "server": ("127.0.0.1", 5151),
            "state": {},
        }
        request = asyncio.ensure_future(app(scope, receive, send))
        await self._wait_for_ops(True)
        gone.set()
        self.assertLess(await self._wait_for_ops(False), 2.0)
        await asyncio.wait_for(request, 5)

    async def test_time_limit(self):
        handle = self._slow_handle()
        with self.assertRaises(BudgetExceeded):
            await run_bounded(None, self._slow_page(handle), max_time_ms=200)


class SamplePositionTests(_Backend, unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = _make_dataset()

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def test_offsets_with_ties_and_none(self):
        stages = self.dataset.match(F("bucket") == 1)._serialize()
        view = self.dataset.match(F("bucket") == 1)
        for field in ("t", "n", "s", None):
            for desc in (False, True):
                with self.subTest(field=field, desc=desc):
                    spec = self._spec(field, desc, stages)
                    expected = _expected(view, field, desc)
                    for offset in (0, 1, 57, 133, len(expected) - 1):
                        found = self.backend.sample_offset(
                            spec, str(expected[offset]), None, Budget()
                        )
                        self.assertEqual(found, offset)

                    self.assertEqual(
                        self.backend.view_total(spec, Budget()), N // 2
                    )

        outside = self.dataset.match(F("bucket") == 0).first().id
        self.assertIsNone(
            self.backend.sample_offset(
                self._spec("t", False, stages), outside, None, Budget()
            )
        )

    def test_group_offsets(self):
        dataset = fo.Dataset()
        dataset.add_group_field("group", default="left")
        samples = []
        for i in range(10):
            group = fo.Group()
            for name in ("left", "right"):
                samples.append(
                    fo.Sample(
                        filepath="/tmp/g_%d_%s.jpg" % (i, name),
                        group=group.element(name),
                        k=i % 3,
                    )
                )

        dataset.add_samples(samples)
        try:
            spec = OrderSpec(
                dataset=dataset.name,
                stages=[],
                group_slice="right",
                sort_by="k",
            )
            view = dataset.select_group_slices("right")
            expected = _expected(view, "k", False)
            group_ids = dict(zip(view.values("id"), view.values("group.id")))
            for offset, _id in enumerate(expected):
                found = self.backend.sample_offset(
                    spec, None, group_ids[str(_id)], Budget()
                )
                self.assertEqual(found, offset)
        finally:
            dataset.delete()

    async def _position(self, stages, sort_by, sample_id, desc=False):
        query = """
            query Position($input: OrderInput!, $sampleId: String) {
              samplePosition(input: $input, sampleId: $sampleId) {
                offset {
                  __typename
                  ... on SamplePositionValue { value }
                  ... on QueryTimeout { queryTime }
                }
                total {
                  __typename
                  ... on SamplePositionValue { value }
                  ... on QueryTimeout { queryTime }
                }
              }
            }
        """
        from fiftyone.server.app import schema

        result = await schema.execute(
            query,
            variable_values={
                "input": {
                    "dataset": self.dataset.name,
                    "view": stages,
                    "sortBy": sort_by,
                    "desc": desc,
                },
                "sampleId": sample_id,
            },
            context_value=get_context(),
        )
        self.assertIsNone(result.errors)
        return result.data["samplePosition"]

    async def test_query(self):
        expected = _expected(self.dataset, "t", True)
        result = await self._position([], "t", str(expected[42]), True)
        self.assertEqual(
            result,
            {
                "offset": {"__typename": "SamplePositionValue", "value": 42},
                "total": {"__typename": "SamplePositionValue", "value": N},
            },
        )

    async def test_total_times_out_while_the_offset_returns(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [fo.Sample(filepath="/tmp/slow_%d.jpg" % i) for i in range(100)]
        )
        try:
            stages = dataset.mongo([SLEEP])._serialize()
            ids = sorted(dataset.values("id"))
            with patch.object(
                fo.app_config, "max_query_time", 1
            ), patch.object(self, "dataset", dataset):
                start = time.time()
                result = await self._position(stages, None, ids[2])
                elapsed = time.time() - start
        finally:
            dataset.delete()

        self.assertEqual(
            result,
            {
                "offset": {"__typename": "SamplePositionValue", "value": 2},
                "total": {"__typename": "QueryTimeout", "queryTime": 1},
            },
        )
        # the total alone would read for 100 * SLEEP_MS = 5 seconds
        self.assertLess(elapsed, 3)


class ServiceTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = _make_dataset()

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def setUp(self):
        foss.get_service.cache_clear()

    def test_token_round_trip_and_errors(self):
        service = OrderService(fosom.MongoOrderBackend())
        spec = OrderSpec(
            dataset=self.dataset.name,
            stages=[],
            sort_by="t",
            extended_stages={"fiftyone.core.stages.SortBy": {"x": 1}},
        )
        opened = service.open(spec, Budget())
        decoded, version = decode_token(opened.token)
        self.assertEqual(decoded.digest(), spec.digest())
        self.assertEqual(version, opened.handle.version)

        # a fresh service serves a token it did not open
        other = OrderService(fosom.MongoOrderBackend())
        view_spec = OrderSpec(dataset=self.dataset.name, stages=[])
        page = lambda position, seek=None, direction=Direction.FORWARD: (
            other.page(
                opened.token, view_spec, position, direction, 3, seek, Budget()
            )
        )
        _, result, version = page(None, SeekTarget(fraction=0.5))
        self.assertEqual(result.offsets, [200, 201, 202])
        self.assertEqual(version, opened.handle.version)

        _, result, _ = page(None, SeekTarget(offset=17), Direction.BACKWARD)
        self.assertEqual(result.offsets, [17, 18, 19])

        stages = self.dataset.match(F("bucket") == 1)._serialize()
        with self.assertRaises(Exception) as cm:
            other.page(
                opened.token,
                OrderSpec(dataset=self.dataset.name, stages=stages),
                None,
                Direction.FORWARD,
                3,
                None,
                Budget(),
            )
        self.assertEqual(cm.exception.code, "ORDER_MISMATCH")

        with self.assertRaises(Exception) as cm:
            page("not-a-position")
        self.assertEqual(cm.exception.code, "BAD_POSITION")

        with self.assertRaises(Exception) as cm:
            other.status("garbage", Budget())
        self.assertEqual(cm.exception.code, "ORDER_EXPIRED")

    def test_status(self):
        service = OrderService(fosom.MongoOrderBackend())
        dataset = self.dataset.clone()
        try:
            spec = OrderSpec(dataset=dataset.name, stages=[], sort_by="u")
            opened = service.open(spec, Budget())
            status = service.status(opened.token, Budget())
            self.assertEqual(status.stale, False)
            self.assertEqual(status.total, N)

            dataset.delete_samples(dataset.first())
            status = service.status(opened.token, Budget())
            self.assertEqual(status.stale, True)
        finally:
            dataset.delete()

    async def _paginate(self, token, **kwargs):
        async def shape(view, samples, pagination_data):
            return [{"_id": sample["_id"]} for sample in samples]

        with patch.object(foss, "_shape_nodes", new=shape):
            return await foss.paginate_samples(
                self.dataset.name, [], None, 5, order=token, **kwargs
            )

    async def test_small_edges(self):
        opened = foss.get_service().open(
            OrderSpec(dataset=self.dataset.name, stages=[], sort_by="t"),
            Budget(),
        )
        expected = _expected(self.dataset, "t", False)
        values = _values(self.dataset, "t")
        first = await self._paginate(opened.token)
        second = await self._paginate(
            opened.token, after=first.page_info.end_cursor
        )
        back = await self._paginate(
            opened.token, before=second.page_info.start_cursor
        )
        jumped = await self._paginate(
            opened.token, seek=SeekTarget(offset=123)
        )

        ids = lambda c: [e.node["_id"] for e in c.edges]
        self.assertEqual(ids(first), expected[:5])
        self.assertEqual([e.offset for e in first.edges], [0, 1, 2, 3, 4])
        self.assertEqual(
            [e.value for e in first.edges], [values[i] for i in expected[:5]]
        )
        self.assertEqual(
            [e.fraction for e in first.edges], [i / N for i in range(5)]
        )
        self.assertEqual(first.page_info.has_previous_page, False)
        self.assertEqual(first.page_info.has_next_page, True)
        self.assertEqual(first.total, N)
        self.assertEqual(ids(second), expected[5:10])
        self.assertEqual(second.page_info.has_previous_page, True)
        self.assertEqual(ids(back), expected[:5])
        self.assertEqual(back.page_info.has_previous_page, False)
        self.assertEqual(first.order_version, opened.handle.version)
        self.assertEqual(ids(jumped), expected[123:128])
        self.assertEqual(
            [e.offset for e in jumped.edges], list(range(123, 128))
        )
        self.assertEqual(jumped.page_info.has_previous_page, True)

    async def test_indexed_edges(self):
        with _large():
            opened = foss.get_service().open(
                OrderSpec(dataset=self.dataset.name, stages=[], sort_by="u"),
                Budget(),
            )
            first = await self._paginate(opened.token)
            jumped = await self._paginate(
                opened.token, seek=SeekTarget(fraction=0.5)
            )

        lo, hi = self.dataset.bounds("u")
        self.assertEqual(opened.handle.plan.mode, Mode.INDEXED)
        self.assertIsNone(first.total)
        self.assertEqual([e.offset for e in first.edges], [None] * 5)
        self.assertEqual(first.edges[0].fraction, 0.0)
        for edge in first.edges + jumped.edges:
            self.assertAlmostEqual(
                edge.fraction, (edge.value - lo) / (hi - lo)
            )

        self.assertGreaterEqual(jumped.edges[0].fraction, 0.5)
        self.assertEqual(first.page_info.has_previous_page, False)
        self.assertEqual(jumped.page_info.has_previous_page, True)
        self.assertEqual(jumped.page_info.has_next_page, True)

    async def test_open_order_reads_the_first_page(self):
        import fiftyone.server.order.schema as fooschema

        input = fooschema.OrderInput(
            dataset=self.dataset.name, view=[], sort_by="t"
        )
        opened = await fooschema.open_order(input)

        async def shape(view, samples, pagination_data):
            return [{"_id": sample["_id"]} for sample in samples]

        with patch.object(foss, "_shape_nodes", new=shape):
            first = await opened.first_page(count=5)
            paged = await self._paginate(opened.token)

        ids = lambda c: [e.node["_id"] for e in c.edges]
        self.assertEqual(ids(first), _expected(self.dataset, "t", False)[:5])
        self.assertEqual(ids(first), ids(paged))
        self.assertEqual(first.page_info, paged.page_info)
        self.assertEqual(first.total, N)

    async def test_a_first_page_that_fails_is_null(self):
        import fiftyone.server.order.schema as fooschema

        opened = await fooschema.open_order(
            fooschema.OrderInput(dataset=self.dataset.name, view=[])
        )
        with patch.object(
            foss,
            "_paginate_ordered",
            side_effect=GraphQLError("budget exceeded"),
        ):
            self.assertIsNone(await opened.first_page(count=5))

    async def test_mismatched_view_raises(self):
        opened = foss.get_service().open(
            OrderSpec(dataset=self.dataset.name, stages=[], sort_by="t"),
            Budget(),
        )
        stages = self.dataset.match(F("bucket") == 1)._serialize()
        with self.assertRaises(GraphQLError) as cm:
            await foss.paginate_samples(
                self.dataset.name, stages, None, 5, order=opened.token
            )
        self.assertEqual(cm.exception.extensions["code"], "ORDER_MISMATCH")


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
