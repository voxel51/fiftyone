"""
FiftyOne: a powerful package for dataset curation, analysis, and visualization.

See https://voxel51.com/fiftyone for more information.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio as _asyncio
from pkgutil import extend_path
import os as _os

import universal_analytics as _ua

#
# This statement allows multiple `fiftyone.XXX` packages to be installed in the
# same environment and used simultaneously.
#
# https://docs.python.org/3/library/pkgutil.html#pkgutil.extend_path
#
__path__ = extend_path(__path__, __name__)

from fiftyone.__public__ import *
import fiftyone.constants as _foc
from fiftyone.utils.uid import _get_user_id


def _log_import_if_allowed():
    if config.do_not_track:
        return

    if _os.environ.get("FIFTYONE_SERVER", False):
        return

    uid, first_import = _get_user_id()

    kind = "new" if first_import else "returning"

    async def send_import_event():
        async with _ua.AsyncHTTPRequest() as http:
            tracker = _ua.Tracker(_foc.UA_ID, http, client_id=uid)
            await tracker.send("event", "import", kind)

    loop = _asyncio.get_event_loop()
    loop.run_until_complete(send_import_event())


_log_import_if_allowed()
