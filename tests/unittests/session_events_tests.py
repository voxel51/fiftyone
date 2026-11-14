"""
FiftyOne session events-related unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import copy
from dataclasses import asdict
import json
import os
import tempfile
import unittest
from unittest import mock

from dacite import from_dict

import fiftyone as fo
from fiftyone.core.session import events

# pylint: disable=no-name-in-module,import-error
from fiftyone.core.session.constants import (
    DEFAULT_LABEL_SELECTION_STYLE,
    VALID_ICON_STYLES,
)
from fiftyone.core.session.session import (
    Session,
    _normalize_selected_labels,
    _on_select_labels,
    _resolve_label_selection_style,
    _resolve_selection_style,
)
from fiftyone.core.session.utils import normalize_selected_samples
from fiftyone.core.session.events import (
    SelectLabels,
    SetLabelSelectionStyle,
    SetSampleSelectionStyle,
)

# pylint: enable=no-name-in-module,import-error
from fiftyone.core.state import StateDescription

from decorators import drop_datasets


class AppConfigStateRestoreTests(unittest.TestCase):
    _FIELDS = {
        "show_confidence": "FIFTYONE_APP_SHOW_CONFIDENCE",
        "show_index": "FIFTYONE_APP_SHOW_INDEX",
        "show_label": "FIFTYONE_APP_SHOW_LABEL",
    }

    def setUp(self):
        self._env = mock.patch.dict(os.environ, {}, clear=False)
        self._env.start()
        self.addCleanup(self._env.stop)

        timezone = fo.config.timezone
        self.addCleanup(setattr, fo.config, "timezone", timezone)

        for name in (
            "FIFTYONE_APP_SHOW_CONFIDENCE",
            "FIFTYONE_APP_SHOW_INDEX",
            "FIFTYONE_APP_SHOW_LABEL",
        ):
            os.environ.pop(name, None)

    def test_state_config_roundtrip_does_not_emit_removed_option_warnings(
        self,
    ):
        app_config = fo.AppConfig()
        app_config.show_confidence = False
        app_config.show_index = False
        app_config.show_label = False
        payload = {"config": app_config.serialize()}

        with self.assertNoLogs("fiftyone.core.config", level="WARNING"):
            state = StateDescription.from_dict(payload)

        self.assertFalse(state.config.show_confidence)
        self.assertFalse(state.config.show_index)
        self.assertFalse(state.config.show_label)

    def test_direct_legacy_assignment_warns(self):
        session = Session.__new__(Session)
        session._disable_wait_warning = True
        session._state = StateDescription(config=fo.AppConfig())

        with self.assertLogs(
            "fiftyone.core.config", level="WARNING"
        ) as captured:
            session.config.show_confidence = False

        self.assertFalse(session.config.show_confidence)
        self.assertEqual(1, len(captured.records))
        self.assertIn("show_confidence", captured.output[0])

    def test_public_config_sources_warn_once_per_legacy_field_value(self):
        for field, env_name in self._FIELDS.items():
            for value in (True, False):
                for source in (
                    "dict",
                    "from_dict",
                    "json_file",
                    "env_only",
                    "dict_and_env",
                ):
                    with self.subTest(field=field, value=value, source=source):
                        env_value = str(value).lower()

                        def load():
                            if source == "dict":
                                return fo.AppConfig({field: value})
                            if source == "from_dict":
                                return fo.AppConfig.from_dict({field: value})
                            if source == "json_file":
                                with tempfile.TemporaryDirectory() as directory:
                                    path = os.path.join(
                                        directory, "app-config.json"
                                    )
                                    with open(
                                        path, "w", encoding="utf-8"
                                    ) as stream:
                                        json.dump({field: value}, stream)
                                    return fo.AppConfig.from_json(path)
                            if source == "env_only":
                                return fo.AppConfig()
                            return fo.AppConfig({field: value})

                        if source in ("env_only", "dict_and_env"):
                            with mock.patch.dict(
                                os.environ, {env_name: env_value}
                            ):
                                with self.assertLogs(
                                    "fiftyone.core.config", level="WARNING"
                                ) as captured:
                                    config = load()
                        else:
                            with self.assertLogs(
                                "fiftyone.core.config", level="WARNING"
                            ) as captured:
                                config = load()

                        self.assertEqual(1, len(captured.records))
                        self.assertIn(field, captured.output[0])
                        self.assertIs(getattr(config, field), value)

    def test_defaults_and_unrelated_or_dynamic_fields_are_quiet(self):
        with self.assertNoLogs("fiftyone.core.config", level="WARNING"):
            config = fo.AppConfig()
            config.theme = "dark"
            config.runtime_extension_option = {"enabled": True}
            state = StateDescription.from_dict(
                {
                    "config": {
                        "theme": "light",
                        "runtime_extension_option": {"enabled": False},
                    }
                }
            )

        self.assertTrue(config.show_confidence)
        self.assertTrue(config.show_index)
        self.assertTrue(config.show_label)
        self.assertEqual("light", state.config.theme)
        self.assertEqual(
            {"enabled": False}, state.config.runtime_extension_option
        )

    def test_session_getter_direct_and_same_value_assignments_warn_once(self):
        for field in self._FIELDS:
            session = Session.__new__(Session)
            session._disable_wait_warning = True
            session._state = StateDescription(config=fo.AppConfig())

            for value in (True, False):
                with self.subTest(field=field, value=value):
                    config = session.config
                    with self.assertLogs(
                        "fiftyone.core.config", level="WARNING"
                    ) as direct:
                        setattr(config, field, value)
                    self.assertEqual(1, len(direct.records))
                    self.assertIn(field, direct.output[0])
                    self.assertIs(getattr(session.config, field), value)

                    with self.assertLogs(
                        "fiftyone.core.config", level="WARNING"
                    ) as repeated:
                        setattr(session.config, field, value)
                    self.assertEqual(1, len(repeated.records))
                    self.assertIn(field, repeated.output[0])
                    self.assertIs(getattr(session.config, field), value)

    def test_direct_assignment_preserves_an_optional_raw_sentinel(self):
        config = fo.AppConfig()
        sentinel = object()

        with self.assertLogs(
            "fiftyone.core.config", level="WARNING"
        ) as captured:
            config.show_label = sentinel

        self.assertEqual(1, len(captured.records))
        self.assertIs(config.show_label, sentinel)

    def test_full_and_partial_internal_state_restore_is_quiet_and_nonmutating(
        self,
    ):
        full = fo.AppConfig().serialize()
        full.update(
            show_confidence=False,
            show_index=True,
            show_label=False,
            theme="dark",
            timezone="UTC",
            runtime_extension_option={"items": [1, 2]},
        )
        cases = (
            full,
            {
                "show_index": False,
                "theme": "light",
                "runtime_extension_option": "preserve",
            },
        )
        for index, config_data in enumerate(cases):
            with self.subTest(config_data=config_data):
                payload = {"config": copy.deepcopy(config_data)}
                original = copy.deepcopy(payload)
                with self.assertNoLogs(
                    "fiftyone.core.config", level="WARNING"
                ):
                    state = StateDescription.from_dict(payload)
                self.assertEqual(original, payload)
                for name, value in config_data.items():
                    self.assertEqual(value, getattr(state.config, name))
                self.assertNotIn("_warn_removed_options", vars(state.config))
                if index == 0:
                    self.assertEqual(config_data, state.config.serialize())
                    self.assertEqual("UTC", fo.config.timezone)

    def test_missing_or_empty_config_copies_global_app_config_even_with_legacy_env(
        self,
    ):
        baseline = copy.deepcopy(vars(fo.app_config))
        for field, env_name in self._FIELDS.items():
            alternate = str(not getattr(fo.app_config, field)).lower()
            with mock.patch.dict(os.environ, {env_name: alternate}):
                for payload in ({}, {"config": {}}):
                    with self.subTest(field=field, payload=payload):
                        original = copy.deepcopy(payload)
                        with self.assertNoLogs(
                            "fiftyone.core.config", level="WARNING"
                        ):
                            state = StateDescription.from_dict(payload)
                        self.assertIsNot(state.config, fo.app_config)
                        self.assertEqual(baseline, vars(state.config))
                        self.assertEqual(original, payload)

    def test_nonempty_partial_config_reads_legacy_env_quietly(self):
        for field, env_name in self._FIELDS.items():
            for value in (True, False):
                with self.subTest(field=field, value=value):
                    payload = {"config": {"theme": "dark"}}
                    with mock.patch.dict(
                        os.environ, {env_name: str(value).lower()}
                    ):
                        with self.assertNoLogs(
                            "fiftyone.core.config", level="WARNING"
                        ):
                            state = StateDescription.from_dict(payload)
                    self.assertIs(getattr(state.config, field), value)
                    self.assertEqual("dark", state.config.theme)
                    self.assertEqual({"config": {"theme": "dark"}}, payload)

    def test_repeated_real_async_state_loads_are_quiet(self):
        payload = {
            "config": {
                "show_confidence": False,
                "show_index": True,
                "show_label": False,
                "runtime_extension_option": {"source": "async-load"},
            }
        }
        original = copy.deepcopy(payload)

        async def load_repeatedly():
            states = []
            for _ in range(3):
                with self.assertNoLogs(
                    "fiftyone.core.config", level="WARNING"
                ):
                    states.append(await events._load_state(payload))
            return states

        env = {
            env_name: str(not payload["config"][field]).lower()
            for field, env_name in self._FIELDS.items()
        }
        with mock.patch.dict(os.environ, env):
            states = asyncio.run(load_repeatedly())
        self.assertEqual(original, payload)
        self.assertEqual(3, len(states))
        for state in states:
            for field in self._FIELDS:
                self.assertIs(
                    getattr(state.config, field), payload["config"][field]
                )
            self.assertEqual(
                {"source": "async-load"}, state.config.runtime_extension_option
            )

    def test_copy_deepcopy_and_serialize_are_quiet_and_keep_compat_values(
        self,
    ):
        config = fo.AppConfig()
        expected = dict.fromkeys(self._FIELDS, False)
        for field, value in expected.items():
            with self.assertLogs("fiftyone.core.config", level="WARNING"):
                setattr(config, field, value)
        with self.assertNoLogs("fiftyone.core.config", level="WARNING"):
            clones = (copy.copy(config), copy.deepcopy(config), config.copy())
            serialized = config.serialize()
        for clone in (config, *clones):
            self.assertNotIn("_warn_removed_options", vars(clone))
            for field, value in expected.items():
                self.assertIs(getattr(clone, field), value)
        for field, value in expected.items():
            self.assertIs(serialized[field], value)
        private_keys = {key for key in vars(config) if key.startswith("_")}
        self.assertTrue(private_keys.isdisjoint(serialized))

    def test_constructor_bypasses_legacy_setattr_hook_but_direct_writes_do_not(
        self,
    ):
        fields = set(self._FIELDS)

        class TrackingAppConfig(fo.AppConfig):
            writes = []

            def __setattr__(self, name, value):
                type(self).writes.append(name)
                super().__setattr__(name, value)

        TrackingAppConfig.writes = []
        values = {
            "show_confidence": False,
            "show_index": True,
            "show_label": False,
        }
        with self.assertLogs(
            "fiftyone.core.config", level="WARNING"
        ) as captured:
            config = TrackingAppConfig(values)

        self.assertEqual(3, len(captured.records))
        for field in fields:
            self.assertTrue(
                any(field in output for output in captured.output),
                msg=f"Missing warning for {field}",
            )
        self.assertTrue(fields.isdisjoint(TrackingAppConfig.writes))

        with self.assertNoLogs("fiftyone.core.config", level="WARNING"):
            config.theme = "dark"
        self.assertIn("theme", TrackingAppConfig.writes)

        with self.assertLogs(
            "fiftyone.core.config", level="WARNING"
        ) as direct:
            config.show_label = True
        self.assertEqual(1, len(direct.records))
        self.assertIn("show_label", direct.output[0])
        self.assertIn("show_label", TrackingAppConfig.writes)
        self.assertEqual("dark", config.theme)

    def test_explicit_none_config_keeps_existing_attribute_error(self):
        with self.assertRaises(AttributeError):
            StateDescription.from_dict({"config": None})

    def test_internal_timezone_and_unrelated_defaults_are_preserved(self):
        with self.assertNoLogs("fiftyone.core.config", level="WARNING"):
            state = StateDescription.from_dict(
                {"config": {"timezone": "UTC", "theme": "dark"}}
            )
        self.assertEqual("UTC", fo.config.timezone)
        self.assertEqual("UTC", state.config.timezone)
        self.assertEqual("dark", state.config.theme)
        self.assertEqual(fo.AppConfig().color_pool, state.config.color_pool)


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
