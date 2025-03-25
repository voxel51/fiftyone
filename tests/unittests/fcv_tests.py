import unittest
from unittest.mock import MagicMock, patch
from pymongo.errors import (
    ServerSelectionTimeoutError,
    OperationFailure,
    PyMongoError,
)
from packaging.version import Version
from typing import Dict, Union

import fiftyone.constants as foc
from fiftyone.core.odm.database import _update_fc_version


class TestUpdateFCV(unittest.TestCase):
    def _get_expected_update_call(
        self, version: Version
    ) -> Dict[str, Union[str, bool]]:
        expected = {"setFeatureCompatibilityVersion": f"{version.major}.0"}

        if version.major >= foc.MONGODB_SERVER_FCV_REQUIRED_CONFIRMATION.major:
            expected["confirm"] = True

        return expected

    @patch("fiftyone.core.odm.database._db_service")
    def test_update_fcv_success(self, mock_db_service):
        """Ensures nominal usage of _update_fc_version

        Tests the next four versions and, for each, the
        _update_fc_version is properly triggered.
        """
        test_cases = [
            (
                Version(
                    f"{i+1+foc.MONGODB_SERVER_FCV_REQUIRED_CONFIRMATION.major}.0.0"
                ),
                Version(
                    f"{i+foc.MONGODB_SERVER_FCV_REQUIRED_CONFIRMATION.major}.0.0"
                ),
            )
            for i in range(1, 4)
        ]

        mock_db_service = {}

        for server_version, fc_version in test_cases:
            with self.subTest(
                server_version=server_version, fc_version=fc_version
            ):
                with patch("pymongo.MongoClient") as mock_client, patch(
                    "fiftyone.core.odm.database._get_logger"
                ) as mock_get_logger:

                    mock_admin = MagicMock()
                    mock_client.admin = mock_admin
                    mock_client.server_info.return_value = {
                        "version": str(server_version)
                    }

                    mock_get_logger.return_value = MagicMock()
                    mock_logger = mock_get_logger.return_value

                    mock_admin.command.return_value = {
                        "featureCompatibilityVersion": {
                            "version": str(fc_version)
                        }
                    }

                    _update_fc_version(mock_client)

                    # Check that the FCV update attempt was made with the correct version
                    expected_call = self._get_expected_update_call(
                        Version(f"{server_version.major}.0")
                    )
                    mock_admin.command.assert_any_call(expected_call)

                    mock_logger.warning.assert_any_call(
                        "Your MongoDB server version is newer than your feature "
                        "compatibility version. "
                        "Upgrading the feature compatibility version now. "
                        "You can suppress this exception by setting your "
                        "`database_validation` config parameter to `False`. See "
                        "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
                        "for more information"
                    )

    @patch("fiftyone.core.odm.database._db_service")
    @patch("pymongo.MongoClient")
    @patch("fiftyone.core.odm.database._get_logger")
    def test_update_fcv_success_minor_and_patch_versions(
        self, mock_get_logger, mock_client, mock_db_service
    ):
        """Tests that minor and patch mongoDB versions are upgraded
        as expected.
        """

        mock_db_service = {}

        server_version = Version(f"{foc.MIN_MONGODB_VERSION.major + 1}.7.6")
        fc_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.2.3")

        mock_admin = MagicMock()
        mock_client.admin = mock_admin
        mock_client.server_info.return_value = {"version": str(server_version)}

        mock_get_logger.return_value = MagicMock()
        mock_logger = mock_get_logger.return_value

        mock_admin.command.return_value = {
            "featureCompatibilityVersion": {"version": str(fc_version)}
        }

        _update_fc_version(mock_client)

        # Check that the FCV update attempt was made with the correct version
        expected_call = self._get_expected_update_call(
            Version(f"{server_version.major}.0")
        )
        mock_admin.command.assert_any_call(expected_call)

        mock_logger.warning.assert_any_call(
            "You are running the oldest supported major version of mongodb. "
            "Please refer to https://deprecation.voxel51.com "
            "for deprecation notices. "
            "You can suppress this exception by setting your "
            "`database_validation` config parameter to `False`. See "
            "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
            "for more information"
        )

        mock_logger.warning.assert_any_call(
            "Your MongoDB server version is newer than your feature "
            "compatibility version. "
            "Upgrading the feature compatibility version now. "
            "You can suppress this exception by setting your "
            "`database_validation` config parameter to `False`. See "
            "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
            "for more information"
        )

    @patch("fiftyone.core.odm.database._db_service")
    @patch("pymongo.MongoClient")
    @patch("fiftyone.core.odm.database._get_logger")
    def test_update_fcv_success_fcv_less_than_min_version(
        self, mock_get_logger, mock_client, mock_db_service
    ):
        """Tests an edge case where the FCV is less than the minimum
        supported version while the server version is the minimum version.
        This should still be successful.
        """

        mock_db_service = {}

        server_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.0.0")
        fc_version = Version(f"{foc.MIN_MONGODB_VERSION.major - 1}.0.0")

        mock_admin = MagicMock()
        mock_client.admin = mock_admin
        mock_client.server_info.return_value = {"version": str(server_version)}

        mock_get_logger.return_value = MagicMock()
        mock_logger = mock_get_logger.return_value

        mock_admin.command.return_value = {
            "featureCompatibilityVersion": {"version": str(fc_version)}
        }

        _update_fc_version(mock_client)

        # Check that the FCV update attempt was made with the correct version
        expected_call = self._get_expected_update_call(
            Version(f"{server_version.major}.0")
        )
        mock_admin.command.assert_any_call(expected_call)

        mock_logger.warning.assert_any_call(
            "You are running the oldest supported major version of mongodb. "
            "Please refer to https://deprecation.voxel51.com "
            "for deprecation notices. "
            "You can suppress this exception by setting your "
            "`database_validation` config parameter to `False`. See "
            "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
            "for more information"
        )

        mock_logger.warning.assert_any_call(
            "Your MongoDB server version is newer than your feature "
            "compatibility version. "
            "Upgrading the feature compatibility version now. "
            "You can suppress this exception by setting your "
            "`database_validation` config parameter to `False`. See "
            "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
            "for more information"
        )

    @patch("fiftyone.core.odm.database._db_service")
    @patch("pymongo.MongoClient")
    @patch("fiftyone.core.odm.database._get_logger")
    def test_update_fcv_log_minimum_version(
        self, mock_get_logger, mock_client, mock_db_service
    ):
        """Tests an edge case where the both the FCV and server
        version are the oldest supported version. No actions should
        take place, only logs.
        """

        mock_db_service = {}

        server_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.0.0")
        fc_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.0.0")

        mock_admin = MagicMock()
        mock_client.admin = mock_admin
        mock_client.server_info.return_value = {"version": str(server_version)}

        mock_get_logger.return_value = MagicMock()
        mock_logger = mock_get_logger.return_value

        mock_admin.command.return_value = {
            "featureCompatibilityVersion": {"version": str(fc_version)}
        }

        _update_fc_version(mock_client)

        mock_logger.warning.assert_any_call(
            "You are running the oldest supported major version of mongodb. "
            "Please refer to https://deprecation.voxel51.com "
            "for deprecation notices. "
            "You can suppress this exception by setting your "
            "`database_validation` config parameter to `False`. See "
            "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
            "for more information"
        )

        with self.assertRaises(AssertionError):
            # Check that this log wasn't shown.
            mock_logger.warning.assert_any_call(
                "Your MongoDB server version is newer than your feature "
                "compatibility version. "
                "Upgrading the feature compatibility version now. "
                "You can suppress this exception by setting your "
                "`database_validation` config parameter to `False`. See "
                "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
                "for more information"
            )

        with self.assertRaises(AssertionError):
            # Check that no update occurred.
            expected_call = self._get_expected_update_call(
                Version(f"{server_version.major}.0")
            )
            mock_admin.command.assert_any_call(expected_call)

    @patch("fiftyone.core.odm.database._db_service")
    @patch("pymongo.MongoClient")
    def test_connection_error(self, mock_client, mock_db_service):
        """Tests that if we get a ServerSelectionTimeoutError, a
        ConnectionError bubbles up to the client in accordance with
        the other validation functions.
        """
        mock_db_service = {}

        # Simulate a connection error by raising ServerSelectionTimeoutError
        mock_client.admin.command.side_effect = ServerSelectionTimeoutError(
            "Could not connect"
        )

        with self.assertRaises(ConnectionError):
            _update_fc_version(mock_client)

    @patch("fiftyone.core.odm.database._db_service")
    @patch("pymongo.MongoClient")
    @patch("fiftyone.core.odm.database._get_logger")
    def test_version_diff_warning(
        self, mock_get_logger, mock_client, mock_db_service
    ):
        """Tests the warning that's generated in the event that
        the FO DB is more than 1 version outside of our expected
        parameters.
        """
        mock_db_service = {}

        server_version = Version(f"{foc.MIN_MONGODB_VERSION.major + 2}.0.0")
        fc_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.0.0")

        mock_admin = MagicMock()
        mock_client.admin = mock_admin
        mock_client.server_info.return_value = {"version": str(server_version)}

        mock_get_logger.return_value = MagicMock()
        mock_logger = mock_get_logger.return_value

        mock_admin.command.return_value = {
            "featureCompatibilityVersion": {"version": str(fc_version)}
        }

        _update_fc_version(mock_client)

        # Check that the warning is triggered due to a large version difference
        mock_logger.warning.assert_any_call(
            "Your MongoDB server version is more than 1 "
            "ahead of your database's feature compatibility version. "
            "Please manually update your database's feature "
            "compatibility version. "
            "You can suppress this exception by setting your "
            "`database_validation` config parameter to `False`. See "
            "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
            "for more information"
        )

    @patch("fiftyone.core.odm.database._db_service")
    @patch("pymongo.MongoClient")
    @patch("fiftyone.core.odm.database._get_logger")
    def test_fcv_greater_than_server_version_warning(
        self, mock_get_logger, mock_client, mock_db_service
    ):
        """Tests the warning that's generated in the event that
        the feature compatability version is ahead of the server version.
        """
        mock_db_service = {}

        server_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.0.0")
        fc_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.1.0")

        mock_admin = MagicMock()
        mock_client.admin = mock_admin
        mock_client.server_info.return_value = {"version": str(server_version)}

        mock_get_logger.return_value = MagicMock()
        mock_logger = mock_get_logger.return_value

        mock_admin.command.return_value = {
            "featureCompatibilityVersion": {"version": str(fc_version)}
        }

        _update_fc_version(mock_client)

        # Check that the warning is triggered for FCV greater than server version
        mock_logger.warning.assert_any_call(
            "Your MongoDB feature compatibility is greater than your "
            "server version. "
            "This may result in unexpected consequences. "
            "Please manually update your database's feature compatibility "
            "version. "
            "You can suppress this exception by setting your "
            "`database_validation` config parameter to `False`. See "
            "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
            "for more information"
        )

    @patch("fiftyone.core.odm.database._db_service")
    @patch("pymongo.MongoClient")
    @patch("fiftyone.core.odm.database._get_logger")
    def test_oldest_supported_version_warning(
        self, mock_get_logger, mock_client, mock_db_service
    ):
        """Tests the warning that's generated in the event that
        the feature compatability version is currently the oldest supported
        version.
        """
        mock_db_service = {}

        mock_admin = MagicMock()
        mock_client.admin = mock_admin
        mock_client.server_info.return_value = {
            "version": str(foc.MIN_MONGODB_VERSION)
        }

        mock_get_logger.return_value = MagicMock()
        mock_logger = mock_get_logger.return_value

        mock_admin.command.return_value = {
            "featureCompatibilityVersion": {
                "version": str(foc.MIN_MONGODB_VERSION)
            }
        }

        _update_fc_version(mock_client)

        # Check that the warning is triggered for the oldest supported version
        mock_logger.warning.assert_any_call(
            "You are running the oldest supported major version of mongodb. "
            "Please refer to https://deprecation.voxel51.com "
            "for deprecation notices. "
            "You can suppress this exception by setting your "
            "`database_validation` config parameter to `False`. See "
            "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
            "for more information"
        )

    @patch("fiftyone.core.odm.database._db_service")
    @patch("pymongo.MongoClient")
    @patch("fiftyone.core.odm.database._get_logger")
    def test_update_fc_version_operation_failure(
        self, mock_get_logger, mock_client, mock_db_service
    ):
        """Tests the error that's generated in the event that
        the feature compatability version update failed.
        """
        mock_db_service = {}

        server_version = Version(f"{foc.MIN_MONGODB_VERSION.major + 1}.0.0")
        fc_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.0.0")
        mock_admin = MagicMock()
        mock_client.admin = mock_admin
        mock_client.server_info.return_value = {"version": str(server_version)}

        mock_get_logger.return_value = MagicMock()
        mock_logger = mock_get_logger.return_value

        mock_admin.command.side_effect = [
            {"featureCompatibilityVersion": {"version": str(fc_version)}},
            OperationFailure("Could not update FCV", 100),
        ]

        _update_fc_version(mock_client)

        # Check that the warning is triggered for the oldest supported version
        mock_logger.error.assert_any_call(
            "Operation failed while updating database's feature "
            "compatibility version - Could not update FCV. "
            f"Please manually set it to {foc.MIN_MONGODB_VERSION.major + 1}.0. "
            "You can suppress this exception by setting your "
            "`database_validation` config parameter to `False`. See "
            "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
            "for more information"
        )

    @patch("fiftyone.core.odm.database._db_service")
    @patch("pymongo.MongoClient")
    @patch("fiftyone.core.odm.database._get_logger")
    def test_update_fc_version_pymongo_failure(
        self, mock_get_logger, mock_client, mock_db_service
    ):
        """Tests the error that's generated in the event that
        the feature compatability version update failed.
        """
        mock_db_service = {}

        server_version = Version(f"{foc.MIN_MONGODB_VERSION.major + 1}.0.0")
        fc_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.0.0")
        mock_admin = MagicMock()
        mock_client.admin = mock_admin
        mock_client.server_info.return_value = {"version": str(server_version)}

        mock_get_logger.return_value = MagicMock()
        mock_logger = mock_get_logger.return_value

        mock_admin.command.side_effect = [
            {"featureCompatibilityVersion": {"version": str(fc_version)}},
            PyMongoError("Could not update FCV"),
        ]

        _update_fc_version(mock_client)

        # Check that the warning is triggered for the oldest supported version
        mock_logger.error.assert_any_call(
            "MongoDB error while updating database's feature "
            "compatibility version - Could not update FCV. "
            f"Please manually set it to {foc.MIN_MONGODB_VERSION.major + 1}.0. "
            "You can suppress this exception by setting your "
            "`database_validation` config parameter to `False`. See "
            "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
            "for more information"
        )

    @patch("fiftyone.core.odm.database._db_service")
    @patch("pymongo.MongoClient")
    @patch("fiftyone.core.odm.database._get_logger")
    def test_no_action_unless_managed(
        self, mock_get_logger, mock_client, mock_db_service
    ):
        """Tests that actions are only logged, not taken, if
        we aren't managing the mongodb instance (_db_service is None).
        """
        mock_db_service = None

        server_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.1.0")
        fc_version = Version(f"{foc.MIN_MONGODB_VERSION.major}.0.0")

        mock_admin = MagicMock()
        mock_client.admin = mock_admin
        mock_client.server_info.return_value = {"version": str(server_version)}

        mock_get_logger.return_value = MagicMock()
        mock_logger = mock_get_logger.return_value

        mock_admin.command.return_value = {
            "featureCompatibilityVersion": {"version": str(fc_version)}
        }

        _update_fc_version(mock_client)

        # Check that the warning is still triggered
        mock_logger.warning.assert_any_call(
            "You are running the oldest supported major version of mongodb. "
            "Please refer to https://deprecation.voxel51.com "
            "for deprecation notices. You can suppress this exception by setting your "
            "`database_validation` config parameter to `False`. See "
            "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
            "for more information"
        )

        with self.assertRaises(AssertionError):
            # Check that this log wasn't shown.
            mock_logger.warning.assert_any_call(
                "Your MongoDB server version is newer than your feature "
                "compatibility version. "
                "Upgrading the feature compatibility version now. "
                "You can suppress this exception by setting your "
                "`database_validation` config parameter to `False`. See "
                "https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection "
                "for more information"
            )

        with self.assertRaises(AssertionError):
            # Check that no update occurred.
            expected_call = self._get_expected_update_call(
                Version(f"{server_version.major}.0")
            )
            mock_admin.command.assert_any_call(expected_call)
