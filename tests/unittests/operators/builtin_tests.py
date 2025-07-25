import pytest
from unittest.mock import MagicMock

from plugins.operators import ConvertIndexToUnique


@pytest.fixture
def ctx():
    return MagicMock()


class TestConvertIndexToUnique:
    def test_resolve_input_with_no_indexes(self, ctx):
        ctx.dataset.get_index_information.return_value = {}
        op = ConvertIndexToUnique()
        prop = op.resolve_input(ctx)
        assert prop.invalid

    def test_resolve_input_with_non_unique_indexes(self, ctx):
        ctx.dataset.get_index_information.return_value = {
            "_id_": {"key": [("_id", 1)], "name": "_id_", "unique": True},
            "filepath_1": {"key": [("filepath", 1)]},
        }
        op = ConvertIndexToUnique()
        prop = op.resolve_input(ctx)
        assert not prop.invalid

        res = prop.to_json()
        assert "index_name" in res["type"]["properties"]

        choices = res["type"]["properties"]["index_name"]["view"]["choices"]

        assert len(choices) == 1
        assert choices[0]["value"] == "filepath_1"

    def test_execute_with_missing_index_name(self, ctx):
        ctx.params = {}
        op = ConvertIndexToUnique()
        result = op.execute(ctx)
        assert result["status"] == "error"
        error_msg = str(result["error"])
        assert "No index name" in error_msg

    def test_execute_with_nonexistent_index(self, ctx):
        ctx.params = {"index_name": "does_not_exist"}
        ctx.dataset.get_index_information.return_value = {}
        op = ConvertIndexToUnique()
        result = op.execute(ctx)
        assert result["status"] == "error"
        error_msg = str(result["error"])
        assert "does not exist" in error_msg

    def test_execute_dry_run_success(self, ctx):
        index_name = "some_index"
        ctx.params = {"index_name": index_name, "dry_run": True}
        ctx.dataset.get_index_information.return_value = {
            index_name: {"key": [("some_field", 1)]}
        }
        ctx.dataset._sample_collection_name = "samples"
        ctx.dataset._frames_collection_name = "frames"
        ctx.dataset._FRAMES_PREFIX = "frames."

        mock_db = ctx.dataset._sample_collection.database

        # Successful commands should not raise exceptions
        mock_db.command.side_effect = [
            None,
            None,
            None,
        ]

        op = ConvertIndexToUnique()
        result = op.execute(ctx)

        assert result["status"] == "success"
        assert not result.get("error")
        assert mock_db.command.call_count == 3

    def test_execute_dry_run_violation(self, ctx):
        index_name = "some_index"
        ctx.params = {"index_name": index_name, "dry_run": True}
        ctx.dataset.get_index_information.return_value = {
            index_name: {"key": [("some_field", 1)]}
        }
        ctx.dataset._sample_collection_name = "samples"
        ctx.dataset._FRAMES_PREFIX = "frames."

        mock_db = ctx.dataset._sample_collection.database
        mock_db.command.side_effect = [
            None,
            Exception("violation"),
            None,
        ]

        op = ConvertIndexToUnique()
        result = op.execute(ctx)

        assert result["status"] == "error"
        assert "violations" in result["message"].lower()

    def test_execute_success(self, ctx):
        index_name = "some_index"
        ctx.params = {"index_name": index_name, "dry_run": False}
        ctx.dataset.get_index_information.return_value = {
            index_name: {"key": [("some_field", 1)]}
        }
        ctx.dataset._sample_collection_name = "samples"
        ctx.dataset._FRAMES_PREFIX = "frames."

        mock_db = ctx.dataset._sample_collection.database

        # Mock the database commands to simulate successful operations
        mock_db.command.side_effect = [
            None,  # prepareUnique
            None,  # dryRun unique
            None,  # final promotion
        ]

        op = ConvertIndexToUnique()
        result = op.execute(ctx)

        assert result["status"] == "success"
        assert (
            "unique index conversion successful" in result["message"].lower()
        )
