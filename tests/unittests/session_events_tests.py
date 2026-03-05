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
        sample_ids = ["a" * 24, "b" * 24]
        meta = {
            "a" * 24: {"type": "default"},
            "b" * 24: {"type": "alt"},
        }

        resolved = _resolve_meta(sample_ids, meta)
        self.assertEqual(resolved, meta)
        self.assertEqual(resolved["b" * 24]["type"], "alt")

    @drop_datasets
    def test_select_samples_without_meta_clears_stale(self):
        """_resolve_meta with None should return empty dict."""
        new_ids = ["b" * 24]
        resolved = _resolve_meta(new_ids, None)
        self.assertEqual(resolved, {})

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

        # Clear style — should revert to checkmark, meta stays as-is
        clear_style = {"default": "checkmark", "alt": "checkmark"}
        event = SetSelectionStyle(style=clear_style)
        state.selection_style = event.style

        self.assertEqual(state.selection_style, clear_style)
        # Meta is untouched — alt meta stays, just visually same icon now
        self.assertEqual(state.selected_meta["a" * 24]["type"], "alt")
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
        """_resolve_meta with empty ids and None meta returns empty dict."""
        resolved = _resolve_meta([], None)
        self.assertEqual(resolved, {})

    @drop_datasets
    def test_select_samples_meta_none_same_as_omitted(self):
        """_resolve_meta(ids, None) returns empty dict same as omitting meta."""
        new_ids = ["b" * 24, "c" * 24]
        resolved = _resolve_meta(new_ids, None)
        self.assertEqual(resolved, {})

    @drop_datasets
    def test_select_samples_empty_meta_dict(self):
        """_resolve_meta(ids, {}) — explicit empty meta is valid."""
        sample_ids = ["a" * 24, "b" * 24]
        resolved = _resolve_meta(sample_ids, {})
        self.assertEqual(resolved, {})

    @drop_datasets
    def test_select_samples_partial_meta(self):
        """Meta for only some IDs is valid — others default on the grid."""
        sample_ids = ["a" * 24, "b" * 24, "c" * 24]
        meta = {
            "a" * 24: {"type": "alt"},
            # b and c have no meta — will show default icon on grid
        }

        resolved = _resolve_meta(sample_ids, meta)
        self.assertEqual(resolved.get("a" * 24, {}).get("type"), "alt")
        self.assertIsNone(resolved.get("b" * 24))
        self.assertIsNone(resolved.get("c" * 24))

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
        self.assertEqual(style, {"default": "checkmark", "alt": "checkmark"})

    @drop_datasets
    def test_selection_style_valid(self):
        """Valid default and alt icons should be accepted."""
        style = _resolve_selection_style("thumbsup", "thumbsdown")
        self.assertEqual(style, {"default": "thumbsup", "alt": "thumbsdown"})

    @drop_datasets
    def test_selection_style_alt_none_falls_back(self):
        """alt=None should fall back to checkmark."""
        style = _resolve_selection_style("checkmark", None)
        self.assertEqual(style, {"default": "checkmark", "alt": "checkmark"})

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

    @drop_datasets
    def test_resolve_meta_rejects_non_dict(self):
        """_resolve_meta should reject non-dict, non-None meta."""
        with self.assertRaises(ValueError):
            _resolve_meta(["a" * 24], "not a dict")

    @drop_datasets
    def test_state_from_dict_restores_selection_fields(self):
        """from_dict should restore selected_meta and selection_style."""
        d = {
            "selected": ["a" * 24],
            "selected_labels": [],
            "selected_meta": {"a" * 24: {"type": "alt"}},
            "selection_style": {"default": "thumbsup", "alt": "thumbsdown"},
        }
        state = StateDescription.from_dict(d)
        self.assertEqual(state.selected_meta, {"a" * 24: {"type": "alt"}})
        self.assertEqual(
            state.selection_style,
            {"default": "thumbsup", "alt": "thumbsdown"},
        )
