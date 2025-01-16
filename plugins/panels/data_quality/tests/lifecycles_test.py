import pytest
from unittest.mock import AsyncMock, MagicMock
from .. import DataQualityPanel
from ..constants import (
    DEFAULT_ISSUE_CONFIG,
    DEFAULT_ISSUE_COUNTS,
    DEFAULT_COMPUTING,
    LAST_SCAN,
    SAMPLE_STORE,
)


@pytest.mark.asyncio
async def test_on_unload_with_content():
    panel = DataQualityPanel()

    ctx = MagicMock()
    ctx.dataset = MagicMock()  # dataset is not None
    ctx.panel.state.computing = "processing"

    store = MagicMock()
    store.get = MagicMock(return_value={"some_key": "some_value"})
    store.set = MagicMock()

    panel.get_store = MagicMock(return_value=store)
    panel._get_store_key = MagicMock(return_value="dataset_dq")

    panel.on_unload(ctx)

    panel.get_store.assert_called_once_with(ctx)
    panel._get_store_key.assert_called_once_with(ctx)

    # Assert that store.set was called to update the content
    store.set.assert_called_once_with(
        "dataset_dq", {"some_key": "some_value", "computing": "processing"}
    )

    # Assert that clear_view was called
    ctx.ops.clear_view.assert_called_once()


@pytest.mark.asyncio
async def test_on_unload_no_dataset():
    panel = DataQualityPanel()

    ctx = MagicMock()
    ctx.dataset = None

    store = MagicMock()
    store.get = MagicMock(return_value=SAMPLE_STORE)
    store.set = MagicMock()

    panel.get_store = MagicMock(return_value=store)
    panel._get_store_key = MagicMock(return_value="test_key")
    panel.ops = MagicMock()
    panel.ops.clear_view = MagicMock()

    panel.on_unload(ctx)

    panel.get_store.assert_not_called()
    panel._get_store_key.assert_not_called()
    panel.ops.clear_view.assert_not_called()


@pytest.mark.asyncio
async def test_on_change_selected_test():
    panel = DataQualityPanel()

    ctx = MagicMock()
    ctx.panel = panel
    ctx.panel.state = MagicMock()
    ctx.panel.state.issue_type = "exact_duplicates"
    ctx.panel.state.screen = "analysis"

    panel.toggle_select_from_grid = AsyncMock()

    ctx.selected = [1, 2]
    panel.on_change_selected(ctx)

    panel.toggle_select_from_grid.assert_called_once_with(ctx)


@pytest.mark.asyncio
async def test_on_load_second_time():
    panel = DataQualityPanel()

    ctx = MagicMock()
    ctx.dataset.name = "test_dataset"
    ctx.panel = panel
    ctx.panel.state = MagicMock()

    store = MagicMock()
    store.get = MagicMock(return_value=SAMPLE_STORE)
    store.set = MagicMock()

    panel.get_store = MagicMock(return_value=store)
    panel._get_store_key = MagicMock(return_value="test_key")
    panel.check_for_new_samples = AsyncMock()
    panel.scan_for_new_samples = AsyncMock()

    panel.on_load(ctx)

    panel.get_store.assert_called_once_with(ctx)
    panel._get_store_key.assert_called_once_with(ctx)
    store.get.assert_called_once_with("test_key")

    # Verify that store set was not called
    store.set.assert_not_called()


@pytest.mark.asyncio
async def test_on_load_first_time():
    panel = DataQualityPanel()

    ctx = MagicMock()
    ctx.dataset.name = "test_dataset"
    ctx.panel = panel
    ctx.panel.state = MagicMock()

    store = MagicMock()
    store.get = MagicMock(return_value=None)
    store.set = MagicMock()

    panel.get_store = MagicMock(return_value=store)
    panel._get_store_key = MagicMock(return_value="test_key")
    panel.check_for_new_samples = AsyncMock()
    panel.scan_for_new_samples = AsyncMock()

    panel.on_load(ctx)

    panel.get_store.assert_called_once_with(ctx)
    panel._get_store_key.assert_called_once_with(ctx)
    store.get.assert_called_once_with("test_key")
    store.set.assert_called_once()  # Verify that the store was set

    assert ctx.panel.state.screen == "home"
    assert ctx.panel.state.first_open is True
    assert ctx.panel.state.dataset_name == "test_dataset"

    assert ctx.panel.state.issue_config == DEFAULT_ISSUE_CONFIG
    assert ctx.panel.state.issue_counts == DEFAULT_ISSUE_COUNTS

    assert ctx.panel.state.computing == DEFAULT_COMPUTING
    assert ctx.panel.state.last_scan == LAST_SCAN
