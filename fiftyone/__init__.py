"""
FiftyOne: a powerful package for dataset curation, analysis, and visualization.

See https://voxel51.com/fiftyone for more information.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from pkgutil import extend_path as _extend_path
import os as _os

#
# This statement allows multiple `fiftyone.XXX` packages to be installed in the
# same environment and used simultaneously.
#
# https://docs.python.org/3/library/pkgutil.html#pkgutil.extend_path
#
__path__ = _extend_path(__path__, __name__)

import fiftyone.constants as _foc

__version__ = _foc.TEAMS_VERSION

from fiftyone.__public__ import *
from fiftyone.core.cache import init_media_cache as _init_media_cache
from fiftyone.core.odm import establish_db_conn as _establish_db_conn
from fiftyone.core.storage import init_storage as _init_storage
from fiftyone.core.uid import log_import_if_allowed as _log_import
from fiftyone.migrations import migrate_database_if_necessary as _migrate

_establish_db_conn(config)
_init_storage()
_init_media_cache(media_cache_config)

if _os.environ.get("FIFTYONE_DISABLE_SERVICES", "0") != "1":
    _migrate()
    _log_import()
