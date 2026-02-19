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
            "result_count": 0,
            "creation_time": now,
            "start_time": None,
            "end_time": None,
            "source_view": run_params.get("source_view"),
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

    def delete_run(self, run_id: str):
        """Delete a run.

        Args:
            run_id: the run ID
        """
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
                    runs.append(run)

        runs.sort(key=lambda r: r.get("creation_time", ""), reverse=True)
        return runs

    def _key(self, run_id: str) -> str:
        return f"{self._RUN_PREFIX}{run_id}"
