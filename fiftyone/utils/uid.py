"""Utilities for usage analytics

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import uuid

import fiftyone.constants as foc

_FIRST_IMPORT = "FIFTYONE_FIRST_IMPORT"


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

    first_import = False
    if _FIRST_IMPORT in os.environ:
        first_import = os.environ[_FIRST_IMPORT] == "1"

    if not read():
        os.environ[_FIRST_IMPORT] = "1"
        os.makedirs(os.path.dirname(uid_path), exist_ok=True)
        with open(uid_path, "w") as f:
            f.write(str(uuid.uuid4()))

        return read(), True

    return read(), first_import
