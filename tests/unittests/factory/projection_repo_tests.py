"""
Unit tests for MongoProjectionRepo.

The pymongo collections are replaced with MagicMocks so no real database is
required.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime
from unittest.mock import MagicMock, call, patch

import pymongo
import pytest
from bson import ObjectId

from fiftyone.factory.repos.projection_plan_doc import (
    ManifestPlanDocument,
    ProjectionJobDocument,
)
from fiftyone.factory.repos.projection_repo import MongoProjectionRepo
from fiftyone.multimodal.projection.compiler.model import (
    JobStatus,
    ProjectionJob,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_plan_doc(**kwargs):
    base = {
        "_id": ObjectId(),
        "plan_id": "plan-sha256",
        "dataset_id": "ds1",
        "compiled_at": datetime(2026, 1, 1),
        "is_current": True,
        "manifest_source": "",
        "channel_bindings": [],
        "logical_streams": [],
        "projections": [],
        "dag": {"order": [], "levels": {}},
    }
    base.update(kwargs)
    return base


def _make_job_doc(**kwargs):
    base = {
        "_id": ObjectId(),
        "job_id": "job-uuid-1",
        "plan_id": "plan-sha256",
        "dataset_id": "ds1",
        "batch_index": 0,
        "episode_paths": ["ep.mcap"],
        "status": "pending",
        "episode_status": [{"path": "ep.mcap", "status": "pending"}],
        "output_paths": {},
        "created_at": datetime(2026, 1, 1),
        "started_at": None,
        "completed_at": None,
        "error": None,
        "delegated_operation_id": None,
    }
    base.update(kwargs)
    return base


def _mock_collection():
    col = MagicMock()
    col.list_indexes.return_value = []
    return col


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def plans_col():
    return _mock_collection()


@pytest.fixture
def jobs_col():
    return _mock_collection()


@pytest.fixture
def repo(plans_col, jobs_col):
    return MongoProjectionRepo(
        plans_collection=plans_col,
        jobs_collection=jobs_col,
    )


@pytest.fixture
def sample_job():
    return ProjectionJob(
        plan_id="plan-sha256",
        dataset_id="ds1",
        batch_index=0,
        episode_paths=["ep.mcap"],
        output_paths={"obs": "gs://bucket/obs/part-0000.parquet"},
    )


# ---------------------------------------------------------------------------
# Index creation
# ---------------------------------------------------------------------------


class TestIndexCreation:
    def test_creates_plan_indexes_on_init(self, plans_col, jobs_col):
        MongoProjectionRepo(
            plans_collection=plans_col,
            jobs_collection=jobs_col,
        )
        plans_col.create_indexes.assert_called_once()
        created_names = [
            idx.document["name"]
            for idx in plans_col.create_indexes.call_args[0][0]
        ]
        assert "plan_id_1" in created_names
        assert "dataset_id_1" in created_names
        assert "dataset_id_1_is_current_1" in created_names

    def test_creates_job_indexes_on_init(self, plans_col, jobs_col):
        MongoProjectionRepo(
            plans_collection=plans_col,
            jobs_collection=jobs_col,
        )
        jobs_col.create_indexes.assert_called_once()
        created_names = [
            idx.document["name"]
            for idx in jobs_col.create_indexes.call_args[0][0]
        ]
        assert "job_id_1" in created_names
        assert "plan_id_1" in created_names
        assert "plan_id_1_status_1" in created_names

    def test_skips_existing_indexes(self, jobs_col, plans_col):
        plans_col.list_indexes.return_value = [
            {"name": "plan_id_1"},
            {"name": "dataset_id_1"},
            {"name": "dataset_id_1_is_current_1"},
        ]
        jobs_col.list_indexes.return_value = [
            {"name": "job_id_1"},
            {"name": "plan_id_1"},
            {"name": "dataset_id_1"},
            {"name": "plan_id_1_status_1"},
        ]
        MongoProjectionRepo(
            plans_collection=plans_col,
            jobs_collection=jobs_col,
        )
        plans_col.create_indexes.assert_not_called()
        jobs_col.create_indexes.assert_not_called()


# ---------------------------------------------------------------------------
# Plan operations
# ---------------------------------------------------------------------------


class TestSavePlan:
    def test_demotes_existing_current_plans(self, repo, plans_col):
        from fiftyone.multimodal.projection.compiler.emitter import emit_plan
        from fiftyone.multimodal.projection.compiler.parser import (
            parse_manifest,
        )
        from fiftyone.multimodal.projection.compiler.expander import (
            expand_manifest,
        )
        from fiftyone.multimodal.projection.compiler.resolver import (
            resolve_manifest,
        )

        yaml = "channel_bindings: []\nprojections: []"
        resolved = resolve_manifest(expand_manifest(parse_manifest(yaml)))

        # Silence the parse error by using a minimal valid plan via direct emit
        plan_doc_raw = _make_plan_doc()
        plans_col.find_one.return_value = plan_doc_raw

        # Build a real CompiledPlan
        import hashlib, json
        from datetime import datetime
        from fiftyone.multimodal.projection.compiler.model import CompiledPlan

        compiled = CompiledPlan(
            plan_id="plan-abc",
            dataset_id="ds1",
            compiled_at=datetime(2026, 1, 1),
            manifest_source="",
            channel_bindings=[],
            logical_streams=[],
            projections=[],
            dag_order=[],
            dag_levels={},
        )
        repo.save_plan(compiled)

        plans_col.update_many.assert_called_once_with(
            {"dataset_id": "ds1", "is_current": True},
            {"$set": {"is_current": False}},
        )

    def test_upserts_plan_doc(self, repo, plans_col):
        from fiftyone.multimodal.projection.compiler.model import CompiledPlan

        compiled = CompiledPlan(
            plan_id="plan-abc",
            dataset_id="ds1",
            compiled_at=datetime(2026, 1, 1),
            manifest_source="",
            channel_bindings=[],
            logical_streams=[],
            projections=[],
            dag_order=[],
            dag_levels={},
        )
        plans_col.find_one.return_value = _make_plan_doc(plan_id="plan-abc")
        repo.save_plan(compiled)

        plans_col.update_one.assert_called_once()
        filter_doc, update_doc = plans_col.update_one.call_args[0]
        assert filter_doc == {"plan_id": "plan-abc"}
        assert update_doc["$set"]["plan_id"] == "plan-abc"

    def test_returns_manifest_plan_document(self, repo, plans_col):
        from fiftyone.multimodal.projection.compiler.model import CompiledPlan

        compiled = CompiledPlan(
            plan_id="plan-abc",
            dataset_id="ds1",
            compiled_at=datetime(2026, 1, 1),
            manifest_source="",
            channel_bindings=[],
            logical_streams=[],
            projections=[],
            dag_order=[],
            dag_levels={},
        )
        plans_col.find_one.return_value = _make_plan_doc(plan_id="plan-abc")
        result = repo.save_plan(compiled)
        assert isinstance(result, ManifestPlanDocument)
        assert result.plan_id == "plan-abc"


class TestGetPlan:
    def test_returns_none_when_not_found(self, repo, plans_col):
        plans_col.find_one.return_value = None
        assert repo.get_plan("missing") is None

    def test_returns_document_when_found(self, repo, plans_col):
        plans_col.find_one.return_value = _make_plan_doc()
        result = repo.get_plan("plan-sha256")
        assert isinstance(result, ManifestPlanDocument)
        assert result.plan_id == "plan-sha256"

    def test_get_current_plan_queries_is_current(self, repo, plans_col):
        plans_col.find_one.return_value = _make_plan_doc()
        repo.get_current_plan("ds1")
        plans_col.find_one.assert_called_once_with(
            {"dataset_id": "ds1", "is_current": True}
        )

    def test_get_current_plan_returns_none_when_not_found(
        self, repo, plans_col
    ):
        plans_col.find_one.return_value = None
        assert repo.get_current_plan("ds1") is None


class TestListPlans:
    def test_returns_list_of_documents(self, repo, plans_col):
        plans_col.find.return_value = [
            _make_plan_doc(),
            _make_plan_doc(plan_id="plan-2"),
        ]
        results = repo.list_plans("ds1")
        assert len(results) == 2
        assert all(isinstance(r, ManifestPlanDocument) for r in results)

    def test_queries_by_dataset_id(self, repo, plans_col):
        plans_col.find.return_value = []
        repo.list_plans("ds1")
        plans_col.find.assert_called_once_with(
            {"dataset_id": "ds1"},
            sort=[("compiled_at", pymongo.DESCENDING)],
        )


# ---------------------------------------------------------------------------
# Job operations
# ---------------------------------------------------------------------------


class TestSaveJobs:
    def test_empty_list_returns_empty(self, repo):
        result = repo.save_jobs([])
        assert result == []

    def test_inserts_all_jobs(self, repo, jobs_col, sample_job):
        inserted_id = ObjectId()
        jobs_col.insert_many.return_value = MagicMock(
            inserted_ids=[inserted_id]
        )
        jobs_col.find.return_value = [_make_job_doc()]
        repo.save_jobs([sample_job])
        jobs_col.insert_many.assert_called_once()
        inserted_docs = jobs_col.insert_many.call_args[0][0]
        assert len(inserted_docs) == 1
        assert inserted_docs[0]["plan_id"] == "plan-sha256"

    def test_returns_job_documents(self, repo, jobs_col, sample_job):
        inserted_id = ObjectId()
        jobs_col.insert_many.return_value = MagicMock(
            inserted_ids=[inserted_id]
        )
        jobs_col.find.return_value = [_make_job_doc()]
        results = repo.save_jobs([sample_job])
        assert len(results) == 1
        assert isinstance(results[0], ProjectionJobDocument)

    def test_episode_status_stored_as_array(self, repo, jobs_col, sample_job):
        inserted_id = ObjectId()
        jobs_col.insert_many.return_value = MagicMock(
            inserted_ids=[inserted_id]
        )
        jobs_col.find.return_value = [_make_job_doc()]
        repo.save_jobs([sample_job])
        doc = jobs_col.insert_many.call_args[0][0][0]
        assert isinstance(doc["episode_status"], list)


class TestGetJob:
    def test_returns_none_when_not_found(self, repo, jobs_col):
        jobs_col.find_one.return_value = None
        assert repo.get_job("missing") is None

    def test_returns_document_when_found(self, repo, jobs_col):
        jobs_col.find_one.return_value = _make_job_doc()
        result = repo.get_job("job-uuid-1")
        assert isinstance(result, ProjectionJobDocument)
        assert result.job_id == "job-uuid-1"


class TestListJobs:
    def test_filters_by_plan_id(self, repo, jobs_col):
        jobs_col.find.return_value = []
        repo.list_jobs(plan_id="plan-sha256")
        jobs_col.find.assert_called_once_with(
            {"plan_id": "plan-sha256"},
            sort=[("batch_index", pymongo.ASCENDING)],
        )

    def test_filters_by_status(self, repo, jobs_col):
        jobs_col.find.return_value = []
        repo.list_jobs(status="pending")
        jobs_col.find.assert_called_once_with(
            {"status": "pending"},
            sort=[("batch_index", pymongo.ASCENDING)],
        )

    def test_filters_by_multiple_fields(self, repo, jobs_col):
        jobs_col.find.return_value = []
        repo.list_jobs(plan_id="p1", dataset_id="ds1", status="running")
        jobs_col.find.assert_called_once_with(
            {"plan_id": "p1", "dataset_id": "ds1", "status": "running"},
            sort=[("batch_index", pymongo.ASCENDING)],
        )

    def test_no_filters_queries_all(self, repo, jobs_col):
        jobs_col.find.return_value = []
        repo.list_jobs()
        jobs_col.find.assert_called_once_with(
            {},
            sort=[("batch_index", pymongo.ASCENDING)],
        )


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------


class TestUpdateJobStatus:
    def test_running_sets_started_at(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = _make_job_doc(
            status="running"
        )
        repo.update_job_status("job-uuid-1", JobStatus.RUNNING)
        _, update, *_ = jobs_col.find_one_and_update.call_args[0]
        assert "started_at" in update["$set"]
        assert "completed_at" not in update["$set"]

    def test_completed_sets_completed_at(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = _make_job_doc(
            status="completed"
        )
        repo.update_job_status("job-uuid-1", JobStatus.COMPLETED)
        _, update, *_ = jobs_col.find_one_and_update.call_args[0]
        assert "completed_at" in update["$set"]

    def test_failed_sets_completed_at(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = _make_job_doc(
            status="failed"
        )
        repo.update_job_status("job-uuid-1", JobStatus.FAILED)
        _, update, *_ = jobs_col.find_one_and_update.call_args[0]
        assert "completed_at" in update["$set"]

    def test_partial_sets_completed_at(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = _make_job_doc(
            status="partial"
        )
        repo.update_job_status("job-uuid-1", JobStatus.PARTIAL)
        _, update, *_ = jobs_col.find_one_and_update.call_args[0]
        assert "completed_at" in update["$set"]

    def test_error_stored_when_provided(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = _make_job_doc(
            status="failed", error="something broke"
        )
        repo.update_job_status(
            "job-uuid-1", JobStatus.FAILED, error="something broke"
        )
        _, update, *_ = jobs_col.find_one_and_update.call_args[0]
        assert update["$set"]["error"] == "something broke"

    def test_no_error_key_when_error_is_none(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = _make_job_doc(
            status="completed"
        )
        repo.update_job_status("job-uuid-1", JobStatus.COMPLETED)
        _, update, *_ = jobs_col.find_one_and_update.call_args[0]
        assert "error" not in update["$set"]

    def test_raises_when_job_not_found(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = None
        with pytest.raises(ValueError, match="No job found"):
            repo.update_job_status("missing", JobStatus.RUNNING)

    def test_returns_job_document(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = _make_job_doc(
            status="running"
        )
        result = repo.update_job_status("job-uuid-1", JobStatus.RUNNING)
        assert isinstance(result, ProjectionJobDocument)
        assert result.status == "running"


class TestUpdateEpisodeStatus:
    def test_uses_array_filter(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = _make_job_doc()
        repo.update_episode_status("job-uuid-1", "ep.mcap", "completed")
        kwargs = jobs_col.find_one_and_update.call_args[1]
        assert kwargs["array_filters"] == [{"ep.path": "ep.mcap"}]

    def test_sets_episode_status_via_positional_filter(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = _make_job_doc()
        repo.update_episode_status("job-uuid-1", "ep.mcap", "completed")
        _, update, *_ = jobs_col.find_one_and_update.call_args[0]
        assert update["$set"]["episode_status.$[ep].status"] == "completed"

    def test_raises_when_job_not_found(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = None
        with pytest.raises(ValueError, match="No job found"):
            repo.update_episode_status("missing", "ep.mcap", "completed")


class TestSetDelegatedOperationId:
    def test_sets_field(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = _make_job_doc(
            delegated_operation_id="op-xyz"
        )
        repo.set_delegated_operation_id("job-uuid-1", "op-xyz")
        _, update, *_ = jobs_col.find_one_and_update.call_args[0]
        assert update["$set"]["delegated_operation_id"] == "op-xyz"

    def test_returns_job_document(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = _make_job_doc(
            delegated_operation_id="op-xyz"
        )
        result = repo.set_delegated_operation_id("job-uuid-1", "op-xyz")
        assert isinstance(result, ProjectionJobDocument)
        assert result.delegated_operation_id == "op-xyz"

    def test_raises_when_job_not_found(self, repo, jobs_col):
        jobs_col.find_one_and_update.return_value = None
        with pytest.raises(ValueError, match="No job found"):
            repo.set_delegated_operation_id("missing", "op-xyz")
