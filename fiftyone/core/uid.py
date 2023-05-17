"""
Utilities for usage analytics.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
import multiprocessing
from socket import gaierror
import threading
import uuid

from httpx import HTTPError
import universal_analytics as ua

import eta.core.serial as etas

import fiftyone as fo
import fiftyone.constants as foc
from fiftyone.core.context import _get_context


_WELCOME_MESSAGE = """
Welcome to

███████╗██╗███████╗████████╗██╗   ██╗ ██████╗ ███╗   ██╗███████╗
██╔════╝██║██╔════╝╚══██╔══╝╚██╗ ██╔╝██╔═══██╗████╗  ██║██╔════╝
█████╗  ██║█████╗     ██║    ╚████╔╝ ██║   ██║██╔██╗ ██║█████╗
██╔══╝  ██║██╔══╝     ██║     ╚██╔╝  ██║   ██║██║╚██╗██║██╔══╝
██║     ██║██║        ██║      ██║   ╚██████╔╝██║ ╚████║███████╗
╚═╝     ╚═╝╚═╝        ╚═╝      ╚═╝    ╚═════╝ ╚═╝  ╚═══╝╚══════╝ v{0}

If you're finding FiftyOne helpful, here's how you can get involved:

|
|  ⭐⭐⭐ Give the project a star on GitHub ⭐⭐⭐
|  https://github.com/voxel51/fiftyone
|
|  🚀🚀🚀 Join the FiftyOne Slack community 🚀🚀🚀
|  https://join.slack.com/t/fiftyone-users/shared_invite/zt-s6936w7b-2R5eVPJoUw008wP7miJmPQ
|
"""

_FIRST_IMPORT = "FIFTYONE_FIRST_IMPORT"
_import_logged = False

logger = logging.getLogger(__name__)


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
    if fo.config.do_not_track or not _allow_logging():
        return

    if test:
        uid, first_import = "test", False
    else:
        uid, first_import = get_user_id()

    kind = "new" if first_import else "returning"

    def send_import_event():
        try:
            with ua.HTTPRequest() as http:
                tracker = ua.Tracker(foc.UA_ID, http, client_id=uid)
                tracker.send(
                    "event",
                    "import",
                    kind,
                    label="%s-%s" % (foc.VERSION, _get_context()),
                )

            global _import_logged
            _import_logged = True
        except (gaierror, HTTPError) as e:
            pass

    th = threading.Thread(target=send_import_event)
    th.start()


def log_welcome_message_if_allowed():
    """Logs a welcome message the first time this function is called on a
    machine with a new FiftyOne version installed, if allowed.
    """
    if not _allow_logging():
        return

    try:
        last_version = etas.load_json(foc.WELCOME_PATH)["version"]
    except:
        last_version = None

    if foc.VERSION == last_version:
        return

    logger.info(_WELCOME_MESSAGE.format(foc.VERSION))

    try:
        etas.write_json({"version": foc.VERSION}, foc.WELCOME_PATH)
    except:
        pass


def _allow_logging():
    if os.environ.get("FIFTYONE_DISABLE_SERVICES", None):
        return False

    if os.environ.get("FIFTYONE_SERVER", None):
        return False

    if multiprocessing.current_process().name != "MainProcess":
        return False

    return True
