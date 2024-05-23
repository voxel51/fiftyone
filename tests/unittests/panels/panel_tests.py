import pytest
from unittest.mock import MagicMock
from fiftyone.operators.panel import (
    Panel,
    PanelOperatorConfig,
    PanelRef,
    PanelRefState,
    PanelRefData,
    WriteOnlyError,
)
from fiftyone.operators.types import Object, Property
import pydash


def simulate_event(panel, mock_ctx, event_name):
    mock_ctx.params["__method__"] = event_name
    panel.execute(mock_ctx)


class TestPanel(Panel):
    @property
    def config(self):
        return PanelOperatorConfig(name="test_panel", label="Test Panel")

    def render(self, ctx):
        return "Rendered content"

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
    return TestPanel()


def test_panel_initialization(panel):
    assert isinstance(panel, Panel)


def test_panel_render(panel, mock_ctx):
    output = panel.render(mock_ctx)
    assert output == "Rendered content"


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


def test_panel_execute(panel, mock_ctx):
    simulate_event(panel, mock_ctx, "on_load")
    assert mock_ctx.ops.show_panel_output.called
    assert mock_ctx.ops.show_panel_output.call_args[0][0] == "Rendered content"


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


def test_panel_ref_data_getattr_raises_write_only_error(mock_ctx):
    data = PanelRefData(mock_ctx)
    with pytest.raises(WriteOnlyError):
        _ = data.test_key


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
