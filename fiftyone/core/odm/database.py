"""
Database connection.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import mongoengine

_DEFAULT_DATABASE = "fiftyone"


_db = None


def connect():
    """Returns a connection to the default database."""
    global _db
    if _db is None:
        _db = mongoengine.connect(_DEFAULT_DATABASE)
    return _db


def drop_database():
    """Drops the database."""
    db = connect()
    db.drop_database(_DEFAULT_DATABASE)
