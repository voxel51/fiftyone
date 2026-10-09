"""
FiftyOne Server order backend tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import datetime
import random
import string
import unittest
from unittest.mock import patch

from bson import ObjectId
from graphql import GraphQLError

import fiftyone as fo
from fiftyone import ViewField as F
import fiftyone.core.utils as fou

from fiftyone.server.order.backend import (
    Budget,
    Direction,
    OrderSpec,
    Reason,
    SeekTarget,
    Strategy,
)
from fiftyone.server.order.labels import format_label
from fiftyone.server.order.mongo import MongoOrderBackend
from fiftyone.server.order.positions import decode_token
from fiftyone.server.order.service import OrderService
import fiftyone.server.samples as foss

N = 400
PAGE = 7
FIELDS = ["u", "t", "s", "n", "str", "d"]


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


def _first_past(expected, values, value, desc):
    """The rank of the first sample at or past ``value`` in view order."""
    for rank, _id in enumerate(expected):
        v = values[_id]
        if value is None:
            if desc and v is None or not desc:
                return rank
        elif v is None:
            if desc:
                return rank
        elif (v <= value) if desc else (v >= value):
            return rank

    return len(expected)


class OrderBackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = _make_dataset()
        cls.backend = MongoOrderBackend()

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def _open(self, sort_by=None, desc=False, stages=None):
        spec = OrderSpec(
            dataset=self.dataset.name,
            stages=stages or [],
            sort_by=sort_by,
            desc=desc,
        )
        return self.backend.open(spec, Budget())

    def _walk_forward(self, handle, position=None):
        ids, ranks = [], []
        while True:
            page = self.backend.page(handle, position, Direction.FORWARD, PAGE)
            ids += page.ids
            ranks += page.ranks
            if not page.has_more:
                return ids, ranks

            position = page.positions[-1]

    def _walk_backward(self, handle, position=None):
        ids, ranks = [], []
        while True:
            page = self.backend.page(
                handle, position, Direction.BACKWARD, PAGE
            )
            ids = page.ids + ids
            ranks = page.ranks + ranks
            if not page.has_more:
                return ids, ranks

            position = page.positions[0]

    def test_full_walks(self):
        for field in FIELDS + [None]:
            for desc in (False, True):
                with self.subTest(field=field, desc=desc):
                    handle = self._open(field, desc)
                    self.assertEqual(handle.plan.strategy, Strategy.LIVE)
                    self.assertEqual(handle.total, N)
                    expected = _expected(self.dataset, field, desc)

                    ids, ranks = self._walk_forward(handle)
                    self.assertEqual(ids, expected)
                    self.assertEqual(ranks, list(range(N)))

                    ids, ranks = self._walk_backward(handle)
                    self.assertEqual(ids, expected)
                    self.assertEqual(ranks, list(range(N)))

    def test_boundaries(self):
        for field in FIELDS + [None]:
            for desc in (False, True):
                with self.subTest(field=field, desc=desc):
                    handle = self._open(field, desc)
                    expected = _expected(self.dataset, field, desc)
                    stored = self.backend.boundaries(handle, 1000)
                    self.assertEqual(
                        [b.rank for b in stored], list(range(0, N, 20))
                    )

                    values = dict(
                        zip(
                            [ObjectId(i) for i in self.dataset.values("id")],
                            (
                                self.dataset.values(field)
                                if field
                                else [None] * N
                            ),
                        )
                    )
                    for b in stored:
                        self.assertEqual(b.value, values[expected[b.rank]])

                    picked = self.backend.boundaries(handle, 4)
                    self.assertEqual(
                        [b.rank for b in picked], [0, 100, 200, 300]
                    )

    def test_rank_seek_is_exact(self):
        for field in ("t", "s", "n", "str", None):
            for desc in (False, True):
                with self.subTest(field=field, desc=desc):
                    handle = self._open(field, desc)
                    expected = _expected(self.dataset, field, desc)
                    for rank in (0, 1, 19, 20, 201, N - 1, N + 50, -3):
                        target = SeekTarget(rank=rank)
                        position, landed = self.backend.seek(handle, target)
                        self.assertEqual(landed, min(max(rank, 0), N - 1))

                        page = self.backend.page(
                            handle, position, Direction.FORWARD, PAGE
                        )
                        stop = min(landed + PAGE, N)
                        self.assertEqual(page.ids, expected[landed:stop])
                        self.assertEqual(page.ranks, list(range(landed, stop)))

                        page = self.backend.page(
                            handle, position, Direction.BACKWARD, PAGE
                        )
                        start = max(landed - PAGE, 0)
                        self.assertEqual(page.ids, expected[start:landed])
                        self.assertEqual(
                            page.ranks, list(range(start, landed))
                        )
                        self.assertEqual(page.has_more, start > 0)

    def test_fraction_seek(self):
        handle = self._open("u")
        seek = lambda f: self.backend.seek(handle, SeekTarget(fraction=f))[1]
        self.assertEqual(seek(0.0), 0)
        self.assertEqual(seek(0.5), 200)
        self.assertEqual(seek(1.0), N - 1)
        self.assertEqual(seek(2.0), N - 1)

    def test_value_seek(self):
        cases = [
            ("t", 4),
            ("t", 3.5),
            ("s", 1000000),
            ("s", 2),
            ("n", None),
            ("n", 2),
            ("str", "m"),
            ("u", 0.25),
        ]
        for field, value in cases:
            for desc in (False, True):
                with self.subTest(field=field, value=value, desc=desc):
                    handle = self._open(field, desc)
                    expected = _expected(self.dataset, field, desc)
                    values = dict(
                        zip(
                            [ObjectId(i) for i in self.dataset.values("id")],
                            self.dataset.values(field),
                        )
                    )
                    rank = _first_past(expected, values, value, desc)
                    target = SeekTarget(value=value, has_value=True)
                    position, landed = self.backend.seek(handle, target)
                    self.assertEqual(landed, rank)

                    page = self.backend.page(
                        handle, position, Direction.FORWARD, PAGE
                    )
                    stop = min(rank + PAGE, N)
                    self.assertEqual(page.ids, expected[rank:stop])
                    self.assertEqual(page.ranks, list(range(rank, stop)))

                    page = self.backend.page(
                        handle, position, Direction.BACKWARD, PAGE
                    )
                    start = max(rank - PAGE, 0)
                    self.assertEqual(page.ids, expected[start:rank])

    def test_value_seek_on_dates(self):
        handle = self._open("d")
        expected = _expected(self.dataset, "d", False)
        values = dict(
            zip(
                [ObjectId(i) for i in self.dataset.values("id")],
                self.dataset.values("d"),
            )
        )
        when = datetime.datetime(2023, 1, 1)
        timestamp = fou.datetime_to_timestamp(when)
        target = SeekTarget(value=timestamp, has_value=True)
        _, landed = self.backend.seek(handle, target)
        self.assertEqual(landed, _first_past(expected, values, when, False))

    def test_walk_from_a_seek_covers_the_rest(self):
        handle = self._open("s")
        expected = _expected(self.dataset, "s", False)
        position, landed = self.backend.seek(handle, SeekTarget(rank=243))
        ids, ranks = self._walk_forward(handle, position)
        self.assertEqual(landed, 243)
        self.assertEqual(ids, expected[243:])
        self.assertEqual(ranks, list(range(243, N)))

        ids, ranks = self._walk_backward(handle, position)
        self.assertEqual(ids, expected[:243])
        self.assertEqual(ranks, list(range(243)))

    def test_match_view(self):
        stages = self.dataset.match(F("bucket") == 1)._serialize()
        handle = self._open("t", stages=stages)
        view = self.dataset.match(F("bucket") == 1)
        self.assertEqual(handle.plan.strategy, Strategy.LIVE)
        self.assertEqual(handle.total, N // 2)
        ids, ranks = self._walk_forward(handle)
        self.assertEqual(ids, _expected(view, "t", False))
        self.assertEqual(ranks, list(range(N // 2)))

    def test_unindexed_sort_is_unavailable(self):
        self.dataset.add_sample_field("w", fo.FloatField)
        handle = self._open("w")
        self.assertEqual(handle.plan.supports_random_access, False)
        self.assertEqual(handle.plan.reason, Reason.UNSUPPORTED_STAGE)
        self.assertEqual(handle.total, 0)

    def test_blocking_view_is_unavailable(self):
        stages = self.dataset.shuffle(seed=1)._serialize()
        handle = self._open(None, stages=stages)
        self.assertEqual(handle.plan.supports_random_access, False)
        self.assertEqual(handle.plan.reason, Reason.UNSUPPORTED_STAGE)

        stages = self.dataset.sort_by("u")._serialize()
        handle = self._open(None, stages=stages)
        self.assertEqual(handle.plan.supports_random_access, False)

    def test_version_changes_on_edit(self):
        handle = self._open("u")
        before = self.backend.version(handle)
        self.assertEqual(before, handle.version)
        self.assertEqual(self.backend.version(handle), before)
        sample = self.dataset.first()
        sample["bucket"] = 7
        sample.save()
        self.assertNotEqual(self.backend.version(handle), before)


class OrderServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = _make_dataset()

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    def test_token_round_trip_and_mismatch(self):
        service = OrderService(MongoOrderBackend())
        spec = OrderSpec(
            dataset=self.dataset.name,
            stages=[],
            sort_by="t",
            extended_stages={"fiftyone.core.stages.SortBy": {"x": 1}},
        )
        opened = service.open(spec)
        decoded, version = decode_token(opened.token)
        self.assertEqual(decoded.digest(), spec.digest())
        self.assertEqual(version, opened.handle.version)

        # a fresh service serves a token it did not open
        other = OrderService(MongoOrderBackend())
        position, landed = other.seek(opened.token, SeekTarget(fraction=0.5))
        half = len(self.dataset) // 2
        self.assertEqual(landed, half)

        view_spec = OrderSpec(dataset=self.dataset.name, stages=[])
        _, page, version = other.page(
            opened.token, view_spec, position, Direction.FORWARD, 3
        )
        self.assertEqual(page.ranks, [half, half + 1, half + 2])
        self.assertEqual(version, opened.handle.version)

        _, page, _ = other.page(
            opened.token,
            view_spec,
            None,
            Direction.BACKWARD,
            3,
            seek=SeekTarget(rank=17),
        )
        self.assertEqual(page.ranks, [17, 18, 19])

        stages = self.dataset.match(F("bucket") == 1)._serialize()
        with self.assertRaises(Exception) as cm:
            other.page(
                opened.token,
                OrderSpec(dataset=self.dataset.name, stages=stages),
                None,
                Direction.FORWARD,
                3,
            )
        self.assertEqual(cm.exception.code, "ORDER_MISMATCH")

        with self.assertRaises(Exception) as cm:
            other.page(
                opened.token, view_spec, "not-a-position", Direction.FORWARD, 3
            )
        self.assertEqual(cm.exception.code, "BAD_POSITION")

        with self.assertRaises(Exception) as cm:
            other.seek("garbage", SeekTarget(rank=1))
        self.assertEqual(cm.exception.code, "ORDER_EXPIRED")

    def test_status(self):
        service = OrderService(MongoOrderBackend())
        spec = OrderSpec(dataset=self.dataset.name, stages=[], sort_by="u")
        opened = service.open(spec)
        status = service.status(opened.token)
        self.assertEqual(status.stale, False)
        self.assertEqual(status.total, N)

        self.dataset.delete_samples(self.dataset.first())
        status = service.status(opened.token)
        self.assertEqual(status.stale, True)


class PaginateOrderedTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = _make_dataset()

    @classmethod
    def tearDownClass(cls):
        cls.dataset.delete()

    async def test_edges_carry_positions_and_ranks(self):
        opened = foss.get_service().open(
            OrderSpec(dataset=self.dataset.name, stages=[], sort_by="t")
        )
        expected = _expected(self.dataset, "t", False)

        async def shape(view, samples, pagination_data):
            return [{"_id": sample["_id"]} for sample in samples]

        with patch.object(foss, "_shape_nodes", new=shape):
            first = await foss.paginate_samples(
                self.dataset.name, [], None, 5, order=opened.token
            )
            second = await foss.paginate_samples(
                self.dataset.name,
                [],
                None,
                5,
                after=first.page_info.end_cursor,
                order=opened.token,
            )
            back = await foss.paginate_samples(
                self.dataset.name,
                [],
                None,
                5,
                before=second.page_info.start_cursor,
                order=opened.token,
            )
            jumped = await foss.paginate_samples(
                self.dataset.name,
                [],
                None,
                5,
                order=opened.token,
                seek=SeekTarget(rank=123),
            )

        self.assertEqual([e.node["_id"] for e in first.edges], expected[:5])
        self.assertEqual([e.rank for e in first.edges], [0, 1, 2, 3, 4])
        self.assertEqual(first.page_info.has_previous_page, False)
        self.assertEqual(first.page_info.has_next_page, True)
        self.assertEqual(first.total, N)
        self.assertEqual([e.node["_id"] for e in second.edges], expected[5:10])
        self.assertEqual([e.rank for e in second.edges], [5, 6, 7, 8, 9])
        self.assertEqual(second.page_info.has_previous_page, True)
        self.assertEqual([e.node["_id"] for e in back.edges], expected[:5])
        self.assertEqual(back.page_info.has_previous_page, False)
        self.assertEqual(back.page_info.has_next_page, True)
        self.assertEqual(first.order_version, opened.handle.version)
        self.assertEqual(
            [e.node["_id"] for e in jumped.edges], expected[123:128]
        )
        self.assertEqual(
            [e.rank for e in jumped.edges], [123, 124, 125, 126, 127]
        )
        self.assertEqual(jumped.page_info.has_previous_page, True)
        self.assertEqual(jumped.page_info.has_next_page, True)

    async def test_mismatched_view_raises(self):
        opened = foss.get_service().open(
            OrderSpec(dataset=self.dataset.name, stages=[], sort_by="t")
        )
        stages = self.dataset.match(F("bucket") == 1)._serialize()
        with self.assertRaises(GraphQLError) as cm:
            await foss.paginate_samples(
                self.dataset.name, stages, None, 5, order=opened.token
            )
        self.assertEqual(cm.exception.extensions["code"], "ORDER_MISMATCH")


class LabelTests(unittest.TestCase):
    def test_labels(self):
        self.assertEqual(format_label(12345.6, 0, True), "12.3k")
        self.assertEqual(format_label(4500000, 0, True), "4.5M")
        self.assertEqual(format_label(0.123456, 0, True), "0.123")
        self.assertEqual(format_label(7, 0, True), "7")
        self.assertEqual(format_label(None, 0, True), "None")
        self.assertEqual(format_label(True, 0, True), "True")
        self.assertEqual(
            format_label(datetime.datetime(2024, 3, 9), 0, True), "Mar 2024"
        )
        self.assertEqual(format_label("x" * 30, 0, True), "x" * 23 + "…")
        self.assertEqual(format_label(None, 1999, False), "2k")


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
