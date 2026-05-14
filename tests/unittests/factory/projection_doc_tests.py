"""
Unit tests for ManifestPlanDocument and ProjectionJobDocument.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime

import pytest
from bson import ObjectId

from fiftyone.factory.repos.projection_plan_doc import (
    ManifestPlanDocument,
    ProjectionJobDocument,
)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def plan_raw():
    return {
        "_id": ObjectId(),
        "plan_id": "abc123",
        "dataset_id": "ds1",
        "compiled_at": datetime(2026, 1, 1),
        "is_current": True,
        "manifest_source": "channel_bindings: []",
        "channel_bindings": [{"id": "imu", "match": {"topic": "/imu"}}],
        "logical_streams": [],
        "projections": [{"id": "obs", "grain": "observation"}],
        "dag": {"order": ["obs"], "levels": {"0": ["obs"]}},
    }


@pytest.fixture
def job_raw():
    return {
        "_id": ObjectId(),
        "job_id": "job-uuid-1",
        "plan_id": "abc123",
        "dataset_id": "ds1",
        "batch_index": 2,
        "episode_paths": ["ep1.mcap", "ep2.mcap"],
        "status": "running",
        "episode_status": [
            {"path": "ep1.mcap", "status": "completed"},
            {"path": "ep2.mcap", "status": "pending"},
        ],
        "output_paths": {"obs": "gs://bucket/obs/part-0002.parquet"},
        "created_at": datetime(2026, 1, 1),
        "started_at": datetime(2026, 1, 2),
        "completed_at": None,
        "error": None,
        "delegated_operation_id": None,
    }


# ---------------------------------------------------------------------------
# ManifestPlanDocument tests
# ---------------------------------------------------------------------------


class TestManifestPlanDocument:
    def test_from_pymongo_populates_all_fields(self, plan_raw):
        doc = ManifestPlanDocument().from_pymongo(plan_raw)
        assert doc.plan_id == "abc123"
        assert doc.dataset_id == "ds1"
        assert doc.is_current is True
        assert doc.manifest_source == "channel_bindings: []"
        assert len(doc.channel_bindings) == 1
        assert doc.channel_bindings[0]["id"] == "imu"
        assert doc.projections[0]["id"] == "obs"
        assert doc.dag["order"] == ["obs"]

    def test_from_pymongo_uses_id_field(self, plan_raw):
        doc = ManifestPlanDocument().from_pymongo(plan_raw)
        assert doc.id == plan_raw["_id"]

    def test_from_pymongo_defaults_missing_fields(self):
        doc = ManifestPlanDocument().from_pymongo({"plan_id": "x"})
        assert doc.dataset_id is None
        assert doc.is_current is False
        assert doc.channel_bindings == []
        assert doc.logical_streams == []
        assert doc.projections == []
        assert doc.dag == {}

    def test_to_pymongo_excludes_id_and_doc(self, plan_raw):
        doc = ManifestPlanDocument().from_pymongo(plan_raw)
        d = doc.to_pymongo()
        assert "id" not in d
        assert "_doc" not in d

    def test_to_pymongo_includes_all_content_fields(self, plan_raw):
        doc = ManifestPlanDocument().from_pymongo(plan_raw)
        d = doc.to_pymongo()
        assert d["plan_id"] == "abc123"
        assert d["dataset_id"] == "ds1"
        assert d["is_current"] is True
        assert len(d["channel_bindings"]) == 1

    def test_to_pymongo_is_a_deep_copy(self, plan_raw):
        doc = ManifestPlanDocument().from_pymongo(plan_raw)
        d = doc.to_pymongo()
        d["channel_bindings"].append({"id": "new"})
        assert len(doc.channel_bindings) == 1

    def test_round_trip_preserves_dag(self, plan_raw):
        doc = ManifestPlanDocument().from_pymongo(plan_raw)
        d = doc.to_pymongo()
        assert d["dag"]["order"] == ["obs"]
        assert d["dag"]["levels"] == {"0": ["obs"]}


# ---------------------------------------------------------------------------
# ProjectionJobDocument tests
# ---------------------------------------------------------------------------


class TestProjectionJobDocument:
    def test_from_pymongo_populates_all_fields(self, job_raw):
        doc = ProjectionJobDocument().from_pymongo(job_raw)
        assert doc.job_id == "job-uuid-1"
        assert doc.plan_id == "abc123"
        assert doc.dataset_id == "ds1"
        assert doc.batch_index == 2
        assert doc.episode_paths == ["ep1.mcap", "ep2.mcap"]
        assert doc.status == "running"
        assert doc.started_at == datetime(2026, 1, 2)
        assert doc.delegated_operation_id is None

    def test_from_pymongo_converts_episode_status_list_to_dict(self, job_raw):
        doc = ProjectionJobDocument().from_pymongo(job_raw)
        assert doc.episode_status == {
            "ep1.mcap": "completed",
            "ep2.mcap": "pending",
        }

    def test_from_pymongo_accepts_episode_status_as_dict(self, job_raw):
        job_raw["episode_status"] = {"ep1.mcap": "completed"}
        doc = ProjectionJobDocument().from_pymongo(job_raw)
        assert doc.episode_status == {"ep1.mcap": "completed"}

    def test_from_pymongo_episode_status_empty_list(self, job_raw):
        job_raw["episode_status"] = []
        doc = ProjectionJobDocument().from_pymongo(job_raw)
        assert doc.episode_status == {}

    def test_from_pymongo_defaults_missing_fields(self):
        doc = ProjectionJobDocument().from_pymongo({"job_id": "x"})
        assert doc.plan_id is None
        assert doc.batch_index == 0
        assert doc.episode_paths == []
        assert doc.status == "pending"
        assert doc.episode_status == {}
        assert doc.output_paths == {}

    def test_to_pymongo_excludes_private_fields(self, job_raw):
        doc = ProjectionJobDocument().from_pymongo(job_raw)
        d = doc.to_pymongo()
        assert "id" not in d
        assert "_doc" not in d

    def test_to_pymongo_includes_all_job_fields(self, job_raw):
        doc = ProjectionJobDocument().from_pymongo(job_raw)
        d = doc.to_pymongo()
        assert d["job_id"] == "job-uuid-1"
        assert d["batch_index"] == 2
        assert d["output_paths"] == {
            "obs": "gs://bucket/obs/part-0002.parquet"
        }

    def test_from_pymongo_output_paths(self, job_raw):
        doc = ProjectionJobDocument().from_pymongo(job_raw)
        assert doc.output_paths == {"obs": "gs://bucket/obs/part-0002.parquet"}

    def test_from_pymongo_with_error_field(self, job_raw):
        job_raw["error"] = "something went wrong"
        doc = ProjectionJobDocument().from_pymongo(job_raw)
        assert doc.error == "something went wrong"

    def test_from_pymongo_with_delegated_operation_id(self, job_raw):
        job_raw["delegated_operation_id"] = "delegated-op-xyz"
        doc = ProjectionJobDocument().from_pymongo(job_raw)
        assert doc.delegated_operation_id == "delegated-op-xyz"
