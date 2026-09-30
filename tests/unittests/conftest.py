"""
Shared unit test fixtures.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import uuid

import pytest

import fiftyone as fo


@pytest.fixture()
def fixture_dataset():
    """Yields a factory that creates test datasets and deletes exactly the
    ones it created when the test ends.

    Each dataset gets a unique name and is persistent, so a concurrent run's
    cleanup of non-persistent datasets cannot delete it mid-test.

    The factory takes:
        filepaths (None): one sample per filepath
        groups (None): a grouped dataset instead, one ``{slice name:
            filepath}`` dict per group; the first slice named is the default

    Returns:
        the created dataset
    """
    created = []

    def make(filepaths=None, groups=None):
        dataset = fo.Dataset("test-" + uuid.uuid4().hex, persistent=True)
        created.append(dataset)
        if groups:
            dataset.add_group_field("group", default=next(iter(groups[0])))
            samples = []
            for slices in groups:
                group = fo.Group()
                samples.extend(
                    fo.Sample(filepath=filepath, group=group.element(name))
                    for name, filepath in slices.items()
                )
            dataset.add_samples(samples)
        elif filepaths:
            dataset.add_samples(
                [fo.Sample(filepath=filepath) for filepath in filepaths]
            )

        return dataset

    yield make

    for dataset in created:
        if not dataset.deleted:
            dataset.delete()
