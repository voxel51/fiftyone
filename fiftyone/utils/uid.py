"""Utilities for usage analytics

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import uuid

import fiftyone.constants as foc


def _get_user_id():
    """Gets the UUID of the current user

    Returns:
        a UUID string and whether the UUID was just created
    """
    uid_path = os.path.join(foc.FIFTYONE_CONFIG_DIR, "var", "uid")

    def read():
        try:
            with open(uid_path) as f:
                return next(f).strip()
        except (IOError, StopIteration):
            return None

    if not read():
        os.makedirs(os.path.dirname(uid_path), exist_ok=True)
        with open(uid_path, "w") as f:
            f.write(str(uuid.uuid4()))

        return read(), True
    return read(), False
