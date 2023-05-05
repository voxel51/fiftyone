"""
FiftyOne Management SDK unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime
import os
import unittest
from unittest import mock

import bson

import fiftyone.management as fom
import fiftyone.management.util as fom_util


class ManagementSdkConnectionTests(unittest.TestCase):
    API_KEY = "api-key-12345"
    API_URI = "https://apis.r.us"

    def setUp(self) -> None:
        conn = fom.connection.APIClientConnection()
        conn._APIClientConnection__client = None

        os.environ["FIFTYONE_API_KEY"] = self.API_KEY
        os.environ["FIFTYONE_API_URI"] = self.API_URI

    def tearDown(self) -> None:
        os.environ.pop("FIFTYONE_API_KEY", None)
        os.environ.pop("FIFTYONE_API_URI", None)

    @mock.patch("fiftyone.management.connection.fiftyone_teams_api")
    def test_singleton(self, api_mock):
        instance1 = fom.connection.APIClientConnection()

        api_mock.Client.assert_not_called()
        instance1.client.get()
        api_mock.Client.assert_called_with(self.API_URI, self.API_KEY)
        api_mock.reset_mock()

        # Make sure instances are equal but client not reinitialized
        instance2 = fom.connection.APIClientConnection()
        instance2.client.get()
        api_mock.Client.assert_not_called()

        self.assertEqual(instance1, instance2)

    @mock.patch("fiftyone.management.connection.fiftyone_teams_api")
    def test_reload(self, api_mock):
        conn = fom.connection.APIClientConnection()
        conn.client.get()

        new_uri = self.API_URI + "/new"
        new_key = self.API_KEY + "_new"
        os.environ["FIFTYONE_API_KEY"] = new_key
        os.environ["FIFTYONE_API_URI"] = new_uri

        api_mock.reset_mock()
        conn.reload()

        api_mock.Client.assert_called_with(new_uri, new_key)
        self.assertEqual(api_mock.Client.return_value, conn.client)

    @staticmethod
    def _get_client_only():
        fom.connection.APIClientConnection().client.get()

    def test_no_apikey(self):
        del os.environ["FIFTYONE_API_KEY"]
        self.assertRaises(ConnectionError, self._get_client_only)

    def test_no_apiuri(self):
        del os.environ["FIFTYONE_API_URI"]
        self.assertRaises(ConnectionError, self._get_client_only)


class ManagementSdkTests(unittest.TestCase):
    DATASET_NAME = "dataset_name"
    EMAIL = "user@company.com"
    KEY_NAME = "key_name"
    KEY_ID = "123456abcdef"
    PERMISSION = fom.DatasetPermission.MANAGE
    PERMISSION_STR = PERMISSION.value
    PLUGIN_NAME = "super-cool-plugin"
    PLUGIN_OPERATOR_NAME = "op-op"
    ROLE = fom.UserRole.ADMIN
    ROLE_STR = ROLE.value
    USER = mock.Mock()

    client = None
    patcher = None

    def _original_resolver_user(self, nullable=False):
        ...

    @classmethod
    def setUpClass(cls) -> None:
        super(ManagementSdkTests, cls).setUpClass()
        cls.client = mock.MagicMock()
        cls.patcher = mock.patch(
            "fiftyone.management.connection.APIClientConnection"
        )
        cls.patcher.start()

        fom.connection.APIClientConnection.return_value.client = cls.client
        cls._original_resolve_user = fom.users._resolve_user_id
        fom.users._resolve_user_id = mock.Mock()
        cls.resolve_user = fom.users._resolve_user_id

    @classmethod
    def tearDownClass(cls) -> None:
        super(ManagementSdkTests, cls).tearDownClass()
        cls.patcher.stop()

    def setUp(self) -> None:
        self.client.reset_mock(return_value=True, side_effect=True)

    ############# Connection
    def test_reload_api_connection(self):
        fom.reload_api_connection()
        fom.connection.APIClientConnection.return_value.reload.assert_called()

    @mock.patch("fiftyone.management.connection.print")
    def test_test_api_connection(self, print_mock):
        self.assertRaises(Exception, fom.test_api_connection)

        self.client.get.return_value.json.return_value = {"status": "failed"}
        self.assertRaises(Exception, fom.test_api_connection)
        self.client.get.assert_called_with("health")
        self.client.reset_mock()
        self.client.get.return_value.json.return_value = {
            "status": "available"
        }

        self.client.post_graphql_request.return_value = {}
        self.assertRaises(Exception, fom.test_api_connection)
        self.client.get.assert_called_with("health")
        self.client.post_graphql_request.assert_called_with(
            "query {viewer {id}}"
        )
        self.client.reset_mock()

        self.client.post_graphql_request.return_value = {
            "viewer": {"id": "you"}
        }
        fom.test_api_connection()
        self.client.get.assert_called_with("health")
        self.client.post_graphql_request.assert_called_with(
            "query {viewer {id}}"
        )
        print_mock.assert_called_with("API connection succeeded")

    ############# API Key

    def test_generate_api_key(self):
        return_key = fom.generate_api_key(self.KEY_NAME, self.USER)

        self.client.post_graphql_request.assert_called_with(
            query=fom.api_key._GENERATE_API_KEY_QUERY,
            variables={
                "name": self.KEY_NAME,
                "userId": self.resolve_user.return_value,
            },
        )
        self.resolve_user.assert_called_with(self.USER, nullable=True)
        self.assertEqual(
            return_key,
            self.client.post_graphql_request.return_value["generateApiKey"][
                "key"
            ],
        )

    def test_list_api_keys(self):
        api_keys = [
            {
                "id": "key1",
                "name": "name1",
                "createdAt": datetime.datetime.utcnow(),
            },
            {
                "id": "key2",
                "name": "name2",
                "createdAt": datetime.datetime.utcnow(),
            },
        ]
        self.client.post_graphql_request.return_value = {
            "user": {"apiKeys": api_keys}
        }
        expected = [
            fom.api_key.APIKey(
                id=ak["id"], name=ak["name"], created_at=ak["createdAt"]
            )
            for ak in api_keys
        ]

        with mock.patch(
            "fiftyone.management.api_key.users.whoami"
        ) as whoami_patch:
            for user_arg, user_actual in [
                (None, whoami_patch.return_value),
                (self.USER, self.USER),
            ]:
                return_keys = fom.list_api_keys(user_arg)

                self.resolve_user.assert_called_with(user_actual)
                self.client.post_graphql_request.assert_called_with(
                    query=fom.api_key._LIST_API_KEYS_QUERY,
                    variables={
                        "userId": self.resolve_user.return_value,
                    },
                )
                self.assertEqual(return_keys, expected)

    def test_delete_api_key(self):
        fom.delete_api_key(self.KEY_ID, self.USER)

        self.resolve_user.assert_called_with(self.USER, nullable=True)
        self.client.post_graphql_request.assert_called_with(
            query=fom.api_key._DELETE_API_KEY_QUERY,
            variables={
                "key": self.KEY_ID,
                "userId": self.resolve_user.return_value,
            },
        )

    ############# Dataset

    def test_get_permissions_for_dataset(self):
        self.client.post_graphql_request.return_value = {
            "dataset": {
                "users": [
                    {
                        "activePermission": "MANAGE",
                        "user": {"name": "A. User", "id": "12345"},
                    },
                    {
                        "activePermission": "EDIT",
                        "user": {"name": "B. User", "id": "67890"},
                    },
                ]
            }
        }

        results = fom.get_permissions_for_dataset(self.DATASET_NAME)

        self.client.post_graphql_request.assert_called_with(
            query=fom.dataset._GET_PERMISSIONS_FOR_DATASET_QUERY,
            variables={
                "dataset": self.DATASET_NAME,
            },
        )
        assert results == [
            {"name": "A. User", "id": "12345", "permission": "MANAGE"},
            {"name": "B. User", "id": "67890", "permission": "EDIT"},
        ]

    def test_get_permissions_for_dataset_user(self):
        self.client.post_graphql_request.return_value = {
            "dataset": {"user": {"activePermission": "VIEW"}}
        }

        results = fom.get_permissions_for_dataset_user(
            self.DATASET_NAME, self.USER
        )

        self.resolve_user.assert_called_with(self.USER)
        self.client.post_graphql_request.assert_called_with(
            query=fom.dataset._GET_PERMISSIONS_FOR_DATASET_USER_QUERY,
            variables={
                "dataset": self.DATASET_NAME,
                "userId": self.resolve_user.return_value,
            },
        )
        assert results == fom.DatasetPermission.VIEW

        self.client.post_graphql_request.return_value = {
            "dataset": {"user": None}
        }
        assert (
            fom.get_permissions_for_dataset_user(self.DATASET_NAME, self.USER)
            == fom.DatasetPermission.NO_ACCESS
        )

    def test_get_permissions_wrapper(self):
        self.assertRaises(ValueError, fom.get_permissions)
        with mock.patch(
            "fiftyone.management.dataset.get_permissions_for_dataset"
        ) as the_mock:
            assert (
                fom.get_permissions(dataset_name=self.DATASET_NAME)
                == the_mock.return_value
            )
        with mock.patch(
            "fiftyone.management.dataset.get_permissions_for_user"
        ) as the_mock:
            assert fom.get_permissions(user=self.USER) == the_mock.return_value
        with mock.patch(
            "fiftyone.management.dataset.get_permissions_for_dataset_user"
        ) as the_mock:
            assert (
                fom.get_permissions(
                    dataset_name=self.DATASET_NAME, user=self.USER
                )
                == the_mock.return_value
            )

    def test_get_permissions_for_user(self):
        datasets = [
            {"name": "quickstart", "user": {"activePermission": "EDIT"}},
            {"name": "quickstart2", "user": {"activePermission": "VIEW"}},
            {"name": "quickstart3", "user": None},
        ]
        self.client.post_graphql_connectioned_request.return_value = datasets

        results = fom.get_permissions_for_user(self.USER)

        self.resolve_user.assert_called_with(self.USER)
        self.client.post_graphql_connectioned_request.assert_called_with(
            query=fom.dataset._GET_PERMISSIONS_FOR_USER_QUERY,
            variables={"userId": self.resolve_user.return_value},
            connection_property="datasetsConnection",
        )
        assert results == [
            {"name": "quickstart", "permission": "EDIT"},
            {"name": "quickstart2", "permission": "VIEW"},
        ]

    def test_set_dataset_default_permission(self):
        for perm in (self.PERMISSION, self.PERMISSION_STR):
            fom.set_dataset_default_permission(self.DATASET_NAME, perm)
            self.client.post_graphql_request.assert_called_with(
                query=fom.dataset._SET_DATASET_DEFAULT_PERM_QUERY,
                variables={
                    "identifier": self.DATASET_NAME,
                    "permission": self.PERMISSION_STR,
                },
            )
        self.assertRaises(
            ValueError,
            fom.set_dataset_default_permission,
            self.DATASET_NAME,
            "invalid",
        )

    def test_set_dataset_user_permission(self):
        for perm in (self.PERMISSION, self.PERMISSION_STR):
            fom.set_dataset_user_permission(self.DATASET_NAME, self.USER, perm)
            self.resolve_user.assert_called_with(self.USER)
            self.client.post_graphql_request.assert_called_with(
                query=fom.dataset._SET_DATASET_USER_PERM_QUERY,
                variables={
                    "identifier": self.DATASET_NAME,
                    "userId": self.resolve_user.return_value,
                    "permission": self.PERMISSION_STR,
                },
            )
        self.assertRaises(
            ValueError,
            fom.set_dataset_user_permission,
            self.DATASET_NAME,
            self.USER,
            "invalid",
        )

    def test_delete_dataset_user_permission(self):
        fom.delete_dataset_user_permission(self.DATASET_NAME, self.USER)
        self.resolve_user.assert_called_with(self.USER)
        self.client.post_graphql_request.assert_called_with(
            query=fom.dataset._DELETE_DATASET_USER_PERM_QUERY,
            variables={
                "identifier": self.DATASET_NAME,
                "userId": self.resolve_user.return_value,
            },
        )

    ######################### Plugin
    def test_delete_plugin(self):
        fom.delete_plugin(self.PLUGIN_NAME)
        self.client.post_graphql_request.assert_called_with(
            query=fom.plugin._DELETE_PLUGIN_QUERY,
            variables={"name": self.PLUGIN_NAME},
        )

    @mock.patch("fiftyone.management.plugin.open")
    def test_download_plugin(self, open_mock):
        download_dir = "/path/to/local/"
        file_token = "download_12345.zip"
        self.client.post_graphql_request.return_value = {
            "downloadPlugin": file_token
        }

        local_path = fom.download_plugin(self.PLUGIN_NAME, download_dir)

        self.client.post_graphql_request.assert_called_with(
            query=fom.plugin._DOWNLOAD_PLUGIN_QUERY,
            variables={"name": self.PLUGIN_NAME},
        )

        self.assertEqual(
            self.client.post_graphql_request.return_value["downloadPlugin"],
            file_token,
        )
        self.client.get.assert_called_with(f"file/{file_token}")
        content = self.client.get.return_value.content

        open_mock.assert_called_with(local_path, "wb")
        opened_file = open_mock.return_value.__enter__.return_value
        opened_file.write.assert_called_with(content)

    def test_get_plugin_info(self):
        plugin = {
            "name": self.PLUGIN_NAME,
            "description": "plugin description",
            "version": "1.2.1",
            "fiftyoneVersion": "~0.21.1",
            "enabled": True,
            "operators": [
                {
                    "name": "operator1",
                    "enabled": True,
                    "permission": {
                        "minimumRole": "MEMBER",
                        "minimumDatasetPermission": "EDIT",
                    },
                }
            ],
        }
        expected = fom_util.camel_to_snake_value(plugin)

        self.client.post_graphql_request.return_value = {"plugin": plugin}

        self.assertEqual(fom.get_plugin_info(self.PLUGIN_NAME), expected)

        self.client.post_graphql_request.assert_called_with(
            query=fom.plugin._GET_PLUGIN_INFO_QUERY,
            variables={"pluginName": self.PLUGIN_NAME},
        )

    def test_list_plugins(self):
        plugins = [
            {
                "name": self.PLUGIN_NAME,
                "description": "plugin description",
                "version": "1.2.1",
                "fiftyoneVersion": "~0.21.1",
                "enabled": True,
                "operators": [
                    {
                        "name": "operator1",
                        "enabled": True,
                        "permission": {
                            "minimumRole": "MEMBER",
                            "minimumDatasetPermission": "EDIT",
                        },
                    }
                ],
            },
            {
                "name": "plugin2",
                "description": "another plugin",
                "version": "blah",
                "fiftyoneVersion": "5.1.2",
                "operators": None,
            },
        ]
        expected = fom_util.camel_to_snake_value(plugins)
        self.client.post_graphql_request.return_value = {"plugins": plugins}

        include_builtin = mock.Mock()

        self.assertEqual(fom.list_plugins(include_builtin), expected)

        self.client.post_graphql_request.assert_called_with(
            query=fom.plugin._LIST_PLUGINS_QUERY,
            variables={"includeBuiltin": include_builtin},
        )

    def test_set_plugin_enabled(self):
        enabled = mock.Mock()
        fom.set_plugin_enabled(self.PLUGIN_NAME, enabled)
        self.client.post_graphql_request.assert_called_with(
            query=fom.plugin._SET_PLUGIN_ENABLED_QUERY,
            variables={"pluginName": self.PLUGIN_NAME, "enabled": enabled},
        )

    def test_set_plugin_operator_enabled(self):
        enabled = mock.Mock()
        fom.set_plugin_operator_enabled(
            self.PLUGIN_NAME, self.PLUGIN_OPERATOR_NAME, enabled
        )
        self.client.post_graphql_request.assert_called_with(
            query=fom.plugin._UPDATE_PLUGIN_OPERATOR_QUERY,
            variables={
                "pluginName": self.PLUGIN_NAME,
                "operatorName": self.PLUGIN_OPERATOR_NAME,
                "enabled": enabled,
            },
        )

    def test_set_plugin_operator_permissions(self):
        fom.set_plugin_operator_permissions(
            self.PLUGIN_NAME,
            self.PLUGIN_OPERATOR_NAME,
            fom.UserRole.ADMIN,
            fom.DatasetPermission.MANAGE,
        )
        self.client.post_graphql_request.assert_called_with(
            query=fom.plugin._UPDATE_PLUGIN_OPERATOR_QUERY,
            variables={
                "pluginName": self.PLUGIN_NAME,
                "operatorName": self.PLUGIN_OPERATOR_NAME,
                "minRole": fom.UserRole.ADMIN.value,
                "minDatasetPerm": fom.DatasetPermission.MANAGE.value,
            },
        )

        self.assertRaises(
            ValueError,
            fom.set_plugin_operator_permissions,
            self.PLUGIN_NAME,
            self.PLUGIN_OPERATOR_NAME,
            minimum_role="invalid",
        )
        self.assertRaises(
            ValueError,
            fom.set_plugin_operator_permissions,
            self.PLUGIN_NAME,
            self.PLUGIN_OPERATOR_NAME,
            minimum_dataset_permission="invalid",
        )

    @mock.patch("fiftyone.management.plugin.open")
    def test_upload_plugin(self, open_mock):
        plugin_path = "/path/to/plugin.zip"
        file_token = "upload1234.zip"
        overwrite = mock.Mock()
        self.client.post_file.return_value = (
            f'{{"file_token": "{file_token}"}}'
        )

        return_value = fom.upload_plugin(plugin_path, overwrite)

        open_mock.assert_called_with(plugin_path, "rb")
        opened_file = open_mock.return_value.__enter__.return_value
        self.client.post_file.assert_called_with("file", opened_file)

        self.client.post_graphql_request.assert_called_with(
            query=fom.plugin._UPLOAD_PLUGIN_QUERY,
            variables={"token": file_token, "overwrite": overwrite},
        )
        self.assertEqual(
            return_value,
            self.client.post_graphql_request.return_value["uploadPlugin"],
        )

    ######################### Users
    def test_get_user(self):
        user = "the_user"
        expected = {
            "id": "12345",
            "name": "A. User",
            "email": "blah@blah.com",
            "role": "ADMIN",
        }
        self.client.post_graphql_request.return_value = {"user": expected}

        result = fom.get_user(user)
        self.client.post_graphql_request.assert_called_with(
            query=fom.users._GET_USER_QUERY, variables={"userId": user}
        )
        assert result == expected

    def test_list_pending_invitations(self):
        invitations = [
            {
                "id": "invitation-id1",
                "createdAt": datetime.datetime.utcnow(),
                "expiresAt": datetime.datetime.utcnow(),
                "inviteeEmail": "id1@company.com",
                "inviteeRole": "ADMIN",
                "url": "some/url",
            },
            {
                "id": "invitation-id2",
                "createdAt": datetime.datetime.utcnow(),
                "expiresAt": datetime.datetime.utcnow(),
                "inviteeEmail": "id2@company.com",
                "inviteeRole": "COLLABORATOR",
                "url": "some/other/url",
            },
        ]

        expected = [
            fom.users.Invitation(
                id=inv["id"],
                created_at=inv["createdAt"],
                expires_at=inv["expiresAt"],
                invitee_email=inv["inviteeEmail"],
                invitee_role=inv["inviteeRole"],
                url=inv["url"],
            )
            for inv in invitations
        ]
        self.client.post_graphql_request.return_value = {
            "invitations": invitations
        }

        return_invitations = fom.list_pending_invitations()
        self.client.post_graphql_request.assert_called_with(
            query=fom.users._LIST_PENDING_INVITATIONS_QUERY
        )
        self.assertEqual(return_invitations, expected)

    def test_list_users(self):
        users = [
            {
                "id": "user1id",
                "email": "user1@company.com",
                "role": "ADMIN",
            },
            {
                "id": "user2id",
                "email": "user2@company.com",
                "role": "MEMBER",
            },
        ]
        self.client.post_graphql_connectioned_request.return_value = users

        return_users = fom.list_users()
        self.client.post_graphql_connectioned_request.assert_called_with(
            fom.users._LIST_USERS_QUERY, "usersConnection"
        )
        self.assertEqual(return_users, users)

    def test_delete_user(self):
        fom.delete_user(self.USER)
        self.resolve_user.assert_called_with(self.USER)
        self.client.post_graphql_request.assert_called_with(
            query=fom.users._DELETE_USER_QUERY,
            variables={"userId": self.resolve_user.return_value},
        )

    def test_delete_user_invitation(self):
        invitation_id = "1234567890"
        fom.delete_user_invitation(invitation_id)
        self.client.post_graphql_request.assert_called_with(
            query=fom.users._DELETE_INVITATION_QUERY,
            variables={"invitationId": invitation_id},
        )

    def test_send_user_invitation(self):
        for role in (self.ROLE, self.ROLE_STR):
            invitation_id = fom.send_user_invitation(self.EMAIL, role)
            self.client.post_graphql_request.assert_called_with(
                query=fom.users._SEND_INVITATION_QUERY,
                variables={"email": self.EMAIL, "role": self.ROLE_STR},
            )
            assert (
                invitation_id
                == self.client.post_graphql_request.return_value[
                    "sendUserInvitation"
                ]["id"]
            )
        self.assertRaises(
            ValueError,
            fom.send_user_invitation,
            self.EMAIL,
            "invalid",
        )

    def test_set_user_role(self):
        for role in (self.ROLE, self.ROLE_STR):
            fom.set_user_role(self.USER, role)
            self.resolve_user.assert_called_with(self.USER)
            self.client.post_graphql_request.assert_called_with(
                query=fom.users._SET_USER_ROLE_QUERY,
                variables={
                    "userId": self.resolve_user.return_value,
                    "role": self.ROLE_STR,
                },
            )
        self.assertRaises(
            ValueError,
            fom.set_user_role,
            self.USER,
            "invalid",
        )

    def test_whoami(self):
        expected = {
            "id": "12345",
            "name": "A. User",
            "email": "blah@blah.com",
            "role": "ADMIN",
        }
        self.client.post_graphql_request.return_value = {"viewer": expected}

        result = fom.whoami()
        self.client.post_graphql_request.assert_called_with(
            query=fom.users._VIEWER_QUERY,
        )
        assert result == expected

    @mock.patch("fiftyone.management.users.get_user")
    def test__resolve_user_id(self, get_user_mock):
        user = fom.users.User(
            id="1234567890",
            name="user",
            email="user@company.com",
            role="ADMIN",
        )
        resolve_user_id = ManagementSdkTests._original_resolve_user

        # nullable
        self.assertRaises(ValueError, resolve_user_id, None, nullable=False)
        self.assertEqual(resolve_user_id(None, nullable=True), None)

        # str not email
        self.assertEqual(resolve_user_id(user["id"]), user["id"])

        # str email
        get_user_mock.return_value = user
        self.assertEqual(resolve_user_id(user["email"]), user["id"])
        get_user_mock.assert_called_with(user["email"])

        get_user_mock.reset_mock()
        get_user_mock.return_value = None
        self.assertRaises(ValueError, resolve_user_id, user["email"])

        # user dict - just has to have 'id' key actually
        self.assertEqual(resolve_user_id(user), user["id"])
        self.assertEqual(resolve_user_id({"id": "theid"}), "theid")

        # Bad types
        for bad_instance in [
            {"name": "blah"},
            5,
            1.345,
            bson.ObjectId(),
            ["12345"],
        ]:
            self.assertRaises(ValueError, resolve_user_id, bad_instance)

    @mock.patch("fiftyone.management.users.get_user")
    def test__resolve_user_id_email(self, get_user_mock):
        resolve_user_id = ManagementSdkTests._original_resolve_user

        # Have to parametrize ourselves since unittest doesnt support it
        parameters = [("user@company.com", True)]
        for email, is_email in parameters:
            with self.subTest(email=email, is_email=is_email):
                get_user_mock.reset_mock()
                if is_email:
                    return_val = resolve_user_id(email, nullable=False)
                    self.assertEqual(
                        return_val, get_user_mock.return_value["id"]
                    )
                    get_user_mock.assert_called_with(email)
                else:
                    self.assertEqual(
                        resolve_user_id(email, nullable=False), email
                    )
                    get_user_mock.assert_not_called()

    ############# Utils
    def test_camel_to_snake(self):
        for pre, post in [
            ("inviteeRole", "invitee_role"),
            ("test123", "test123"),
            ("threeWordResponse", "three_word_response"),
        ]:
            self.assertEqual(fom_util.camel_to_snake(pre), post)

    def test_camel_to_snake_value(self):
        for pre, post in [
            ("sameSame", "sameSame"),
            ({"inviteeRole": "theInvitee"}, {"invitee_role": "theInvitee"}),
            (
                [{"inviteeRole": "theInvitee"}],
                [{"invitee_role": "theInvitee"}],
            ),
            (
                {"outerKey": {"innerKey": [{"subInnerKey": "innerValue"}]}},
                {
                    "outer_key": {
                        "inner_key": [{"sub_inner_key": "innerValue"}]
                    }
                },
            ),
        ]:
            self.assertEqual(fom_util.camel_to_snake_value(pre), post)
