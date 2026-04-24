"""
Decorator utils for unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone as fo
import fiftyone.core.odm as foo

from functools import wraps


def drop_datasets(func):
    """Decorator that drops all non-persistent datasets from the database
    before running a test.
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        fo.delete_non_persistent_datasets()
        return func(*args, **kwargs)

    return wrapper


def drop_ontologies(func):
    """Decorator that drops the ``ontologies`` collection before and after a
    test so ontology state doesn't leak across tests.
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        db = foo.get_db_conn()
        db.drop_collection("ontologies")
        try:
            return func(*args, **kwargs)
        finally:
            db.drop_collection("ontologies")

    return wrapper
