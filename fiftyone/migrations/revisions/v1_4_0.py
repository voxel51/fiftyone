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

LOG_FILE_SUFFIX = ".log"


def up(db, dataset_name):
    _migrate_field_bulk(db, dataset_name, "run_link", "log_path")


def down(db, dataset_name):
    _migrate_field_bulk(db, dataset_name, "log_path", "run_link")


def _migrate_field_bulk(db, dataset_name, source_field, target_field):
    dataset = db.datasets.find_one({"name": dataset_name}, {"_id": True})
    if not dataset:
        return

    dataset_id = dataset.get("_id")
    if not dataset_id:
        return

    try:
        db.delegated_ops.update_many(
            {
                "dataset_id": dataset_id,
                f"{source_field}": {
                    "$regex": f"\\{LOG_FILE_SUFFIX}$",
                    "$exists": True,
                },
            },
            {"$rename": {f"{source_field}": f"{target_field}"}},
        )
    except Exception as e:
        raise RuntimeError(
            f"Failed to replace '{target_field}' with '{source_field}' "
            f"for dataset '{dataset_name}'. Reason: {e}"
        )
