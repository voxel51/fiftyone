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
_default_port = 27017


ASC = pymongo.ASCENDING
DESC = pymongo.DESCENDING


def _connect():
    global _client
    if _client is None:
        connect(_DEFAULT_DATABASE, port=_default_port)
        _client = pymongo.MongoClient(port=_default_port)


def set_default_port(port):
    """Changes the default port used to connect to the database.

    Args:
        port (int): port number
    """
    global _default_port
    _default_port = int(port)


def get_db_conn():
    """Returns a connection to the database.

    Returns:
        a ``pymongo.MongoClient``
    """
    _connect()
    return _client[_DEFAULT_DATABASE]


def drop_database():
    """Drops the database."""
    _connect()
    _client.drop_database(_DEFAULT_DATABASE)


def sync_database():
    """Syncs all pending database writes to disk."""
    if _client is not None:
        _client.admin.command("fsync")
