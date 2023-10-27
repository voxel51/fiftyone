"""
FiftyOne orchestrator repository document.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
from datetime import datetime
from typing import List

logger = logging.getLogger(__name__)


class OrchestratorDocument:
    def __init__(
        self,
        instance_identifier: str = None,
        description: str = None,
        available_operators: List[str] = None,
    ):
        self.id = None
        self.updated_at = None
        self.created_at = None
        self.deactivated_at = None
        self.available_operators = available_operators
        self.instance_id = instance_identifier
        self.description = description

    def from_pymongo(self, doc: dict):
        self.id = str(doc["_id"])
        self.available_operators = (
            doc["available_operators"] if "available_operators" in doc else []
        )
        self.instance_id = doc["instance_id"]
        self.description = doc["description"]
        self.created_at = doc["created_at"] if "created_at" in doc else None
        self.updated_at = doc["updated_at"] if "updated_at" in doc else None
        self.deactivated_at = (
            doc["deactivated_at"] if "deactivated_at" in doc else None
        )
        return self

    def to_pymongo(self) -> dict:
        d = self.__dict__
        d.pop("id")
        return d
