"""
Saved-view work behind the App's GraphQL mutations, which runs off the event
loop.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest

import fiftyone as fo
from fiftyone import ViewField as F
import fiftyone.server.mutation as fosm


@pytest.fixture
def dataset():
    ds = fo.Dataset()
    ds.add_samples(
        [
            fo.Sample(filepath="/tmp/a.png", score=0.1),
            fo.Sample(filepath="/tmp/b.png", score=0.9),
        ]
    )
    yield ds
    ds.delete()


def test_save_load_update_delete_saved_view(dataset):
    view = dataset.match(F("score") > 0.5)

    saved, loaded = fosm._save_view(
        dataset, "high", view, "high scores", None, True
    )
    assert saved.name == "high"
    assert saved.description == "high scores"
    assert len(loaded) == 1

    slug = dataset._get_saved_view_doc("high").slug
    assert len(fosm._load_saved_view_by_slug(dataset, slug)) == 1
    assert fosm._load_saved_view_by_slug(dataset, "missing") is None

    updated = fosm._update_saved_view(
        dataset, None, "high", {"name": "top", "description": None}
    )
    assert updated.name == "top"

    deleted_id = fosm._delete_saved_view(dataset, "top")
    assert deleted_id is not None
    assert not dataset.has_saved_view("top")

    with pytest.raises(ValueError):
        fosm._delete_saved_view(dataset, "top")


def test_update_saved_view_loads_the_dataset_by_name(dataset):
    fosm._save_view(dataset, "all", dataset.view(), None, None, False)

    updated = fosm._update_saved_view(
        None, dataset.name, "all", {"color": "#ff0000"}
    )

    assert updated.name == "all"
    assert updated.color == "#ff0000"


def test_search_select_fields_loads_the_dataset_by_name(dataset):
    # a filter matching no field still selects the default fields
    fields = fosm._search_select_fields(None, dataset.name, {"missing": "x"})

    assert "filepath" in fields
    assert "score" not in fields
