"""
FiftyOne: a powerful package for dataset curation, analysis, and visualization.

See https://voxel51.com/fiftyone for more information.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from pkgutil import extend_path

#
# This statement allows multiple `fiftyone.XXX` packages to be installed in the
# same environment and used simultaneously.
#
# https://docs.python.org/3/library/pkgutil.html#pkgutil.extend_path
#
__path__ = extend_path(__path__, __name__)

from fiftyone.__public__ import *
