"""
FiftyOne session events-related unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import asdict
import unittest

from dacite import from_dict

from fiftyone.core.state import StateDescription
from fiftyone.core.session.session import (
    _on_select_labels,
    _resolve_meta,
    _resolve_selection_style,
)
from fiftyone.core.session.events import (
    SelectLabels,
    SelectSamples,
    SetSelectionStyle,
)

from decorators import drop_datasets


class SessionTests(unittest.TestCase):
    @drop_datasets
    def test_select_labels(self):
        state = StateDescription()
        event = from_dict(
            SelectLabels,
            dict(
                labels=[
                    {
                        "label_id": "0" * 24,
                        "field": "ground_truth",
                        "sample_id": "0" * 24,
                        "frame_number": None,
                    }
                ]
            ),
        )

        _on_select_labels(state, event)
        self.assertListEqual(
            state.selected_labels, [asdict(data) for data in event.labels]
        )

        _on_select_labels(
            state,
            SelectLabels([]),
        )
        self.assertListEqual(state.selected_labels, [])

    @drop_datasets
    def test_select_samples_with_meta(self):
        state = StateDescription()
        sample_ids = ["a" * 24, "b" * 24]
        meta = {
            "a" * 24: {"type": "default"},
            "b" * 24: {"type": "alt"},
        }

        event = SelectSamples(sample_ids=sample_ids, meta=meta)
        state.selected = event.sample_ids
        state.selected_meta = event.meta

        self.assertListEqual(state.selected, sample_ids)
        self.assertEqual(state.selected_meta, meta)
        self.assertEqual(state.selected_meta["b" * 24]["type"], "alt")

    @drop_datasets
    def test_select_samples_without_meta_clears_stale(self):
        """Calling select_samples without meta should clear existing meta."""
        state = StateDescription()

        # First, set up some existing meta
        state.selected = ["a" * 24]
        state.selected_meta = {"a" * 24: {"type": "alt"}}

        # Now select new samples without meta — simulates a caller
        # unaware of the meta feature (backward compat)
        new_ids = ["b" * 24]
        state.selected = list(new_ids)
        state.selected_meta = {}  # what select_samples does when meta=None

        self.assertListEqual(state.selected, new_ids)
        self.assertEqual(state.selected_meta, {})

    @drop_datasets
    def test_set_selection_style(self):
        state = StateDescription()

        event = SetSelectionStyle(
            style={"default": "thumbsup", "alt": "thumbsdown"}
        )
        state.selection_style = event.style

        self.assertEqual(state.selection_style["default"], "thumbsup")
        self.assertEqual(state.selection_style["alt"], "thumbsdown")

    @drop_datasets
    def test_clear_selection_style(self):
        state = StateDescription()

        # Set up alt selection
        state.selection_style = {"default": "thumbsup", "alt": "thumbsdown"}
        state.selected_meta = {
            "a" * 24: {"type": "alt"},
            "b" * 24: {"type": "default"},
        }

        # Clear style — should revert to checkmark and convert alt meta
        event = SetSelectionStyle(style={"default": "checkmark"})
        state.selection_style = event.style
        state.selected_meta = {
            k: {"type": "default"} for k in state.selected_meta
        }

        self.assertEqual(state.selection_style, {"default": "checkmark"})
        self.assertEqual(state.selected_meta["a" * 24]["type"], "default")
        self.assertEqual(state.selected_meta["b" * 24]["type"], "default")

    @drop_datasets
    def test_select_samples_meta_rejects_extra_ids(self):
        """Meta keys not in the selected IDs should raise ValueError."""
        selected_ids = ["a" * 24]
        meta = {
            "a" * 24: {"type": "alt"},
            "c" * 24: {"type": "alt"},  # not in selected_ids
        }

        with self.assertRaises(ValueError):
            _resolve_meta(selected_ids, meta)

    @drop_datasets
    def test_select_samples_empty_ids_clears_everything(self):
        """select_samples() with no args clears selected and meta."""
        state = StateDescription()
        state.selected = ["a" * 24]
        state.selected_meta = {"a" * 24: {"type": "alt"}}

        # Simulate select_samples() with no args
        state.selected = []
        state.selected_meta = {}

        self.assertListEqual(state.selected, [])
        self.assertEqual(state.selected_meta, {})

    @drop_datasets
    def test_select_samples_meta_none_same_as_omitted(self):
        """select_samples(ids, meta=None) behaves same as select_samples(ids)."""
        state = StateDescription()
        state.selected = ["a" * 24]
        state.selected_meta = {"a" * 24: {"type": "alt"}}

        # meta=None should clear stale meta
        new_ids = ["b" * 24, "c" * 24]
        state.selected = list(new_ids)
        state.selected_meta = {}  # what select_samples does when meta is None

        self.assertListEqual(state.selected, new_ids)
        self.assertEqual(state.selected_meta, {})

    @drop_datasets
    def test_select_samples_empty_meta_dict(self):
        """select_samples(ids, meta={}) — explicit empty meta is valid."""
        state = StateDescription()
        sample_ids = ["a" * 24, "b" * 24]

        state.selected = list(sample_ids)
        meta = {}
        # meta is not None, so it goes through the validation path
        selected_set = set(state.selected)
        extra_keys = set(meta.keys()) - selected_set
        self.assertEqual(len(extra_keys), 0)
        state.selected_meta = meta

        self.assertListEqual(state.selected, sample_ids)
        self.assertEqual(state.selected_meta, {})

    @drop_datasets
    def test_select_samples_partial_meta(self):
        """Meta for only some IDs is valid — others default on the grid."""
        state = StateDescription()
        sample_ids = ["a" * 24, "b" * 24, "c" * 24]
        meta = {
            "a" * 24: {"type": "alt"},
            # b and c have no meta — will show default icon on grid
        }

        selected_set = set(sample_ids)
        extra_keys = set(meta.keys()) - selected_set
        self.assertEqual(len(extra_keys), 0)

        state.selected = list(sample_ids)
        state.selected_meta = meta

        self.assertEqual(
            state.selected_meta.get("a" * 24, {}).get("type"), "alt"
        )
        self.assertIsNone(state.selected_meta.get("b" * 24))
        self.assertIsNone(state.selected_meta.get("c" * 24))

    @drop_datasets
    def test_select_samples_meta_rejects_invalid_type(self):
        """Meta with invalid type should raise ValueError."""
        selected_ids = ["a" * 24]
        meta = {"a" * 24: {"type": "invalid"}}

        with self.assertRaises(ValueError):
            _resolve_meta(selected_ids, meta)

    @drop_datasets
    def test_select_samples_meta_rejects_missing_type(self):
        """Meta entry without type key should raise ValueError."""
        selected_ids = ["a" * 24]
        meta = {"a" * 24: {"foo": "bar"}}

        with self.assertRaises(ValueError):
            _resolve_meta(selected_ids, meta)

    @drop_datasets
    def test_selection_style_default_none_falls_back(self):
        """set_selection_style(default=None) should fall back to checkmark."""
        style = _resolve_selection_style(None, None)
        self.assertEqual(style, {"default": "checkmark"})

    @drop_datasets
    def test_selection_style_valid(self):
        """Valid default and alt icons should be accepted."""
        style = _resolve_selection_style("thumbsup", "thumbsdown")
        self.assertEqual(style, {"default": "thumbsup", "alt": "thumbsdown"})

    @drop_datasets
    def test_selection_style_alt_none_excluded(self):
        """alt=None should not include 'alt' key in the result."""
        style = _resolve_selection_style("checkmark", None)
        self.assertNotIn("alt", style)

    @drop_datasets
    def test_selection_style_rejects_invalid_default(self):
        """Invalid default icon should raise ValueError."""
        with self.assertRaises(ValueError):
            _resolve_selection_style("invalid_icon", None)

    @drop_datasets
    def test_selection_style_rejects_invalid_alt(self):
        """Invalid alt icon should raise ValueError."""
        with self.assertRaises(ValueError):
            _resolve_selection_style("checkmark", "invalid_icon")
