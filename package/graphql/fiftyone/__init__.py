"""
FiftyOne V2 GraphQL schema definition package

See https://voxel51.com/fiftyone/package/graphql for more information.

| Copyright 2017-2025, Voxel51, Inc.
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
