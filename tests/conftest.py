""" General pytest configuration
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os


def pytest_configure(config):
    # pytest-xdist sets PYTEST_XDIST_WORKER to "gw0", "gw1", etc.
    # When running without xdist, it's not set
    worker_id = os.environ.get("PYTEST_XDIST_WORKER")

    if worker_id:
        # Extract number from "gw0" -> "0"
        worker_num = worker_id.replace("gw", "")
        db_name = f"fiftyone-test-{worker_num}"
    else:
        db_name = "fiftyone-test"

    os.environ["FIFTYONE_DATABASE_NAME"] = db_name
