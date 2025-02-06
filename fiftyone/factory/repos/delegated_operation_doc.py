"""
FiftyOne delegated operation repository document.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from datetime import datetime

from fiftyone.operators.executor import (
    ExecutionContext,
    ExecutionResult,
    ExecutionRunState,
    ExecutionProgress,
)

logger = logging.getLogger(__name__)


class DelegatedOperationDocument(object):
    def __init__(
        self,
        operator: str = None,
        delegation_target: str = None,
        context: ExecutionContext = None,
        is_remote: bool = False,
    ):
        self.operator = operator
        self.label = None
        self.delegation_target = delegation_target
        if isinstance(context, ExecutionContext) or context is None:
            pass
        else:
            raise AttributeError(
                "context must be an instance of ExecutionContext"
            )
        self.context = context
        self.run_state = (
            ExecutionRunState.SCHEDULED
            if is_remote
            else ExecutionRunState.QUEUED
        )  # if running locally use QUEUED otherwise SCHEDULED
        self.run_link = None
        self.queued_at = datetime.utcnow() if not is_remote else None
        self.updated_at = datetime.utcnow()
        self.status = None
        self.dataset_id = None
        self.started_at = None
        self.pinned = False
        self.completed_at = None
        self.failed_at = None
        self.scheduled_at = datetime.utcnow() if is_remote else None
        self.result = None
        self.id = None
        self._doc = None
        self.metadata = None
        self.log_upload_error = None
        self.log_path = None

    def from_pymongo(self, doc: dict):
        # required fields
        self.operator = doc.get("operator")
        self.queued_at = doc.get("queued_at")
        self.run_state = doc.get("run_state")

        # optional fields
        self.delegation_target = doc.get("delegation_target", None)
        self.started_at = doc.get("started_at", None)
        self.completed_at = doc.get("completed_at", None)
        self.failed_at = doc.get("failed_at", None)
        self.scheduled_at = doc.get("scheduled_at", None)
        self.pinned = doc.get("pinned", None)
        self.dataset_id = doc.get("dataset_id", None)
        self.run_link = doc.get("run_link", None)
        self.log_upload_error = doc.get("log_upload_error", None)
        self.log_path = doc.get("log_path", None)
        self.metadata = doc.get("metadata", None)
        self.label = doc.get("label", None)
        self.updated_at = doc.get("updated_at", None)

        # internal fields
        self.id = doc["_id"]
        self._doc = doc

        # nested fields
        if (
            "context" in doc
            and doc["context"] is not None
            and "request_params" in doc["context"]
        ):
            self.context = ExecutionContext(
                request_params=doc["context"]["request_params"],
            )

        if "result" in doc and doc["result"] is not None:
            res = ExecutionResult()
            if "result" in doc["result"]:
                res.result = doc["result"]["result"]
            if "error" in doc["result"]:
                res.error = doc["result"]["error"]

            if res.result or res.error:
                self.result = res

        if "status" in doc and doc["status"] is not None:
            self.status = ExecutionProgress()
            if "progress" in doc["status"]:
                self.status.progress = doc["status"]["progress"]
            if "label" in doc["status"]:
                self.status.label = doc["status"]["label"]
            if "updated_at" in doc["status"]:
                self.status.updated_at = doc["status"]["updated_at"]

        return self

    def to_pymongo(self) -> dict:
        d = self.__dict__
        if self.context:
            d["context"] = {
                "request_params": self.context._get_serialized_request_params()
            }
        d.pop("_doc")
        d.pop("id")
        return d
