"""
FiftyOne session events-related unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import asdict
import unittest
from unittest.mock import MagicMock

from dacite import from_dict

# pylint: disable=no-name-in-module,import-error
from fiftyone.core.session.constants import (
    VALID_ICON_STYLES,
    VALID_LABEL_SELECTION_STYLES,
)
from fiftyone.core.session.session import (
    _on_select_labels,
    _normalize_selected_labels,
    _normalize_selected_samples,
    _resolve_label_selection_style,
    _resolve_selection_style,
)
from fiftyone.core.session.events import (
    SelectLabels,
    SetLabelSelectionStyle,
    SetSampleSelectionStyle,
)

# pylint: enable=no-name-in-module,import-error
from fiftyone.core.state import StateDescription
from fiftyone.operators.operations import Operations

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

    # -------------------------------------------------------------------
    # _normalize_selected_samples
    # -------------------------------------------------------------------

    def test_normalize_selected_samples_with_dicts(self):
        """Normalize list of dicts with sample_id and type."""
        samples = [
            {"sample_id": "a" * 24, "type": "default"},
            {"sample_id": "b" * 24, "type": "alt"},
        ]
        result = _normalize_selected_samples(samples)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["sample_id"], "a" * 24)
        self.assertEqual(result[0]["type"], "default")
        self.assertEqual(result[1]["sample_id"], "b" * 24)
        self.assertEqual(result[1]["type"], "alt")

    def test_normalize_selected_samples_with_strings(self):
        """Normalize list of plain string IDs — all become type 'default'."""
        samples = ["a" * 24, "b" * 24]
        result = _normalize_selected_samples(samples)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0], {"sample_id": "a" * 24, "type": "default"})
        self.assertEqual(result[1], {"sample_id": "b" * 24, "type": "default"})

    def test_normalize_selected_samples_mixed(self):
        """Normalize a mix of strings and dicts."""
        samples = [
            "a" * 24,
            {"sample_id": "b" * 24, "type": "alt"},
        ]
        result = _normalize_selected_samples(samples)
        self.assertEqual(result[0], {"sample_id": "a" * 24, "type": "default"})
        self.assertEqual(result[1], {"sample_id": "b" * 24, "type": "alt"})

    def test_normalize_selected_samples_empty(self):
        """Normalizing empty list returns empty list."""
        result = _normalize_selected_samples([])
        self.assertEqual(result, [])

    def test_normalize_selected_samples_dict_without_type_defaults(self):
        """Dict without 'type' key defaults to 'default'."""
        samples = [{"sample_id": "a" * 24}]
        result = _normalize_selected_samples(samples)
        self.assertEqual(result[0]["type"], "default")

    def test_normalize_selected_samples_rejects_invalid_type(self):
        """Dict with invalid type should raise ValueError."""
        with self.assertRaises(ValueError):
            _normalize_selected_samples(
                [{"sample_id": "a" * 24, "type": "invalid"}]
            )

    def test_normalize_selected_samples_rejects_non_string_non_dict(self):
        """Non-string, non-dict entries should raise TypeError."""
        with self.assertRaises(TypeError):
            _normalize_selected_samples([123])

        with self.assertRaises(TypeError):
            _normalize_selected_samples([None])

        with self.assertRaises(TypeError):
            _normalize_selected_samples([[]])

    def test_normalize_selected_samples_preserves_order(self):
        """Normalization preserves insertion order."""
        ids = [chr(ord("a") + i) * 24 for i in range(5)]
        result = _normalize_selected_samples(ids)
        self.assertEqual([r["sample_id"] for r in result], ids)

    def test_normalize_selected_samples_duplicate_ids(self):
        """Duplicate IDs are preserved (no dedup at this layer)."""
        samples = ["a" * 24, "a" * 24]
        result = _normalize_selected_samples(samples)
        self.assertEqual(len(result), 2)

    def test_normalize_selected_samples_rejects_missing_sample_id(self):
        """Dict without sample_id should raise ValueError."""
        with self.assertRaises(ValueError):
            _normalize_selected_samples([{"type": "default"}])

        with self.assertRaises(ValueError):
            _normalize_selected_samples([{"sample_id": "", "type": "default"}])

        with self.assertRaises(ValueError):
            _normalize_selected_samples(
                [{"sample_id": None, "type": "default"}]
            )

    # -------------------------------------------------------------------
    # _resolve_selection_style
    # -------------------------------------------------------------------

    def test_selection_style_default_none_falls_back(self):
        """Both None should fall back to checkmark."""
        style = _resolve_selection_style(None, None)
        self.assertEqual(style, {"default": "checkmark", "alt": "checkmark"})

    def test_selection_style_valid(self):
        """Valid default and alt icons should be accepted."""
        style = _resolve_selection_style("thumbsup", "thumbsdown")
        self.assertEqual(style, {"default": "thumbsup", "alt": "thumbsdown"})

    def test_selection_style_alt_none_falls_back(self):
        """alt=None should fall back to checkmark."""
        style = _resolve_selection_style("checkmark", None)
        self.assertEqual(style, {"default": "checkmark", "alt": "checkmark"})

    def test_selection_style_rejects_invalid_default(self):
        """Invalid default icon should raise ValueError."""
        with self.assertRaises(ValueError):
            _resolve_selection_style("invalid_icon", None)

    def test_selection_style_rejects_invalid_alt(self):
        """Invalid alt icon should raise ValueError."""
        with self.assertRaises(ValueError):
            _resolve_selection_style("checkmark", "invalid_icon")

    def test_selection_style_all_valid_icons(self):
        """Every supported icon style should be accepted."""
        for icon in VALID_ICON_STYLES:
            style = _resolve_selection_style(icon, icon)
            self.assertEqual(style["default"], icon)
            self.assertEqual(style["alt"], icon)

    # -------------------------------------------------------------------
    # StateDescription.selected — computed property
    # -------------------------------------------------------------------

    @drop_datasets
    def test_selected_property_derives_from_selected_samples(self):
        """selected is computed from selected_samples."""
        state = StateDescription()
        state.selected_samples = [
            {"sample_id": "a" * 24, "type": "default"},
            {"sample_id": "b" * 24, "type": "alt"},
        ]
        self.assertEqual(state.selected, ["a" * 24, "b" * 24])

    @drop_datasets
    def test_selected_property_empty(self):
        """selected is [] when selected_samples is []."""
        state = StateDescription()
        self.assertEqual(state.selected, [])

    @drop_datasets
    def test_selected_property_is_read_only(self):
        """selected cannot be set directly on StateDescription."""
        state = StateDescription()
        with self.assertRaises(AttributeError):
            state.selected = ["a" * 24]

    @drop_datasets
    def test_selected_updates_when_selected_samples_changes(self):
        """Mutating selected_samples is reflected in selected."""
        state = StateDescription()
        state.selected_samples = [
            {"sample_id": "a" * 24, "type": "default"},
        ]
        self.assertEqual(state.selected, ["a" * 24])

        state.selected_samples.append({"sample_id": "b" * 24, "type": "alt"})
        self.assertEqual(state.selected, ["a" * 24, "b" * 24])

        state.selected_samples = []
        self.assertEqual(state.selected, [])

    @drop_datasets
    def test_constructor_selected_samples_takes_priority(self):
        """selected_samples kwarg takes priority over selected kwarg."""
        state = StateDescription(  # pylint: disable=unexpected-keyword-arg
            selected=["a" * 24],
            selected_samples=[
                {"sample_id": "b" * 24, "type": "alt"},
            ],
        )
        self.assertEqual(state.selected, ["b" * 24])
        self.assertEqual(
            state.selected_samples,
            [
                {"sample_id": "b" * 24, "type": "alt"},
            ],
        )

    @drop_datasets
    def test_constructor_bootstraps_from_selected(self):
        """selected kwarg bootstraps selected_samples when no selected_samples."""
        state = StateDescription(selected=["a" * 24, "b" * 24])
        self.assertEqual(
            state.selected_samples,
            [
                {"sample_id": "a" * 24, "type": "default"},
                {"sample_id": "b" * 24, "type": "default"},
            ],
        )
        self.assertEqual(state.selected, ["a" * 24, "b" * 24])

    @drop_datasets
    def test_selected_in_attributes(self):
        """selected is included in attributes() for serialization."""
        state = StateDescription()
        self.assertIn("selected", state.attributes())

    # -------------------------------------------------------------------
    # SetSampleSelectionStyle event + StateDescription
    # -------------------------------------------------------------------

    @drop_datasets
    def test_set_sample_selection_style(self):
        state = StateDescription()
        event = SetSampleSelectionStyle(
            style={"default": "thumbsup", "alt": "thumbsdown"}
        )
        state.sample_selection_style = event.style
        self.assertEqual(state.sample_selection_style["default"], "thumbsup")
        self.assertEqual(state.sample_selection_style["alt"], "thumbsdown")

    @drop_datasets
    def test_clear_sample_selection_style(self):
        state = StateDescription()
        state.sample_selection_style = {
            "default": "thumbsup",
            "alt": "thumbsdown",
        }

        clear_style = {"default": "checkmark", "alt": "checkmark"}
        event = SetSampleSelectionStyle(style=clear_style)
        state.sample_selection_style = event.style
        self.assertEqual(state.sample_selection_style, clear_style)

    # -------------------------------------------------------------------
    # StateDescription.from_dict
    # -------------------------------------------------------------------

    @drop_datasets
    def test_state_from_dict_restores_selection_fields(self):
        """from_dict should restore selected_samples and sample_selection_style."""
        d = {
            "selected": ["a" * 24],
            "selected_labels": [],
            "selected_samples": [
                {"sample_id": "a" * 24, "type": "alt"},
            ],
            "sample_selection_style": {
                "default": "thumbsup",
                "alt": "thumbsdown",
            },
        }
        state = StateDescription.from_dict(d)
        self.assertEqual(
            state.selected_samples,
            [{"sample_id": "a" * 24, "type": "alt"}],
        )
        self.assertEqual(
            state.sample_selection_style,
            {"default": "thumbsup", "alt": "thumbsdown"},
        )

    @drop_datasets
    def test_state_from_dict_backward_compat_strings(self):
        """from_dict with flat selected list and no selected_samples."""
        d = {
            "selected": ["a" * 24, "b" * 24],
            "selected_labels": [],
        }
        state = StateDescription.from_dict(d)
        self.assertEqual(state.selected, ["a" * 24, "b" * 24])

    @drop_datasets
    def test_state_from_dict_missing_style_uses_default(self):
        """from_dict without sample_selection_style uses default checkmark."""
        d = {
            "selected": [],
            "selected_labels": [],
        }
        state = StateDescription.from_dict(d)
        self.assertEqual(
            state.sample_selection_style,
            {"default": "checkmark", "alt": "checkmark"},
        )

    @drop_datasets
    def test_state_from_dict_empty_selected_samples(self):
        """from_dict with empty selected_samples list."""
        d = {
            "selected": [],
            "selected_labels": [],
            "selected_samples": [],
        }
        state = StateDescription.from_dict(d)
        self.assertEqual(state.selected_samples, [])
        self.assertEqual(state.selected, [])

    # -------------------------------------------------------------------
    # Operations.set_selected_samples — backward & forward compat
    # -------------------------------------------------------------------

    @drop_datasets
    def test_ops_set_selected_samples_with_id_list(self):
        """ctx.ops.set_selected_samples(id_list) — backward compat."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        id_list = ["a" * 24, "b" * 24]
        ops.set_selected_samples(id_list)

        mock_ctx.trigger.assert_called_once_with(
            "set_selected_samples",
            params={
                "samples": [
                    {"sample_id": "a" * 24, "type": "default"},
                    {"sample_id": "b" * 24, "type": "default"},
                ]
            },
        )

    @drop_datasets
    def test_ops_set_selected_samples_with_dict_list(self):
        """ctx.ops.set_selected_samples([{sample_id, type}]) — new format."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        samples = [
            {"sample_id": "a" * 24, "type": "default"},
            {"sample_id": "b" * 24, "type": "alt"},
        ]
        ops.set_selected_samples(samples)

        mock_ctx.trigger.assert_called_once_with(
            "set_selected_samples",
            params={"samples": samples},
        )

    @drop_datasets
    def test_ops_set_selected_samples_mixed_input(self):
        """ctx.ops.set_selected_samples with mixed strings and dicts."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        ops.set_selected_samples(
            [
                "a" * 24,
                {"sample_id": "b" * 24, "type": "alt"},
            ]
        )

        mock_ctx.trigger.assert_called_once_with(
            "set_selected_samples",
            params={
                "samples": [
                    {"sample_id": "a" * 24, "type": "default"},
                    {"sample_id": "b" * 24, "type": "alt"},
                ]
            },
        )

    @drop_datasets
    def test_ops_set_selected_samples_empty(self):
        """ctx.ops.set_selected_samples([]) clears selection."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        ops.set_selected_samples([])

        mock_ctx.trigger.assert_called_once_with(
            "set_selected_samples",
            params={"samples": []},
        )

    @drop_datasets
    def test_ops_set_selected_samples_rejects_invalid(self):
        """ctx.ops.set_selected_samples with invalid items raises."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        with self.assertRaises(TypeError):
            ops.set_selected_samples([123])

    # -------------------------------------------------------------------
    # Operations.set_sample_selection_style / clear_sample_selection_style
    # -------------------------------------------------------------------

    @drop_datasets
    def test_ops_set_sample_selection_style(self):
        """ctx.ops.set_sample_selection_style triggers correctly."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        ops.set_sample_selection_style(  # pylint: disable=no-member
            default="thumbsup", alt="thumbsdown"
        )

        mock_ctx.trigger.assert_called_once_with(
            "set_sample_selection_style",
            params={"default": "thumbsup", "alt": "thumbsdown"},
        )

    @drop_datasets
    def test_ops_clear_sample_selection_style(self):
        """ctx.ops.clear_sample_selection_style triggers correctly."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        ops.clear_sample_selection_style()  # pylint: disable=no-member

        mock_ctx.trigger.assert_called_once_with(
            "clear_sample_selection_style"
        )

    # -------------------------------------------------------------------
    # _normalize_selected_labels
    # -------------------------------------------------------------------

    def test_normalize_selected_labels_with_type(self):
        """Normalize labels with explicit type."""
        labels = [
            {
                "label_id": "l1",
                "sample_id": "s1",
                "field": "detections",
                "type": "alt",
            }
        ]
        result = _normalize_selected_labels(labels)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["type"], "alt")
        self.assertEqual(result[0]["label_id"], "l1")

    def test_normalize_selected_labels_without_type(self):
        """Normalize labels without type defaults to 'default'."""
        labels = [{"label_id": "l1", "sample_id": "s1", "field": "detections"}]
        result = _normalize_selected_labels(labels)
        self.assertEqual(result[0]["type"], "default")

    def test_normalize_selected_labels_preserves_optional_keys(self):
        """Optional keys like frame_number and instance_id are preserved."""
        labels = [
            {
                "label_id": "l1",
                "sample_id": "s1",
                "field": "detections",
                "frame_number": 5,
                "instance_id": "inst1",
            }
        ]
        result = _normalize_selected_labels(labels)
        self.assertEqual(result[0]["frame_number"], 5)
        self.assertEqual(result[0]["instance_id"], "inst1")

    def test_normalize_selected_labels_rejects_invalid_type(self):
        """Invalid selection type raises ValueError."""
        with self.assertRaises(ValueError):
            _normalize_selected_labels(
                [
                    {
                        "label_id": "l1",
                        "sample_id": "s1",
                        "field": "detections",
                        "type": "invalid",
                    }
                ]
            )

    def test_normalize_selected_labels_rejects_missing_keys(self):
        """Missing required keys raises ValueError."""
        with self.assertRaises(ValueError):
            _normalize_selected_labels([{"label_id": "l1", "sample_id": "s1"}])

        with self.assertRaises(ValueError):
            _normalize_selected_labels(
                [{"label_id": "l1", "field": "detections"}]
            )

    def test_normalize_selected_labels_rejects_non_dict(self):
        """Non-dict entries raise TypeError."""
        with self.assertRaises(TypeError):
            _normalize_selected_labels(["not_a_dict"])

    def test_normalize_selected_labels_empty(self):
        """Empty list returns empty list."""
        result = _normalize_selected_labels([])
        self.assertEqual(result, [])

    # -------------------------------------------------------------------
    # _resolve_label_selection_style
    # -------------------------------------------------------------------

    def test_label_selection_style_default_none_falls_back(self):
        """Both None should fall back to dashed."""
        style = _resolve_label_selection_style(None, None)
        self.assertEqual(style, {"default": "dashed", "alt": "dashed"})

    def test_label_selection_style_valid(self):
        """Valid default and alt styles should be accepted."""
        style = _resolve_label_selection_style("dashed-green", "filled-red")
        self.assertEqual(
            style, {"default": "dashed-green", "alt": "filled-red"}
        )

    def test_label_selection_style_alt_none_falls_back(self):
        """alt=None should fall back to dashed."""
        style = _resolve_label_selection_style("dashed", None)
        self.assertEqual(style, {"default": "dashed", "alt": "dashed"})

    def test_label_selection_style_rejects_invalid_default(self):
        """Invalid default style should raise ValueError."""
        with self.assertRaises(ValueError):
            _resolve_label_selection_style("invalid_style", None)

    def test_label_selection_style_rejects_invalid_alt(self):
        """Invalid alt style should raise ValueError."""
        with self.assertRaises(ValueError):
            _resolve_label_selection_style("dashed", "invalid_style")

    def test_label_selection_style_all_valid_styles(self):
        """Every supported label selection style should be accepted."""
        for s in VALID_LABEL_SELECTION_STYLES:
            style = _resolve_label_selection_style(s, s)
            self.assertEqual(style["default"], s)
            self.assertEqual(style["alt"], s)

    # -------------------------------------------------------------------
    # SetLabelSelectionStyle event + StateDescription
    # -------------------------------------------------------------------

    @drop_datasets
    def test_set_label_selection_style(self):
        state = StateDescription()
        event = SetLabelSelectionStyle(
            style={"default": "dashed-green", "alt": "filled-red"}
        )
        state.label_selection_style = event.style
        self.assertEqual(
            state.label_selection_style["default"], "dashed-green"
        )
        self.assertEqual(state.label_selection_style["alt"], "filled-red")

    @drop_datasets
    def test_clear_label_selection_style(self):
        state = StateDescription()
        state.label_selection_style = {
            "default": "filled-green",
            "alt": "dashed-red",
        }
        clear_style = {"default": "dashed", "alt": "dashed"}
        event = SetLabelSelectionStyle(style=clear_style)
        state.label_selection_style = event.style
        self.assertEqual(state.label_selection_style, clear_style)

    @drop_datasets
    def test_state_from_dict_restores_label_selection_style(self):
        """from_dict should restore label_selection_style."""
        d = {
            "selected": [],
            "selected_labels": [],
            "label_selection_style": {
                "default": "dashed-green",
                "alt": "filled-red",
            },
        }
        state = StateDescription.from_dict(d)
        self.assertEqual(
            state.label_selection_style,
            {"default": "dashed-green", "alt": "filled-red"},
        )

    @drop_datasets
    def test_state_from_dict_missing_label_style_uses_default(self):
        """from_dict without label_selection_style uses default dashed."""
        d = {
            "selected": [],
            "selected_labels": [],
        }
        state = StateDescription.from_dict(d)
        self.assertEqual(
            state.label_selection_style,
            {"default": "dashed", "alt": "dashed"},
        )

    # -------------------------------------------------------------------
    # Operations.set_label_selection_style / clear_label_selection_style
    # -------------------------------------------------------------------

    @drop_datasets
    def test_ops_set_label_selection_style(self):
        """ctx.ops.set_label_selection_style triggers correctly."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        ops.set_label_selection_style(  # pylint: disable=no-member
            default="dashed-green", alt="filled-red"
        )

        mock_ctx.trigger.assert_called_once_with(
            "set_label_selection_style",
            params={"default": "dashed-green", "alt": "filled-red"},
        )

    @drop_datasets
    def test_ops_clear_label_selection_style(self):
        """ctx.ops.clear_label_selection_style triggers correctly."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        ops.clear_label_selection_style()  # pylint: disable=no-member

        mock_ctx.trigger.assert_called_once_with("clear_label_selection_style")

    @drop_datasets
    def test_ops_set_selected_labels_with_type(self):
        """ctx.ops.set_selected_labels normalizes type."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        labels = [
            {
                "label_id": "l1",
                "sample_id": "s1",
                "field": "detections",
                "type": "alt",
            }
        ]
        ops.set_selected_labels(labels)

        mock_ctx.trigger.assert_called_once()
        call_args = mock_ctx.trigger.call_args
        self.assertEqual(call_args[0][0], "set_selected_labels")
        passed_labels = call_args[1]["params"]["labels"]
        self.assertEqual(passed_labels[0]["type"], "alt")

    @drop_datasets
    def test_ops_set_selected_labels_defaults_type(self):
        """ctx.ops.set_selected_labels defaults type to 'default'."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        labels = [{"label_id": "l1", "sample_id": "s1", "field": "detections"}]
        ops.set_selected_labels(labels)

        mock_ctx.trigger.assert_called_once()
        call_args = mock_ctx.trigger.call_args
        passed_labels = call_args[1]["params"]["labels"]
        self.assertEqual(passed_labels[0]["type"], "default")
