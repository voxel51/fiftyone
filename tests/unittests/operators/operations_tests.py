"""
FiftyOne Operations unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest.mock import MagicMock

from fiftyone.operators.operations import Operations


class OperationsTests(unittest.TestCase):
    # -------------------------------------------------------------------
    # Operations.set_selected_samples — backward & forward compat
    # -------------------------------------------------------------------

    def test_set_selected_samples_with_id_list(self):
        """ctx.ops.set_selected_samples(id_list) — backward compat."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        id_list = ["a" * 24, "b" * 24]
        ops.set_selected_samples(id_list)

        mock_ctx.trigger.assert_called_once_with(
            "set_selected_samples",
            params={
                "samples": [
                    {"id": "a" * 24, "type": "default"},
                    {"id": "b" * 24, "type": "default"},
                ]
            },
        )

    def test_set_selected_samples_with_dict_list(self):
        """ctx.ops.set_selected_samples([{id, type}]) — new format."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        samples = [
            {"id": "a" * 24, "type": "default"},
            {"id": "b" * 24, "type": "alt"},
        ]
        ops.set_selected_samples(samples)

        mock_ctx.trigger.assert_called_once_with(
            "set_selected_samples",
            params={"samples": samples},
        )

    def test_set_selected_samples_mixed_input(self):
        """ctx.ops.set_selected_samples with mixed strings and dicts."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        ops.set_selected_samples(
            [
                "a" * 24,
                {"id": "b" * 24, "type": "alt"},
            ]
        )

        mock_ctx.trigger.assert_called_once_with(
            "set_selected_samples",
            params={
                "samples": [
                    {"id": "a" * 24, "type": "default"},
                    {"id": "b" * 24, "type": "alt"},
                ]
            },
        )

    def test_set_selected_samples_empty(self):
        """ctx.ops.set_selected_samples([]) clears selection."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        ops.set_selected_samples([])

        mock_ctx.trigger.assert_called_once_with(
            "set_selected_samples",
            params={"samples": []},
        )

    def test_set_selected_samples_rejects_invalid(self):
        """ctx.ops.set_selected_samples with invalid items raises."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        with self.assertRaises(TypeError):
            ops.set_selected_samples([123])

    # -------------------------------------------------------------------
    # Operations.set_sample_selection_style / clear_sample_selection_style
    # -------------------------------------------------------------------

    def test_set_sample_selection_style(self):
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

    def test_clear_sample_selection_style(self):
        """ctx.ops.clear_sample_selection_style triggers correctly."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        ops.clear_sample_selection_style()  # pylint: disable=no-member

        mock_ctx.trigger.assert_called_once_with(
            "clear_sample_selection_style"
        )

    def test_set_label_selection_style(self):
        """ctx.ops.set_label_selection_style triggers correctly."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        ops.set_label_selection_style(  # pylint: disable=no-member
            default="dashed", alt="dashed-red"
        )

        mock_ctx.trigger.assert_called_once_with(
            "set_label_selection_style",
            params={"default": "dashed", "alt": "dashed-red"},
        )

    def test_clear_label_selection_style(self):
        """ctx.ops.clear_label_selection_style triggers correctly."""
        mock_ctx = MagicMock()
        ops = Operations(mock_ctx)

        ops.clear_label_selection_style()  # pylint: disable=no-member

        mock_ctx.trigger.assert_called_once_with("clear_label_selection_style")
