"""
FiftyOne: a powerful package for dataset curation, analysis, and visualization.

See https://voxel51.com/fiftyone for more information.

| Copyright 2017-2023, Voxel51, Inc.
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

__version__ = _foc.VERSION

from fiftyone.__public__ import *

import fiftyone.core.uid as _fou
import fiftyone.core.logging as _fol
import fiftyone.migrations as _fom

_fol.init_logging()

if _os.environ.get("FIFTYONE_DISABLE_SERVICES", "0") != "1":
    _fom.migrate_database_if_necessary()
    _fou.log_import_if_allowed()
