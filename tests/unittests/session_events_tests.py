"""
FiftyOne session events-related unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import asdict
import threading
import time
import types
import unittest
from unittest import mock

from dacite import from_dict

# pylint: disable=no-name-in-module,import-error
from fiftyone.core.session.constants import (
    DEFAULT_LABEL_SELECTION_STYLE,
    VALID_ICON_STYLES,
)
import fiftyone.core.session.session as foss
from fiftyone.core.session.session import (
    _attach_listeners,
    _normalize_selected_labels,
    _on_select_labels,
    _resolve_label_selection_style,
    _resolve_selection_style,
)
from fiftyone.core.session.utils import normalize_selected_samples
from fiftyone.core.session.events import (
    AppCountUpdate,
    CloseSession,
    SelectLabels,
    SetLabelSelectionStyle,
    SetSampleSelectionStyle,
)

# pylint: enable=no-name-in-module,import-error
from fiftyone.core.state import StateDescription

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
    # normalize_selected_samples
    # -------------------------------------------------------------------

    def testnormalize_selected_samples_with_dicts(self):
        """Normalize list of dicts with id and type."""
        samples = [
            {"id": "a" * 24, "type": "default"},
            {"id": "b" * 24, "type": "alt"},
        ]
        result = normalize_selected_samples(samples)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["id"], "a" * 24)
        self.assertEqual(result[0]["type"], "default")
        self.assertEqual(result[1]["id"], "b" * 24)
        self.assertEqual(result[1]["type"], "alt")

    def testnormalize_selected_samples_with_strings(self):
        """Normalize list of plain string IDs — all become type 'default'."""
        samples = ["a" * 24, "b" * 24]
        result = normalize_selected_samples(samples)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0], {"id": "a" * 24, "type": "default"})
        self.assertEqual(result[1], {"id": "b" * 24, "type": "default"})

    def testnormalize_selected_samples_mixed(self):
        """Normalize a mix of strings and dicts."""
        samples = [
            "a" * 24,
            {"id": "b" * 24, "type": "alt"},
        ]
        result = normalize_selected_samples(samples)
        self.assertEqual(result[0], {"id": "a" * 24, "type": "default"})
        self.assertEqual(result[1], {"id": "b" * 24, "type": "alt"})

    def testnormalize_selected_samples_empty(self):
        """Normalizing empty list returns empty list."""
        result = normalize_selected_samples([])
        self.assertEqual(result, [])

    def testnormalize_selected_samples_dict_without_type_defaults(self):
        """Dict without 'type' key defaults to 'default'."""
        samples = [{"id": "a" * 24}]
        result = normalize_selected_samples(samples)
        self.assertEqual(result[0]["type"], "default")

    def testnormalize_selected_samples_rejects_invalid_type(self):
        """Dict with invalid type should raise ValueError."""
        with self.assertRaises(ValueError):
            normalize_selected_samples([{"id": "a" * 24, "type": "invalid"}])

    def testnormalize_selected_samples_rejects_non_string_non_dict(self):
        """Non-string, non-dict entries should raise TypeError."""
        with self.assertRaises(TypeError):
            normalize_selected_samples([123])

        with self.assertRaises(TypeError):
            normalize_selected_samples([None])

        with self.assertRaises(TypeError):
            normalize_selected_samples([[]])

    def testnormalize_selected_samples_preserves_order(self):
        """Normalization preserves insertion order."""
        ids = [chr(ord("a") + i) * 24 for i in range(5)]
        result = normalize_selected_samples(ids)
        self.assertEqual([r["id"] for r in result], ids)

    def testnormalize_selected_samples_duplicate_ids(self):
        """Duplicate IDs are preserved (no dedup at this layer)."""
        samples = ["a" * 24, "a" * 24]
        result = normalize_selected_samples(samples)
        self.assertEqual(len(result), 2)

    def testnormalize_selected_samples_rejects_missing_id(self):
        """Dict without id should raise ValueError."""
        with self.assertRaises(ValueError):
            normalize_selected_samples([{"type": "default"}])

        with self.assertRaises(ValueError):
            normalize_selected_samples([{"id": "", "type": "default"}])

        with self.assertRaises(ValueError):
            normalize_selected_samples([{"id": None, "type": "default"}])

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
    # StateDescription.selected_samples constructor behavior
    # -------------------------------------------------------------------

    @drop_datasets
    def test_constructor_selected_samples_takes_priority(self):
        """selected_samples kwarg takes priority over selected kwarg."""
        state = StateDescription(  # pylint: disable=unexpected-keyword-arg
            selected=["a" * 24],
            selected_samples=[
                {"id": "b" * 24, "type": "alt"},
            ],
        )
        self.assertEqual(
            state.selected_samples,
            [
                {"id": "b" * 24, "type": "alt"},
            ],
        )

    @drop_datasets
    def test_constructor_bootstraps_from_selected(self):
        """selected kwarg bootstraps selected_samples when no selected_samples."""
        state = StateDescription(selected=["a" * 24, "b" * 24])
        self.assertEqual(
            state.selected_samples,
            [
                {"id": "a" * 24, "type": "default"},
                {"id": "b" * 24, "type": "default"},
            ],
        )

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
                {"id": "a" * 24, "type": "alt"},
            ],
            "sample_selection_style": {
                "default": "thumbsup",
                "alt": "thumbsdown",
            },
        }
        state = StateDescription.from_dict(d)
        self.assertEqual(
            state.selected_samples,
            [{"id": "a" * 24, "type": "alt"}],
        )
        self.assertEqual(
            state.sample_selection_style,
            {"default": "thumbsup", "alt": "thumbsdown"},
        )

    @drop_datasets
    def test_state_from_dict_backward_compat_strings(self):
        """from_dict with flat selected list and no selected_samples bootstraps."""
        d = {
            "selected": ["a" * 24, "b" * 24],
            "selected_labels": [],
        }
        state = StateDescription.from_dict(d)
        self.assertEqual(
            state.selected_samples,
            [
                {"id": "a" * 24, "type": "default"},
                {"id": "b" * 24, "type": "default"},
            ],
        )

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

    # -------------------------------------------------------------------
    # Label selection style
    # -------------------------------------------------------------------

    @drop_datasets
    def test_set_label_selection_style(self):
        state = StateDescription()
        event = SetLabelSelectionStyle(
            style={"default": "dashed-green", "alt": "dashed-red"}
        )
        state.label_selection_style = event.style
        self.assertEqual(
            state.label_selection_style["default"], "dashed-green"
        )
        self.assertEqual(state.label_selection_style["alt"], "dashed-red")

    @drop_datasets
    def test_clear_label_selection_style(self):
        state = StateDescription()
        state.label_selection_style = {
            "default": "dashed-green",
            "alt": "dashed-red",
        }

        clear_style = dict(DEFAULT_LABEL_SELECTION_STYLE)
        event = SetLabelSelectionStyle(style=clear_style)
        state.label_selection_style = event.style
        self.assertEqual(state.label_selection_style, clear_style)

    @drop_datasets
    def test_resolve_label_selection_style_valid(self):
        result = _resolve_label_selection_style("dashed-green", "dashed-red")
        self.assertEqual(
            result, {"default": "dashed-green", "alt": "dashed-red"}
        )

    @drop_datasets
    def test_resolve_label_selection_style_defaults(self):
        result = _resolve_label_selection_style(None, None)
        self.assertEqual(result, {"default": "dashed", "alt": "dashed"})

    @drop_datasets
    def test_resolve_label_selection_style_invalid(self):
        with self.assertRaises(ValueError):
            _resolve_label_selection_style("invalid-style", "dashed")

    @drop_datasets
    def test_normalize_selected_labels_adds_type(self):
        labels = [
            {"label_id": "a", "sample_id": "s1", "field": "detections"},
        ]
        result = _normalize_selected_labels(labels)
        self.assertEqual(result[0]["type"], "default")

    @drop_datasets
    def test_normalize_selected_labels_preserves_type(self):
        labels = [
            {
                "label_id": "a",
                "sample_id": "s1",
                "field": "detections",
                "type": "alt",
            },
        ]
        result = _normalize_selected_labels(labels)
        self.assertEqual(result[0]["type"], "alt")

    @drop_datasets
    def test_normalize_selected_labels_invalid_type(self):
        labels = [
            {
                "label_id": "a",
                "sample_id": "s1",
                "field": "detections",
                "type": "invalid",
            },
        ]
        with self.assertRaises(ValueError):
            _normalize_selected_labels(labels)

    @drop_datasets
    def test_state_from_dict_restores_label_selection_style(self):
        d = {
            "selected": [],
            "selected_labels": [],
            "label_selection_style": {
                "default": "dashed-green",
                "alt": "dashed-red",
            },
        }
        state = StateDescription.from_dict(d)
        self.assertEqual(
            state.label_selection_style,
            {"default": "dashed-green", "alt": "dashed-red"},
        )

    @drop_datasets
    def test_state_from_dict_missing_label_style_uses_default(self):
        d = {
            "selected": [],
            "selected_labels": [],
        }
        state = StateDescription.from_dict(d)
        self.assertEqual(
            state.label_selection_style,
            {"default": "dashed", "alt": "dashed"},
        )


class _FakeClient:
    def __init__(self):
        self.listeners = {}

    def add_event_listener(self, event_name, listener):
        self.listeners[event_name] = listener


@mock.patch.object(foss, "_WAIT_POLL_INTERVAL", 0.01)
@mock.patch.object(foss.focx, "is_notebook_context", return_value=False)
class SessionWaitTests(unittest.TestCase):
    def _session(self):
        session = types.SimpleNamespace(
            _client=_FakeClient(), _wait_closed_at=None
        )
        _attach_listeners(session)
        return session

    def _wait(self, session, wait):
        returned = threading.Event()

        def run():
            foss.Session.wait(session, wait)
            returned.set()

        threading.Thread(target=run, daemon=True).start()
        time.sleep(0.05)
        return returned

    def _emit(self, session, event):
        session._client.listeners[event.get_event_name()](event)

    def test_wait_returns_after_close(self, _):
        session = self._session()
        returned = self._wait(session, 0.2)

        self._emit(session, AppCountUpdate(count=0))
        self._emit(session, CloseSession())

        self.assertFalse(returned.wait(0.1))
        self.assertTrue(returned.wait(1))

    def test_wait_continues_after_reconnect(self, _):
        session = self._session()
        returned = self._wait(session, 0.2)

        self._emit(session, CloseSession())
        time.sleep(0.1)
        self._emit(session, AppCountUpdate(count=1))

        self.assertFalse(returned.wait(0.4))

        self._emit(session, CloseSession())
        self.assertTrue(returned.wait(1))

    def test_wait_restarts_window_on_each_close(self, _):
        session = self._session()
        returned = self._wait(session, 0.3)

        self._emit(session, CloseSession())
        time.sleep(0.2)
        self._emit(session, AppCountUpdate(count=1))
        self._emit(session, CloseSession())

        self.assertFalse(returned.wait(0.2))
        self.assertTrue(returned.wait(1))
