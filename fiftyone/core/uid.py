"""
Utilities for usage analytics.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import multiprocessing
import os
from socket import gaierror
import threading
import uuid

from ga4mp import GtagMP
from httpx import HTTPError

import fiftyone as fo
import fiftyone.constants as foc
from fiftyone.core.context import _get_context


_FIRST_IMPORT = "FIFTYONE_FIRST_IMPORT"
_import_logged = False


def get_user_id():
    """Gets the UUID of the current user.

    Returns:
        a tuple of

        -   UUID string
        -   True/False whether the UUID was newly created
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


def log_import_if_allowed(test=False):
    """Logs the FiftyOne import event, if allowed.

    Args:
        test (False): whether to use the "test" uid
    """
    if fo.config.do_not_track:
        return

    if os.environ.get("FIFTYONE_DISABLE_SERVICES", None):
        return

    if os.environ.get("FIFTYONE_SERVER", None):
        return

    if multiprocessing.current_process().name != "MainProcess":
        return

    if test:
        uid, first_import = "test", False
    else:
        uid, first_import = get_user_id()

    kind = "new" if first_import else "returning"

    def send_import_event():
        try:
            gtag = GtagMP(
                api_secret=foc.GA4_ID[0],
                measurement_id=foc.GA4_ID[1],
                client_id=uid,
            )
            event = gtag.create_new_event(name="import")
            event.set_event_param("python_kind", kind)
            event.set_event_param("python_context", _get_context())
            event.set_event_param("python_version", foc.VERSION)
            gtag.send([event])

            global _import_logged
            _import_logged = True
        except (gaierror, HTTPError) as e:
            pass

    th = threading.Thread(target=send_import_event)
    th.start()
