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

    @unittest.mock.patch.object(dataset_permissions.foo, "get_db_conn")
    @unittest.mock.patch.object(
        dataset_permissions.api_requests, "get_dataset_permissions_for_user"
    )
    def test_get_dataset_permissions_for_current_user_not_set(
        self, get_dataset_permissions_for_user_mock, get_db_conn_mock
    ):
        dataset = "my_dataset"
        context_vars.running_user_id.set(None)

        #####
        self.assertIsNone(
            dataset_permissions.get_dataset_permissions_for_current_user(
                dataset
            )
        )
        #####

        get_dataset_permissions_for_user_mock.assert_not_called()
        get_db_conn_mock.assert_not_called()

    @unittest.mock.patch.object(dataset_permissions.foo, "get_db_conn")
    @unittest.mock.patch.object(
        dataset_permissions.api_requests, "get_dataset_permissions_for_user"
    )
    def test_get_dataset_permissions_for_current_user_nonexistent(
        self, get_dataset_permissions_for_user_mock, get_db_conn_mock
    ):
        dataset = "my_dataset"
        user_id = "test_user"
        db = get_db_conn_mock.return_value
        db.datasets.find_one.return_value = {}
        get_dataset_permissions_for_user_mock.return_value = None

        reset_token = context_vars.running_user_id.set(user_id)
        try:
            #####
            self.assertRaises(
                dataset_permissions.DatasetPermissionException,
                dataset_permissions.get_dataset_permissions_for_current_user,
                dataset,
            )
            #####

            get_db_conn_mock.assert_called()
            db.datasets.find_one.assert_called_once_with(
                {"name": dataset}, {"persistent": True}
            )
        finally:
            context_vars.running_user_id.reset(reset_token)

    @unittest.mock.patch.object(dataset_permissions.foo, "get_db_conn")
    @unittest.mock.patch.object(
        dataset_permissions.api_requests, "get_dataset_permissions_for_user"
    )
    def test_get_dataset_permissions_for_current_user_no_access(
        self, get_dataset_permissions_for_user_mock, get_db_conn_mock
    ):
        dataset = "my_dataset"
        user_id = "test_user"
        db = get_db_conn_mock.return_value
        db.datasets.find_one.return_value = {"persistent": True}
        get_dataset_permissions_for_user_mock.return_value = (
            dataset_permissions.DatasetPermission.NO_ACCESS.name
        )

        reset_token = context_vars.running_user_id.set(user_id)
        try:
            #####
            self.assertRaises(
                dataset_permissions.DatasetPermissionException,
                dataset_permissions.get_dataset_permissions_for_current_user,
                dataset,
            )
            #####

            get_db_conn_mock.assert_called()
            db.datasets.find_one.assert_called_once_with(
                {"name": dataset}, {"persistent": True}
            )
        finally:
            context_vars.running_user_id.reset(reset_token)

    @unittest.mock.patch.object(dataset_permissions.foo, "get_db_conn")
    @unittest.mock.patch.object(
        dataset_permissions.api_requests, "get_dataset_permissions_for_user"
    )
    def test_get_dataset_permissions_for_current_user_nonpersistent(
        self, get_dataset_permissions_for_user_mock, get_db_conn_mock
    ):
        dataset = "my_dataset"
        user_id = "test_user"
        db = get_db_conn_mock.return_value
        db.datasets.find_one.return_value = {"persistent": False}
        get_dataset_permissions_for_user_mock.return_value = (
            dataset_permissions.DatasetPermission.NO_ACCESS.name
        )

        reset_token = context_vars.running_user_id.set(user_id)
        try:
            #####
            result = (
                dataset_permissions.get_dataset_permissions_for_current_user(
                    dataset
                )
            )
            #####

            self.assertEqual(
                result, dataset_permissions.DatasetPermission.MANAGE
            )
            get_db_conn_mock.assert_called()
            db.datasets.find_one.assert_called_once_with(
                {"name": dataset}, {"persistent": True}
            )
        finally:
            context_vars.running_user_id.reset(reset_token)

    @unittest.mock.patch.object(dataset_permissions.foo, "get_db_conn")
    @unittest.mock.patch.object(
        dataset_permissions.api_requests, "get_dataset_permissions_for_user"
    )
    def test_get_dataset_permissions_for_current_user_ok(
        self, get_dataset_permissions_for_user_mock, get_db_conn_mock
    ):
        dataset = "my_dataset"
        user_id = "test_user"
        get_dataset_permissions_for_user_mock.return_value = (
            dataset_permissions.DatasetPermission.EDIT.name
        )

        reset_token = context_vars.running_user_id.set(user_id)
        try:
            #####
            result = (
                dataset_permissions.get_dataset_permissions_for_current_user(
                    dataset
                )
            )
            #####

            self.assertEqual(
                result, dataset_permissions.DatasetPermission.EDIT
            )
            get_db_conn_mock.assert_not_called()
        finally:
            context_vars.running_user_id.reset(reset_token)

    @unittest.mock.patch.object(
        dataset_permissions.api_requests, "list_datasets_for_user"
    )
    def test_list_datasets_for_current_user(self, list_datasets_for_user_mock):
        user_id = "test_user"

        context_vars.running_user_id.set(None)

        #####
        self.assertIsNone(dataset_permissions.list_datasets_for_current_user())
        #####

        reset_token = context_vars.running_user_id.set(user_id)
        try:
            glob_patt, tags, info = mock.Mock(), mock.Mock(), mock.Mock()
            result = dataset_permissions.list_datasets_for_current_user(
                glob_patt=glob_patt, tags=tags, info=info
            )
            list_datasets_for_user_mock.assert_called_with(
                user_id, glob_patt=glob_patt, tags=tags, info=info
            )
            self.assertEqual(result, list_datasets_for_user_mock.return_value)
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
