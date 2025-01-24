import unittest
from unittest.mock import MagicMock, patch
from pymongo.errors import (
    ServerSelectionTimeoutError,
    OperationFailure,
    PyMongoError,
)
from packaging.version import Version

import fiftyone.constants as foc
from fiftyone.core.odm.database import (
    _update_fc_version,
)  # Replace with your actual import path


class TestUpdateFCV(unittest.TestCase):
    @patch("pymongo.MongoClient")
    @patch("fiftyone.core.odm.database._get_logger")
    def test_update_fcv_success(self, mock_get_logger, mock_client):
        # Set up the mock client and server info
        server_version = Version(f"{foc.MIN_MONGODB_VERSION.major + 1}.0.0")
        fc_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.0.0")
        mock_admin = MagicMock()
        mock_client.admin = mock_admin
        mock_client.server_info.return_value = {"version": str(server_version)}

        mock_get_logger.return_value = MagicMock()
        mock_logger = mock_get_logger.return_value

        # Mock the command responses
        mock_admin.command.return_value = {
            "featureCompatibilityVersion": {"version": str(fc_version)}
        }

        # Call the function
        _update_fc_version(mock_client)

        # Check that the FCV update attempt was made with the correct version
        mock_admin.command.assert_any_call(
            {
                "setFeatureCompatibilityVersion": f"{foc.MIN_MONGODB_VERSION.major + 1}.0",
                "confirm": True,
            }
        )
        mock_logger.warning.assert_any_call(
            "Your MongoDB server version is newer than your feature "
            "compatability number. "
            "Attempting to bump the feature compatability version now."
        )

    @patch("pymongo.MongoClient")
    def test_connection_error(self, mock_client):
        # Simulate a connection error by raising ServerSelectionTimeoutError
        mock_client.admin.command.side_effect = ServerSelectionTimeoutError(
            "Could not connect"
        )

        with self.assertRaises(ConnectionError):
            _update_fc_version(mock_client)

    @patch("pymongo.MongoClient")
    @patch("fiftyone.core.odm.database._get_logger")
    def test_version_diff_warning(self, mock_get_logger, mock_client):
        # Set up the mock client and server info

        server_version = Version(f"{foc.MIN_MONGODB_VERSION.major + 2}.0.0")
        fc_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.0.0")

        mock_admin = MagicMock()
        mock_client.admin = mock_admin
        mock_client.server_info.return_value = {"version": str(server_version)}

        mock_get_logger.return_value = MagicMock()
        mock_logger = mock_get_logger.return_value

        # Mock the command responses
        mock_admin.command.return_value = {
            "featureCompatibilityVersion": {"version": str(fc_version)}
        }

        # Call the function
        _update_fc_version(mock_client)

        # Check that the warning is triggered due to a large version difference
        mock_logger.warning.assert_any_call(
            "Your MongoDB server version is more than 2 "
            "ahead of your database's feature compatability version. "
            "Please manually update your database's feature "
            "compatability version."
        )

    @patch("pymongo.MongoClient")
    @patch("fiftyone.core.odm.database._get_logger")
    def test_fcv_greater_than_server_version_warning(
        self, mock_get_logger, mock_client
    ):

        server_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.0.0")
        fc_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.1.0")

        # Set up the mock client and server info
        mock_admin = MagicMock()
        mock_client.admin = mock_admin
        mock_client.server_info.return_value = {"version": str(server_version)}

        mock_get_logger.return_value = MagicMock()
        mock_logger = mock_get_logger.return_value

        # Mock the command responses
        mock_admin.command.return_value = {
            "featureCompatibilityVersion": {"version": str(fc_version)}
        }

        # Call the function
        _update_fc_version(mock_client)

        # Check that the warning is triggered for FCV greater than server version
        mock_logger.warning.assert_any_call(
            "Your MongoDB feature compatability is greater than your "
            "server version. "
            "This may result in unexpected consequences. "
            "Please manually update your databases feature server version."
        )

    @patch("pymongo.MongoClient")
    @patch("fiftyone.core.odm.database._get_logger")
    def test_oldest_supported_version_warning(
        self, mock_get_logger, mock_client
    ):
        # Set up the mock client and server info
        mock_admin = MagicMock()
        mock_client.admin = mock_admin
        mock_client.server_info.return_value = {
            "version": str(foc.MIN_MONGODB_VERSION)
        }

        mock_get_logger.return_value = MagicMock()
        mock_logger = mock_get_logger.return_value

        # Mock the command responses
        mock_admin.command.return_value = {
            "featureCompatibilityVersion": {
                "version": str(foc.MIN_MONGODB_VERSION)
            }
        }

        # Call the function
        _update_fc_version(mock_client)

        # Check that the warning is triggered for the oldest supported version
        mock_logger.warning.assert_any_call(
            "You are running the oldest supported version of mongo. "
            "Please refer to https://deprecation.voxel51.com "
            "for deprecation notices."
        )
