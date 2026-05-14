"""
FiftyOne multimodal projection plan and job repository documents.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import copy
from datetime import datetime


class ManifestPlanDocument(object):
    """MongoDB document for a compiled MCAP projection manifest plan."""

    def __init__(self):
        self.id = None
        self.plan_id: str | None = None
        self.dataset_id: str | None = None
        self.compiled_at: datetime | None = None
        self.is_current: bool = False
        self.manifest_source: str | None = None
        self.channel_bindings: list = []
        self.logical_streams: list = []
        self.projections: list = []
        self.dag: dict = {}
        self._doc: dict | None = None

    def from_pymongo(self, doc: dict) -> ManifestPlanDocument:
        self.id = doc.get("_id", doc.get("id"))
        self.plan_id = doc.get("plan_id")
        self.dataset_id = doc.get("dataset_id")
        self.compiled_at = doc.get("compiled_at")
        self.is_current = doc.get("is_current", False)
        self.manifest_source = doc.get("manifest_source")
        self.channel_bindings = doc.get("channel_bindings", [])
        self.logical_streams = doc.get("logical_streams", [])
        self.projections = doc.get("projections", [])
        self.dag = doc.get("dag", {})
        self._doc = doc
        return self

    def to_pymongo(self) -> dict:
        ignore_keys = {"id", "_doc"}
        return {
            k: copy.deepcopy(v)
            for k, v in self.__dict__.items()
            if k not in ignore_keys
        }


class ProjectionJobDocument(object):
    """MongoDB document for one batched projection worker job."""

    def __init__(self):
        self.id = None
        self.job_id: str | None = None
        self.plan_id: str | None = None
        self.dataset_id: str | None = None
        self.batch_index: int = 0
        self.episode_paths: list[str] = []
        self.status: str = "pending"
        self.episode_status: dict[str, str] = {}
        self.output_paths: dict[str, str] = {}
        self.created_at: datetime | None = None
        self.started_at: datetime | None = None
        self.completed_at: datetime | None = None
        self.error: str | None = None
        self.delegated_operation_id: str | None = None
        self._doc: dict | None = None

    def from_pymongo(self, doc: dict) -> ProjectionJobDocument:
        self.id = doc.get("_id", doc.get("id"))
        self.job_id = doc.get("job_id")
        self.plan_id = doc.get("plan_id")
        self.dataset_id = doc.get("dataset_id")
        self.batch_index = doc.get("batch_index", 0)
        self.episode_paths = doc.get("episode_paths", [])
        self.status = doc.get("status", "pending")
        # episode_status is stored as [{path, status}] in MongoDB.
        raw_es = doc.get("episode_status", [])
        if isinstance(raw_es, list):
            self.episode_status = {
                item["path"]: item["status"] for item in raw_es
            }
        else:
            self.episode_status = raw_es
        self.output_paths = doc.get("output_paths", {})
        self.created_at = doc.get("created_at")
        self.started_at = doc.get("started_at")
        self.completed_at = doc.get("completed_at")
        self.error = doc.get("error")
        self.delegated_operation_id = doc.get("delegated_operation_id")
        self._doc = doc
        return self

    def to_pymongo(self) -> dict:
        ignore_keys = {"id", "_doc"}
        return {
            k: copy.deepcopy(v)
            for k, v in self.__dict__.items()
            if k not in ignore_keys
        }
