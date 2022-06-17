"""
Database utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import atexit
from datetime import datetime
import logging
from multiprocessing.pool import ThreadPool
import os

import asyncio
from bson import json_util
from bson.codec_options import CodecOptions
from mongoengine import connect
import mongoengine.errors as moe
import motor.motor_asyncio as mtr

from packaging.version import Version
import pymongo
from pymongo.errors import BulkWriteError, ServerSelectionTimeoutError
import pytz

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.constants as foc
from fiftyone.core.config import FiftyOneConfigError
import fiftyone.core.fields as fof
import fiftyone.core.service as fos
import fiftyone.core.utils as fou

from .document import DynamicDocument

fod = fou.lazy_import("fiftyone.core.dataset")

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
# error being raised so that migrations can be properly run and, if necsssary,
# informative errors can be raised alerting the user that they are using the
# wrong version or type of client.
#
# This is currently guaranteed because:
#   - `DatabaseConfigDocument` is a dynamic document, so any future fields that
#     are added will not cause an error
#   - All declared fields are optional and we have promised ourselves that
#     their type and meaning will never change
#


class DatabaseConfigDocument(DynamicDocument):
    """Backing document for the database config."""

    meta = {"collection": "config"}

    version = fof.StringField()
    type = fof.StringField()


def get_db_config():
    """Retrieves the database config.

    Returns:
        a :class:`DatabaseConfigDocument`
    """
    save = False

    try:
        # pylint: disable=no-member
        config = DatabaseConfigDocument.objects.get()
    except moe.DoesNotExist:
        config = DatabaseConfigDocument()
        save = True

    if config.version is None:
        #
        # The database version was added to this config in v0.15.0, so if no
        # version is available, assume the database is at the preceeding
        # release. It's okay if the database's version is actually older,
        # because there are no significant admin migrations prior to v0.14.4.
        #
        # This needs to be implemented here rather than in a migration because
        # this information is required in order to run migrations...
        #
        config.version = "0.14.4"
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

        except fos.ServiceExecutableNotFound as error:
            if fou.is_32_bit():
                raise FiftyOneConfigError(
                    "MongoDB is not supported on 32-bit systems. Please "
                    "define a `database_uri` in your "
                    "`fiftyone.core.config.FiftyOneConfig` to define a "
                    "connection to your own MongoDB instance or cluster "
                )

            if fou.is_arm_mac():
                raise FiftyOneConfigError(
                    "MongoDB is not yet supported on Apple Silicon Macs. "
                    "Please define a `database_uri` in your "
                    "`fiftyone.core.config.FiftyOneConfig` to define a "
                    "connection to your own MongoDB instance or cluster"
                )

            raise error

    _client = pymongo.MongoClient(
        **_connection_kwargs, appname=foc.DATABASE_APPNAME
    )
    _validate_db_version(config, _client)

    # Register cleanup method
    atexit.register(_delete_non_persistent_datasets_if_allowed)

    connect(config.database_name, **_connection_kwargs)

    config = get_db_config()
    if foc.CLIENT_TYPE != config.type:
        raise ConnectionError(
            "Cannot connect to database type '%s' with client type '%s'"
            % (config.type, foc.CLIENT_TYPE)
        )


def _connect():
    global _client
    if _client is None:
        global _connection_kwargs

        _client = pymongo.MongoClient(
            **_connection_kwargs, appname=foc.DATABASE_APPNAME
        )
        connect(fo.config.database_name, **_connection_kwargs)


def _async_connect():
    global _async_client
    if _async_client is None:
        global _connection_kwargs
        _async_client = mtr.AsyncIOMotorClient(
            **_connection_kwargs, appname=foc.DATABASE_APPNAME
        )


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
                        {"$project": {"appName": 1, "command": 1}},
                        {
                            "$match": {
                                "appName": foc.DATABASE_APPNAME,
                                "command.ismaster": 1,
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
            "https://voxel51.com/docs/fiftyone/user_guide/config.html#configuring-a-mongodb-connection "
            "for more information" % (version, foc.MIN_MONGODB_VERSION)
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


def get_async_db_client():
    """Returns an async database client.

    Returns:
        a ``motor.motor_asyncio.AsyncIOMotorClient``
    """
    _async_connect()
    return _async_client


def get_async_db_conn():
    """Returns an async connection to the database.

    Returns:
        a ``motor.motor_asyncio.AsyncIOMotorDatabase``
    """
    db = get_async_db_client()[fo.config.database_name]
    return _apply_options(db)


def _apply_options(db):
    timezone = fo.config.timezone

    if not timezone or timezone.lower() == "utc":
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
    for name in list_datasets():
        dataset_dict = conn.datasets.find_one({"name": name})
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


def drop_orphan_run_results(dry_run=False):
    """Drops all orphan run results from the database.

    Orphan run results are results that are not associated with any known
    dataset.

    Args:
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    results_in_use = set()
    for name in list_datasets():
        dataset_dict = conn.datasets.find_one({"name": name})
        results_in_use.update(_get_result_ids(dataset_dict))

    all_run_results = set(conn.fs.files.distinct("_id", {}, {}))

    orphan_results = [
        _id for _id in all_run_results if _id not in results_in_use
    ]

    if not orphan_results:
        return

    _logger.info(
        "Deleting %d orphan run result(s): %s",
        len(orphan_results),
        orphan_results,
    )
    if not dry_run:
        _delete_run_results(orphan_results)


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


def export_collection(docs, json_path, key="documents", num_docs=None):
    """Exports the collection to disk in JSON format.

    Args:
        docs: an iteraable containing the documents to export
        json_path: the path to write the JSON file
        key ("documents"): the field name under which to store the documents
        num_docs (None): the total number of documents. If omitted, this must
            be computable via ``len(docs)``
    """
    if num_docs is None:
        num_docs = len(docs)

    etau.ensure_basedir(json_path)

    with open(json_path, "w") as f:
        f.write('{"%s": [' % key)
        with fou.ProgressBar(total=num_docs, iters_str="docs") as pb:
            for idx, doc in pb(enumerate(docs, 1)):
                f.write(json_util.dumps(doc))
                if idx < num_docs:
                    f.write(",")

        f.write("]}")


def import_document(json_path):
    """Imports a document from JSON on disk.

    Args:
        json_path: the path to the document

    Returns:
        a BSON document dict
    """
    with open(json_path, "r") as f:
        return json_util.loads(f.read())


def import_collection(json_path):
    """Imports the collection from JSON on disk.

    Args:
        json_path: the path to the collection on disk

    Returns:
        a BSON dict
    """
    with open(json_path, "r") as f:
        return json_util.loads(f.read())


def insert_documents(docs, coll, ordered=False):
    """Inserts a list of documents into a collection.

    The ``_id`` field of the input documents will be populated if it is not
    already set.

    Args:
        docs: the list of BSON document dicts to insert
        coll: a pymongo collection instance
        ordered (False): whether the documents must be inserted in order
    """
    try:
        for batch in fou.iter_batches(docs, 100000):  # mongodb limit
            coll.insert_many(list(batch), ordered=ordered)
    except BulkWriteError as bwe:
        msg = bwe.details["writeErrors"][0]["errmsg"]
        raise ValueError(msg) from bwe


def bulk_write(ops, coll, ordered=False):
    """Performs a batch of write operations on a collection.

    Args:
        ops: a list of pymongo operations
        coll: a pymongo collection instance
        ordered (False): whether the operations must be performed in order
    """
    try:
        for ops_batch in fou.iter_batches(ops, 100000):  # mongodb limit
            coll.bulk_write(list(ops_batch), ordered=ordered)
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

    delete_results = _get_result_ids(dataset_dict)

    if delete_results:
        _logger.info("Deleting %d run result(s)", len(delete_results))
        if not dry_run:
            _delete_run_results(delete_results)


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
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_dict = conn.datasets.find_one({"name": name})
    if not dataset_dict:
        _logger.warning("Dataset '%s' not found", name)
        return

    annotation_runs = dataset_dict.get("annotation_runs", {})
    if anno_key not in annotation_runs:
        _logger.warning(
            "Dataset '%s' has no annotation run with key '%s'",
            name,
            anno_key,
        )
        return

    run_doc = annotation_runs.pop(anno_key)
    result_id = run_doc.get("results", None)

    if result_id is not None:
        _logger.info("Deleting run result '%s'", result_id)
        if not dry_run:
            _delete_run_results([result_id])

    _logger.info(
        "Deleting annotation run '%s' from dataset '%s'", anno_key, name
    )
    if not dry_run:
        conn.datasets.replace_one({"name": name}, dataset_dict)


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
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_dict = conn.datasets.find_one({"name": name})
    if not dataset_dict:
        _logger.warning("Dataset '%s' not found", name)
        return

    anno_keys = []
    result_ids = []
    for anno_key, run_doc in dataset_dict.get("annotation_runs", {}).items():
        anno_keys.append(anno_key)

        result_id = run_doc.get("results", None)
        if result_id is not None:
            result_ids.append(result_id)

    if result_ids:
        _logger.info("Deleting %d run result(s)", len(result_ids))
        if not dry_run:
            _delete_run_results(result_ids)

    _logger.info(
        "Deleting annotation runs %s from dataset '%s'", anno_keys, name
    )
    if not dry_run:
        dataset_dict["annotation_runs"] = {}
        conn.datasets.replace_one({"name": name}, dataset_dict)


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
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_dict = conn.datasets.find_one({"name": name})
    if not dataset_dict:
        _logger.warning("Dataset '%s' not found", name)
        return

    brain_methods = dataset_dict.get("brain_methods", {})
    if brain_key not in brain_methods:
        _logger.warning(
            "Dataset '%s' has no brain method run with key '%s'",
            name,
            brain_key,
        )
        return

    run_doc = brain_methods.pop(brain_key)
    result_id = run_doc.get("results", None)

    if result_id is not None:
        _logger.info("Deleting run result '%s'", result_id)
        if not dry_run:
            _delete_run_results([result_id])

    _logger.info(
        "Deleting brain method run '%s' from dataset '%s'", brain_key, name
    )
    if not dry_run:
        conn.datasets.replace_one({"name": name}, dataset_dict)


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
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_dict = conn.datasets.find_one({"name": name})
    if not dataset_dict:
        _logger.warning("Dataset '%s' not found", name)
        return

    brain_keys = []
    result_ids = []
    for brain_key, run_doc in dataset_dict.get("brain_methods", {}).items():
        brain_keys.append(brain_key)

        result_id = run_doc.get("results", None)
        if result_id is not None:
            result_ids.append(result_id)

    if result_ids:
        _logger.info("Deleting %d run result(s)", len(result_ids))
        if not dry_run:
            _delete_run_results(result_ids)

    _logger.info(
        "Deleting brain method runs %s from dataset '%s'",
        brain_keys,
        name,
    )
    if not dry_run:
        dataset_dict["brain_methods"] = {}
        conn.datasets.replace_one({"name": name}, dataset_dict)


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
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_dict = conn.datasets.find_one({"name": name})
    if not dataset_dict:
        _logger.warning("Dataset '%s' not found", name)
        return

    evaluations = dataset_dict.get("evaluations", {})
    if eval_key not in evaluations:
        _logger.warning(
            "Dataset '%s' has no evaluation with key '%s'", name, eval_key
        )
        return

    run_doc = evaluations.pop(eval_key)
    result_id = run_doc.get("results", None)

    if result_id is not None:
        _logger.info("Deleting run result '%s'", result_id)
        if not dry_run:
            _delete_run_results([result_id])

    _logger.info("Deleting evaluation '%s' from dataset '%s'", eval_key, name)
    if not dry_run:
        conn.datasets.replace_one({"name": name}, dataset_dict)


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
    conn = get_db_conn()
    _logger = _get_logger(dry_run=dry_run)

    dataset_dict = conn.datasets.find_one({"name": name})
    if not dataset_dict:
        _logger.warning("Dataset '%s' not found", name)
        return

    eval_keys = []
    result_ids = []
    for eval_key, run_doc in dataset_dict.get("evaluations", {}).items():
        eval_keys.append(eval_key)

        result_id = run_doc.get("results", None)
        if result_id is not None:
            result_ids.append(result_id)

    if result_ids:
        _logger.info("Deleting %d run result(s)", len(result_ids))
        if not dry_run:
            _delete_run_results(result_ids)

    _logger.info("Deleting evaluations %s from dataset '%s'", eval_keys, name)
    if not dry_run:
        dataset_dict["evaluations"] = {}
        conn.datasets.replace_one({"name": name}, dataset_dict)


def _get_logger(dry_run=False):
    if dry_run:
        return _DryRunLoggerAdapter(logger, {})

    return logger


class _DryRunLoggerAdapter(logging.LoggerAdapter):
    def process(self, msg, kwargs):
        msg = "(dry run) " + msg
        return msg, kwargs


def _get_result_ids(dataset_dict):
    result_ids = []

    for run_doc in dataset_dict.get("annotation_runs", {}).values():
        result_id = run_doc.get("results", None)
        if result_id is not None:
            result_ids.append(result_id)

    for run_doc in dataset_dict.get("brain_methods", {}).values():
        result_id = run_doc.get("results", None)
        if result_id is not None:
            result_ids.append(result_id)

    for run_doc in dataset_dict.get("evaluations", {}).values():
        result_id = run_doc.get("results", None)
        if result_id is not None:
            result_ids.append(result_id)

    return result_ids


def _delete_run_results(result_ids):
    conn = get_db_conn()

    # Delete from GridFS
    conn.fs.files.delete_many({"_id": {"$in": result_ids}})
    conn.fs.chunks.delete_many({"files_id": {"$in": result_ids}})
