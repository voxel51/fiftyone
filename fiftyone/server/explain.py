"""
Utilities for inspecting MongoDB explain documents.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from unittest import TestCase
import typing as t

from pymongo.database import Database
from pymongo.typings import _DocumentType

import fiftyone.core.collections as foc
import fiftyone.core.dataset as fod
import fiftyone.core.odm as foo

_IXSCAN = "IXSCAN"


def explain(sample_collection: foc.SampleCollection) -> _DocumentType:
    db: Database = foo.get_db_conn()
    dataset: fod.Dataset = sample_collection._dataset
    return db.command(
        "aggregate",
        dataset._sample_collection_name,
        pipeline=sample_collection._pipeline(),
        explain=True,
    )


def assert_index(
    sample_collection: foc.SampleCollection,
    key_pattern: t.Dict[str, t.Union[t.Literal[-1], t.Literal[1]]],
    multi_key_paths: t.Optional[t.List[str]] = None,
    test_case: t.Optional[TestCase] = None,
):
    """Asserts the utilization of an index in
    :class:`fiftyone.core.collections.SampleCollection`.

    Args:
        sample_collection: the
            :class:`fiftyone.core.collections.SampleCollection`
        key_pattern: a dict mapping field paths to -1 or 1, i.e.
            descending or ascending
        multi_key_paths (None): an optional list or iterable of multi-key
            paths
        test_case (None): an option :class:`unittest.TestCase` to use for
            assertion
    """
    doc = explain(sample_collection)
    input_stage = doc["stages"][0]["$cursor"]["queryPlanner"]["winningPlan"][
        "inputStage"
    ]

    _assert_equal(input_stage["stage"], _IXSCAN)
    _assert_equal(input_stage["keyPattern"], key_pattern)

    if multi_key_paths:
        _assert_equal(list(input_stage["multiKeyPaths"]), multi_key_paths)
    else:
        _assert_equal("multiKeyPaths" in input_stage, False)


def _assert_equal(one, two, test_case: t.Optional[TestCase] = None):
    if test_case:
        test_case.assertEqual(one, two)
        return

    if isinstance(one, dict):
        assert len(one) == len(two)
        print(two)
        for k, v in one.items():
            assert two[k] == v

    if isinstance(one, list):
        for o, t in zip(one, two):
            assert o == t
