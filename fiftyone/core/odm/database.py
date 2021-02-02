"""
Database connection.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

from mongoengine import connect
import motor
import pymongo

import fiftyone.constants as foc


_client = None
_async_client = None
_default_port = 27017

logger = logging.getLogger(__name__)

ASC = pymongo.ASCENDING
DESC = pymongo.DESCENDING


def _connect():
    global _client
    if _client is None:
        connect(foc.DEFAULT_DATABASE, port=_default_port)
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
    return _client[foc.DEFAULT_DATABASE]


def get_async_db_conn():
    """Returns an async connection to the database.

    Returns:
        a ``motor.motor_tornado.MotorDatabase``
    """
    _async_connect()
    return _async_client[foc.DEFAULT_DATABASE]


def drop_database():
    """Drops the database."""
    _connect()
    _client.drop_database(foc.DEFAULT_DATABASE)


def sync_database():
    """Syncs all pending database writes to disk."""
    if _client is not None:
        _client.admin.command("fsync")


def list_collections():
    """Returns a list of all collection names in the database.

    Returns:
        a list of all collection names
    """
    conn = get_db_conn()
    return list(conn.list_collection_names())


def drop_orphan_collections():
    """Drops all orphan collections from the database.

    Orphan collections are collections that are not associated with any known
    dataset or other collections used by FiftyOne.
    """
    import fiftyone.core.dataset as fod

    colls_in_use = {"datasets"}
    for dataset_name in fod.list_datasets():
        dataset = fod.load_dataset(dataset_name)
        colls_in_use.add(dataset._sample_collection_name)
        colls_in_use.add(dataset._frame_collection_name)

    conn = get_db_conn()
    for name in conn.list_collection_names():
        if name not in colls_in_use:
            logger.info("Dropping collection '%s'", name)
            conn.drop_collection(name)


def stream_collection(collection_name):
    """Streams the contents of the collection to stdout.

    Args:
        collection_name: the name of the collection
    """
    import fiftyone.core.utils as fou

    conn = get_db_conn()
    coll = conn[collection_name]
    objects = map(fou.pformat, coll.find({}))
    fou.stream_objects(objects)
