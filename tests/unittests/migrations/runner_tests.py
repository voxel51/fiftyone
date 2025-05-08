"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import datetime
import unittest
from unittest.mock import patch, MagicMock

from fiftyone.migrations import get_datasets_revisions


class TestGetDatasetRevisions(unittest.TestCase):
    @patch("fiftyone.core.odm.get_db_conn")
    def test_all_fields_present(self, mock_get_db_conn):
        mock_conn = MagicMock()
        mock_conn.datasets.find.return_value = [
            {"name": "dataset1", "version": "v1"},
            {"name": "dataset2", "version": "v2"},
        ]
        mock_get_db_conn.return_value = mock_conn

        result = get_datasets_revisions()
        expected = {"dataset1": "v1", "dataset2": "v2"}
        self.assertEqual(result, expected)

    @patch("fiftyone.core.odm.get_db_conn")
    def test_missing_version_field(self, mock_get_db_conn):
        mock_conn = MagicMock()
        mock_conn.datasets.find.return_value = [
            {"name": "dataset1"},  # version is missing
            {"name": "dataset2", "version": "v2"},
        ]
        mock_get_db_conn.return_value = mock_conn

        result = get_datasets_revisions()
        expected = {"dataset1": None, "dataset2": "v2"}
        self.assertEqual(result, expected)

    @patch("fiftyone.core.odm.get_db_conn")
    def test_empty_collection(self, mock_get_db_conn):
        mock_conn = MagicMock()
        mock_conn.datasets.find.return_value = []
        mock_get_db_conn.return_value = mock_conn

        result = get_datasets_revisions()
        self.assertEqual(result, {})

    @patch("fiftyone.core.odm.get_db_conn")
    def test_name_is_none(self, mock_get_db_conn):
        mock_conn = MagicMock()
        mock_conn.datasets.find.return_value = [
            {"name": None, "version": "v2"},
        ]
        mock_get_db_conn.return_value = mock_conn

        result = get_datasets_revisions()
        self.assertEqual(result, {None: "v2"})

    @patch("fiftyone.core.odm.get_db_conn")
    def test_filter_same_as_list_datasets(self, mock_get_db_conn):
        mock_conn = MagicMock()
        mock_conn.datasets.find.return_value = [
            {"name": "dataset1", "version": "v1"},
        ]
        mock_get_db_conn.return_value = mock_conn

        result = get_datasets_revisions()
        self.assertEqual(result, {"dataset1": "v1"})

        # Check that the same query used to list all datasets
        # is used to list revisions
        from fiftyone.core.dataset import _list_datasets_query

        query = _list_datasets_query(include_private=True)

        mock_conn.datasets.find.assert_called_with(
            query, {"name": 1, "version": 1}
        )
