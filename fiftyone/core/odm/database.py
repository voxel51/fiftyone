"""
Database connection.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from mongoengine import connect
import pymongo


_DEFAULT_DATABASE = "fiftyone"
_client = None


def _connect():
    global _client
    if _client is None:
        connect(_DEFAULT_DATABASE)
        _client = pymongo.MongoClient()


def get_db_conn():
    """Creates a connection to the database"""
    _connect()
    return _client[_DEFAULT_DATABASE]


def drop_database():
    """Drops the database."""
    _connect()
    _client.drop_database(_DEFAULT_DATABASE)
