"""
Apply JSON patch to python objects.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest

import fiftyone
from fiftyone.server.utils import json_patch


class TestParse:
    """Tests json_patch.parse()"""

    @staticmethod
    def test_one():
        """Tests parsing a single patch."""

        #####
        res = json_patch.parse(
            {"op": "replace", "path": "/x/y/0", "value": 42}
        )
        #####

        assert isinstance(res, json_patch.Patch)

    @staticmethod
    def test_many():
        """Tests parsing multiple patches."""

        #####
        res = json_patch.parse(
            {"op": "replace", "path": "/x/y/0", "value": 42},
            {"op": "add", "path": "/x/y", "value": 100},
            {"op": "remove", "path": "/x/y/0"},
        )
        #####

        assert isinstance(res, list)
        assert len(res) == 3

        for p in res:
            assert isinstance(p, json_patch.Patch)


# TODO: test without samples; use random combos of objects, dicts, and lists


@pytest.fixture(name="sample")
def fixture_sample():
    """A sample from the quickstart dataset."""
    ds = fiftyone.load_dataset("quickstart")
    return ds.first()


def test_add(sample):
    """Tests sample JSON patch add."""
    patch = json_patch.Add(path="/ground_truth/detections", value=100)

    starting_len = len(patch.get_field(sample))

    ####
    patch.apply(sample)
    ####

    field = patch.get_field(sample)
    assert len(field) == starting_len + 1
    assert patch.value == field[-1]


def test_remove(sample):
    """Tests sample JSON patch remove."""
    patch = json_patch.Remove(path="/ground_truth/detections/0")

    parent_field = patch.get_parent_field(sample)
    starting_len = len(parent_field)
    value_to_remove = patch.get_field(sample)

    ####
    patch.apply(sample)
    ####

    parent_field = patch.get_parent_field(sample)
    assert value_to_remove not in parent_field
    assert len(parent_field) == starting_len - 1


def test_replace(sample):
    """Tests sample JSON patch replace."""
    patch = json_patch.Replace(path="/ground_truth/detections/0", value=42)

    original_value = patch.get_field(sample)

    ####
    patch.apply(sample)
    ####

    value = patch.get_field(sample)
    assert original_value != value
    assert value == patch.value
