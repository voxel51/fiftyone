"""
FiftyOne Server paging under data changes: samples deleted between pages.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import random
import unittest
from unittest.mock import patch

from bson import ObjectId
import pytest

import fiftyone as fo
from fiftyone import ViewField as F

from fiftyone.server.order.backend import (
    Budget,
    Direction,
    OrderSpec,
    SeekTarget,
)
from fiftyone.server.order.mongo import MongoOrderBackend
from fiftyone.server.order.service import OrderService
import fiftyone.server.samples as foss

N = 60
PAGE = 5


def _make_dataset():
    rnd = random.Random(51)
    dataset = fo.Dataset()
    dataset.add_samples(
        [
            fo.Sample(
                filepath="/tmp/data_changes_%04d.jpg" % i,
                u=rnd.random(),
                # blocks of 4 equal values, so a block spans a page boundary
                t=i // 4,
                bucket=i % 2,
            )
            for i in range(N)
        ]
    )
    dataset.create_index("u")
    dataset.create_index("t")
    return dataset


def _order(dataset, field):
    """The order contract: value, then id."""
    rows = zip(
        dataset.values(field), [ObjectId(i) for i in dataset.values("id")]
    )
    return [_id for _, _id in sorted(rows)]


async def _shape(view, samples, pagination_data):
    return [{"_id": sample["_id"]} for sample in samples]


def _ids(connection):
    return [edge.node["_id"] for edge in connection.edges]


def _duplicates(ids):
    return [_id for i, _id in enumerate(ids) if _id in ids[:i]]


class SkipPagingDeletionTests(unittest.IsolatedAsyncioTestCase):
    """Default grid paging: ``after`` is an index and pages ``$skip``."""

    def setUp(self):
        self.dataset = _make_dataset()
        self.patch = patch.object(foss, "_shape_nodes", new=_shape)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.dataset.delete()

    async def _page(self, page):
        after = str(page * PAGE - 1) if page else None
        return await foss.paginate_samples(
            self.dataset.name, [], None, PAGE, after=after
        )

    @pytest.mark.xfail(
        strict=True,
        reason="skip paging: a deletion on an earlier page shifts every "
        "later offset, so the first sample of the next page is never served",
    )
    async def test_next_page_after_a_deletion_serves_every_survivor(self):
        first = _ids(await self._page(0))
        self.dataset.delete_samples(str(first[2]))
        second = _ids(await self._page(1))

        survivors = [ObjectId(i) for i in self.dataset.values("id")]
        shown = [i for i in first + second if i != first[2]]
        self.assertEqual(shown, survivors[: 2 * PAGE - 1])

    @pytest.mark.xfail(
        strict=True,
        reason="skip paging: a page fetched backward after a deletion "
        "overlaps the cached page after it by one sample",
    )
    async def test_previous_page_after_a_deletion_repeats_nothing(self):
        three = _ids(await self._page(3))
        before = [ObjectId(i) for i in self.dataset.values("id")]
        self.dataset.delete_samples(str(before[0]))
        two = _ids(await self._page(2))

        self.assertEqual(_duplicates(two + three), [])

    @pytest.mark.xfail(
        strict=True,
        reason="the value cursor (cursor_pagination) seeks $gt the last "
        "value, so the rest of a tie block at a page boundary is skipped",
    )
    async def test_value_cursor_serves_every_sample(self):
        ids, after = [], None
        while True:
            page = await foss.paginate_samples(
                self.dataset.name,
                [],
                None,
                PAGE,
                after=after,
                sort_by="t",
                cursor_pagination=True,
            )
            ids += _ids(page)
            if not page.page_info.has_next_page:
                break

            after = page.page_info.end_cursor

        self.assertEqual(len(ids), N)


class OrderDeletionTests(unittest.TestCase):
    """LIVE orders page by ``(value, _id)`` positions."""

    def setUp(self):
        self.dataset = _make_dataset()
        self.backend = MongoOrderBackend()

    def tearDown(self):
        self.dataset.delete()

    def _spec(self, stages=None):
        return OrderSpec(
            dataset=self.dataset.name, stages=stages or [], sort_by="u"
        )

    def _walk_with_deletion(self):
        """Walks forward, deleting the sample the position names and one
        before it after the second page."""
        handle = self.backend.open(self._spec(), Budget())
        expected = _order(self.dataset, "u")
        ids, ranks, position, pages = [], [], None, 0
        while True:
            page = self.backend.page(handle, position, Direction.FORWARD, PAGE)
            ids += page.ids
            ranks += page.ranks
            pages += 1
            if pages == 2:
                deleted = [page.ids[-1], expected[0]]
                self.dataset.delete_samples([str(i) for i in deleted])
            if not page.has_more:
                break

            position = page.positions[-1]

        return ids, ranks, deleted

    def test_a_walk_continues_past_a_deleted_position(self):
        ids, _, deleted = self._walk_with_deletion()
        survivors = _order(self.dataset, "u")

        self.assertEqual([i for i in ids if i not in deleted], survivors)
        self.assertEqual(_duplicates(ids), [])

    @pytest.mark.xfail(
        strict=True,
        reason="edge ranks count from the position's rank, which was taken "
        "before the deletion; later ranks are off by the samples deleted "
        "before them",
    )
    def test_ranks_after_a_deletion_count_survivors(self):
        ids, ranks, _ = self._walk_with_deletion()
        survivors = _order(self.dataset, "u")
        after = ids[2 * PAGE :]

        self.assertEqual(
            ranks[2 * PAGE :], [survivors.index(i) for i in after]
        )

    @pytest.mark.xfail(
        strict=True,
        reason="OrderService.handle() reuses the cached handle whatever the "
        "version: stale boundaries land a rank seek one sample late",
    )
    def test_rank_seek_after_a_deletion_lands_on_the_rank(self):
        service = OrderService(MongoOrderBackend())
        opened = service.open(self._spec())
        service.seek(opened.token, SeekTarget(rank=40))
        self.dataset.delete_samples(str(_order(self.dataset, "u")[10]))

        survivors = _order(self.dataset, "u")
        _, page, _ = service.page(
            opened.token,
            OrderSpec(dataset=self.dataset.name, stages=[]),
            None,
            Direction.FORWARD,
            3,
            seek=SeekTarget(rank=40),
        )
        self.assertEqual(page.ids, survivors[40:43])
        self.assertEqual(page.ranks, [40, 41, 42])

    @pytest.mark.xfail(
        strict=True,
        reason="orderStatus reports stale but the cached handle's total",
    )
    def test_status_after_a_deletion_reports_the_new_total(self):
        service = OrderService(MongoOrderBackend())
        opened = service.open(self._spec())
        self.dataset.delete_samples(self.dataset.first())

        status = service.status(opened.token)
        self.assertEqual(status.stale, True)
        self.assertEqual(status.total, N - 1)

    def test_a_page_after_a_deletion_reports_a_new_version(self):
        service = OrderService(MongoOrderBackend())
        opened = service.open(self._spec())
        self.dataset.delete_samples(self.dataset.first())

        _, _, version = service.page(
            opened.token,
            OrderSpec(dataset=self.dataset.name, stages=[]),
            None,
            Direction.FORWARD,
            PAGE,
        )
        self.assertNotEqual(version, opened.handle.version)

    @pytest.mark.xfail(
        strict=True,
        reason="the version fingerprints the whole dataset, so an edit "
        "outside the view marks the order stale",
    )
    def test_version_ignores_edits_outside_the_view(self):
        stages = self.dataset.match(F("bucket") == 1)._serialize()
        handle = self.backend.open(self._spec(stages), Budget())
        outside = self.dataset.match(F("bucket") == 0).first()
        outside["u"] = 2.0
        outside.save()

        self.assertEqual(self.backend.version(handle), handle.version)
