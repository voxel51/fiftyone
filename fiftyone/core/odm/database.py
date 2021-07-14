"""
Database utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import copy
import logging

from bson import json_util
from mongoengine import connect
import motor
import pymongo
from pymongo.errors import BulkWriteError

import eta.core.utils as etau

import fiftyone.constants as foc
import fiftyone.core.utils as fou


_client = None
_async_client = None
_default_port = 27017

logger = logging.getLogger(__name__)

_PERMANENT_COLLS = {"datasets", "fs.files", "fs.chunks"}


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


def aggregate(collection, pipeline):
    """Executes an aggregation on a collection.

    Args:
        collection: a `pymongo.collection.Collection` or
            `motor.motor_tornado.MotorCollection`
        pipeline: a MongoDB aggregation pipeline

    Returns:
        a `pymongo.command_cursor.CommandCursor` or
        `motor.motor_tornado.MotorCommandCursor`
    """
    return collection.aggregate(pipeline, allowDiskUse=True)


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


def drop_orphan_collections(dry_run=False):
    """Drops all orphan collections from the database.

    Orphan collections are collections that are not associated with any known
    dataset or other collections used by FiftyOne.

    Args:
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    conn = get_db_conn()

    colls_in_use = copy(_PERMANENT_COLLS)
    for name in list_datasets():
        dataset_dict = conn.datasets.find_one({"name": name})
        sample_coll_name = dataset_dict.get("sample_collection_name", None)
        if sample_coll_name:
            colls_in_use.add(sample_coll_name)
            colls_in_use.add("frames." + sample_coll_name)

    for name in conn.list_collection_names():
        if name not in colls_in_use:
            logger.info("Dropping collection '%s'", name)
            if not dry_run:
                conn.drop_collection(name)


def drop_orphan_run_results(dry_run=False):
    """Drops all orphan run results from the database.

    Orphan run results are results that are not associated with any known
    dataset.

    Args:
        dry_run (False): whether to log the actions that would be taken but not
            perform them
    """
    conn = get_db_conn()

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

    logger.info(
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
    return sorted([d["name"] for d in conn.datasets.find({})])


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

    dataset_dict = conn.datasets.find_one({"name": name})
    if not dataset_dict:
        logger.warning("Dataset '%s' not found", name)
        return

    logger.info("Dropping document '%s' from 'datasets' collection", name)
    if not dry_run:
        conn.datasets.delete_one({"name": name})

    if "sample_collection_name" not in dataset_dict:
        logger.warning(
            "Cannot find sample/frame collections for dataset '%s'; stopping "
            "now. Use `drop_orphan_collections()` to cleanup any dangling "
            "collections",
            name,
        )
        return

    collections = conn.list_collection_names()

    sample_collection_name = dataset_dict["sample_collection_name"]
    if sample_collection_name in collections:
        logger.info("Dropping collection '%s'", sample_collection_name)
        if not dry_run:
            conn.drop_collection(sample_collection_name)

    frame_collection_name = "frames." + sample_collection_name
    if frame_collection_name in collections:
        logger.info("Dropping collection '%s'", frame_collection_name)
        if not dry_run:
            conn.drop_collection(frame_collection_name)

    delete_results = _get_result_ids(dataset_dict)

    if delete_results:
        logger.info("Deleting %d run result(s)", len(delete_results))
        if not dry_run:
            _delete_run_results(delete_results)


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

    match_d = {"name": name}
    dataset_dict = conn.datasets.find_one(match_d)
    if not dataset_dict:
        logger.warning("Dataset '%s' not found", name)
        return

    evaluations = dataset_dict.get("evaluations", {})
    if eval_key not in evaluations:
        logger.warning(
            "Dataset '%s' has no evaluation with key '%s'", name, eval_key
        )
        return

    run_doc = evaluations.pop(eval_key)
    result_id = run_doc.get("results", None)

    if result_id is not None:
        logger.info("Deleting run result '%s'", result_id)
        if not dry_run:
            _delete_run_results([result_id])

    logger.info("Deleting evaluation '%s' from dataset '%s'", eval_key, name)
    if not dry_run:
        conn.datasets.replace_one(match_d, dataset_dict)


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

    match_d = {"name": name}
    dataset_dict = conn.datasets.find_one(match_d)
    if not dataset_dict:
        logger.warning("Dataset '%s' not found", name)
        return

    eval_keys = []
    result_ids = []
    for eval_key, run_doc in dataset_dict.get("evaluations", {}).items():
        eval_keys.append(eval_key)

        result_id = run_doc.get("results", None)
        if result_id is not None:
            result_ids.append(result_id)

    if result_ids:
        logger.info("Deleting %d run result(s)", len(result_ids))
        if not dry_run:
            _delete_run_results(result_ids)

    logger.info("Deleting evaluations %s from dataset '%s'", eval_keys, name)
    if not dry_run:
        dataset_dict["evaluations"] = {}
        conn.datasets.replace_one(match_d, dataset_dict)


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

    match_d = {"name": name}
    dataset_dict = conn.datasets.find_one(match_d)
    if not dataset_dict:
        logger.warning("Dataset '%s' not found", name)
        return

    brain_methods = dataset_dict.get("brain_methods", {})
    if brain_key not in brain_methods:
        logger.warning(
            "Dataset '%s' has no brain method run with key '%s'",
            name,
            brain_key,
        )
        return

    run_doc = brain_methods.pop(brain_key)
    result_id = run_doc.get("results", None)

    if result_id is not None:
        logger.info("Deleting run result '%s'", result_id)
        if not dry_run:
            _delete_run_results([result_id])

    logger.info(
        "Deleting brain method run '%s' from dataset '%s'", brain_key, name,
    )
    if not dry_run:
        conn.datasets.replace_one(match_d, dataset_dict)


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

    match_d = {"name": name}
    dataset_dict = conn.datasets.find_one(match_d)
    if not dataset_dict:
        logger.warning("Dataset '%s' not found", name)
        return

    brain_keys = []
    result_ids = []
    for brain_key, run_doc in dataset_dict.get("brain_methods", {}).items():
        brain_keys.append(brain_key)

        result_id = run_doc.get("results", None)
        if result_id is not None:
            result_ids.append(result_id)

    if result_ids:
        logger.info("Deleting %d run result(s)", len(result_ids))
        if not dry_run:
            _delete_run_results(result_ids)

    logger.info(
        "Deleting brain method runs %s from dataset '%s'", brain_keys, name,
    )
    if not dry_run:
        dataset_dict["brain_methods"] = {}
        conn.datasets.replace_one(match_d, dataset_dict)


def _get_result_ids(dataset_dict):
    result_ids = []

    for run_doc in dataset_dict.get("evaluations", {}).values():
        result_id = run_doc.get("results", None)
        if result_id is not None:
            result_ids.append(result_id)

    for run_doc in dataset_dict.get("brain_methods", {}).values():
        result_id = run_doc.get("results", None)
        if result_id is not None:
            result_ids.append(result_id)

    return result_ids


def _delete_run_results(result_ids):
    conn = get_db_conn()

    # Delete from GridFS
    conn.fs.files.delete_many({"_id": {"$in": result_ids}})
    conn.fs.chunks.delete_many({"files_id": {"$in": result_ids}})
