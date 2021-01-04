"""
FiftyOne: a powerful package for dataset curation, analysis, and visualization.

See https://voxel51.com/fiftyone for more information.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
from pkgutil import extend_path
import os as _os
import threading as _threading

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
from fiftyone.core.context import _get_context
from fiftyone.core.odm import MetaDocument
from fiftyone.migrations import get_migration_runner

from mongoengine import DoesNotExist


logger = logging.getLogger(__name__)


def _migrate_if_necessary():
    try:
        # pylint: disable=no-member
        doc = MetaDocument.objects.get()
        head = doc.version
        doc.version = _foc.VERSION
    except DoesNotExist:
        head = None
        doc = MetaDocument(version=_foc.VERSION)
    doc.save()
    destination = _foc.VERSION
    if head != destination:
        runner = get_migration_runner(head, destination, admin=True)
        if runner.has_revisions:
            logger.info(
                "Migrating fiftyone-db to the current version (%s)",
                _foc.VERSION,
            )
            runner.run()


def _log_import_if_allowed():
    if config.do_not_track:
        return

    if _os.environ.get("FIFTYONE_DISABLE_SERVICES", False):
        return

    uid, first_import = _get_user_id()

    kind = "new" if first_import else "returning"

    def send_import_event():
        try:
            with _ua.HTTPRequest() as http:
                tracker = _ua.Tracker(_foc.UA_ID, http, client_id=uid)
                tracker.send(
                    "event",
                    "import",
                    kind,
                    label="%s-%s" % (_foc.VERSION, _get_context()),
                )
        except:
            pass

    th = _threading.Thread(target=send_import_event)
    th.start()


_migrate_if_necessary()
_log_import_if_allowed()
