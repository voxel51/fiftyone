"""
Database connection.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from mongoengine import connect
import motor
import pymongo

from fiftyone.constants import DEFAULT_DATABASE

_client = None
_async_client = None
_default_port = 27017


ASC = pymongo.ASCENDING
DESC = pymongo.DESCENDING


def _connect():
    global _client
    if _client is None:
        connect(DEFAULT_DATABASE, port=_default_port)
        _client = pymongo.MongoClient(port=_default_port)


def _async_connect():
    global _async_client
    if _async_client is None:
        _async_client = motor.motor_tornado.MotorClient(
            "localhost", _default_port
        )


def set_default_port(port):
    """Changes the default port used to connect to the database.

    Args:
        port (int): port number
    """
    global _default_port
    _default_port = int(port)


def get_db_client():
    """Returns a database client.

    Returns:
        a ``pymongo.mongo_client.MongoClient``
    """
    return pymongo.MongoClient(port=_default_port)


def get_db_conn():
    """Returns a connection to the database.

    Returns:
        a ``pymongo.database.Database``
    """
    _connect()
    return _client[DEFAULT_DATABASE]


def get_async_db_conn():
    """Returns an async connection to the database.

    Returns:
        a ``motor.motor_tornado.MotorDatabase``
    """
    _async_connect()
    return _async_client[DEFAULT_DATABASE]


def drop_database():
    """Drops the database."""
    _connect()
    _client.drop_database(DEFAULT_DATABASE)


def sync_database():
    """Syncs all pending database writes to disk."""
    if _client is not None:
        _client.admin.command("fsync")
