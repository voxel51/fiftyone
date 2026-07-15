"""
Utilities for usage analytics.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
import uuid

import fiftyone.constants as foc


logger = logging.getLogger(__name__)


def get_user_id():
    """Gets the UUID of the current user.

    The UUID is persisted in the FiftyOne config directory so that it is stable
    across sessions. It is only used for anonymous usage analytics, so if the
    config directory cannot be created or written to (e.g. a read-only
    filesystem, or a container where ``~`` resolves to a directory we don't
    own), a fresh ephemeral UUID is returned rather than raising an error.

    Returns:
        a UUID string
    """
    uid_path = os.path.join(foc.FIFTYONE_CONFIG_DIR, "var", "uid")

    def read():
        try:
            with open(uid_path) as f:
                return next(f).strip()
        except (IOError, StopIteration):
            return None

    if not read():
        try:
            os.makedirs(os.path.dirname(uid_path), exist_ok=True)
            with open(uid_path, "w") as f:
                f.write(str(uuid.uuid4()))
        except OSError:
            logger.debug(
                "Failed to persist user ID to '%s'; using an ephemeral ID",
                uid_path,
            )
            return str(uuid.uuid4())

    return read()
