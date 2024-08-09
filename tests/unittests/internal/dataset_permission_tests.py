"""
FiftyOne dataset-snapshot related unit tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest import mock

from fiftyone.internal import context_vars, dataset_permissions
from fiftyone.internal.dataset_permissions import DatasetPermission


class InternalDatasetPermissionsTests(unittest.TestCase):
    @unittest.mock.patch.object(
        dataset_permissions.api_requests,
        "create_dataset_with_user_permissions",
    )
    def test_create_dataset_with_current_user_permissions(
        self, create_dataset_with_user_permissions_mock
    ):
        dataset = "my_dataset"
        user_id = "test_user"

        context_vars.running_user_id.set(None)

        #####
        self.assertFalse(
            dataset_permissions.create_dataset_with_current_user_permissions(
                dataset
            )
        )

        reset_token = context_vars.running_user_id.set(user_id)
        try:
            #####
            self.assertEqual(
                dataset_permissions.create_dataset_with_current_user_permissions(
                    dataset
                ),
                create_dataset_with_user_permissions_mock.return_value,
            )
            create_dataset_with_user_permissions_mock.assert_called_with(
                dataset, user_id
            )
        finally:
            context_vars.running_user_id.reset(reset_token)

    @unittest.mock.patch.object(
        dataset_permissions.api_requests, "get_dataset_permissions_for_user"
    )
    def test_get_dataset_permissions_for_current_user(
        self, get_dataset_permissions_for_user_mock
    ):
        dataset = "my_dataset"
        user_id = "test_user"

        context_vars.running_user_id.set(None)

        #####
        self.assertIsNone(
            dataset_permissions.get_dataset_permissions_for_current_user(
                dataset
            )
        )
        #####

        reset_token = context_vars.running_user_id.set(user_id)

        try:
            #####
            get_dataset_permissions_for_user_mock.return_value = None
            self.assertRaises(
                dataset_permissions.DatasetPermissionException,
                dataset_permissions.get_dataset_permissions_for_current_user,
                dataset,
            )
            get_dataset_permissions_for_user_mock.assert_called_with(
                dataset, user_id
            )

            #####
            get_dataset_permissions_for_user_mock.reset_mock()
            get_dataset_permissions_for_user_mock.return_value = "NO_ACCESS"
            self.assertRaises(
                dataset_permissions.DatasetPermissionException,
                dataset_permissions.get_dataset_permissions_for_current_user,
                dataset,
            )
            get_dataset_permissions_for_user_mock.assert_called_with(
                dataset, user_id
            )

            #####
            get_dataset_permissions_for_user_mock.reset_mock()
            get_dataset_permissions_for_user_mock.return_value = "VIEW"
            self.assertEqual(
                dataset_permissions.get_dataset_permissions_for_current_user(
                    dataset
                ),
                DatasetPermission.VIEW,
            )
        finally:
            context_vars.running_user_id.reset(reset_token)

    def test_running_in_user_context(self):
        context_vars.running_user_id.set(None)
        self.assertFalse(dataset_permissions.running_in_user_context())
        reset_token = context_vars.running_user_id.set("blah")
        try:
            self.assertTrue(dataset_permissions.running_in_user_context())
        finally:
            context_vars.running_user_id.reset(reset_token)
