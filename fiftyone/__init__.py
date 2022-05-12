"""
FiftyOne: a powerful package for dataset curation, analysis, and visualization.

See https://voxel51.com/fiftyone for more information.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from pkgutil import extend_path as _extend_path
import atexit as _atexit
import os as _os

#
# This statement allows multiple `fiftyone.XXX` packages to be installed in the
# same environment and used simultaneously.
#
# https://docs.python.org/3/library/pkgutil.html#pkgutil.extend_path
#
__path__ = _extend_path(__path__, __name__)

import fiftyone.constants as _foc

__version__ = _foc.VERSION

from fiftyone.__public__ import *

import fiftyone.core.odm as _foo
import fiftyone.core.dataset as _fod
import fiftyone.core.uid as _fou
import fiftyone.migrations as _fom


if not _os.environ.get("_FIFTYONE_ROOT_CONN_INIT"):
    _os.environ["_FIFTYONE_ROOT_CONN_INIT"] = "1"
    _foo.track_connection()

    @_atexit.register
    def cleanup():
        try:
            _foo.untrack_connection()
            if _foo.get_connection_count() > 0:
                return
            _fod.delete_non_persistent_datasets()
            _foo.sync_database()
        finally:
            _os.environ.pop("_FIFTYONE_ROOT_CONN_INIT", None)


if _os.environ.get("FIFTYONE_DISABLE_SERVICES", "0") != "1":
    _fom.migrate_database_if_necessary()
    _fou.log_import_if_allowed()
