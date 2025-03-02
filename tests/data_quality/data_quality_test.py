import pytest
from unittest.mock import MagicMock
from plugins.panels import DataQualityPanel
from plugins.panels.data_quality import (
    STATUS,
    SAMPLE_STORE,
    DEFAULT_ISSUE_COUNTS,
)
from datetime import datetime, timedelta
from collections import defaultdict


@pytest.fixture
def panel():
    return DataQualityPanel()


@pytest.fixture
def mock_ctx():
    """Fixture to create a mock context object with dataset and panel attributes."""
    ctx = MagicMock()
    ctx.dataset = MagicMock()
    ctx.panel = MagicMock()
    ctx.panel.state = MagicMock()
    ctx.panel.state.new_samples = defaultdict(lambda: [0, False, False])
    ctx.panel.state.issue_config = {
        "brightness": {"min": 0.2, "max": 0.8},
        "issue_type_2": {"min": 0.1, "max": 0.9},
    }
    ctx.dataset.bounds = MagicMock(return_value=(0.0, 1.0))

    return ctx


def test_process_exact_duplicates(mock_ctx, panel):
    """Test processing the exact_duplicates issue type."""
    panel._process_exact_duplicates = MagicMock(
        return_value=(["hash1"], [("hash1", ["sample1", "sample2"])], 2)
    )
    panel.get_store = MagicMock(return_value={})
    panel._get_store_key = MagicMock(return_value="test_key")

    store = MagicMock()
    panel.get_store.return_value = store
    store.get.return_value = {
        "results": {"exact_duplicates": {}},
        "counts": {},
        "computing": {},
        "last_scan": None,
        "status": {"exact_duplicates": ""},
    }

    panel._process_issue_computation(mock_ctx, "exact_duplicates")

    # Verify that the store was updated correctly
    store.set.assert_called()
    content = store.set.call_args[0][1]
    assert content["results"]["exact_duplicates"]["dup_filehash"] == ["hash1"]
    assert content["results"]["exact_duplicates"]["dup_sample_ids"] == [
        ("hash1", ["sample1", "sample2"])
    ]
    assert content["counts"]["exact_duplicates"] == 2


def test_process_histogram_issue(mock_ctx, panel):
    """Test processing a non-duplicate issue type with histogram values."""
    panel.get_store = MagicMock(return_value={})
    panel._get_store_key = MagicMock(return_value="test_key")
    panel.get_plot_defaults = MagicMock(return_value=(0.1, 0.9))
    mock_ctx.panel.state.issue_config["brightness"][
        "detect_method"
    ] = "threshold"

    mock_ctx.dataset.histogram_values.return_value = (
        [1, 2, 3],
        [0.0, 0.5, 1.0],
        None,
    )
    mock_view = MagicMock()
    mock_ctx.dataset.match.return_value = mock_view
    mock_view.__len__.return_value = 5

    store = MagicMock()
    panel.get_store.return_value = store

    store.get.return_value = {
        "results": {"brightness": {}},
        "counts": {},
        "computing": {},
        "last_scan": None,
        "status": {"brightness": {}},
    }

    panel._process_issue_computation(mock_ctx, "brightness")

    # Verify that the store was updated correctly
    store.set.assert_called()
    content = store.set.call_args[0][1]
    assert content["results"]["brightness"]["counts"] == [1, 2, 3]
    assert content["results"]["brightness"]["edges"] == [0.0, 0.5, 1.0]
    assert content["counts"]["brightness"] == 5


def test_process_exact_duplicates_with_duplicates(mock_ctx, panel):
    """Test when the dataset has duplicate filehash values."""
    mock_ctx.dataset.has_field.return_value = True
    mock_view = MagicMock()
    mock_ctx.dataset.exists.return_value = mock_view
    mock_view.values.return_value = (
        ["sample1", "sample2", "sample3", "sample4"],
        ["hash1", "hash2", "hash1", "hash3"],
    )

    (
        dup_filehashes,
        dup_sample_ids,
        num_duplicates,
    ) = panel._process_exact_duplicates(mock_ctx)

    assert dup_filehashes == ["hash1"]
    assert dup_sample_ids == [("hash1", ["sample1", "sample3"])]
    assert num_duplicates == 2


def test_process_exact_duplicates_no_duplicates(mock_ctx, panel):
    """Test when the dataset has no duplicate filehash values."""
    mock_ctx.dataset.has_field.return_value = True
    mock_view = MagicMock()
    mock_ctx.dataset.exists.return_value = mock_view
    mock_view.values.return_value = (
        ["sample1", "sample2", "sample3"],
        ["hash1", "hash2", "hash3"],
    )

    (
        dup_filehashes,
        dup_sample_ids,
        num_duplicates,
    ) = panel._process_exact_duplicates(mock_ctx)

    assert dup_filehashes == []
    assert dup_sample_ids == []
    assert num_duplicates == 0


def test_process_exact_duplicates_no_filehash_field(mock_ctx, panel):
    """Test when the dataset does not have the 'filehash' field."""
    mock_ctx.dataset.has_field.return_value = False

    (
        dup_filehashes,
        dup_sample_ids,
        num_duplicates,
    ) = panel._process_exact_duplicates(mock_ctx)

    assert dup_filehashes == []
    assert dup_sample_ids == []
    assert num_duplicates == 0


def test_on_success_near_duplicates_delegated_execution(mock_ctx, panel):
    """Test the delegated execution path (when run_id is not None)."""
    panel._get_run_id = MagicMock(return_value="1234")
    panel._on_compute_option_selected = MagicMock()

    panel._on_success_near_duplicates(mock_ctx)

    panel._get_run_id.assert_called_once_with(mock_ctx)
    panel._on_compute_option_selected.assert_called_once_with(
        mock_ctx, "delegate", run_id="1234"
    )
    mock_ctx.panel.state.near_duplicates_status = {}


def test_on_success_near_duplicates_immediate_execution(mock_ctx, panel):
    """Test the immediate execution path (when run_id is None)."""
    panel._get_run_id = MagicMock(return_value=None)
    panel._on_compute_option_selected = MagicMock()
    panel._process_issue_computation = MagicMock()

    panel._on_success_near_duplicates(mock_ctx)

    panel._get_run_id.assert_called_once_with(mock_ctx)
    panel._on_compute_option_selected.assert_called_once_with(
        mock_ctx, "execute"
    )
    panel._process_issue_computation.assert_called_once_with(
        mock_ctx, "near_duplicates"
    )


def test_computation_handler_check_existing_field_true(
    panel, mock_ctx, mocker
):
    """Test when check_existing_field is True and the field doesn't exist."""
    mock_ctx.params = {
        "check_existing_field": True,
        "original_params": {"issue_type": "brightness"},
    }
    mock_ctx.dataset.exists = MagicMock(return_value=False)

    change_status_mock = mocker.patch.object(panel, "change_computing_status")
    process_issue_mock = mocker.patch.object(
        panel, "_process_issue_computation"
    )

    panel.computation_handler(mock_ctx)

    change_status_mock.assert_called_once_with(
        mock_ctx, "brightness", is_computing=True, execution_type="execute"
    )
    process_issue_mock.assert_called_once_with(mock_ctx, "brightness")


def test_computation_handler_check_existing_field_false_no_run_id(
    panel, mock_ctx, mocker
):
    """Test when check_existing_field is False and run_id is None."""
    mock_ctx.params = {
        "check_existing_field": False,
        "original_params": {"issue_type": "brightness"},
    }
    mocker.patch.object(panel, "_get_run_id", return_value=None)

    process_issue_mock = mocker.patch.object(
        panel, "_process_issue_computation"
    )

    panel.computation_handler(mock_ctx)

    process_issue_mock.assert_called_once_with(mock_ctx, "brightness")


def test_computation_handler_with_run_id(panel, mock_ctx, mocker):
    """Test when a run_id is present (delegated execution)."""
    mock_ctx.params = {
        "check_existing_field": False,
        "original_params": {"issue_type": "brightness"},
    }
    mock_ctx.dataset.exists = MagicMock(return_value=True)
    mocker.patch.object(panel, "_get_run_id", return_value="run123")

    # Mock store
    store_mock = MagicMock()
    store_mock.get = MagicMock(return_value={"status": {}})
    store_mock.set = MagicMock()
    mocker.patch.object(panel, "get_store", return_value=store_mock)

    change_status_mock = mocker.patch.object(panel, "change_computing_status")

    panel.computation_handler(mock_ctx)
    store_mock.get.assert_called_once()

    change_status_mock.assert_called_once_with(
        mock_ctx,
        "brightness",
        is_computing=True,
        execution_type="delegate_execution",
        delegation_run_id="run123",
    )


def test_change_computing_status_update_computing_status(
    panel, mock_ctx, mocker
):
    """Test when changing the computing status without changing the issue status."""
    mock_ctx.panel.state.computing = {
        "brightness": {
            "is_computing": False,
            "execution_type": "",
            "delegation_run_id": "",
            "delegation_status": "",
        }
    }

    # Mock store
    store_mock = MagicMock()
    store_mock.get = MagicMock(
        return_value={
            "computing": mock_ctx.panel.state.computing,
            "status": {},
        }
    )
    store_mock.set = MagicMock()
    mocker.patch.object(panel, "get_store", return_value=store_mock)

    panel._get_store_key = MagicMock(return_value="dataset_dq")

    # Call the method with specific parameters
    panel.change_computing_status(
        mock_ctx,
        issue_type="brightness",
        is_computing=True,
        execution_type="execution",
        delegation_run_id="run123",
        delegation_status="running",
    )

    # Assert the computing status was updated
    assert mock_ctx.panel.state.computing["brightness"] == {
        "is_computing": True,
        "execution_type": "execution",
        "delegation_run_id": "run123",
        "delegation_status": "running",
    }

    # Assert that the store was updated correctly
    store_mock.set.assert_called_once_with(
        "dataset_dq",
        {"computing": mock_ctx.panel.state.computing, "status": {}},
    )


def test_change_computing_status_with_issue_status(panel, mock_ctx, mocker):
    """Test when changing the computing status and the issue status."""
    mock_ctx.panel.state.computing = {
        "brightness": {
            "is_computing": False,
            "execution_type": "",
            "delegation_run_id": "",
            "delegation_status": "",
        }
    }

    # Mock store
    store_mock = MagicMock()
    store_mock.get = MagicMock(
        return_value={
            "computing": mock_ctx.panel.state.computing,
            "status": {"brightness": "in_review"},
        }
    )
    panel._get_store_key = MagicMock(return_value="dataset_dq")
    store_mock.set = MagicMock()
    mocker.patch.object(panel, "get_store", return_value=store_mock)

    # Call the method with specific parameters including an issue status
    panel.change_computing_status(
        mock_ctx,
        issue_type="brightness",
        is_computing=True,
        execution_type="typeA",
        delegation_run_id="run123",
        delegation_status="in_progress",
        issue_status="in_review",
    )

    # Assert the computing status was updated
    assert mock_ctx.panel.state.computing["brightness"] == {
        "is_computing": True,
        "execution_type": "typeA",
        "delegation_run_id": "run123",
        "delegation_status": "in_progress",
    }

    # Assert that the issue status was updated to "in_review"
    assert store_mock.get.return_value["status"]["brightness"] == "in_review"

    # Assert that the store was updated correctly
    store_mock.set.assert_called_once_with(
        "dataset_dq",
        {
            "computing": mock_ctx.panel.state.computing,
            "status": {"brightness": "in_review"},
        },
    )

    # def test_change_computing_status_invalid_issue_status(panel, mock_ctx, mocker):
    """Test when the issue status is not in the STATUS values."""
    mock_ctx.panel.state.computing = {
        "brightness": {
            "is_computing": False,
            "execution_type": "",
            "delegation_run_id": "",
            "delegation_status": "",
        }
    }

    # Mock store
    store_mock = MagicMock()
    store_mock.get = MagicMock(
        return_value={
            "computing": mock_ctx.panel.state.computing,
            "status": {},
        }
    )
    store_mock.set = MagicMock()
    mocker.patch.object(panel, "get_store", return_value=store_mock)

    # Call the method with an invalid issue status
    panel.change_computing_status(
        mock_ctx,
        issue_type="brightness",
        is_computing=True,
        execution_type="typeA",
        delegation_run_id="run123",
        delegation_status="in_progress",
        issue_status="invalid_status",
    )

    panel._get_store_key = MagicMock(return_value="dataset_dq")

    # Assert that the computing status was updated
    assert mock_ctx.panel.state.computing["brightness"] == {
        "is_computing": True,
        "execution_type": "typeA",
        "delegation_run_id": "run123",
        "delegation_status": "in_progress",
    }

    # Assert that the issue status was not updated
    assert "brightness" not in store_mock.get.return_value["status"]

    # Assert that the store was updated correctly without changing issue status
    store_mock.set.assert_called_once_with(
        "dataset_dq",
        {"computing": mock_ctx.panel.state.computing, "status": {}},
    )

    # def test_change_computing_status_no_computing_update(panel, mock_ctx, mocker):
    """Test when computing status does not change (no updates)."""
    mock_ctx.panel.state.computing = {
        "brightness": {
            "is_computing": False,
            "execution_type": "",
            "delegation_run_id": "",
            "delegation_status": "",
        }
    }

    # Mock store
    store_mock = MagicMock()
    store_mock.get = MagicMock(
        return_value={
            "computing": mock_ctx.panel.state.computing,
            "status": {},
        }
    )
    store_mock.set = MagicMock()
    mocker.patch.object(panel, "get_store", return_value=store_mock)

    # Call the method without updating computing status
    panel.change_computing_status(
        mock_ctx,
        issue_type="brightness",  # Using the same status as current, no change
        is_computing=False,
        execution_type="",
        delegation_run_id="",
        delegation_status="",
    )

    # Assert that the computing status did not change
    assert mock_ctx.panel.state.computing["brightness"] == {
        "is_computing": False,
        "execution_type": "",
        "delegation_run_id": "",
        "delegation_status": "",
    }

    # Assert that the store was not updated
    # store_mock.set.assert_not_called()


def test_check_for_new_samples_new_samples_equals_dataset_size(
    panel, mock_ctx, mocker
):
    # Setup state for "exact_duplicates"
    mock_ctx.panel.state.new_samples = {"exact_duplicates": [0, False, False]}
    last_scan_time = datetime.utcnow() - timedelta(days=1)
    mock_ctx.panel.state.last_scan = {
        "exact_duplicates": {"timestamp": last_scan_time}
    }

    # Setup the store to return previous results (for exact_duplicates, results are not validated)
    store_mock = MagicMock()
    store_mock.get.return_value = {
        "results": {"exact_duplicates": {"dummy": "value"}}
    }
    mocker.patch.object(panel, "get_store", return_value=store_mock)

    mock_ctx.dataset.exists = MagicMock(
        return_value=["sample1", "sample2", "sample3"]
    )
    mock_ctx.dataset.count = MagicMock(return_value=3)
    mock_ctx.dataset._max = MagicMock(return_value=datetime.utcnow())

    mocker.patch.object(panel, "_change_issue_status")

    # Call the new check_for_new_samples method
    panel.check_for_new_samples(mock_ctx)

    panel._change_issue_status.assert_called_once_with(
        mock_ctx, issue_type="exact_duplicates", new_status=STATUS[0]
    )
    assert mock_ctx.panel.state.new_samples["exact_duplicates"] == [
        3,
        True,
        False,
    ]


def test_check_for_new_samples_empty_new_samples_view(panel, mock_ctx, mocker):
    mock_ctx.panel.state.new_samples = {"exact_duplicates": [0, False, False]}
    last_scan_time = datetime.utcnow() - timedelta(days=1)
    mock_ctx.panel.state.last_scan = {
        "exact_duplicates": {"timestamp": last_scan_time}
    }

    store_mock = MagicMock()
    store_mock.get.return_value = {
        "results": {"exact_duplicates": {"dummy": "value"}}
    }
    mocker.patch.object(panel, "get_store", return_value=store_mock)

    mock_ctx.dataset.exists = MagicMock(return_value=[])
    mock_ctx.dataset.count = MagicMock(return_value=100)
    mock_ctx.dataset._max = MagicMock(return_value=datetime.utcnow())

    panel.check_for_new_samples(mock_ctx)

    # When no new samples are found, state is updated to [0, True, False]
    assert mock_ctx.panel.state.new_samples["exact_duplicates"] == [
        0,
        True,
        False,
    ]


def test_check_for_new_samples_missing_counts_or_edges(
    panel, mock_ctx, mocker
):
    # Use a non-duplicate issue type ("brightness") for this test and provide all keys
    mock_ctx.panel.state.new_samples = {
        "brightness": [0, False, False],
        "blurriness": [0, False, False],
        "aspect_ratio": [0, False, False],
        "entropy": [0, False, False],
        "near_duplicates": [0, False, False],
        "exact_duplicates": [0, False, False],
    }
    last_scan_time = datetime.utcnow() - timedelta(days=1)
    mock_ctx.panel.state.last_scan = {
        "brightness": {"timestamp": last_scan_time},
        "blurriness": {"timestamp": last_scan_time},
        "aspect_ratio": {"timestamp": last_scan_time},
        "entropy": {"timestamp": last_scan_time},
        "near_duplicates": {"timestamp": last_scan_time},
        "exact_duplicates": {"timestamp": last_scan_time},
    }

    store_mock = MagicMock()
    # Simulate missing "counts" and "edges" in the stored results for brightness.
    store_mock.get.return_value = {
        "results": {"brightness": {"counts": None, "edges": None}}
    }
    mocker.patch.object(panel, "get_store", return_value=store_mock)

    mock_ctx.dataset._max = MagicMock(return_value=datetime.utcnow())

    panel.check_for_new_samples(mock_ctx)

    # Since brightness's stored results are incomplete, its new_samples should remain unchanged.
    assert mock_ctx.panel.state.new_samples["brightness"] == [0, False, False]


def test_check_for_new_samples_last_modified_before_scan(
    panel, mock_ctx, mocker
):
    mock_ctx.panel.state.new_samples = {"exact_duplicates": [0, False, False]}
    last_scan_time = datetime.utcnow() + timedelta(days=1)
    mock_ctx.panel.state.last_scan = {
        "exact_duplicates": {"timestamp": last_scan_time}
    }

    store_mock = MagicMock()
    store_mock.get.return_value = {
        "results": {"exact_duplicates": {"dummy": "value"}}
    }
    mocker.patch.object(panel, "get_store", return_value=store_mock)

    # Simulate that the dataset's last modified time is before the last scan.
    mock_ctx.dataset._max = MagicMock(
        return_value=datetime.utcnow() - timedelta(days=2)
    )

    panel.check_for_new_samples(mock_ctx)

    assert mock_ctx.panel.state.new_samples["exact_duplicates"] == [
        0,
        True,
        False,
    ]


def test_check_for_new_samples_no_last_scan_time(panel, mock_ctx, mocker):
    """Test when last_scan is not set for the issue type."""
    mock_ctx.panel.state.new_samples = {
        "exact_duplicates": [0, False, False],
        "brightness": [0, False, False],
        "blurriness": [0, False, False],
        "aspect_ratio": [0, False, False],
        "entropy": [0, False, False],
        "near_duplicates": [0, False, False],
    }
    # Simulate no last_scan by setting an empty dict
    mock_ctx.panel.state.last_scan = {}

    # Patch LAST_SCAN to an empty dict so that no MagicMock is returned from LAST_SCAN.get()
    mocker.patch("plugins.panels.data_quality.LAST_SCAN", {})

    store_mock = MagicMock()
    store_mock.get.return_value = {
        "results": {"exact_duplicates": {"dummy": "value"}}
    }
    mocker.patch.object(panel, "get_store", return_value=store_mock)

    mock_ctx.dataset._max = MagicMock(return_value=datetime.utcnow())

    panel.check_for_new_samples(mock_ctx)

    # With no last_scan, the method should update new_samples to [0, True, False]
    assert mock_ctx.panel.state.new_samples["exact_duplicates"] == [
        0,
        True,
        False,
    ]


def test_estimate_execution_wait_time(panel, mock_ctx):
    mock_ctx.panel.state.issue_type = "brightness"
    mock_ctx.dataset.count = MagicMock(return_value=10000)

    wait_time = panel.estimate_execution_wait_time(mock_ctx)

    assert wait_time == 45 * (10000 // 5000)  # Expect 90

    mock_ctx.panel.state.issue_type = "exact_duplicates"
    wait_time = panel.estimate_execution_wait_time(mock_ctx)

    assert wait_time == 45 * 2 * (10000 // 5000)  # Expect 180


def test_tag_samples(panel, mock_ctx, mocker):
    mock_ctx.selected = [1, 2, 3]
    mock_ctx.params = {"tags": ["tag1", "tag2"]}

    # Mock dataset select and tag_samples
    mock_dataset = MagicMock()
    mock_target_view = MagicMock()
    mock_target_view.tag_samples.return_value = None
    mock_ctx.dataset = mock_dataset
    mock_ctx.dataset.select.return_value = mock_target_view

    # Call the function
    panel._tag_samples(mock_ctx)

    # Assertions to verify tag_samples call
    mock_target_view.tag_samples.assert_called_once_with(["tag1", "tag2"])
    assert mock_ctx.panel.state.tags == ["tag1", "tag2"]
    assert mock_ctx.panel.state.alert == "tagging"


def test_mark_as_reviewed_in_modal(panel, mock_ctx, mocker):
    # Mocking necessary methods
    mocker.patch.object(panel, "get_store", return_value=MagicMock())
    mocker.patch.object(panel, "_get_store_key", return_value="mock_key")
    mocker.patch.object(panel, "navigate_to_screen", return_value=None)

    # Mock store and content setup
    mock_store = MagicMock()
    mock_content = {"status": {"brightness": STATUS[1]}}
    mock_store.get.return_value = mock_content
    panel.get_store.return_value = mock_store

    # Call the function
    panel.mark_as_reviewed_in_modal(mock_ctx)

    # Assertions to verify status change and navigation
    mock_store.set.assert_called_once_with("mock_key", mock_content)
    assert mock_ctx.panel.state.alert == "reviewed"
    panel.navigate_to_screen.assert_called_once_with(
        mock_ctx, next_screen="home"
    )


def test_mark_as_reviewed(panel, mock_ctx, mocker):
    # Mocking necessary methods
    mocker.patch.object(panel, "get_store", return_value=MagicMock())
    mocker.patch.object(panel, "_get_store_key", return_value="mock_key")

    # Mock store and content setup
    mock_store = MagicMock()
    mock_content = {"status": {"brightness": STATUS[1]}}
    mock_store.get.return_value = mock_content
    panel.get_store.return_value = mock_store

    # Call the function
    panel.mark_as_reviewed(mock_ctx)

    # Assertions to verify status change
    mock_store.set.assert_called_once_with("mock_key", mock_content)
    assert mock_ctx.panel.state.alert == "reviewed"


def test_change_issue_status(panel, mock_ctx, mocker):
    mocker.patch.object(panel, "get_store", return_value=MagicMock())
    mocker.patch.object(panel, "_get_store_key", return_value="mock_key")

    mock_store = MagicMock()
    mock_content = {"status": {"brightness": "pending"}}
    mock_store.get.return_value = mock_content
    panel.get_store.return_value = mock_store
    mock_ctx.panel.state.alert = None

    panel._change_issue_status(mock_ctx, "brightness", STATUS[3])

    assert mock_content["status"]["brightness"] == STATUS[3]
    mock_store.set.assert_called_once_with("mock_key", mock_content)
    assert mock_ctx.panel.state.alert == "reviewed"


def test_change_issue_status_with_default(panel, mock_ctx, mocker):
    # Mocking necessary methods
    mocker.patch.object(panel, "get_store", return_value=MagicMock())
    mocker.patch.object(panel, "_get_store_key", return_value="mock_key")

    # Mock store and content setup
    mock_store = MagicMock()
    mock_content = {"status": {"brightness": STATUS[1]}}
    mock_store.get.return_value = mock_content
    panel.get_store.return_value = mock_store

    mock_ctx.params = {"value": STATUS[2]}

    panel._change_issue_status(mock_ctx)

    assert mock_ctx.panel.state.alert == "in_review"


def test_get_issue_status(panel, mock_ctx, mocker):
    """Test _get_issue_status retrieves issue status from store."""
    store_mock = mocker.MagicMock()
    store_mock.get.return_value = {"status": {"brightness": "IN_PROGRESS"}}
    mocker.patch.object(panel, "get_store", return_value=store_mock)

    result = panel._get_issue_status(mock_ctx, "brightness")
    assert result == "IN_PROGRESS"


def test_get_current_issue_count(panel, mock_ctx, mocker):
    store_mock = mocker.MagicMock()
    store_mock.get.return_value = {
        "current_counts": {"brightness": 3},
        "counts": {"brightness": 5},
    }
    mocker.patch.object(panel, "get_store", return_value=store_mock)

    result = panel._get_current_issue_count(mock_ctx, "brightness")
    assert result == 3


def test_get_issue_count(panel, mock_ctx, mocker):
    store_mock = mocker.MagicMock()
    store_mock.get.return_value = {"counts": {"brightness": 5}}
    mocker.patch.object(panel, "get_store", return_value=store_mock)

    result = panel._get_issue_count(mock_ctx, "brightness")
    assert result == 5


@pytest.mark.parametrize(
    "selected, current_count, expected_text",
    [
        ([], 10, "Tag 10 samples in current view:"),
        (["sample1"], 0, "Tag 1 samples currently selected:"),
        (
            ["sample1", "sample2"],
            5,
            "Tag 2 out of 5 samples currently selected:",
        ),
    ],
)
def test_get_tag_helper_text(
    panel, mock_ctx, selected, current_count, expected_text, mocker
):
    """Test _get_tag_helper_text with different selected and issue counts."""
    mock_ctx.selected = selected
    mocker.patch.object(
        panel, "_get_current_issue_count", return_value=current_count
    )

    result = panel._get_tag_helper_text(mock_ctx)
    assert result == expected_text


def test_toggle_select_from_grid(panel, mock_ctx):
    """Test toggle_select_from_grid sets selected duplicates."""
    mock_ctx.selected = ["dup1", "dup2"]

    panel.toggle_select_from_grid(mock_ctx)

    mock_ctx.panel.state.set.assert_called_once_with(
        "exact_duplicates_analysis.exact_duplicates_analysis_content.exact_duplicate_selections",
        ["dup1", "dup2"],
    )


def test_toggle_select(panel, mock_ctx):
    mock_ctx.params = {"value": ["sample1", "sample2"]}
    panel.toggle_select(mock_ctx)

    mock_ctx.ops.set_selected_samples.assert_called_once_with(
        ["sample1", "sample2"]
    )


def test_slider_change(panel, mock_ctx):
    mock_ctx.params = {"value": [0.2, 0.8]}
    mock_ctx.panel.state.issue_type = "brightness"
    panel.change_view = MagicMock()

    panel.slider_change(mock_ctx)

    assert mock_ctx.panel.state.hist_lower_thresh == 0.2
    assert mock_ctx.panel.state.hist_upper_thresh == 0.8
    panel.change_view.assert_called_once_with(mock_ctx, "brightness")


@pytest.mark.parametrize(
    "counts, edges, lower_thresh, upper_thresh, expected_in, expected_out",
    [
        # Normal case
        ([10, 20, 30], [0, 1, 2, 3], 0.5, 2.5, [10, 20, 30], [0, 0, 0]),
        # All counts within threshold
        ([5, 10, 15], [0, 1, 2, 3], 0, 3, [5, 10, 15], [0, 0, 0]),
        # All counts outside threshold
        ([5, 10, 15], [0, 1, 2, 3], 3.5, 4.5, [0, 0, 0], [5, 10, 15]),
        # Partial overlap with thresholds
        ([1, 2, 3], [0, 1, 2, 3], 1.5, 2.5, [0, 2, 3], [1, 0, 0]),
        # Edge case: Empty input
        ([], [], 0, 1, [], []),
        # Edge case: Single bin
        ([10], [0, 1], 0, 1, [10], [0]),
    ],
)
def test_prepare_histogram_data(
    panel, counts, edges, lower_thresh, upper_thresh, expected_in, expected_out
):
    """Test prepare_histogram_data with various scenarios."""
    result_in, result_out = panel.prepare_histogram_data(
        counts, edges, lower_thresh, upper_thresh
    )
    assert result_in == expected_in
    assert result_out == expected_out


def test_set_hist_defaults_with_none_thresholds(panel, mock_ctx, mocker):
    """Test when both thresholds are None, defaults are set."""
    mocker.patch.object(panel, "get_plot_defaults", return_value=(0.2, 0.7))

    mock_ctx.panel.state.issue_type = "brightness"
    mock_ctx.panel.state.issue_config = MagicMock()

    mock_ctx.panel.state.hist_lower_thresh = None
    mock_ctx.panel.state.hist_upper_thresh = None

    panel.set_hist_defaults(mock_ctx)

    assert mock_ctx.panel.state.hist_lower_thresh == 0.2
    assert mock_ctx.panel.state.hist_upper_thresh == 0.7
    mock_ctx.panel.state.set.assert_called_once_with(
        "brightness_analysis.brightness_analysis_content.double_slider_brightness",
        [0.2, 0.7],
    )


def test_set_hist_defaults_with_existing_thresholds(panel, mock_ctx):
    """Test when both thresholds are already set and should not change."""
    mock_ctx.panel.state.issue_type = "brightness"
    mock_ctx.panel.state.hist_lower_thresh = 0.3
    mock_ctx.panel.state.hist_upper_thresh = 0.6

    panel.set_hist_defaults(mock_ctx)

    # Thresholds should remain unchanged
    assert mock_ctx.panel.state.hist_lower_thresh == 0.3
    assert mock_ctx.panel.state.hist_upper_thresh == 0.6
    mock_ctx.panel.state.set.assert_not_called()


def test_set_hist_defaults_with_lower_below_bounds(panel, mock_ctx, mocker):
    """Test when the new lower threshold is below the bounds."""
    mocker.patch.object(panel, "get_plot_defaults", return_value=(-0.1, 0.7))

    mock_ctx.panel.state.issue_type = "brightness"
    mock_ctx.panel.state.hist_lower_thresh = None
    mock_ctx.panel.state.hist_upper_thresh = None
    mock_ctx.panel.state.issue_config = MagicMock()

    panel.set_hist_defaults(mock_ctx)

    # Check that defaults were set correctly
    assert mock_ctx.panel.state.hist_lower_thresh == -0.1
    assert mock_ctx.panel.state.hist_upper_thresh == 0.7
    mock_ctx.panel.state.set.assert_called_once_with(
        "brightness_analysis.brightness_analysis_content.double_slider_brightness",
        [-0.1, 0.7],
    )


def test_set_hist_defaults_with_percentage_method(panel, mock_ctx, mocker):
    """Test when the detect method is percentage."""
    mock_ctx.panel.state.issue_type = "brightness"
    mock_ctx.panel.state.issue_config = {
        "brightness": {"detect_method": "percentage"}
    }

    mocker.patch.object(panel, "get_plot_defaults", return_value=(0.15, 0.85))

    mock_ctx.panel.state.hist_lower_thresh = None
    mock_ctx.panel.state.hist_upper_thresh = None

    panel.set_hist_defaults(mock_ctx)

    assert mock_ctx.panel.state.hist_lower_thresh == 0.15
    assert mock_ctx.panel.state.hist_upper_thresh == 0.85
    mock_ctx.panel.state.set.assert_called_once_with(
        "brightness_analysis.brightness_analysis_content.double_slider_brightness",
        [0.15, 0.85],
    )


def test_within_bounds(panel, mock_ctx):
    result = panel.get_plot_defaults(mock_ctx, "brightness", "threshold")
    assert result == (0.2, 0.8)


def test_percentage_method(panel, mock_ctx):
    result = panel.get_plot_defaults(mock_ctx, "brightness", "percentage")
    assert result == (0.2, 0.8)


def test_threshold_method_more(panel, mock_ctx):
    mock_ctx.dataset.bounds = MagicMock(return_value=(0.0, 1.0))
    mock_ctx.panel.state.issue_config["brightness"]["max"] = -0.1
    result = panel.get_plot_defaults(mock_ctx, "brightness", "threshold")
    assert result == (-0.1, -0.1)


def test_threshold_method_case_3(panel, mock_ctx):
    mock_ctx.dataset.bounds = MagicMock(return_value=(1.0, 2.0))
    mock_ctx.panel.state.issue_config["brightness"]["max"] = 0
    result = panel.get_plot_defaults(mock_ctx, "brightness", "threshold")
    assert result == (0, 0)


def test_threshold_method_lower_above_max(panel, mock_ctx):
    mock_ctx.panel.state.issue_config["brightness"]["min"] = 1.1
    result = panel.get_plot_defaults(mock_ctx, "brightness", "threshold")
    assert result == (1.1, 1.1)


def test_outside_bounds(panel, mock_ctx):
    mock_ctx.panel.state.issue_config["brightness"] = {"min": -0.5, "max": 1.5}
    result = panel.get_plot_defaults(mock_ctx, "brightness", "threshold")
    assert result == (-0.5, 1.5)


def test_get_threshold_range_within_bounds(panel):
    assert panel.get_threshold_range(5, 15, 0, 20) == (5, 15)


def test_get_threshold_range_min_below_lower_bound(panel):
    assert panel.get_threshold_range(-5, 15, 0, 20) == (-5, 0)


def test_get_threshold_range_max_above_upper_bound(panel):
    assert panel.get_threshold_range(5, 25, 0, 20) == (20, 25)


def test_get_threshold_range_both_outside_bounds(panel):
    assert panel.get_threshold_range(-5, 25, 0, 20) == (20, 25)


def test_get_threshold_range_min_farther_than_max(panel):
    assert panel.get_threshold_range(-10, 25, 0, 20) == (-10, 0)


def test_get_threshold_range_max_farther_than_min(panel):
    assert panel.get_threshold_range(-15, 30, 0, 20) == (-15, 0)


@pytest.mark.asyncio
async def test_change_view_general_case(panel):
    """Test general case for updating view based on histogram bounds."""
    ctx = MagicMock()
    ctx.panel.state.hist_lower_thresh = 50
    ctx.panel.state.hist_upper_thresh = 200
    ctx.panel.state.issue_counts = {}
    ctx.panel.state.set = MagicMock()

    store = MagicMock()
    store.get = MagicMock(
        return_value={
            "status": {"brightness": "computing"},
            "counts": DEFAULT_ISSUE_COUNTS,
            "current_counts": DEFAULT_ISSUE_COUNTS,
        }
    )
    panel.get_store = MagicMock(return_value=store)
    panel._get_store_key = MagicMock(return_value="dataset_dq")

    dataset_view = MagicMock()
    dataset_view.match = MagicMock(return_value=[1, 2, 3])
    ctx.dataset = dataset_view
    ctx.ops.set_view = MagicMock()

    panel.change_view(ctx, "brightness")

    store.set.assert_called_once()
    ctx.ops.set_view.assert_called_once_with([1, 2, 3])
    ctx.panel.state.set.assert_called_with(
        "brightness_analysis.header_brightness.collaspsed_sub_left_brightness.issue_count_brightness_analysis_page",
        3,
    )


@pytest.mark.asyncio
async def test_change_view_near_duplicates(panel):
    """Test handling of near_duplicates."""
    ctx = MagicMock()
    ctx.panel.state.hist_lower_thresh = 10
    ctx.panel.state.hist_upper_thresh = 50
    ctx.panel.state.issue_counts = {}
    ctx.panel.state.set = MagicMock()

    store = MagicMock()
    store.get = MagicMock(
        return_value={
            "status": {"near_duplicates": "computing"},
            "counts": DEFAULT_ISSUE_COUNTS,
            "current_counts": DEFAULT_ISSUE_COUNTS,
        }
    )
    panel.get_store = MagicMock(return_value=store)
    panel._get_store_key = MagicMock(return_value="dataset_dq")

    dataset_view = MagicMock()
    dataset_view.match = MagicMock(return_value=[1, 2])
    ctx.dataset = dataset_view
    ctx.ops.set_view = MagicMock()

    panel.change_view(ctx, "near_duplicates")

    store.set.assert_called_once()
    ctx.ops.set_view.assert_called_once_with([1, 2])
    ctx.panel.state.set.assert_called_with(
        "near_duplicates_analysis.header_near_duplicates.collaspsed_sub_left_near_duplicates.issue_count_near_duplicates_analysis_page",
        2,
    )


@pytest.mark.asyncio
async def test_change_view_exact_duplicates(panel):
    """Test handling of exact_duplicates."""

    ctx = MagicMock()
    ctx.panel.state.issue_counts = {}
    ctx.panel.state.set = MagicMock()

    store = MagicMock()
    store.get = MagicMock(
        return_value={
            "status": {"exact_duplicates": "computing"},
            "results": {
                "exact_duplicates": {
                    "dup_filehash": ["hash1", "hash2"],
                    "dup_sample_ids": ["id1", "id2"],
                }
            },
            "counts": {"exact_duplicates": 25},
            "current_counts": {"exact_duplicates": 25},
        }
    )
    panel.get_store = MagicMock(return_value=store)
    panel._get_store_key = MagicMock(return_value="dataset_dq")

    match_return = MagicMock()
    match_return.sort_by = MagicMock(return_value=[1, 2, 3])
    ctx.dataset.match = MagicMock(return_value=match_return)
    ctx.dataset.has_field = MagicMock(return_value=True)

    panel.change_view(ctx, "exact_duplicates")

    store.set.assert_called_once()
    ctx.ops.set_view.assert_called_once_with([1, 2, 3])


@pytest.mark.asyncio
async def test_change_view_exact_duplicates_dataset_no_field(panel):
    """Test handling of exact_duplicates."""

    ctx = MagicMock()
    ctx.panel.state.issue_counts = {}
    ctx.panel.state.set = MagicMock()

    store = MagicMock()
    store.get = MagicMock(
        return_value={
            "status": {"exact_duplicates": "computing"},
            "results": {
                "exact_duplicates": {
                    "dup_filehash": ["hash1", "hash2"],
                    "dup_sample_ids": ["id1", "id2"],
                }
            },
            "counts": {"exact_duplicates": 25},
            "current_counts": {"exact_duplicates": 25},
        }
    )
    panel.get_store = MagicMock(return_value=store)
    panel._get_store_key = MagicMock(return_value="dataset_dq")

    match_return = MagicMock()
    match_return.sort_by = MagicMock(return_value=[1, 2, 3])
    ctx.dataset.match = MagicMock(return_value=match_return)
    ctx.dataset.has_field = MagicMock(return_value=False)

    panel.change_view(ctx, "exact_duplicates")

    ctx.ops.clear_view.assert_called_once()


@pytest.mark.asyncio
async def test_change_view_clear_view(panel):
    """Test that clear_view is called when no conditions are met."""

    ctx = MagicMock()
    ctx.panel.state.hist_lower_thresh = None
    ctx.panel.state.hist_upper_thresh = None
    ctx.ops.clear_view = MagicMock()

    panel.change_view(ctx, "brightness")
    ctx.ops.clear_view.assert_called_once()


@pytest.mark.asyncio
async def test_on_change_set_threshold_save(panel):

    ctx = MagicMock()
    ctx.params = {"value": "Save Threshold"}
    ctx.panel.state = MagicMock()
    ctx.panel.state.issue_type = "brightness"
    ctx.panel.state.hist_lower_thresh = 50
    ctx.panel.state.hist_upper_thresh = 200
    ctx.panel.state.set = MagicMock()

    store = MagicMock()
    store.get = MagicMock(
        return_value={
            "config": {"brightness": {"min": 0, "max": 255}},
            "counts": {"brightness": 100},
            "current_counts": {"brightness": 80},
        }
    )
    store.set = MagicMock()

    panel.get_store = MagicMock(return_value=store)
    panel._get_store_key = MagicMock(return_value="dataset_dq")

    panel.on_change_set_threshold(ctx)

    # Assert that the threshold values and counts are updated in config and store
    store.set.assert_called_once_with(
        "dataset_dq",
        {
            "config": {"brightness": {"min": 50, "max": 200}},
            "counts": {
                "brightness": 80
            },  # this gets updated to the most up-to-date value
            "current_counts": {"brightness": 80},
        },
    )

    # Assert that the panel state for header and issue count is set correctly
    ctx.panel.state.set.assert_any_call(
        "header_brightness.collapsed_sub_left_brightness.issue_count_brightness_home_page",
        80,
    )


@pytest.mark.asyncio
async def test_on_change_set_threshold_reset(panel):
    # Setup the mock objects

    ctx = MagicMock()
    ctx.params = {"value": "Reset Threshold"}
    ctx.panel.state = MagicMock()
    ctx.panel.state.issue_type = "brightness"
    ctx.panel.state.hist_lower_thresh = 50
    ctx.panel.state.hist_upper_thresh = 200
    ctx.panel.state.set = MagicMock()
    ctx.panel.dataset = MagicMock()
    ctx.panel.dataset.match = MagicMock(return_value=[])

    store = MagicMock()
    store.get = MagicMock(
        return_value={
            "config": {"brightness": {"min": 0, "max": 255}},
            "counts": {"brightness": 100},
            "current_counts": {"brightness": 80},
        }
    )
    panel.get_store = MagicMock(return_value=store)
    panel._get_store_key = MagicMock(return_value="some_key")
    panel.get_plot_defaults = MagicMock(return_value=(10, 240))
    panel.change_view = MagicMock()

    # Call the method
    panel.on_change_set_threshold(ctx)

    # Assert that the config and counts are reset in the store
    store.set.assert_called_once_with(
        "some_key",
        {
            "config": {"brightness": SAMPLE_STORE["config"]["brightness"]},
            "counts": {"brightness": 0},
            "current_counts": {"brightness": 80},
        },
    )

    # Assert that the panel state for hist thresholds is updated
    ctx.panel.state.set.assert_any_call(
        "brightness_analysis.brightness_analysis_content.double_slider_brightness",
        [10, 240],
    )

    # Assert that change_view was called
    panel.change_view.assert_called_once_with(ctx, "brightness")


@pytest.mark.asyncio
async def test_on_compute_option_selected_with_new_samples(panel):

    ctx = MagicMock()
    ctx.params = {
        "issue_type": "brightness",
        "selected_option": {"id": "execute"},
    }
    ctx.panel.state = MagicMock()
    ctx.panel.state.issue_type = "brightness"
    ctx.panel.state.new_samples = {"brightness": [1, True, True]}
    ctx.panel.state.set = MagicMock()
    panel.change_computing_status = MagicMock()

    panel._on_compute_option_selected(
        ctx, execution_option="execute", run_id=""
    )

    # Assert that new_samples are updated
    updated_samples = {"brightness": [1, True, True]}
    ctx.panel.state.set.assert_called_once_with("new_samples", updated_samples)


@pytest.mark.asyncio
async def test_on_compute_option_selected_execute(panel):
    ctx = MagicMock()
    ctx.params = {
        "issue_type": "brightness",
        "selected_option": {"id": "execute"},
    }
    ctx.panel.state = MagicMock()
    ctx.panel.state.issue_type = "brightness"
    ctx.panel.state.new_samples = {"brightness": [1, True, False]}
    panel.change_computing_status = MagicMock()

    # Call the method
    panel._on_compute_option_selected(
        ctx, execution_option="execute", run_id=""
    )

    # Assert that change_computing_status was called with expected arguments for execute
    panel.change_computing_status.assert_called_once_with(
        ctx,
        "brightness",
        is_computing=True,
        execution_type="execute",
        delegation_run_id="",
        delegation_status="",
        issue_status=STATUS[1],
    )


@pytest.mark.asyncio
async def test_on_compute_option_selected_delegate(panel):
    ctx = MagicMock()
    ctx.params = {
        "issue_type": "brightness",
        "selected_option": {"id": "delegate"},
    }
    ctx.panel.state = MagicMock()
    ctx.panel.state.issue_type = "brightness"
    ctx.panel.state.new_samples = {"brightness": [1, True, False]}
    panel.change_computing_status = MagicMock()

    panel._on_compute_option_selected(
        ctx, execution_option="delegate", run_id="12345"
    )

    panel.change_computing_status.assert_called_once_with(
        ctx,
        "brightness",
        is_computing=True,
        execution_type="delegate_execution",
        delegation_run_id="12345",
        delegation_status="",
        issue_status=STATUS[1],
    )


@pytest.mark.asyncio
async def test_navigate_to_screen_home(panel):
    ctx = MagicMock()
    ctx.params = {}
    ctx.panel.state = MagicMock()
    ctx.panel.state.issue_type = None
    ctx.panel.state.screen = None
    ctx.panel.state.first_open = True
    ctx.ops.set_view = MagicMock()
    ctx.dataset.view = MagicMock(return_value="mocked_view")

    # Perform the navigate to screen operation for home
    panel.navigate_to_screen(ctx, next_screen="home")

    # Assert that the panel state is updated correctly
    assert ctx.panel.state.screen == "home"
    assert ctx.panel.state.first_open is False
    assert ctx.panel.state.issue_type is None

    # Check that the view was reset
    ctx.ops.set_view.assert_called_once_with("mocked_view")
    assert ctx.panel.state.hist_lower_thresh is None
    assert ctx.panel.state.hist_upper_thresh is None
    assert ctx.panel.state.issue_type is None
    assert ctx.ops.set_view.call_count == 1


@pytest.mark.asyncio
async def test_navigate_to_screen_analysis_recompute(panel):
    ctx = MagicMock()
    ctx.params = {}
    ctx.panel.state = MagicMock()
    ctx.panel.state.issue_type = "brightness"
    ctx.panel.state.screen = None
    ctx.panel.state.first_open = True
    ctx.ops.set_view = MagicMock()
    ctx.dataset.view = MagicMock(return_value="mocked_view")

    panel._process_issue_computation = MagicMock()
    panel.set_hist_defaults = MagicMock()
    panel.change_computing_status = MagicMock()
    panel.change_view = MagicMock()

    # Perform the navigate to screen operation for analysis with recompute
    panel.navigate_to_screen(
        ctx, issue_type="brightness", next_screen="analysis", recompute=True
    )

    # Assert that the panel state is updated correctly
    assert ctx.panel.state.screen == "analysis"
    assert ctx.panel.state.first_open is False
    panel._process_issue_computation.assert_called_once_with(
        ctx, "brightness", True
    )

    # Ensure histogram defaults were set
    panel.set_hist_defaults.assert_called_once_with(ctx)

    # Ensure the status change and view change happen
    panel.change_computing_status.assert_called_once_with(
        ctx, "brightness", issue_status=STATUS[2]
    )
    panel.change_view.assert_called_once_with(ctx, "brightness")


@pytest.mark.asyncio
async def test_navigate_to_screen_should_reset_issue_on_error(panel):
    ctx = MagicMock()
    ctx.params = {}
    ctx.panel.state = MagicMock()
    ctx.panel.state.issue_type = "blurriness"
    ctx.panel.state.screen = None
    ctx.panel.state.first_open = True
    ctx.ops.set_view = MagicMock()
    ctx.dataset.view = MagicMock(return_value="mocked_view")

    # Simulate ValueError being raised during the process
    panel._process_issue_computation = MagicMock(
        side_effect=ValueError("Test error")
    )
    panel.should_reset_issue = MagicMock(return_value=True)
    panel.reset_issue = MagicMock()

    # Perform the navigate to screen operation for analysis
    panel.navigate_to_screen(
        ctx, issue_type="blurriness", next_screen="analysis", recompute=True
    )

    # Ensure the reset_issue method was called
    panel.reset_issue.assert_called_once_with(ctx, "blurriness")

    # Ensure the screen was updated to "pre_load_compute"
    assert ctx.panel.state.screen == "pre_load_compute"


@pytest.mark.asyncio
async def test_reset_issue_changes_status(panel):
    ctx = MagicMock()
    store = MagicMock()
    store.get = MagicMock(return_value={"results": {}, "last_scan": {}})
    store.set = MagicMock()

    panel.get_store = MagicMock(return_value=store)
    panel._get_store_key = MagicMock(return_value="test_key")
    panel.change_computing_status = MagicMock()

    # Perform the reset issue operation
    panel.reset_issue(ctx, "exact_duplicates")

    # Assert that change_computing_status was called correctly
    panel.change_computing_status.assert_called_once_with(
        ctx, "exact_duplicates", is_computing=False, issue_status=STATUS[0]
    )


@pytest.mark.asyncio
async def test_reset_issue_updates_store(panel):
    ctx = MagicMock()
    store = MagicMock()
    store.get = MagicMock(return_value={"results": {}, "last_scan": {}})
    store.set = MagicMock()

    # Mock the methods for status change and store interaction
    panel.get_store = MagicMock(return_value=store)
    panel._get_store_key = MagicMock(return_value="test_key")
    panel.change_computing_status = MagicMock()

    # Perform the reset issue operation
    panel.reset_issue(ctx, "exact_duplicates")

    # Get the content that will be set back to the store
    updated_content = store.set.call_args[0][1]

    # Assert that the store was updated with the correct content
    assert (
        updated_content["results"]["exact_duplicates"]
        == SAMPLE_STORE["results"]["exact_duplicates"]
    )
    assert (
        updated_content["last_scan"]["exact_duplicates"]
        == SAMPLE_STORE["last_scan"]["exact_duplicates"]
    )
    store.set.assert_called_once_with("test_key", updated_content)


@pytest.mark.asyncio
async def test_should_reset_issue_with_samples(panel):
    ctx = MagicMock()
    ctx.dataset.exists = MagicMock(return_value=[1, 2, 3])
    ctx.log = MagicMock()

    # 'In Review' status
    panel._get_issue_status = MagicMock(return_value=STATUS[2])
    result = panel.should_reset_issue(ctx, "exact_duplicates")
    assert result is False

    # 'Reviewed' status
    panel._get_issue_status = MagicMock(return_value=STATUS[3])
    result = panel.should_reset_issue(ctx, "exact_duplicates")
    assert result is False

    # 'Computing' status
    panel._get_issue_status = MagicMock(return_value=STATUS[1])
    result = panel.should_reset_issue(ctx, "exact_duplicates")
    assert result is False


@pytest.mark.asyncio
async def test_should_reset_issue_with_no_samples(panel):
    ctx = MagicMock()
    ctx.dataset.exists = MagicMock(return_value=[])
    ctx.log = MagicMock()

    # 'In Review' status
    panel._get_issue_status = MagicMock(return_value=STATUS[2])
    result = panel.should_reset_issue(ctx, "exact_duplicates")
    assert result is True

    # 'Reviewed' status
    panel._get_issue_status = MagicMock(return_value=STATUS[3])
    result = panel.should_reset_issue(ctx, "exact_duplicates")
    assert result is True

    ctx.log.assert_called_with("should_reset_issue:exact_duplicates")
    assert ctx.log.call_count == 2

    # 'Computing' status
    panel._get_issue_status = MagicMock(return_value=STATUS[1])
    result = panel.should_reset_issue(ctx, "exact_duplicates")
    assert result is False
