"""
Similarity search run manager.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .constants import STORE_NAME, RunStatus


class RunManager:
    """Manager class for persisting and retrieving similarity search runs."""

    _RUN_PREFIX = "run:"
    _OPID_PREFIX = "opid:"

    # Fields too large for listing — only needed by get_run / apply_run
    _HEAVY_FIELDS = {"result_ids", "result_view", "source_view"}

    def __init__(self, ctx):
        self._store = ctx.store(STORE_NAME)

    def create_run(self, run_params: Dict[str, Any]) -> str:
        """Create a new run entry.

        Args:
            run_params: run configuration parameters

        Returns:
            the run ID
        """
        run_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        run_data = {
            "run_id": run_id,
            "run_name": run_params.get("run_name") or f"Search {now[:16]}",
            "status": RunStatus.PENDING,
            "brain_key": run_params["brain_key"],
            "query_type": run_params["query_type"],
            "query": run_params.get("query"),
            "k": run_params.get("k"),
            "reverse": run_params.get("reverse", False),
            "dist_field": run_params.get("dist_field"),
            "patches_field": run_params.get("patches_field"),
            "result_ids": [],
            "result_view": None,
            "result_count": 0,
            "creation_time": now,
            "start_time": None,
            "end_time": None,
            "source_view": run_params.get("source_view"),
            "negative_query_ids": run_params.get("negative_query_ids"),
            "operator_run_id": None,
            "status_details": None,
        }
        self._store.set(self._key(run_id), run_data)
        return run_id

    def get_run(self, run_id: str) -> Optional[Dict]:
        """Get a run by ID.

        Args:
            run_id: the run ID

        Returns:
            the run data dict, or None
        """
        return self._store.get(self._key(run_id))

    def update_run(self, run_id: str, updates: Dict[str, Any]):
        """Update fields on an existing run.

        Args:
            run_id: the run ID
            updates: dict of fields to update
        """
        run = self.get_run(run_id)
        if run:
            run.update(updates)
            self._store.set(self._key(run_id), run)

    def set_operator_run_id(self, run_id: str, operator_run_id: str):
        """Link a delegated operation ID to a run and create index key.

        Args:
            run_id: the run ID
            operator_run_id: the delegated operation document ID
        """
        self.update_run(run_id, {"operator_run_id": operator_run_id})
        self._store.set(f"{self._OPID_PREFIX}{operator_run_id}", run_id)

    def find_run_by_operator_id(self, operator_run_id: str) -> Optional[Dict]:
        """Find a run by its delegated operation ID. O(1) lookup.

        Args:
            operator_run_id: the delegated operation document ID

        Returns:
            the run data dict, or None
        """
        run_id = self._store.get(f"{self._OPID_PREFIX}{operator_run_id}")
        if run_id:
            return self.get_run(run_id)
        return None

    def delete_run(self, run_id: str):
        """Delete a run and its index keys.

        Args:
            run_id: the run ID
        """
        run = self.get_run(run_id)
        if run and run.get("operator_run_id"):
            self._store.delete(f"{self._OPID_PREFIX}{run['operator_run_id']}")
        self._store.delete(self._key(run_id))

    def list_runs(self) -> List[Dict]:
        """List all runs sorted by creation time (newest first).

        Returns:
            list of run data dicts
        """
        keys = self._store.list_keys()
        runs = []
        for key in keys:
            if key.startswith(self._RUN_PREFIX):
                run = self._store.get(key)
                if run:
                    # Strip heavy fields for listing
                    runs.append(
                        {
                            k: v
                            for k, v in run.items()
                            if k not in self._HEAVY_FIELDS
                        }
                    )

        runs.sort(key=lambda r: r.get("creation_time", ""), reverse=True)
        return runs

    def _key(self, run_id: str) -> str:
        return f"{self._RUN_PREFIX}{run_id}"
