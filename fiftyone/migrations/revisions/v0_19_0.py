"""
FiftyOne v0.19.0 revision.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import datetime
import logging
import string

from bson import ObjectId


logger = logging.getLogger(__name__)


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    if "slug" not in dataset_dict:
        _set_slug(db, dataset_dict)

    if "description" not in dataset_dict:
        dataset_dict["description"] = None

    if "saved_views" not in dataset_dict:
        dataset_dict["saved_views"] = []

    _up_runs(db, dataset_dict, "annotation_runs")
    _up_runs(db, dataset_dict, "brain_methods")
    _up_runs(db, dataset_dict, "evaluations")

    _warn_legacy_3d_config(dataset_dict)

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    dataset_dict.pop("slug", None)
    dataset_dict.pop("description", None)

    _delete_saved_views(db, dataset_dict)
    _down_runs(db, dataset_dict, "annotation_runs")
    _down_runs(db, dataset_dict, "brain_methods")
    _down_runs(db, dataset_dict, "evaluations")

    db.datasets.replace_one(match_d, dataset_dict)


def _delete_saved_views(db, dataset_dict):
    saved_views = dataset_dict.pop("saved_views", [])

    if saved_views:
        db.views.delete_many({"_id": {"$in": saved_views}})


def _up_runs(db, dataset_dict, runs_field):
    if runs_field not in dataset_dict:
        return

    runs = dataset_dict[runs_field]

    _runs = {}
    for key, run_doc in runs.items():
        if isinstance(run_doc, dict):
            _id = ObjectId()
            run_doc["_id"] = _id
            run_doc["_dataset_id"] = dataset_dict["_id"]
            _runs[key] = _id
            db.runs.insert_one(run_doc)
        else:
            # Assume already migrated
            _runs[key] = run_doc

    dataset_dict[runs_field] = _runs


def _down_runs(db, dataset_dict, runs_field):
    if runs_field not in dataset_dict:
        return

    runs = dataset_dict[runs_field]

    _runs = {}
    for key, _id in runs.items():
        if isinstance(_id, ObjectId):
            try:
                run_doc = db.runs.find_one({"_id": _id})
            except:
                continue

            db.runs.delete_one({"_id": _id})
            run_doc.pop("_id", None)
            run_doc.pop("_dataset_id", None)
            _runs[key] = run_doc
        else:
            # Assume already migrated
            _runs[key] = _id

    dataset_dict[runs_field] = _runs


def _warn_legacy_3d_config(dataset_dict):
    try:
        config = dataset_dict["app_config"]["plugins"]["3d"]
    except:
        return

    is_legacy = False

    try:
        is_legacy |= "itemRotation" in config["overlay"]
    except:
        pass

    try:
        is_legacy |= "rotation" in config["overlay"]
    except:
        pass

    try:
        is_legacy |= "rotation" in config["pointCloud"]
    except:
        pass

    if is_legacy:
        name = dataset_dict.get("name", "????")
        logger.warning(
            "Dataset '%s' uses legacy 3D visualization config settings",
            name,
        )


def _set_slug(db, dataset_dict):
    _id = dataset_dict["_id"]
    name = dataset_dict.get("name", None)
    slug = dataset_dict.get("slug", None)

    existing_names = set()
    existing_slugs = set()

    for d in db.datasets.find({"_id": {"$ne": _id}}, {"name": 1, "slug": 1}):
        if "name" in d:
            existing_names.add(d["name"])

        if "slug" in d:
            existing_slugs.add(d["slug"])

    if name is None:
        name = _get_default_dataset_name(existing_names)

    if slug is None:
        try:
            # Give the user a one-time pass if they have a really long dataset
            # name to have a slug-friendly name that's shorter
            slug = _to_slug(name[: _NAME_LENGTH_RANGE[1]])
        except Exception as e:
            old_name = name
            name = _get_default_dataset_name(existing_names)
            slug = _to_slug(name)

            logger.warning(e)
            logger.warning("Renaming dataset '%s' to '%s'", old_name, name)

    if name in existing_names or slug in existing_slugs:
        old_name = name

        # Make a valid, unique name that resembles the original
        name = _get_default_dataset_name(existing_names)
        name = old_name + "-RENAMED-" + name
        name = name[-_NAME_LENGTH_RANGE[1] :]

        slug = _to_slug(name)

        logger.warning(
            "Dataset name '%s' conflicts with another dataset's name", old_name
        )
        logger.warning("Renaming dataset '%s' to '%s'", old_name, name)

    dataset_dict["name"] = name
    dataset_dict["slug"] = slug


_SAFE_CHARS = set(string.ascii_letters) | set(string.digits)
_HYPHEN_CHARS = set(string.whitespace) | set("+_.-")
_NAME_LENGTH_RANGE = (1, 100)


def _sanitize_char(c):
    if c in _SAFE_CHARS:
        return c

    if c in _HYPHEN_CHARS:
        return "-"

    return ""


def _to_slug(name):
    if not isinstance(name, str):
        raise ValueError("Expected string; found %s: %s" % (type(name), name))

    if len(name) > _NAME_LENGTH_RANGE[1]:
        raise ValueError(
            "'%s' is too long; length %d > %d"
            % (name, len(name), _NAME_LENGTH_RANGE[1])
        )

    safe = []
    last = ""
    for c in name:
        s = _sanitize_char(c)
        if s and (s != "-" or last != "-"):
            safe.append(s)
            last = s

    slug = "".join(safe).strip("-").lower()

    if len(slug) < _NAME_LENGTH_RANGE[0]:
        raise ValueError(
            "'%s' has invalid slug-friendly name '%s'; length %d < %d"
            % (name, slug, len(slug), _NAME_LENGTH_RANGE[0])
        )

    if len(slug) > _NAME_LENGTH_RANGE[1]:
        raise ValueError(
            "'%s' has invalid slug-friendly name '%s'; length %d > %d"
            % (name, slug, len(slug), _NAME_LENGTH_RANGE[1])
        )

    return slug


def _get_default_dataset_name(existing_names):
    now = datetime.now()
    name = now.strftime("%Y.%m.%d.%H.%M.%S")
    if name in existing_names:
        name = now.strftime("%Y.%m.%d.%H.%M.%S.%f")

    return name
