"""
FiftyOne: a powerful package for dataset curation, analysis, and visualization.

See https://voxel51.com/fiftyone for more information.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from os import getenv
from pkgutil import extend_path as _extend_path
from sys import hexversion


logger = logging.getLogger(__name__)

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

import fiftyone.core.logging as _fol


_fol.init_logging()

# Register the execution store extras cloner so that allowlisted panel run
# history follows a full dataset clone (including SDK clones).
try:
    import fiftyone.operators.store.clone as _esclone  # noqa: F401
except Exception:  # pragma: no cover - best-effort registration
    logger.warning(
        "Failed to register execution store clone hook", exc_info=True
    )
