# pylint: disable=no-member,no-name-in-module

import pytest
from unittest.mock import MagicMock
from fiftyone.operators.operations import build_register_panel_params
from fiftyone.operators.panel import (
    Panel,
    PanelConfig,
    PanelRef,
    PanelRefState,
    PanelRefData,
    WriteOnlyError,
)
from fiftyone.plugins import PluginScope
from fiftyone.operators.types import Object, Property


def simulate_event(panel, mock_ctx, event_name):
    mock_ctx.params["__method__"] = event_name
    panel.execute(mock_ctx)


class MockPanel(Panel):
    @property
    def config(self):
        return PanelConfig(name="test_panel", label="Test Panel")

    def render(self, ctx):
        panel = Object()
        panel.str("content", default="Rendered content")
        return Property(panel)

    def on_change(self, ctx):
        pass  # Implemented for testing purposes


@pytest.fixture
def mock_ctx():
    ctx = MagicMock()
    ctx.panel_state = {}
    ctx.panel_id = "test_panel_id"
    ctx.params = {
        "__method__": "on_load",
        "panel_id": "test_panel_id",
        "state": {},
        "event_args": {},
    }
    return ctx


@pytest.fixture
def panel():
    return MockPanel()


def test_panel_initialization(panel):
    assert isinstance(panel, Panel)


def test_panel_render(panel, mock_ctx):
    output = panel.render(mock_ctx)
    assert isinstance(output, Property)


def test_panel_resolve_input(panel, mock_ctx):
    resolved_input = panel.resolve_input(mock_ctx)
    assert isinstance(resolved_input, Property)
    assert isinstance(resolved_input.type, Object)
    assert "state" in resolved_input.type.properties
    assert "event_args" in resolved_input.type.properties
    assert "panel_id" in resolved_input.type.properties
    assert "state" in resolved_input.type.properties
    assert "event_args" in resolved_input.type.properties


def test_panel_on_startup(panel, mock_ctx):
    panel.on_startup(mock_ctx)
    assert mock_ctx.ops.register_panel.called
    assert (
        mock_ctx.ops.register_panel.call_args[1]["name"] == panel.config.name
    )
    assert (
        mock_ctx.ops.register_panel.call_args[1]["label"] == panel.config.label
    )


def test_panel_config_not_on_startup():
    # panels register from the /operators payload, not a startup execute
    config = PanelConfig(name="test_panel", label="Test Panel")
    assert config.on_startup is False


def test_resolve_panel_config(panel):
    panel_config = panel.resolve_panel_config()
    assert panel_config["name"] == "test_panel"
    assert panel_config["label"] == "Test Panel"
    assert panel_config["allow_duplicates"] is False
    assert panel_config["on_load"].endswith("#on_load")
    assert panel_config["on_change"].endswith("#on_change")


def test_build_register_panel_params_from_panel(panel):
    params = build_register_panel_params(**panel.resolve_panel_config())
    assert params["panel_name"] == "test_panel"
    assert params["panel_label"] == "Test Panel"
    assert params["allow_duplicates"] is False
    assert params["on_load"].endswith("#on_load")
    assert params["on_change"].endswith("#on_change")


GRID = PluginScope.DATASET_SAMPLES_GRID
MODAL = PluginScope.DATASET_SAMPLE_MODAL


@pytest.mark.parametrize(
    "surfaces,expected",
    [
        ("grid", [GRID]),
        ("modal", [MODAL]),
        ("grid modal", [GRID, MODAL]),
        # A portal panel is rendered wherever a consumer places it.
        ("portal", [PluginScope.ALL]),
        ("grid portal", [PluginScope.ALL]),
        ("modal portal", [PluginScope.ALL]),
        ("grid modal portal", [PluginScope.ALL]),
    ],
)
def test_panel_config_surfaces_derive_scopes(surfaces, expected):
    config = PanelConfig(name="p", label="P", surfaces=surfaces)
    assert config.scopes == expected


def test_portal_panel_operator_emits_all_surface_on_the_wire():
    config = PanelConfig(name="p", label="P", surfaces="portal")
    assert config.to_json()["scopes"] == ["ALL"]


@pytest.mark.parametrize(
    "surfaces",
    ["grid", "modal", "portal", "grid portal", "grid modal portal"],
)
def test_panel_surfaces_reach_the_app_unchanged(surfaces):
    # The App places the panel by this string, so preserve it verbatim even
    # though the operator metadata represents a portal as ALL.
    class PortalPanel(MockPanel):
        @property
        def config(self):
            return PanelConfig(name="p", label="P", surfaces=surfaces)

    assert PortalPanel().resolve_panel_config()["surfaces"] == surfaces


@pytest.mark.parametrize("kwargs", [{}, {"surfaces": None}])
def test_panel_config_surfaces_default_is_grid(kwargs):
    config = PanelConfig(name="p", label="P", **kwargs)
    assert config.scopes == [GRID]
    assert config.surfaces == "grid"
    assert config.panel_surfaces == "grid"


def test_panel_config_surfaces_accepts_operator_surfaces():
    config = PanelConfig(name="p", label="P", surfaces=[MODAL])
    assert config.scopes == [MODAL]
    assert config.panel_surfaces == "modal"


def test_panel_config_all_operator_surface_is_a_portal():
    config = PanelConfig(name="p", label="P", surfaces=[PluginScope.ALL])
    assert config.scopes == [PluginScope.ALL]
    assert config.panel_surfaces == "portal"


def test_panel_config_surfaces_deduplicates():
    config = PanelConfig(name="p", label="P", surfaces="grid grid")
    assert config.scopes == [GRID]
    assert config.panel_surfaces == "grid"


def test_panel_config_invalid_surface_raises():
    with pytest.raises(ValueError):
        PanelConfig(name="p", label="P", surfaces="main")


def test_panel_config_to_json_surfaces_are_operator_surfaces():
    config = PanelConfig(name="p", label="P", surfaces="grid modal")
    assert config.to_json()["scopes"] == [
        "dataset_samples_grid",
        "dataset_sample_modal",
    ]


def test_sidebar_panel_requires_explicit_scopes():
    with pytest.raises(ValueError):
        PanelConfig(name="p", label="P", surfaces="sidebar_right")


def test_sidebar_panel_has_independent_surface_and_scope():
    config = PanelConfig(
        name="p",
        label="P",
        surfaces="sidebar_right",
        scopes=[GRID],
    )
    assert config.surfaces == "sidebar_right"
    assert config.scopes == [GRID]


def test_panel_execute(panel, mock_ctx):
    simulate_event(panel, mock_ctx, "on_load")
    assert mock_ctx.ops.show_panel_output.called
    assert isinstance(mock_ctx.ops.show_panel_output.call_args[0][0], Property)


def test_panel_execute_on_startup(panel, mock_ctx):
    simulate_event(panel, mock_ctx, None)
    assert mock_ctx.ops.register_panel.called


def test_panel_execute_method_not_none(panel, mock_ctx):
    simulate_event(panel, mock_ctx, "on_startup")
    assert mock_ctx.ops.register_panel.called


def test_panel_on_change(panel, mock_ctx):
    panel.on_change = MagicMock()
    simulate_event(panel, mock_ctx, "on_change")
    panel.on_change.assert_called_with(mock_ctx)


def test_panel_ref_state_initialization(mock_ctx):
    state = PanelRefState(mock_ctx)
    assert state._data == mock_ctx.panel_state
    assert state._ctx == mock_ctx


def test_panel_ref_state_setattr(mock_ctx):
    state = PanelRefState(mock_ctx)
    state.test_key = "test_value"
    assert state._data["test_key"] == "test_value"
    mock_ctx.ops.patch_panel_state.assert_called_with(
        {"test_key": "test_value"}
    )


def test_panel_ref_state_getattr(mock_ctx):
    state = PanelRefState(mock_ctx)
    state._data["test_key"] = "test_value"
    assert state.test_key == "test_value"


def test_panel_ref_state_clear(mock_ctx):
    state = PanelRefState(mock_ctx)
    state.test_key = "test_value"
    state.clear()
    assert state._data == {}
    mock_ctx.ops.clear_panel_state.assert_called()


def test_panel_ref_data_initialization(mock_ctx):
    data = PanelRefData(mock_ctx)
    assert data._data == {}
    assert data._ctx == mock_ctx


def test_panel_ref_data_setattr(mock_ctx):
    data = PanelRefData(mock_ctx)
    data.test_key = "test_value"
    assert data._data["test_key"] == "test_value"
    mock_ctx.ops.patch_panel_data.assert_called_with(
        {"test_key": "test_value"}
    )


def test_panel_ref_data_clear(mock_ctx):
    data = PanelRefData(mock_ctx)
    data.test_key = "test_value"
    data.clear()
    assert data._data == {}
    mock_ctx.ops.clear_panel_data.assert_called()


def test_panel_ref_initialization(mock_ctx):
    panel_ref = PanelRef(mock_ctx)
    assert panel_ref._ctx == mock_ctx
    assert isinstance(panel_ref._state, PanelRefState)
    assert isinstance(panel_ref._data, PanelRefData)


def test_panel_ref_properties(mock_ctx):
    panel_ref = PanelRef(mock_ctx)
    assert panel_ref.state == panel_ref._state
    assert panel_ref.data == panel_ref._data
    assert panel_ref.id == mock_ctx.panel_id


def test_panel_ref_close(mock_ctx):
    panel_ref = PanelRef(mock_ctx)
    panel_ref.close()
    mock_ctx.ops.close_panel.assert_called()


def test_panel_ref_set_state(mock_ctx):
    panel_ref = PanelRef(mock_ctx)
    panel_ref.set_state("test_key", "test_value")
    assert panel_ref._state._data["test_key"] == "test_value"
    mock_ctx.ops.patch_panel_state.assert_called_with(
        {"test_key": "test_value"}
    )


def test_panel_ref_set_state_dict(mock_ctx):
    panel_ref = PanelRef(mock_ctx)
    panel_ref.set_state({"test_key": "test_value"})
    assert panel_ref._state._data["test_key"] == "test_value"
    mock_ctx.ops.patch_panel_state.assert_called_with(
        {"test_key": "test_value"}
    )


def test_panel_ref_set_state_deep_path(mock_ctx):
    panel_ref = PanelRef(mock_ctx)
    panel_ref.set_state("nested.key.path", "test_value")
    assert panel_ref._state._data["nested"]["key"]["path"] == "test_value"
    mock_ctx.ops.patch_panel_state.assert_called_with(
        {"nested.key.path": "test_value"}
    )


def test_panel_ref_set_state_deep_path_dict(mock_ctx):
    panel_ref = PanelRef(mock_ctx)
    panel_ref.set_state({"nested.key.path": "test_value"})
    assert panel_ref._state._data["nested"]["key"]["path"] == "test_value"
    mock_ctx.ops.patch_panel_state.assert_called_with(
        {"nested.key.path": "test_value"}
    )


def test_panel_ref_get_data_raises_write_only_error(mock_ctx):
    panel_ref = PanelRef(mock_ctx)
    with pytest.raises(WriteOnlyError):
        _ = panel_ref.data.get("test_key")


def test_panel_ref_get_state(mock_ctx):
    panel_ref = PanelRef(mock_ctx)
    panel_ref.set_state("test_key", "test_value")
    assert panel_ref.get_state("test_key") == "test_value"


def test_panel_ref_set_data(mock_ctx):
    panel_ref = PanelRef(mock_ctx)
    panel_ref.set_data("test_key", "test_value")
    assert panel_ref._data._data["test_key"] == "test_value"
    mock_ctx.ops.patch_panel_data.assert_called_with(
        {"test_key": "test_value"}
    )


def test_panel_ref_set_data_dict(mock_ctx):
    panel_ref = PanelRef(mock_ctx)
    panel_ref.set_data({"test_key": "test_value"})
    assert panel_ref._data._data["test_key"] == "test_value"
    mock_ctx.ops.patch_panel_data.assert_called_with(
        {"test_key": "test_value"}
    )


def test_panel_ref_set_data_deep_path(mock_ctx):
    panel_ref = PanelRef(mock_ctx)
    panel_ref.set_data("nested.key.path", "test_value")
    assert panel_ref._data._data["nested"]["key"]["path"] == "test_value"
    mock_ctx.ops.patch_panel_data.assert_called_with(
        {"nested.key.path": "test_value"}
    )


def test_panel_ref_set_data_deep_path_dict(mock_ctx):
    panel_ref = PanelRef(mock_ctx)
    panel_ref.set_data({"nested.key.path": "test_value"})
    assert panel_ref._data._data["nested"]["key"]["path"] == "test_value"
    mock_ctx.ops.patch_panel_data.assert_called_with(
        {"nested.key.path": "test_value"}
    )
