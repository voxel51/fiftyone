"""
FiftyOne v0.15.0 admin revision.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging


logger = logging.getLogger(__name__)


def up(db):
    db = db["fiftyone"]

    dataset_names = [d.get("name", None) for d in db.datasets.find({})]

    colls_in_use = set()
    for dataset_name in dataset_names:
        dataset_dict = db.datasets.find_one({"name": dataset_name})
        sample_coll_name = dataset_dict.get("sample_collection_name", None)
        if sample_coll_name:
            colls_in_use.add(sample_coll_name)
            colls_in_use.add("frames." + sample_coll_name)

    # Only collections with these prefixes may be deleted
    prefixes = ("samples.", "frames.", "patches.", "clips.")

    drop_colls = []
    for coll_name in db.list_collection_names():
        if coll_name not in colls_in_use and any(
            coll_name.startswith(prefix) for prefix in prefixes
        ):
            drop_colls.append(coll_name)

    if drop_colls:
        logger.info(
            "Dropping %d orphan collections that were unintentionally left "
            "behind when datasets were deleted",
            len(drop_colls),
        )
        for coll_name in drop_colls:
            db.drop_collection(coll_name)


def down(db):
    pass
