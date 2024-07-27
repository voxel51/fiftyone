"""
FiftyOne v0.26.0 revision.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging


logger = logging.getLogger(__name__)


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    # Add `last_modified_at` property
    if "last_modified_at" not in dataset_dict:
        dataset_dict["last_modified_at"] = None

    add_samples_created_at = False
    sample_fields = dataset_dict.get("sample_fields", [])
    if sample_fields:
        add_samples_created_at = _up_fields(sample_fields)

    add_frames_created_at = False
    frame_fields = dataset_dict.get("frame_fields", [])
    if frame_fields:
        add_frames_created_at = _up_fields(frame_fields)

    db.datasets.replace_one(match_d, dataset_dict)

    # Populate `Sample.created_at` values
    if add_samples_created_at:
        sample_collection_name = dataset_dict.get(
            "sample_collection_name", None
        )
        if sample_collection_name:
            _add_created_at(db, dataset_name, sample_collection_name)

    # Populate `Frame.created_at` values
    if add_frames_created_at:
        frame_collection_name = dataset_dict.get("frame_collection_name", None)
        if frame_collection_name:
            _add_created_at(db, dataset_name, frame_collection_name)


def down(db, dataset_name):
    pass


def _up_fields(fields):
    found_created_at = False
    found_last_modified_at = False

    for field in fields:
        name = field.get("name", None)
        found_created_at |= name == "created_at"
        found_last_modified_at |= name == "last_modified_at"

        # Add `read_only` property
        if "read_only" not in field:
            field["read_only"] = False

    # Add `created_at` field
    if not found_created_at:
        fields.append(
            {
                "name": "created_at",
                "ftype": "fiftyone.core.fields.DateTimeField",
                "embedded_doc_type": None,
                "subfield": None,
                "fields": [],
                "db_field": "created_at",
                "description": None,
                "info": None,
                "read_only": True,
            }
        )

    # Add `last_modified_at` field
    if not found_last_modified_at:
        fields.append(
            {
                "name": "last_modified_at",
                "ftype": "fiftyone.core.fields.DateTimeField",
                "embedded_doc_type": None,
                "subfield": None,
                "fields": [],
                "db_field": "last_modified_at",
                "description": None,
                "info": None,
                "read_only": True,
            }
        )

    return not found_created_at


def _add_created_at(db, dataset_name, collection_name):
    try:
        pipeline = [{"$set": {"created_at": {"$toDate": "$_id"}}}]
        db[collection_name].update_many({}, pipeline)
    except Exception as e:
        logger.warning(
            "Failed to populate 'created_at' field for dataset %s. Reason: %s",
            dataset_name,
            e,
        )
