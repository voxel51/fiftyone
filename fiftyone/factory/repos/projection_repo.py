"""
FiftyOne multimodal projection plan and job repository.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from datetime import datetime
import logging
from typing import List, Optional

import pymongo
from pymongo import IndexModel
from pymongo.collection import Collection

from fiftyone.factory.repos.projection_plan_doc import (
    ManifestPlanDocument,
    ProjectionJobDocument,
)
from fiftyone.multimodal.projection.compiler.model import (
    CompiledPlan,
    JobStatus,
    ProjectionJob,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------


class ProjectionRepo(object):
    """Base class for the projection plan + job repository."""

    # Plans

    def save_plan(self, plan: CompiledPlan) -> ManifestPlanDocument:
        raise NotImplementedError

    def get_current_plan(
        self, dataset_id: str
    ) -> Optional[ManifestPlanDocument]:
        raise NotImplementedError

    def get_plan(self, plan_id: str) -> Optional[ManifestPlanDocument]:
        raise NotImplementedError

    def list_plans(self, dataset_id: str) -> List[ManifestPlanDocument]:
        raise NotImplementedError

    # Jobs

    def save_jobs(
        self, jobs: List[ProjectionJob]
    ) -> List[ProjectionJobDocument]:
        raise NotImplementedError

    def get_job(self, job_id: str) -> Optional[ProjectionJobDocument]:
        raise NotImplementedError

    def list_jobs(
        self,
        plan_id: Optional[str] = None,
        dataset_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[ProjectionJobDocument]:
        raise NotImplementedError

    def update_job_status(
        self,
        job_id: str,
        status: JobStatus,
        error: Optional[str] = None,
    ) -> ProjectionJobDocument:
        raise NotImplementedError

    def update_episode_status(
        self,
        job_id: str,
        episode_path: str,
        status: str,
    ) -> ProjectionJobDocument:
        raise NotImplementedError

    def get_all_episode_paths(self, plan_id: str) -> set:
        raise NotImplementedError

    def get_next_batch_index(self, plan_id: str) -> int:
        raise NotImplementedError

    def set_delegated_operation_id(
        self,
        job_id: str,
        delegated_operation_id: str,
    ) -> ProjectionJobDocument:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# MongoDB implementation
# ---------------------------------------------------------------------------


class MongoProjectionRepo(ProjectionRepo):
    PLANS_COLLECTION = "multimodal_manifest_plans"
    JOBS_COLLECTION = "multimodal_projection_jobs"

    def __init__(
        self,
        plans_collection: Collection = None,
        jobs_collection: Collection = None,
    ):
        self._plans = (
            plans_collection
            if plans_collection is not None
            else self._get_collection(self.PLANS_COLLECTION)
        )
        self._jobs = (
            jobs_collection
            if jobs_collection is not None
            else self._get_collection(self.JOBS_COLLECTION)
        )
        self._create_indexes()

    def _get_collection(self, name: str) -> Collection:
        import fiftyone.core.odm as foo

        return foo.get_db_conn()[name]

    def _create_indexes(self):
        self._create_plan_indexes()
        self._create_job_indexes()

    def _create_plan_indexes(self):
        existing = [idx["name"] for idx in self._plans.list_indexes()]
        to_create = []

        if "plan_id_1" not in existing:
            to_create.append(
                IndexModel(
                    [("plan_id", pymongo.ASCENDING)],
                    name="plan_id_1",
                    unique=True,
                )
            )
        if "dataset_id_1" not in existing:
            to_create.append(
                IndexModel(
                    [("dataset_id", pymongo.ASCENDING)],
                    name="dataset_id_1",
                )
            )
        if "dataset_id_1_is_current_1" not in existing:
            to_create.append(
                IndexModel(
                    [
                        ("dataset_id", pymongo.ASCENDING),
                        ("is_current", pymongo.ASCENDING),
                    ],
                    name="dataset_id_1_is_current_1",
                )
            )

        if to_create:
            self._plans.create_indexes(to_create)

    def _create_job_indexes(self):
        existing = [idx["name"] for idx in self._jobs.list_indexes()]
        to_create = []

        if "job_id_1" not in existing:
            to_create.append(
                IndexModel(
                    [("job_id", pymongo.ASCENDING)],
                    name="job_id_1",
                    unique=True,
                )
            )
        if "plan_id_1" not in existing:
            to_create.append(
                IndexModel(
                    [("plan_id", pymongo.ASCENDING)],
                    name="plan_id_1",
                )
            )
        if "dataset_id_1" not in existing:
            to_create.append(
                IndexModel(
                    [("dataset_id", pymongo.ASCENDING)],
                    name="dataset_id_1",
                )
            )
        if "plan_id_1_status_1" not in existing:
            to_create.append(
                IndexModel(
                    [
                        ("plan_id", pymongo.ASCENDING),
                        ("status", pymongo.ASCENDING),
                    ],
                    name="plan_id_1_status_1",
                )
            )

        if to_create:
            self._jobs.create_indexes(to_create)

    # ------------------------------------------------------------------
    # Plan operations
    # ------------------------------------------------------------------

    def save_plan(self, plan: CompiledPlan) -> ManifestPlanDocument:
        """Upsert the plan and mark it as the current plan for its dataset.

        Any previously current plans for the same dataset_id are demoted
        (is_current set to False) before the new plan is set as current.
        """
        # Demote all existing current plans for this dataset.
        self._plans.update_many(
            {"dataset_id": plan.dataset_id, "is_current": True},
            {"$set": {"is_current": False}},
        )

        doc = plan.to_mongo_doc()
        self._plans.update_one(
            {"plan_id": plan.plan_id},
            {"$set": doc},
            upsert=True,
        )

        raw = self._plans.find_one({"plan_id": plan.plan_id})
        return ManifestPlanDocument().from_pymongo(raw)

    def get_current_plan(
        self, dataset_id: str
    ) -> Optional[ManifestPlanDocument]:
        raw = self._plans.find_one(
            {"dataset_id": dataset_id, "is_current": True}
        )
        if raw is None:
            return None
        return ManifestPlanDocument().from_pymongo(raw)

    def get_plan(self, plan_id: str) -> Optional[ManifestPlanDocument]:
        raw = self._plans.find_one({"plan_id": plan_id})
        if raw is None:
            return None
        return ManifestPlanDocument().from_pymongo(raw)

    def list_plans(self, dataset_id: str) -> List[ManifestPlanDocument]:
        cursor = self._plans.find(
            {"dataset_id": dataset_id},
            sort=[("compiled_at", pymongo.DESCENDING)],
        )
        return [ManifestPlanDocument().from_pymongo(doc) for doc in cursor]

    # ------------------------------------------------------------------
    # Job operations
    # ------------------------------------------------------------------

    def save_jobs(
        self, jobs: List[ProjectionJob]
    ) -> List[ProjectionJobDocument]:
        """Bulk-insert a list of projection jobs. Returns the persisted docs."""
        if not jobs:
            return []

        docs = [job.to_mongo_doc() for job in jobs]
        result = self._jobs.insert_many(docs)

        cursor = self._jobs.find({"_id": {"$in": result.inserted_ids}})
        return [ProjectionJobDocument().from_pymongo(doc) for doc in cursor]

    def get_job(self, job_id: str) -> Optional[ProjectionJobDocument]:
        raw = self._jobs.find_one({"job_id": job_id})
        if raw is None:
            return None
        return ProjectionJobDocument().from_pymongo(raw)

    def list_jobs(
        self,
        plan_id: Optional[str] = None,
        dataset_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[ProjectionJobDocument]:
        query: dict = {}
        if plan_id is not None:
            query["plan_id"] = plan_id
        if dataset_id is not None:
            query["dataset_id"] = dataset_id
        if status is not None:
            query["status"] = status

        cursor = self._jobs.find(
            query, sort=[("batch_index", pymongo.ASCENDING)]
        )
        return [ProjectionJobDocument().from_pymongo(doc) for doc in cursor]

    def update_job_status(
        self,
        job_id: str,
        status: JobStatus,
        error: Optional[str] = None,
    ) -> ProjectionJobDocument:
        """Transition a job's status and stamp the appropriate timestamp."""
        now = datetime.utcnow()
        update: dict = {"status": status.value, "updated_at": now}

        if status == JobStatus.RUNNING:
            update["started_at"] = now
        elif status in (
            JobStatus.COMPLETED,
            JobStatus.FAILED,
            JobStatus.PARTIAL,
        ):
            update["completed_at"] = now

        # Always write the error field at terminal states so stale errors from
        # a prior failed run are cleared when the job is re-run successfully.
        if status in (
            JobStatus.COMPLETED,
            JobStatus.FAILED,
            JobStatus.PARTIAL,
        ):
            update["error"] = error

        doc = self._jobs.find_one_and_update(
            {"job_id": job_id},
            {"$set": update},
            return_document=pymongo.ReturnDocument.AFTER,
        )
        if doc is None:
            raise ValueError(f"No job found with job_id={job_id!r}")
        return ProjectionJobDocument().from_pymongo(doc)

    def update_episode_status(
        self,
        job_id: str,
        episode_path: str,
        status: str,
    ) -> ProjectionJobDocument:
        """Update the per-episode status within a batch job.

        episode_status is stored as [{path, status}] in MongoDB so that
        episode paths (which contain dots, slashes, etc.) are never used as
        field names. arrayFilters targets the matching element by path.
        """
        doc = self._jobs.find_one_and_update(
            {"job_id": job_id, "episode_status.path": episode_path},
            {
                "$set": {
                    "episode_status.$[ep].status": status,
                    "updated_at": datetime.utcnow(),
                }
            },
            array_filters=[{"ep.path": episode_path}],
            return_document=pymongo.ReturnDocument.AFTER,
        )
        if doc is None:
            raise ValueError(f"No job found with job_id={job_id!r}")
        return ProjectionJobDocument().from_pymongo(doc)

    def get_all_episode_paths(self, plan_id: str) -> set:
        """Return the set of episode paths already assigned to any job for this plan."""
        cursor = self._jobs.find({"plan_id": plan_id}, {"episode_paths": 1})
        covered: set = set()
        for doc in cursor:
            covered.update(doc.get("episode_paths", []))
        return covered

    def get_next_batch_index(self, plan_id: str) -> int:
        """Return the next available batch_index for a plan (max existing + 1, or 0)."""
        doc = self._jobs.find_one(
            {"plan_id": plan_id},
            sort=[("batch_index", pymongo.DESCENDING)],
        )
        return (doc["batch_index"] + 1) if doc else 0

    def set_delegated_operation_id(
        self,
        job_id: str,
        delegated_operation_id: str,
    ) -> ProjectionJobDocument:
        """Attach a Teams delegated operation ID to a job document."""
        doc = self._jobs.find_one_and_update(
            {"job_id": job_id},
            {"$set": {"delegated_operation_id": delegated_operation_id}},
            return_document=pymongo.ReturnDocument.AFTER,
        )
        if doc is None:
            raise ValueError(f"No job found with job_id={job_id!r}")
        return ProjectionJobDocument().from_pymongo(doc)
