"""
FiftyOne v1.4.0 revision.

In previous versions we used the run_link field in delegated operations to
store the path to the log file. This revision migrates the data from the 
run_link field to the new log_path field allowing for the use of both fields 
and a cleaner implementation.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    _migrate_field_bulk(db, dataset_name, "run_link", "log_path")


def down(db, dataset_name):
    _migrate_field_bulk(db, dataset_name, "logs_path", "run_link")


def _migrate_field_bulk(db, dataset_name, source_field, target_field):
    ops = _get_ops(db, dataset_name)

    ops_to_update = [
        op
        for op in ops
        if op.get(source_field)
        and isinstance(op.get(source_field), str)
        and op.get(source_field).endswith(".log")
    ]

    if not ops_to_update:
        return 0

    bulk_updates = [
        {
            "update_one": {
                "filter": {"_id": op["_id"]},
                "update": {
                    "$set": {
                        target_field: op[source_field],
                        source_field: None,
                    }
                },
            }
        }
        for op in ops_to_update
    ]

    try:
        return db.delegated_ops.bulk_write(bulk_updates)
    except Exception:
        return 0


def _get_ops(db, dataset_name):
    dataset = db.datasets.find_one({"name": dataset_name})
    if not dataset:
        return []

    dataset_id = dataset.get("_id")
    if not dataset_id:
        return []

    return db.delegated_ops.find({"dataset_id": dataset_id})
