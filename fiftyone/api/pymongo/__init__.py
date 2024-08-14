"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# Match the import style of pymongo

from fiftyone.api.pymongo.client import MongoClient
from fiftyone.api.pymongo import (
    change_stream,
    collection,
    command_cursor,
    cursor,
    database,
)
