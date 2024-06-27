"""
FiftyOne: a powerful package for dataset curation, analysis, and visualization.

See https://voxel51.com/fiftyone for more information.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from logging import warning
from pkgutil import extend_path as _extend_path
from sys import hexversion
from os import getenv

# Python 3.8 goes EoL in October, 2024
#  We should tell folks we won't support those Python versions after 9/24

PYTHON_38_NOTICE = getenv(
    'FIFTYONE_PYTHON_38_DEPRECATION_NOTICE', "True"
) == "True"

if hexversion < 0x30900f0 and hexversion >= 0x30800f0 and PYTHON_38_NOTICE:
    warning("***Python 3.8 Deprecation Notice***")
    warning("Python 3.8 will no longer be supported in new releases after"
            "October 1, 2024.")
    warning("Please upgrade to Python 3.9 or later.")
    warning("For additional details please see https://deprecation.voxel51.com")

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
