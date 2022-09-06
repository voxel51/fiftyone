"""
FiftyOne v0.18.1 revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import datetime
import logging
import string


logger = logging.getLogger(__name__)


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    if "url_name" not in dataset_dict:
        _set_url_name(db, dataset_dict)

    if "description" not in dataset_dict:
        dataset_dict["description"] = None

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    dataset_dict.pop("url_name", None)
    dataset_dict.pop("description", None)

    db.datasets.replace_one(match_d, dataset_dict)


def _set_url_name(db, dataset_dict):
    _id = dataset_dict["_id"]
    name = dataset_dict.get("name", None)
    url_name = dataset_dict.get("url_name", None)

    existing_names = set()
    existing_url_names = set()

    for d in db.datasets.find(
        {"_id": {"$ne": _id}}, {"name": 1, "url_name": 1}
    ):
        if "name" in d:
            existing_names.add(d["name"])

        if "url_name" in d:
            existing_url_names.add(d["url_name"])

    if name is None:
        name = _get_default_dataset_name(existing_names)

    if url_name is None:
        try:
            # Give the user a one-time pass if they have a really long dataset
            # name to have a URL-friendly name that's shorter
            url_name = _to_url_name(name[: _NAME_LENGTH_RANGE[1]])
        except Exception as e:
            old_name = name
            name = _get_default_dataset_name(existing_names)
            url_name = _to_url_name(name)

            logger.warning(e)
            logger.warning("Renaming dataset '%s' to '%s'", old_name, name)

    if name in existing_names or url_name in existing_url_names:
        old_name = name

        # Make a valid, unique name that resembles the original
        name = _get_default_dataset_name(existing_names)
        name = old_name + "-RENAMED-" + name
        name = name[-_NAME_LENGTH_RANGE[1] :]

        url_name = _to_url_name(name)

        logger.warning(
            "Dataset name '%s' conflicts with another dataset's name", old_name
        )
        logger.warning("Renaming dataset '%s' to '%s'", old_name, name)

    dataset_dict["name"] = name
    dataset_dict["url_name"] = url_name


_SAFE_CHARS = set(string.ascii_letters) | set(string.digits)
_HYPHEN_CHARS = set(string.whitespace) | set("+_.-")
_NAME_LENGTH_RANGE = (1, 100)


def _sanitize_char(c):
    if c in _SAFE_CHARS:
        return c

    if c in _HYPHEN_CHARS:
        return "-"

    return ""


def _to_url_name(name):
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

    url_name = "".join(safe).strip("-").lower()

    if len(url_name) < _NAME_LENGTH_RANGE[0]:
        raise ValueError(
            "'%s' has invalid URL-friendly name '%s'; length %d < %d"
            % (name, url_name, len(url_name), _NAME_LENGTH_RANGE[0])
        )

    if len(url_name) > _NAME_LENGTH_RANGE[1]:
        raise ValueError(
            "'%s' has invalid URL-friendly name '%s'; length %d > %d"
            % (name, url_name, len(url_name), _NAME_LENGTH_RANGE[1])
        )

    return url_name


def _get_default_dataset_name(existing_names):
    now = datetime.now()
    name = now.strftime("%Y.%m.%d.%H.%M.%S")
    if name in existing_names:
        name = now.strftime("%Y.%m.%d.%H.%M.%S.%f")

    return name
