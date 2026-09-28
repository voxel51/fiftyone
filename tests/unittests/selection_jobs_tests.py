"""Background selection work, cancellation and recovery regression tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime, timedelta, timezone
from itertools import count
from types import SimpleNamespace
import unittest
import time
from unittest.mock import patch
from uuid import uuid4

from bson import ObjectId
from pymongo.collection import Collection

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.core.subsets as fosub
from contextvars import ContextVar

import fiftyone.core.selection_context as fosc

_actor = ContextVar("selection_test_actor", default=None)
import fiftyone.server.selection as foss
import fiftyone.server.selection_jobs as jobs


class SelectionJobsTests(unittest.TestCase):
    def setUp(self):
        actor_provider = patch.object(fosc, "get_actor", _actor.get)
        actor_provider.start()
        self.addCleanup(actor_provider.stop)
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [fo.Sample(filepath="/tmp/job-%d.jpg" % i) for i in range(12)]
        )
        self.subset = fosub.create_subset(self.dataset, "Background")
        self.owner = _actor.set("owner")
        self.schedule_patch = patch.object(jobs, "_schedule")
        self.schedule = self.schedule_patch.start()
        self.addCleanup(self.schedule_patch.stop)

    def tearDown(self):
        _actor.reset(self.owner)
        self.dataset.delete()

    def start(self, kind, request):
        return jobs.start_job(
            self.dataset,
            {
                "id": str(uuid4()),
                "kind": kind,
                "request": request,
            },
        )

    def finish(self, job):
        jobs._run_job(self.dataset, job["id"])
        return jobs.get_job(self.dataset, job["id"])

    def test_start_returns_before_work_and_rejects_reused_request(self):
        request = {"id": "fixed", "kind": "snapshot", "request": {}}
        first = jobs.start_job(self.dataset, request)
        self.assertEqual(first["state"], "requested")
        self.assertIsNone(first["result"])
        self.assertEqual(jobs.start_job(self.dataset, request), first)
        with self.assertRaisesRegex(ValueError, "another request"):
            jobs.start_job(self.dataset, {**request, "kind": "scope"})
        final = self.finish(first)
        self.assertEqual(final["state"], "completed")
        self.assertEqual(final["result"]["counts"]["episodes"], 12)

    def test_job_reads_and_cancellation_are_owner_scoped(self):
        job = self.start("snapshot", {})
        token = _actor.set("another-user")
        try:
            for method in (jobs.get_job, jobs.cancel_job, jobs.retry_job):
                with self.assertRaisesRegex(ValueError, "not available"):
                    method(self.dataset, job["id"])
        finally:
            _actor.reset(token)
        self.assertEqual(
            jobs.cancel_job(self.dataset, job["id"])["state"], "canceled"
        )
        self.assertEqual(self.finish(job)["state"], "canceled")

    def test_write_permission_is_checked_before_queuing(self):
        with patch.object(
            fosc, "check_access", side_effect=PermissionError("Denied")
        ) as access, self.assertRaises(PermissionError):
            jobs.start_job(
                self.dataset, {"id": "no", "kind": "add", "request": {}}
            )
        access.assert_called_once_with(self.dataset, "edit")

    def test_cancel_retains_partial_writes_and_retry_uses_same_capture(self):
        snapshot = foss.create_snapshot(self.dataset, {})
        job = self.start(
            "add",
            {
                "subsetId": self.subset["id"],
                "operationId": str(uuid4()),
                "snapshotId": snapshot["snapshotId"],
            },
        )
        original = fosub._insert_batch
        calls = 0

        def cancel_after_write(collection, docs):
            nonlocal calls
            original(collection, docs)
            if collection.name == "subset_members":
                calls += 1
                if calls == 1:
                    jobs.cancel_job(self.dataset, job["id"])

        with patch.object(fosub, "_BATCH_SIZE", 3), patch.object(
            fosub, "_insert_batch", cancel_after_write
        ), patch.object(jobs.time, "monotonic", side_effect=count()):
            stopped = self.finish(job)
        self.assertEqual(stopped["state"], "canceled")
        self.assertEqual(stopped["progress"]["added"], 3)
        self.assertEqual(
            len(fosub.subset_members(self.dataset, self.subset["id"])), 3
        )
        # An expired capture must not prevent retrying fully prepared candidates.
        foo.get_db_conn().selection_snapshots.delete_one(
            {"_id": ObjectId(snapshot["snapshotId"])}
        )
        self.dataset.add_sample(fo.Sample(filepath="/tmp/after-capture.jpg"))
        retry = jobs.retry_job(self.dataset, job["id"])
        self.assertNotEqual(retry["id"], job["id"])
        final = self.finish(retry)
        self.assertEqual(final["state"], "completed")
        self.assertEqual(final["result"]["added"], 12)
        self.assertEqual(
            len(fosub.subset_members(self.dataset, self.subset["id"])), 12
        )
        self.assertEqual(self.finish(retry)["result"], final["result"])

    def test_expired_worker_is_failed_without_silently_recapturing(self):
        job = self.start("snapshot", {})
        coordinator = jobs._coordinator(self.dataset)
        claimed = coordinator.claim(job["id"])
        claimed["lease_expires_at"] = datetime.now(timezone.utc) - timedelta(
            minutes=1
        )
        coordinator._store.set(job["id"], claimed)
        failed = jobs.get_job(self.dataset, job["id"])
        self.assertEqual(failed["state"], "failed")
        self.assertIn("worker stopped", failed["error"])

    def test_queued_add_retains_snapshot_for_the_retry_window(self):
        snapshot = foss.create_snapshot(self.dataset, {})
        self.start(
            "add",
            {
                "subsetId": self.subset["id"],
                "operationId": str(uuid4()),
                "snapshotId": snapshot["snapshotId"],
            },
        )
        doc = foss.snapshot_info(self.dataset, snapshot["snapshotId"])
        self.assertGreater(
            doc["expires_at"].replace(tzinfo=timezone.utc),
            datetime.now(timezone.utc) + timedelta(days=6),
        )
        chunks = list(
            foo.get_db_conn().selection_snapshot_members.find(
                {"snapshot_id": doc["_id"]}
            )
        )
        self.assertEqual(sum(chunk["count"] for chunk in chunks), 12)
        self.assertTrue(
            all(chunk["expires_at"] == doc["expires_at"] for chunk in chunks)
        )

    def test_canceling_capture_cleans_its_partial_chunks(self):
        job = self.start("snapshot", {})
        original = Collection.insert_one

        def cancel_after_chunk(collection, doc, *args, **kwargs):
            result = original(collection, doc, *args, **kwargs)
            if collection.name == "selection_snapshot_members":
                jobs.cancel_job(self.dataset, job["id"])
            return result

        with patch.object(foss, "SNAPSHOT_CHUNK", 3), patch.object(
            Collection, "insert_one", cancel_after_chunk
        ), patch.object(jobs.time, "monotonic", side_effect=count()):
            stopped = self.finish(job)
        self.assertEqual(stopped["state"], "canceled")
        self.assertEqual(
            foo.get_db_conn().selection_snapshot_members.count_documents(
                {"_dataset_id": self.dataset._doc.id}
            ),
            0,
        )

    def test_executor_preserves_each_request_actor(self):
        self.schedule_patch.stop()
        for actor, sample_id in zip(
            ("first-owner", "second-owner"), self.dataset.values("id")[:2]
        ):
            token = _actor.set(actor)
            try:
                job = self.start(
                    "add",
                    {
                        "subsetId": self.subset["id"],
                        "operationId": str(uuid4()),
                        "members": [
                            {"episodeId": sample_id, "kind": "episode"}
                        ],
                    },
                )
                deadline = time.monotonic() + 5
                while (
                    job["state"] in {"requested", "running"}
                    and time.monotonic() < deadline
                ):
                    time.sleep(0.02)
                    job = jobs.get_job(self.dataset, job["id"])
                self.assertEqual(job["state"], "completed", job)
                self.assertEqual(
                    fosub.get_subset(self.dataset, self.subset["id"])[
                        "last_modified_by"
                    ],
                    actor,
                )
            finally:
                _actor.reset(token)

    def test_picker_does_not_count_member_collections(self):
        with patch.object(
            fosub,
            "subset_counts",
            side_effect=AssertionError("expensive count"),
        ):
            page = fosub.browse_subsets(self.dataset, counts=False)
            metadata = fosub.subset_summary(
                self.dataset, self.subset["id"], counts=False
            )
        self.assertIsNone(metadata["counts"])
        self.assertEqual(metadata["name"], "Background")
        self.assertIsNone(page["subsets"][0]["counts"])
        self.assertEqual(page["subsets"][0]["kinds"], [])
