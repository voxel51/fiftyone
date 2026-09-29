"""Source-owned selection ranges without changing the grid's parent filters.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

import fiftyone as fo
import fiftyone.server.selection as selection
import fiftyone.server.selection_extensions as extensions


def test_capture_source_is_applied_after_building_the_grid_view():
    dataset = object()
    view = SimpleNamespace(_dataset=dataset)
    source = {"source": "test:ranges", "parameters": {}}
    with patch.object(
        selection, "resolve_filters", return_value=({}, lambda v: v)
    ), patch.object(selection.fosv, "get_view", return_value=view) as build:
        result, boundary, converted = selection._scoped_view(
            dataset, {"boundary": {"captureSource": source}}
        )
    assert result is view
    assert not converted
    assert "provider" not in build.call_args.kwargs["selection_scope"]
    assert boundary["provider"] == {"kind": "source", "descriptor": source}


def test_source_resolution_rejects_foreign_parents_and_propagates_errors():
    view = Mock()
    view.values.return_value = ["111111111111111111111111"]
    source = {"kind": "source", "descriptor": {"source": "test:ranges"}}
    with patch.object(extensions, "_range_source_resolver", None):
        with pytest.raises(ValueError, match="No resolver"):
            selection.candidate_members(view, source)
        unregister = extensions.register_selection_range_source_resolver(
            lambda *args: [
                {"kind": "episode", "episodeId": "222222222222222222222222"}
            ]
        )
        try:
            with pytest.raises(ValueError, match="outside its view"):
                selection.candidate_members(view, source)
        finally:
            unregister()


def test_source_capture_keeps_exact_ranges_in_resolution_and_frozen_snapshot():
    dataset = fo.Dataset()
    try:
        dataset.add_samples(
            [
                fo.Sample(filepath="/tmp/source-one.jpg"),
                fo.Sample(filepath="/tmp/source-two.jpg"),
            ]
        )
        sample_id = dataset.first().id
        member = {
            "kind": "segment",
            "episodeId": sample_id,
            "range": {
                "start": "9007199254740993",
                "end": "9007199254741003",
                "timebase": "timestamp-ns",
                "streams": ["camera-1"],
            },
        }
        source = {"source": "test:ranges", "parameters": {}}
        request = {"boundary": {"captureSource": source}}
        unregister = extensions.register_selection_range_source_resolver(
            lambda view, *_: [member] if sample_id in view.values("id") else []
        )
        try:
            resolved = selection.resolve_scope(
                dataset, {**request, "episodeIds": [sample_id]}
            )
            assert resolved["counts"]["fullEpisodes"] == 0
            assert resolved["counts"]["segments"] == 1
            assert (
                resolved["groups"][0]["members"][0]["range"]["start"]
                == member["range"]["start"]
            )
            snapshot = selection.create_snapshot(dataset, request)
            members, _ = selection.load_snapshot(
                dataset, snapshot["snapshotId"]
            )
            frozen = list(members)
            assert frozen[0]["range"]["end"] == member["range"]["end"]
            assert snapshot["counts"] == resolved["counts"]
        finally:
            unregister()
    finally:
        dataset.delete()
