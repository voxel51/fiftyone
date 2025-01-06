"""
FiftyOne Server constants

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import date, datetime

from fiftyone.server.scalars import Date, DateTime

LIST_LIMIT = 200
SCALAR_OVERRIDES = {
    date: Date,
    datetime: DateTime,
}
