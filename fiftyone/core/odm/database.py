"""
Database utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import atexit
import dataclasses
from datetime import datetime
import logging
from multiprocessing.pool import ThreadPool
import os
from typing import Tuple

import asyncio
from bson import json_util, ObjectId
from bson.codec_options import CodecOptions
from mongoengine import connect
import motor.motor_asyncio as mtr

from packaging.version import Version
import pymongo
from pymongo.errors import (
    BulkWriteError,
    OperationFailure,
    PyMongoError,
    ServerSelectionTimeoutError,
)
import pytz

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.migrations as fom
from fiftyone.core.config import FiftyOneConfigError
import fiftyone.core.service as fos
import fiftyone.core.utils as fou

foa = fou.lazy_import("fiftyone.core.annotation")
fob = fou.lazy_import("fiftyone.core.brain")
fod = fou.lazy_import("fiftyone.core.dataset")
foe = fou.lazy_import("fiftyone.core.evaluation")
fors = fou.lazy_import("fiftyone.core.runs")


logger = logging.getLogger(__name__)

_client = None
_async_client = None
_connection_kwargs = {}
_db_service = None


#
# IMPORTANT DATABASE CONFIG REQUIREMENTS
#
# All past and future versions of FiftyOne must be able to deduce the
# database's current version and type from the `config` collection without an
# error being raised so that migrations can be properly run and, if necessary,
# informative errors can be raised alerting the user that they are using the
# wrong version or type of client.
#
# This is currently guaranteed because:
#   - `DatabaseConfigDocument` is declared as non-strict, so any past or future
#     fields that are not currently defined will not cause an error
#   - All declared fields are optional, and we have promised ourselves that
#     their type and meaning will never change
#


@dataclasses.dataclass(init=False)
class DatabaseConfigDocument:
    """Backing document for the database config."""

    version: str
    type: str

    def __init__(self, conn, version=None, type=None, *args, **kwargs):
        # Create our own __init__ so we can ignore extra kwargs/unknown fields
        # from other versions
        self._conn = conn
        self.version = version
        self.type = type

    def save(self):
        self._conn.config.replace_one(
            {}, dataclasses.asdict(self), upsert=True
        )


def get_db_config():
    """Retrieves the database config.

    Returns:
        a :class:`DatabaseConfigDocument`
    """
    conn = get_db_conn()

    config_docs = list(conn.config.find())
    if config_docs:
        if len(config_docs) > 1:
            config_doc = _handle_multiple_config_docs(conn, config_docs)
        else:
            config_doc = config_docs[0]

        config = DatabaseConfigDocument(conn, **config_doc)
        save = False
    else:
        config = DatabaseConfigDocument(conn)
        save = True

    if config.version is None:
        #
        # If the database has no version, then assume the version of the client
        # that is currently connecting to it.
        #
        # This needs to be implemented here rather than in a migration because
        # this information is required in order to run migrations...
        #
        config.version = foc.VERSION
        save = True

    if config.type is None:
        #
        # If the database has no type, then assume the type of the client that
        # is currently connecting to it.
        #
        # This needs to be implemented here rather than in a migration because
        # this information is required in order to decide if a client is
        # allowed to connect to the database at all (a precursor to running a
        # migration)...
        #
        config.type = foc.CLIENT_TYPE
        save = True

    if save:
        config.save()

    return config


def _handle_multiple_config_docs(conn, config_docs):
    if fo.config.database_admin:
        logger.warning(
            "Unexpectedly found %d documents in the 'config' collection; "
            "deleting all but the newest one",
            len(config_docs),
        )

        # Use aggregation to be sure that even under heavy concurrency, we
        # don't accidentally delete all the docs
        conn.config.aggregate(
            [{"$sort": {"_id": -1}}, {"$limit": 1}, {"$out": "config"}]
        )

        config_doc = next(iter(conn.config.find()))
    else:
        # Use the newest one
        config_doc = max(config_docs, key=lambda d: d["_id"])

    return config_doc


def establish_db_conn(config):
    """Establishes the database connection.

    If ``fiftyone.config.database_uri`` is defined, then we connect to that
    URI. Otherwise, a :class:`fiftyone.core.service.DatabaseService` is
    created.

    Args:
        config: a :class:`fiftyone.core.config.FiftyOneConfig`

    Raises:
        ConnectionError: if a connection to ``mongod`` could not be established
        FiftyOneConfigError: if ``fiftyone.config.database_uri`` is not
            defined and ``mongod`` could not be found
        ServiceExecutableNotFound: if
            :class:`fiftyone.core.service.DatabaseService` startup was
            attempted, but ``mongod`` was not found in :mod:`fiftyone.db.bin`
        RuntimeError: if the ``mongod`` found does not meet FiftyOne's
            requirements, or validation could not occur
    """
    global _client
    global _db_service
    global _connection_kwargs

    established_port = os.environ.get("FIFTYONE_PRIVATE_DATABASE_PORT", None)
    if established_port is not None:
        _connection_kwargs["port"] = int(established_port)
    if config.database_uri is not None:
        _connection_kwargs["host"] = config.database_uri
    elif _db_service is None:
        if os.environ.get("FIFTYONE_DISABLE_SERVICES", False):
            return

        try:
            _db_service = fos.DatabaseService()
            port = _db_service.port
            _connection_kwargs["port"] = port
            os.environ["FIFTYONE_PRIVATE_DATABASE_PORT"] = str(port)

        except fos.ServiceExecutableNotFound:
            raise FiftyOneConfigError(
                "MongoDB could not be installed on your system. Please "
                "define a `database_uri` in your "
                "`fiftyone.core.config.FiftyOneConfig` to connect to your"
                "own MongoDB instance or cluster "
            )

    _client = pymongo.MongoClient(
        **_connection_kwargs, appname=foc.DATABASE_APPNAME
    )
    _validate_db_version(config, _client)

    # Register cleanup method
    atexit.register(_delete_non_persistent_datasets_if_allowed)

    connect(config.database_name, **_connection_kwargs)

    db_config = get_db_config()
    if db_config.type != foc.CLIENT_TYPE:
        raise ConnectionError(
            "Cannot connect to database type '%s' with client type '%s'"
            % (db_config.type, foc.CLIENT_TYPE)
        )

    if os.environ.get("FIFTYONE_DISABLE_SERVICES", "0") != "1":
        if _db_service is not None and db_config.type == foc.CLIENT_TYPE:
            # if this is a fiftyone-managed database and the database type
            # is fiftyone, try to upgrade the feature compatibility version
            _update_fc_version(_client)
        fom.migrate_database_if_necessary(config=db_config)


def _connect():
    global _client
    if _client is None:
        global _connection_kwargs

        establish_db_conn(fo.config)


def _async_connect(use_global=False):
    # Regular connect here first, to ensure connection kwargs are established
    #   for below.
    _connect()

    global _async_client
    if not use_global or _async_client is None:
        global _connection_kwargs
        client = mtr.AsyncIOMotorClient(
            **_connection_kwargs, appname=foc.DATABASE_APPNAME
        )

        if use_global:
            _async_client = client
    else:
        client = _async_client

    return client


def _delete_non_persistent_datasets_if_allowed():
    """Deletes all non-persistent datasets if and only if we are the only
    client currently connected to the database.
    """
    try:
        num_connections = len(
            list(
                _client.admin.aggregate(
                    [
                        {"$currentOp": {"allUsers": True}},
                        {"$project": {"appName": True, "command": True}},
                        {
                            "$match": {
                                "appName": foc.DATABASE_APPNAME,
                                "$or": [
                                    {"command.ismaster": 1},
                                    {"command.hello": 1},
                                ],
                            }
                        },
                    ]
                )
            )
        )
    except:
        logger.warning(
            "Skipping automatic non-persistent dataset cleanup. This action "
            "requires read access of the 'admin' database"
        )
        return

    try:
        if num_connections <= 1:
            fod.delete_non_persistent_datasets()
    except:
        logger.exception("Skipping automatic non-persistent dataset cleanup")


def _validate_db_version(config, client):
    try:
        version = Version(client.server_info()["version"])
    except Exception as e:
        if isinstance(e, ServerSelectionTimeoutError):
            raise ConnectionError("Could not connect to `mongod`") from e

        raise RuntimeError("Failed to validate `mongod` version") from e

    if config.database_validation and version < foc.MIN_MONGODB_VERSION:
        raise RuntimeError(
            "Found `mongod` version %s, but only %s and higher are "
            "compatible. You can suppress this exception by setting your "
            "`database_validation` config parameter to `False`. See "
            "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
            "for more information" % (version, foc.MIN_MONGODB_VERSION)
        )


def _get_fcv_and_version(
    client: pymongo.MongoClient,
) -> Tuple[Version, Version]:
    """Fetches the current FCV and server version.

    Args:
        client: a ``pymongo.MongoClient`` to connect to the database

    Returns:
        a tuple of

        -   a ``Version`` of the FCV
        -   a ``Version`` of the server version

    Raises:
        ConnectionError: if a connection to ``mongod`` could not be established
    """
    try:
        current_version = client.admin.command(
            {"getParameter": 1, "featureCompatibilityVersion": 1}
        )
        current_fcv = Version(
            current_version["featureCompatibilityVersion"]["version"]
        )
        server_version = Version(client.server_info()["version"])
        return current_fcv, server_version
    except ServerSelectionTimeoutError as e:
        raise ConnectionError("Could not connect to `mongod`") from e


def _is_fcv_upgradeable(fc_version: Version, server_version: Version) -> bool:
    """Tests to see if feature compatibility version (FCV) upgrade is possible.

    The following conditions return ``False``:

        -   If both the server's version and FCV are the oldest supported
            version, warn about any upcoming deprecations
        -   If the FCV isgreater than the server version, warn that this is an
            unexpected
        -   If the major versions between server and FCV is greater than we can
            handle, warn that this is unexpected

    Note that MongoDB will fail to initialize if the server version and FCV
    differ by two or more major versions, so this check may be redundant.

    Args:
        client: a ``pymongo.MongoClient`` to connect to the database

    Returns:
        whether a version upgrade is possible
    """

    _logger = _get_logger()

    if (fc_version == foc.MIN_MONGODB_VERSION) and (
        server_version == foc.MIN_MONGODB_VERSION
    ):
        _logger.warning(
            "You are running the oldest supported version of mongo. "
            "Please refer to https://deprecation.voxel51.com "
            "for deprecation notices."
        )
        return False

    elif fc_version > server_version:
        _logger.warning(
            "Your MongoDB feature compatibility is greater than your "
            "server version. "
            "This may result in unexpected consequences. "
            "Please manually update your database's feature compatibility "
            "version."
        )
        return False

    elif server_version.major - fc_version.major > foc.MAX_ALLOWABLE_FCV_DELTA:
        _logger.warning(
            "Your MongoDB server version is more than %s "
            "ahead of your database's feature compatibility version. "
            "Please manually update your database's feature "
            "compatibility version." % str(foc.MAX_ALLOWABLE_FCV_DELTA)
        )
        return False

    elif server_version.major > fc_version.major:
        return True

    return False


def _update_fc_version(client: pymongo.MongoClient):
    """Updates a database's feature compatibility version (FCV) if possible.

    Checks to see if a version upgrade for the FCV is required and possible.
    If it is, issue an upgrade and log as a warning.

    Note that MongoDB will fail to initialize if the server version and FCV
    differ by two or more major versions, so this check may be redundant.

    Args:
        client: a ``pymongo.MongoClient`` to connect to the database
    """

    fc_version, server_version = _get_fcv_and_version(client)
    _logger = _get_logger()

    if _is_fcv_upgradeable(fc_version, server_version):
        bumped = f"{server_version.major}.0"
        cmd = {"setFeatureCompatibilityVersion": bumped}

        if (
            server_version.major
            >= foc.MONGODB_SERVER_FCV_REQUIRED_CONFIRMATION.major
        ):
            # Server version 7.0+ added the confirm flag
            cmd["confirm"] = True

        try:
            _logger.warning(
                "Your MongoDB server version is newer than your feature "
                "compatibility version. "
                "Upgrading the feature compatibility version now."
            )
            client.admin.command(cmd)

        except OperationFailure as e:
            _logger.error(
                "Operation failed while updating database's feature "
                "compatibility version - %s. "
                "Please manually set it to %s." % (str(e), bumped)
            )

        except PyMongoError as e:
            _logger.error(
                "MongoDB error while updating database's feature "
                "compatibility version - %s. "
                "Please manually set it to %s." % (str(e), bumped)
            )


def aggregate(collection, pipelines):
    """Executes one or more aggregations on a collection.

    Multiple aggregations are executed using multiple threads, and their
    results are returned as lists rather than cursors.

    Args:
        collection: a ``pymongo.collection.Collection`` or
            ``motor.motor_asyncio.AsyncIOMotorCollection``
        pipelines: a MongoDB aggregation pipeline or a list of pipelines

    Returns:
        -   If a single pipeline is provided, a
            ``pymongo.command_cursor.CommandCursor`` or
            ``motor.motor_asyncio.AsyncIOMotorCommandCursor`` is returned

        -   If multiple pipelines are provided, each cursor is extracted into
            a list and the list of lists is returned
    """
    pipelines = list(pipelines)

    is_list = pipelines and not isinstance(pipelines[0], dict)
    if not is_list:
        pipelines = [pipelines]

    num_pipelines = len(pipelines)
    if isinstance(collection, mtr.AsyncIOMotorCollection):
        if num_pipelines == 1 and not is_list:
            return collection.aggregate(pipelines[0], allowDiskUse=True)

        return _do_async_pooled_aggregate(collection, pipelines)

    if num_pipelines == 1:
        result = collection.aggregate(pipelines[0], allowDiskUse=True)
        return [result] if is_list else result

    return _do_pooled_aggregate(collection, pipelines)


def _do_pooled_aggregate(collection, pipelines):
    # @todo: MongoDB 5.0 supports snapshots which can be used to make the
    # results consistent, i.e. read from the same point in time
    with ThreadPool(processes=len(pipelines)) as pool:
        return pool.map(
            lambda p: list(collection.aggregate(p, allowDiskUse=True)),
            pipelines,
            chunksize=1,
        )


async def _do_async_pooled_aggregate(collection, pipelines):
    return await asyncio.gather(
        *[_do_async_aggregate(collection, pipeline) for pipeline in pipelines]
    )


async def _do_async_aggregate(collection, pipeline):
    return [i async for i in collection.aggregate(pipeline, allowDiskUse=True)]


def ensure_connection():
    """Ensures database connection exists"""
    _connect()


def get_db_client():
    """Returns a database client.

    Returns:
        a ``pymongo.mongo_client.MongoClient``
    """
    _connect()
    return _client


def get_db_conn():
    """Returns a connection to the database.

    Returns:
        a ``pymongo.database.Database``
    """
    _connect()
    db = _client[fo.config.database_name]
    return _apply_options(db)


def get_async_db_client(use_global=False):
    """Returns an async database client.

    Args:
        use_global: whether to use the global client singleton

    Returns:
        a ``motor.motor_asyncio.AsyncIOMotorClient``
    """
    return _async_connect(use_global)


def get_async_db_conn(use_global=False):
    """Returns an async connection to the database.

    Returns:
        a ``motor.motor_asyncio.AsyncIOMotorDatabase``
    """
    db = get_async_db_client(use_global=use_global)[fo.config.database_name]
    return _apply_options(db)


def _apply_options(db):
    timezone = fo.config.timezone

    if not timezone:
        return db

    if timezone.lower() == "local":
        tzinfo = datetime.now().astimezone().tzinfo
    else:
        tzinfo = pytz.timezone(timezone)

    return db.with_options(
        codec_options=CodecOptions(tz_aware=True, tzinfo=tzinfo)
    )


def drop_database():
    """Drops the database."""
    _connect()
    _client.drop_database(fo.config.database_name)


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


def drop_collection(collection_name):
    """Drops specified collection from the database.

    Args:
        collection_name: the collection name
    """
    conn = get_db_conn()
    conn.drop_collection(collection_name)


def drop_orphan_collections(dry_run=False):
    """Drops all orphan collections from the database.

    Orphan collections are collections that are not associated with any known
    dataset or other collections used by FiftyOne.

    Args:
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    colls_in_use = set()
    for dataset_dict in conn.datasets.find({}):
        sample_coll_name = dataset_dict.get("sample_collection_name", None)
        if sample_coll_name:
            colls_in_use.add(sample_coll_name)
            colls_in_use.add("frames." + sample_coll_name)

    # Only collections with these prefixes may be deleted
    coll_prefixes = ("samples.", "frames.", "patches.", "clips.")

    for coll_name in conn.list_collection_names():
        if coll_name not in colls_in_use and any(
            coll_name.startswith(prefix) for prefix in coll_prefixes
        ):
            _logger.info("Dropping collection '%s'", coll_name)
            if not dry_run:
                conn.drop_collection(coll_name)


def drop_orphan_saved_views(dry_run=False):
    """Drops all orphan saved views from the database.

    Orphan saved views are saved view documents that are not associated with
    any known dataset or other collections used by FiftyOne.

    Args:
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    view_ids_in_use = set()
    for dataset_dict in conn.datasets.find({}):
        view_ids = _get_saved_view_ids(dataset_dict)
        view_ids_in_use.update(view_ids)

    all_view_ids = set(conn.views.distinct("_id"))

    orphan_view_ids = list(all_view_ids - view_ids_in_use)

    if not orphan_view_ids:
        return

    _logger.info(
        "Deleting %d orphan saved view(s): %s",
        len(orphan_view_ids),
        orphan_view_ids,
    )
    if not dry_run:
        _delete_saved_views(conn, orphan_view_ids)


def drop_orphan_runs(dry_run=False):
    """Drops all orphan runs from the database.

    Orphan runs are runs that are not associated with any known dataset or
    other collections used by FiftyOne.

    Args:
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    run_ids_in_use = set()
    result_ids_in_use = set()
    for dataset_dict in conn.datasets.find({}):
        run_ids = _get_run_ids(dataset_dict)
        run_ids_in_use.update(run_ids)

        result_ids = _get_result_ids(conn, dataset_dict)
        result_ids_in_use.update(result_ids)

    all_run_ids = set(conn.runs.distinct("_id"))
    all_result_ids = set(conn.fs.files.distinct("_id"))

    orphan_run_ids = list(all_run_ids - run_ids_in_use)
    orphan_result_ids = list(all_result_ids - result_ids_in_use)

    if orphan_run_ids:
        _logger.info(
            "Deleting %d orphan run(s): %s",
            len(orphan_run_ids),
            orphan_run_ids,
        )
        if not dry_run:
            _delete_run_docs(conn, orphan_run_ids)

    if orphan_result_ids:
        _logger.info(
            "Deleting %d orphan run result(s): %s",
            len(orphan_result_ids),
            orphan_result_ids,
        )
        if not dry_run:
            _delete_run_results(conn, orphan_result_ids)


def drop_orphan_stores(dry_run=False):
    """Drops all orphan execution stores from the database.

    Orphan stores are those that are associated with a dataset that no longer
    exists in the database.

    Args:
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_ids = set(conn.datasets.distinct("_id"))

    store_ids = set(conn.execution_store.distinct("dataset_id"))
    store_ids.discard(None)

    orphan_store_ids = list(store_ids - dataset_ids)

    if orphan_store_ids:
        _logger.info(
            "Deleting %d orphan store(s): %s",
            len(orphan_store_ids),
            orphan_store_ids,
        )
        if not dry_run:
            _delete_stores(conn, orphan_store_ids)


def stream_collection(collection_name):
    """Streams the contents of the collection to stdout.

    Args:
        collection_name: the name of the collection
    """
    conn = get_db_conn()
    coll = conn[collection_name]
    objects = map(fou.pformat, coll.find({}))
    fou.stream_objects(objects)


def get_collection_stats(collection_name):
    """Sets stats about the collection.

    Args:
        collection_name: the name of the collection

    Returns:
        a stats dict
    """
    conn = get_db_conn()
    stats = dict(conn.command("collstats", collection_name))
    stats["wiredTiger"] = None
    stats["indexDetails"] = None
    return stats


def count_documents(coll, pipeline):
    result = aggregate(coll, pipeline + [{"$count": "count"}])

    try:
        return list(result)[0]["count"]
    except:
        pass

    return 0


def export_document(doc, json_path):
    """Exports the document to disk in JSON format.

    Args:
        doc: a BSON document dict
        json_path: the path to write the JSON file
    """
    etau.write_file(json_util.dumps(doc), json_path)


def export_collection(
    docs,
    json_dir_or_path,
    key="documents",
    patt="{idx:06d}-{id}.json",
    num_docs=None,
    progress=None,
):
    """Exports the collection to disk in JSON format.

    Args:
        docs: an iterable containing the documents to export
        json_dir_or_path: the path to write a single JSON file containing the
            entire collection, or a directory in which to write per-document
            JSON files
        key ("documents"): the field name under which to store the documents
            when ``json_path`` is a single JSON file
        patt ("{idx:06d}-{id}.json"): a filename pattern to use when
            ``json_path`` is a directory. The pattern may contain ``idx`` to
            refer to the index of the document in ``docs`` or ``id`` to refer
            to the document's ID
        num_docs (None): the total number of documents. If omitted, this must
            be computable via ``len(docs)``
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
    """
    if num_docs is None:
        num_docs = len(docs)

    if json_dir_or_path.endswith(".json"):
        _export_collection_single(
            docs, json_dir_or_path, key, num_docs, progress=progress
        )
    else:
        _export_collection_multi(
            docs, json_dir_or_path, patt, num_docs, progress=progress
        )


def _export_collection_single(docs, json_path, key, num_docs, progress=None):
    etau.ensure_basedir(json_path)

    with open(json_path, "w") as f:
        f.write('{"%s": [' % key)
        with fou.ProgressBar(
            total=num_docs, iters_str="docs", progress=progress
        ) as pb:
            for idx, doc in pb(enumerate(docs, 1)):
                f.write(json_util.dumps(doc))
                if idx < num_docs:
                    f.write(",")

        f.write("]}")


def _export_collection_multi(docs, json_dir, patt, num_docs, progress=None):
    etau.ensure_dir(json_dir)

    json_patt = os.path.join(json_dir, patt)
    with fou.ProgressBar(
        total=num_docs, iters_str="docs", progress=progress
    ) as pb:
        for idx, doc in pb(enumerate(docs, 1)):
            json_path = json_patt.format(idx=idx, id=str(doc["_id"]))
            export_document(doc, json_path)


def import_document(json_path):
    """Imports a document from JSON on disk.

    Args:
        json_path: the path to the document

    Returns:
        a BSON document dict
    """
    with open(json_path, "r") as f:
        return json_util.loads(f.read())


def import_collection(json_dir_or_path, key="documents"):
    """Imports the collection from JSON on disk.

    Args:
        json_dir_or_path: the path to a JSON file on disk, or a directory
            containing per-document JSON files
        key ("documents"): the field name under which the documents are stored
            when ``json_path`` is a single JSON file

    Returns:
        a tuple of

        -   an iterable of BSON documents
        -   the number of documents
    """
    if json_dir_or_path.endswith(".json"):
        return _import_collection_single(json_dir_or_path, key)

    return _import_collection_multi(json_dir_or_path)


def _import_collection_single(json_path, key):
    with open(json_path, "r") as f:
        docs = json_util.loads(f.read()).get(key, [])

    num_docs = len(docs)

    return docs, num_docs


def _import_collection_multi(json_dir):
    json_paths = [
        p
        for p in etau.list_files(json_dir, abs_paths=True)
        if p.endswith(".json")
    ]
    docs = map(import_document, json_paths)

    return docs, len(json_paths)


def insert_documents(docs, coll, ordered=False, progress=None, num_docs=None):
    """Inserts documents into a collection.

    The ``_id`` field of the input documents will be populated if it is not
    already set.

    Args:
        docs: an iterable of BSON document dicts
        coll: a pymongo collection
        ordered (False): whether the documents must be inserted in order
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
        num_docs (None): the total number of documents. Only used when
            ``progress=True``. If omitted, this will be computed via
            ``len(docs)``, if possible

    Returns:
        a list of IDs of the inserted documents
    """
    ids = []
    batcher = fou.get_default_batcher(docs, progress=progress, total=num_docs)

    try:
        with batcher:
            for batch in batcher:
                batch = list(batch)
                coll.insert_many(batch, ordered=ordered)
                ids.extend(b["_id"] for b in batch)
                if batcher.manual_backpressure:
                    # @todo can we infer content size from insert_many() above?
                    batcher.apply_backpressure(batch)

    except BulkWriteError as bwe:
        msg = bwe.details["writeErrors"][0]["errmsg"]
        raise ValueError(msg) from bwe

    return ids


def bulk_write(ops, coll, ordered=False, progress=False):
    """Performs a batch of write operations on a collection.

    Args:
        ops: a list of pymongo operations
        coll: a pymongo collection
        ordered (False): whether the operations must be performed in order
        progress (False): whether to render a progress bar (True/False), use
            the default value ``fiftyone.config.show_progress_bars`` (None), or
            a progress callback function to invoke instead
    """
    batcher = fou.get_default_batcher(ops, progress=progress)

    try:
        with batcher:
            for batch in batcher:
                batch = list(batch)
                coll.bulk_write(batch, ordered=ordered)
                if batcher.manual_backpressure:
                    # @todo can we infer content size from bulk_write() above?
                    # @todo do we need a more accurate measure of size here?
                    content_size = sum(len(str(b)) for b in batch)
                    batcher.apply_backpressure(content_size)

    except BulkWriteError as bwe:
        msg = bwe.details["writeErrors"][0]["errmsg"]
        raise ValueError(msg) from bwe


def list_datasets():
    """Returns the list of available FiftyOne datasets.

    This is a low-level implementation of dataset listing that does not call
    :meth:`fiftyone.core.dataset.list_datasets`, which is helpful if a
    database may be corrupted.

    Returns:
        a list of :class:`Dataset` names
    """
    conn = get_db_conn()
    return conn.datasets.distinct("name")


def _patch_referenced_docs(
    dataset_name, collection_name, field_name, dry_run=False
):
    """Ensures that the referenced documents in the collection for
    the given dataset exactly match the IDs in its dataset document.
    """
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_dict = conn.datasets.find_one({"name": dataset_name})
    if not dataset_dict:
        _logger.warning("Dataset '%s' not found", dataset_name)
        return

    dataset_id = dataset_dict["_id"]
    ids_from_dataset_list = dataset_dict.get(field_name, [])

    # {id: name} in collection_name
    doc_id_to_name = {}
    for ref_doc_dict in conn[collection_name].find(
        {"_dataset_id": dataset_id}
    ):
        try:
            doc_id_to_name[ref_doc_dict["_id"]] = ref_doc_dict["name"]
        except:
            pass

    # Make sure docs in `views` collection match IDs in `dataset_dict`
    ids_from_dataset_set = set(ids_from_dataset_list)
    ids_from_collection = set(doc_id_to_name)
    made_changes = False

    bad_ids = ids_from_dataset_set - ids_from_collection
    num_bad_ids = len(bad_ids)
    if num_bad_ids > 0:
        _logger.info(
            "Purging %d bad %s view ID(s) %s from dataset",
            num_bad_ids,
            field_name,
            bad_ids,
        )
        ids_from_dataset_list = [
            _id for _id in ids_from_dataset_list if _id not in bad_ids
        ]
        made_changes = True

    missing_ids = ids_from_collection - ids_from_dataset_set
    num_missing_docs = len(missing_ids)
    if num_missing_docs > 0:
        missing_docs = [(_id, doc_id_to_name[_id]) for _id in missing_ids]
        _logger.info(
            "Adding %d misplaced %s(s) %s back to dataset",
            num_missing_docs,
            field_name,
            missing_docs,
        )
        ids_from_dataset_list.extend(missing_ids)
        made_changes = True

    if made_changes and not dry_run:
        conn.datasets.update_one(
            {"name": dataset_name},
            {"$set": {field_name: ids_from_dataset_list}},
        )


def patch_saved_views(dataset_name, dry_run=False):
    """Ensures that the saved view documents in the ``views`` collection for
    the given dataset exactly match the IDs in its dataset document.

    Args:
        dataset_name: the name of the dataset
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _patch_referenced_docs(dataset_name, "views", "saved_views", dry_run)


def patch_workspaces(dataset_name, dry_run=False):
    """Ensures that the workspace documents in the ``workspaces`` collection for
    the given dataset exactly match the IDs in its dataset document.

    Args:
        dataset_name: the name of the dataset
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _patch_referenced_docs(dataset_name, "workspaces", "workspaces", dry_run)


def patch_annotation_runs(dataset_name, dry_run=False):
    """Ensures that the annotation runs in the ``runs`` collection for the
    given dataset exactly match the values in its dataset document.

    Args:
        dataset_name: the name of the dataset
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _patch_runs(
        dataset_name,
        "annotation_runs",
        foa.AnnotationMethod,
        "annotation run",
        dry_run=dry_run,
    )


def patch_brain_runs(dataset_name, dry_run=False):
    """Ensures that the brain method runs in the ``runs`` collection for the
    given dataset exactly match the values in its dataset document.

    Args:
        dataset_name: the name of the dataset
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _patch_runs(
        dataset_name,
        "brain_methods",
        fob.BrainMethod,
        "brain method run",
        dry_run=dry_run,
    )


def patch_evaluations(dataset_name, dry_run=False):
    """Ensures that the evaluation runs in the ``runs`` collection for the
    given dataset exactly match the values in its dataset document.

    Args:
        dataset_name: the name of the dataset
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _patch_runs(
        dataset_name,
        "evaluations",
        foe.EvaluationMethod,
        "evaluation",
        dry_run=dry_run,
    )


def patch_runs(dataset_name, dry_run=False):
    """Ensures that the runs in the ``runs`` collection for the given dataset
    exactly match the values in its dataset document.

    Args:
        dataset_name: the name of the dataset
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _patch_runs(
        dataset_name,
        "runs",
        fors.Run,
        "run",
        dry_run=dry_run,
    )


def _patch_runs(dataset_name, runs_field, run_cls, run_str, dry_run=False):
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_dict = conn.datasets.find_one({"name": dataset_name})
    if not dataset_dict:
        _logger.warning("Dataset '%s' not found", dataset_name)
        return

    dataset_id = dataset_dict["_id"]

    # {key: id} in dataset_dict
    runs_dict = dataset_dict.get(runs_field, {})

    # {key: id} in runs collection
    rd = {}
    for run_dict in conn.runs.find({"_dataset_id": dataset_id}):
        try:
            cls = etau.get_class(run_dict["config"]["cls"][: -len("Config")])
            if issubclass(cls, run_cls):
                rd[run_dict["key"]] = run_dict["_id"]
        except:
            pass

    # In order for a run to be valid, its ``(key, id)`` must match in both
    # `dataset_dict` and the `runs` collection
    runs = set(runs_dict.items())
    run_docs = set(rd.items())
    made_changes = False

    bad_runs = runs - run_docs
    num_bad_runs = len(bad_runs)
    if num_bad_runs > 0:
        _logger.info(
            "Purging %d %s(s) %s from dataset",
            num_bad_runs,
            run_str,
            bad_runs,
        )
        for bad_key, _ in bad_runs:
            runs_dict.pop(bad_key, None)

        made_changes = True

    missing_runs = run_docs - runs
    num_missing_runs = len(missing_runs)
    if num_missing_runs > 0:
        _logger.info(
            "Adding %d misplaced %s(s) %s to dataset",
            num_missing_runs,
            run_str,
            missing_runs,
        )
        runs_dict.update(missing_runs)
        made_changes = True

    if made_changes:
        conn.datasets.update_one(
            {"name": dataset_name},
            {"$set": {runs_field: runs_dict}},
        )


def delete_dataset(name, dry_run=False):
    """Deletes the dataset with the given name.

    This is a low-level implementation of deletion that does not call
    :meth:`fiftyone.core.dataset.load_dataset`, which is helpful if a dataset's
    backing document or collections are corrupted and cannot be loaded via the
    normal pathways.

    Args:
        name: the name of the dataset
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_dict = conn.datasets.find_one({"name": name})
    if not dataset_dict:
        _logger.warning("Dataset '%s' not found", name)
        return

    _logger.info("Dropping document '%s' from 'datasets' collection", name)
    if not dry_run:
        conn.datasets.delete_one({"name": name})

    if "sample_collection_name" not in dataset_dict:
        _logger.warning(
            "Cannot find sample/frame collections for dataset '%s'; stopping "
            "now. Use `drop_orphan_collections()` to cleanup any dangling "
            "collections",
            name,
        )
        return

    collections = conn.list_collection_names()

    sample_collection_name = dataset_dict["sample_collection_name"]
    if sample_collection_name in collections:
        _logger.info("Dropping collection '%s'", sample_collection_name)
        if not dry_run:
            conn.drop_collection(sample_collection_name)

    frame_collection_name = "frames." + sample_collection_name
    if frame_collection_name in collections:
        _logger.info("Dropping collection '%s'", frame_collection_name)
        if not dry_run:
            conn.drop_collection(frame_collection_name)

    view_ids = _get_saved_view_ids(dataset_dict)

    if view_ids:
        _logger.info("Deleting %d saved view(s)", len(view_ids))
        if not dry_run:
            _delete_saved_views(conn, view_ids)

    run_ids = _get_run_ids(dataset_dict)
    result_ids = _get_result_ids(conn, dataset_dict)

    if run_ids:
        _logger.info("Deleting %d run doc(s)", len(run_ids))
        if not dry_run:
            _delete_run_docs(conn, run_ids)

    if result_ids:
        _logger.info("Deleting %d run result(s)", len(result_ids))
        if not dry_run:
            _delete_run_results(conn, result_ids)

    _id = dataset_dict["_id"]
    num_stores = conn.execution_store.count_documents(
        {"dataset_id": _id, "key": "__store__"}
    )
    if num_stores > 0:
        _logger.info("Deleting %d store(s)", num_stores)
        if not dry_run:
            conn.execution_store.delete_many({"dataset_id": _id})


def delete_saved_view(dataset_name, view_name, dry_run=False):
    """Deletes the saved view with the given name from the dataset with the
    given name.

    This is a low-level implementation of deletion that does not call
    :meth:`fiftyone.core.dataset.load_dataset` or
    :meth:`fiftyone.core.collections.SampleCollection.load_saved_view`,
    which is helpful if a dataset's backing document or collections are
    corrupted and cannot be loaded via the normal pathways.

    Args:
        dataset_name: the name of the dataset
        view_name: the name of the saved view
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_dict = conn.datasets.find_one({"name": dataset_name})
    if not dataset_dict:
        _logger.warning("Dataset '%s' not found", dataset_name)
        return

    dataset_id = dataset_dict["_id"]
    saved_views = dataset_dict.get("saved_views", [])

    # {name: id} in `views` collection
    sd = {}
    for saved_view_dict in conn.views.find({"_dataset_id": dataset_id}):
        try:
            sd[saved_view_dict["name"]] = saved_view_dict["_id"]
        except:
            pass

    del_id = sd.get(view_name, None)
    if del_id is None:
        _logger.warning(
            "Dataset '%s' has no saved view '%s'", dataset_name, view_name
        )
        return

    _logger.info(
        "Deleting saved view %s' with ID '%s' from dataset '%s'",
        view_name,
        del_id,
        dataset_name,
    )

    saved_views = [_id for _id in saved_views if _id != del_id]

    if not dry_run:
        conn.datasets.update_one(
            {"name": dataset_name},
            {"$set": {"saved_views": saved_views}},
        )
        _delete_saved_views(conn, [del_id])


def delete_saved_views(dataset_name, dry_run=False):
    """Deletes all saved views from the dataset with the given name.

    This is a low-level implementation of deletion that does not call
    :meth:`fiftyone.core.dataset.load_dataset` or
    :meth:`fiftyone.core.collections.SampleCollection.load_saved_view`,
    which is helpful if a dataset's backing document or collections are
    corrupted and cannot be loaded via the normal pathways.

    Args:
        dataset_name: the name of the dataset
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_dict = conn.datasets.find_one({"name": dataset_name})
    if not dataset_dict:
        _logger.warning("Dataset '%s' not found", dataset_name)
        return

    dataset_id = dataset_dict["_id"]
    del_ids = [d["_id"] for d in conn.views.find({"_dataset_id": dataset_id})]

    if not del_ids:
        _logger.info("Dataset '%s' has no saved views", dataset_name)
        return

    _logger.info(
        "Deleting %d saved views from dataset '%s'",
        len(del_ids),
        dataset_name,
    )

    if not dry_run:
        conn.datasets.update_one(
            {"name": dataset_name},
            {"$set": {"saved_views": []}},
        )
        _delete_saved_views(conn, del_ids)


def delete_annotation_run(name, anno_key, dry_run=False):
    """Deletes the annotation run with the given key from the dataset with
    the given name.

    This is a low-level implementation of deletion that does not call
    :meth:`fiftyone.core.dataset.load_dataset` or
    :meth:`fiftyone.core.collections.SampleCollection.delete_annotation_run`,
    which is helpful if a dataset's backing document or collections are
    corrupted and cannot be loaded via the normal pathways.

    Note that, as this method does not load :class:`fiftyone.core.runs.Run`
    instances, it does not call :meth:`fiftyone.core.runs.Run.cleanup`.

    Args:
        name: the name of the dataset
        anno_key: the annotation key
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _delete_run(
        name,
        anno_key,
        "annotation_runs",
        "annotation run",
        dry_run=dry_run,
    )


def delete_annotation_runs(name, dry_run=False):
    """Deletes all annotation runs from the dataset with the given name.

    This is a low-level implementation of deletion that does not call
    :meth:`fiftyone.core.dataset.load_dataset` or
    :meth:`fiftyone.core.collections.SampleCollection.delete_annotation_runs`,
    which is helpful if a dataset's backing document or collections are
    corrupted and cannot be loaded via the normal pathways.

    Note that, as this method does not load :class:`fiftyone.core.runs.Run`
    instances, it does not call :meth:`fiftyone.core.runs.Run.cleanup`.

    Args:
        name: the name of the dataset
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _delete_runs(
        name,
        "annotation_runs",
        "annotation run",
        dry_run=dry_run,
    )


def delete_brain_run(name, brain_key, dry_run=False):
    """Deletes the brain method run with the given key from the dataset with
    the given name.

    This is a low-level implementation of deletion that does not call
    :meth:`fiftyone.core.dataset.load_dataset` or
    :meth:`fiftyone.core.collections.SampleCollection.delete_brain_run`,
    which is helpful if a dataset's backing document or collections are
    corrupted and cannot be loaded via the normal pathways.

    Note that, as this method does not load :class:`fiftyone.core.runs.Run`
    instances, it does not call :meth:`fiftyone.core.runs.Run.cleanup`.

    Args:
        name: the name of the dataset
        brain_key: the brain key
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _delete_run(
        name,
        brain_key,
        "brain_methods",
        "brain method run",
        dry_run=dry_run,
    )


def delete_brain_runs(name, dry_run=False):
    """Deletes all brain method runs from the dataset with the given name.

    This is a low-level implementation of deletion that does not call
    :meth:`fiftyone.core.dataset.load_dataset` or
    :meth:`fiftyone.core.collections.SampleCollection.delete_brain_runs`,
    which is helpful if a dataset's backing document or collections are
    corrupted and cannot be loaded via the normal pathways.

    Note that, as this method does not load :class:`fiftyone.core.runs.Run`
    instances, it does not call :meth:`fiftyone.core.runs.Run.cleanup`.

    Args:
        name: the name of the dataset
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _delete_runs(
        name,
        "brain_methods",
        "brain method run",
        dry_run=dry_run,
    )


def delete_evaluation(name, eval_key, dry_run=False):
    """Deletes the evaluation run with the given key from the dataset with the
    given name.

    This is a low-level implementation of deletion that does not call
    :meth:`fiftyone.core.dataset.load_dataset` or
    :meth:`fiftyone.core.collections.SampleCollection.delete_evaluation`,
    which is helpful if a dataset's backing document or collections are
    corrupted and cannot be loaded via the normal pathways.

    Note that, as this method does not load :class:`fiftyone.core.runs.Run`
    instances, it does not call :meth:`fiftyone.core.runs.Run.cleanup`.

    Args:
        name: the name of the dataset
        eval_key: the evaluation key
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _delete_run(
        name,
        eval_key,
        "evaluations",
        "evaluation",
        dry_run=dry_run,
    )


def delete_evaluations(name, dry_run=False):
    """Deletes all evaluations from the dataset with the given name.

    This is a low-level implementation of deletion that does not call
    :meth:`fiftyone.core.dataset.load_dataset` or
    :meth:`fiftyone.core.collections.SampleCollection.delete_evaluations`,
    which is helpful if a dataset's backing document or collections are
    corrupted and cannot be loaded via the normal pathways.

    Note that, as this method does not load :class:`fiftyone.core.runs.Run`
    instances, it does not call :meth:`fiftyone.core.runs.Run.cleanup`.

    Args:
        name: the name of the dataset
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _delete_runs(
        name,
        "evaluations",
        "evaluation",
        dry_run=dry_run,
    )


def delete_run(name, run_key, dry_run=False):
    """Deletes the run with the given key from the dataset with the given name.

    This is a low-level implementation of deletion that does not call
    :meth:`fiftyone.core.dataset.load_dataset` or
    :meth:`fiftyone.core.collections.SampleCollection.delete_run`, which is
    helpful if a dataset's backing document or collections are corrupted and
    cannot be loaded via the normal pathways.

    Note that, as this method does not load :class:`fiftyone.core.runs.Run`
    instances, it does not call :meth:`fiftyone.core.runs.Run.cleanup`.

    Args:
        name: the name of the dataset
        run_key: the run key
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _delete_run(
        name,
        run_key,
        "runs",
        "run",
        dry_run=dry_run,
    )


def delete_runs(name, dry_run=False):
    """Deletes all runs from the dataset with the given name.

    This is a low-level implementation of deletion that does not call
    :meth:`fiftyone.core.dataset.load_dataset` or
    :meth:`fiftyone.core.collections.SampleCollection.delete_runs`, which is
    helpful if a dataset's backing document or collections are corrupted and
    cannot be loaded via the normal pathways.

    Note that, as this method does not load :class:`fiftyone.core.runs.Run`
    instances, it does not call :meth:`fiftyone.core.runs.Run.cleanup`.

    Args:
        name: the name of the dataset
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    _delete_runs(
        name,
        "runs",
        "run",
        dry_run=dry_run,
    )


def _get_logger(dry_run=False):
    if dry_run:
        return _DryRunLoggerAdapter(logger, {})

    return logger


class _DryRunLoggerAdapter(logging.LoggerAdapter):
    def process(self, msg, kwargs):
        msg = "(dry run) " + msg
        return msg, kwargs


def _delete_run(dataset_name, run_key, runs_field, run_str, dry_run=False):
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_dict = conn.datasets.find_one({"name": dataset_name})
    if not dataset_dict:
        _logger.warning("Dataset '%s' not found", dataset_name)
        return

    runs = dataset_dict.get(runs_field, {})
    if run_key not in runs:
        _logger.warning(
            "Dataset '%s' has no %s with key '%s'",
            dataset_name,
            run_str,
            run_key,
        )
        return

    _logger.info(
        "Deleting %s '%s' from dataset '%s'",
        run_str,
        run_key,
        dataset_name,
    )

    run_id = runs.pop(run_key)

    run_doc = conn.runs.find_one({"_id": run_id})
    result_id = run_doc.get("results", None)
    if result_id is not None:
        _logger.info("Deleting %s result '%s'", run_str, result_id)
        if not dry_run:
            _delete_run_results(conn, [result_id])

    if not dry_run:
        _logger.info("Deleting %s doc '%s'", run_str, run_id)
        conn.runs.delete_one({"_id": run_id})
        conn.datasets.update_one(
            {"name": dataset_name},
            {"$set": {runs_field: runs}},
        )


def _delete_runs(dataset_name, runs_field, run_str, dry_run=False):
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_dict = conn.datasets.find_one({"name": dataset_name})
    if not dataset_dict:
        _logger.warning("Dataset '%s' not found", dataset_name)
        return

    runs = dataset_dict.get(runs_field, {})
    if not runs:
        _logger.info("Dataset '%s' has no %ss", dataset_name, run_str)
        return

    run_keys, run_ids = zip(*runs.items())

    _logger.info(
        "Deleting %s(s) %s from dataset '%s'",
        run_str,
        run_keys,
        dataset_name,
    )

    result_ids = _get_result_ids(conn, dataset_dict)

    if run_ids:
        _logger.info("Deleting %d %s doc(s)", len(run_ids), run_str)
        if not dry_run:
            _delete_run_docs(conn, run_ids)

    if result_ids:
        _logger.info("Deleting %d %s result(s)", len(result_ids), run_str)
        if not dry_run:
            _delete_run_results(conn, result_ids)

    if not dry_run:
        conn.datasets.update_one(
            {"name": dataset_name},
            {"$set": {runs_field: {}}},
        )


def _get_saved_view_ids(dataset_dict):
    view_ids = []

    for view_doc_or_id in dataset_dict.get("saved_views", []):
        # Saved view docs used to be stored directly in `dataset_dict`.
        # Such data could be encountered here because datasets are lazily
        # migrated
        if isinstance(view_doc_or_id, ObjectId):
            view_ids.append(view_doc_or_id)

    return view_ids


def _get_run_ids(dataset_dict):
    run_ids = []

    for runs_field in _RUNS_FIELDS:
        for run_doc_or_id in dataset_dict.get(runs_field, {}).values():
            # Run docs used to be stored directly in `dataset_dict`.
            # Such data could be encountered here because datasets are lazily
            # migrated
            if isinstance(run_doc_or_id, ObjectId):
                run_ids.append(run_doc_or_id)

    return run_ids


def _get_result_ids(conn, dataset_dict):
    run_ids = []
    result_ids = []

    for runs_field in _RUNS_FIELDS:
        for run_doc_or_id in dataset_dict.get(runs_field, {}).values():
            if isinstance(run_doc_or_id, ObjectId):
                run_ids.append(run_doc_or_id)
            elif isinstance(run_doc_or_id, dict):
                # Run docs used to be stored directly in `dataset_dict`.
                # Such data could be encountered here because datasets are
                # lazily migrated
                result_id = run_doc_or_id.get("results", None)
                if result_id is not None:
                    result_ids.append(result_id)

    if run_ids:
        for run_doc in conn.runs.find({"_id": {"$in": run_ids}}):
            result_id = run_doc.get("results", None)
            if result_id is not None:
                result_ids.append(result_id)

    return result_ids


def _delete_saved_views(conn, view_ids):
    conn.views.delete_many({"_id": {"$in": view_ids}})


def _delete_run_docs(conn, run_ids):
    conn.runs.delete_many({"_id": {"$in": run_ids}})


def _delete_run_results(conn, result_ids):
    conn.fs.files.delete_many({"_id": {"$in": result_ids}})
    conn.fs.chunks.delete_many({"files_id": {"$in": result_ids}})


def _delete_stores(conn, dataset_ids):
    conn.execution_store.delete_many({"dataset_id": {"$in": dataset_ids}})


_RUNS_FIELDS = ["annotation_runs", "brain_methods", "evaluations", "runs"]
