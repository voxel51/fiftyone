"""
FiftyOne v1.4.0 revision.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    delegated_ops = _get_ops(db, dataset_name)

    for op in delegated_ops:
        run_link = op.get("run_link")

        if (
            run_link
            and isinstance(run_link, str)
            and run_link.endswith(".log")
        ):
            db.delegated_ops.update_one(
                {"_id": op["_id"]},
                {"$set": {"log_path": run_link, "run_link": None}},
            )


def down(db, dataset_name):
    delegated_ops = _get_ops(db, dataset_name)

    for op in delegated_ops:
        log_path = op.get("log_path")

        if (
            log_path
            and isinstance(log_path, str)
            and log_path.endswith(".log")
        ):
            db.delegated_ops.update_one(
                {"_id": op["_id"]},
                {"$set": {"log_path": None, "run_link": log_path}},
            )


def _get_ops(db, dataset_name):
    dataset = db.datasets.find_one({"name": dataset_name})
    if not dataset:
        return []

    dataset_id = dataset.get("_id")
    if not dataset_id:
        return []

    return db.delegated_ops.find({"dataset_id": dataset_id})
