import copy
import unittest
from unittest import mock
import pytest

import fiftyone.management as fom

EMPTY_GROUP = {
    "id": "group-1",
    "name": "group name",
    "description": "group description",
    "users": [],
}


USER1 = {
    "id": "user-id",
    "name": "Test User",
    "email": "test@email.com",
    "role": "ADMIN",
}


USER2 = {
    "id": "user-id-2",
    "name": "Test User 2",
    "email": "test2@email.com",
    "role": "ADMIN",
}


class ManagementSdkUserGroup(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        super(ManagementSdkUserGroup, cls).setUpClass()
        # patch connection client
        cls.client = mock.MagicMock()
        cls.patcher = mock.patch.object(
            fom.connection.APIClientConnection, "__new__"
        )
        cls.patcher.start()

        cls.singleton = mock.MagicMock()
        fom.connection.APIClientConnection.__new__.return_value = cls.singleton

        cls.singleton.client = cls.client

        # patch the resolve_user_id and resolve_user_group_id function
        cls.patcher1 = mock.patch(
            "fiftyone.management.user_groups.resolve_user_id"
        )
        cls.patcher2 = mock.patch(
            "fiftyone.management.user_groups.resolve_user_group_id"
        )

        cls.resolve_user_id = cls.patcher1.start()
        cls.resolve_user_group_id = cls.patcher2.start()

    @classmethod
    def tearDownClass(cls) -> None:
        super(ManagementSdkUserGroup, cls).tearDownClass()
        cls.patcher.stop()
        cls.patcher1.stop()
        cls.patcher2.stop()

    def setUp(self) -> None:
        self.client.reset_mock(return_value=True, side_effect=True)
        self.resolve_user_id.reset_mock(return_value=True, side_effect=True)
        self.resolve_user_group_id.reset_mock(
            return_value=True, side_effect=True
        )

    @staticmethod
    def _reset_mock(mock_objs):
        for mock_obj in mock_objs:
            mock_obj.reset_mock()

    def test_list_user_groups_for_user(self):
        # mock return value
        user_groups = [
            {
                "id": "group-1",
                "name": "Admins",
                "description": "",
                "user": USER1,
            },
            {
                "id": "group-2",
                "name": "Annotators",
                "description": "",
                "user": USER1,
            },
        ]
        payload = {"user": {"userGroups": user_groups}}

        # mock the client and the connection
        self.client.post_graphql_request.return_value = payload

        user_name = "Test User"
        user_id = "user-id"
        expected = [user_groups[0], user_groups[1]]
        self.resolve_user_id.return_value = user_id

        # get the full user group objects with verbose = True
        returned_groups = fom.list_user_groups_for_user(
            user_name, verbose=True
        )

        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._LIST_USER_GROUP_FOR_USER_QUERY,
            variables={"user_id": user_id},
        )
        self.assertEqual(returned_groups, expected)
        self.resolve_user_id.assert_called_with(user_name)

        # get the list of group names in the default case with verbose = False
        expected = [group["name"] for group in expected]
        returned_groups = fom.list_user_groups_for_user(user_name)
        self.assertEqual(returned_groups, expected)

    def test_list_user_groups(self):
        # mock return value
        users = [USER1]
        user_groups = [
            {
                "id": "group-1",
                "name": "Admins",
                "description": "",
                "users": users,
            },
            {
                "id": "group-2",
                "name": "Annotators",
                "description": "",
                "users": users,
            },
        ]
        payload = {"userGroups": user_groups}
        self.client.post_graphql_request.return_value = payload

        # get the list of full user group objects with verbose=True and max 10
        returned_groups = fom.list_user_groups(10, verbose=True)

        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._LIST_USER_GROUPS_QUERY,
            variables={"first": 10},
        )
        expected = [fom.UserGroup(**group) for group in user_groups]
        self.assertEqual(returned_groups, expected)

    def test_list_user_groups_simplified(self):
        user_groups = [
            {
                "name": "Admins",
            },
            {
                "name": "Annotators",
            },
        ]
        payload = {"userGroups": user_groups}
        self.client.post_graphql_request.return_value = payload

        # get the list of group names in verbose=False and default max 100
        returned_groups = fom.list_user_groups()
        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._LIST_USER_GROUPS_QUERY_SIMPLIFIED,
            variables={"first": 100},
        )
        expected = ["Admins", "Annotators"]
        self.assertEqual(returned_groups, expected)

    @mock.patch("fiftyone.management.user_groups.add_users_to_group")
    def test_create_user_group(self, add_users_to_group):
        # mock data
        group_data = copy.deepcopy(EMPTY_GROUP)
        name = group_data["name"]
        description = group_data["description"]
        payload = {"createUserGroup": group_data}

        # mock the client and the connection
        self.client.post_graphql_request.return_value = payload
        self.resolve_user_id.side_effect = lambda args: args

        # create the user group without users
        returned_group = fom.create_user_group(name, description)
        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._CREATE_USER_GROUP_QUERY,
            variables={"name": name, "description": description},
        )
        expected = fom.UserGroup(**group_data)
        self.assertEqual(returned_group, expected)

        # create the user group with users
        group_id = expected.id
        users = ["user1", "user2"]
        fom.create_user_group(name, description, users)
        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._CREATE_USER_GROUP_QUERY,
            variables={"name": name, "description": description},
        )
        self.resolve_user_id.has_calls([mock.call(user) for user in users])
        add_users_to_group.assert_called_with(
            group_id, users, resolved_users=True
        )

        # expect error when group data is not returned
        self.client.post_graphql_request.return_value = {}
        with pytest.raises(fom.FiftyOneManagementError):
            fom.create_user_group(name, description)

    def test_create_user_group_invalid_users(self):
        self.resolve_user_id.side_effect = ValueError("User not found")

        users = ["user1", "user2"]
        with pytest.raises(ValueError):
            fom.create_user_group("some name", "some descriptions", users)
        self.client.post_graphql_request.assert_not_called()

    def test_update_user_group_basic(
        self,
    ):
        group_id = "group-1"
        self.resolve_user_group_id.return_value = group_id

        # if no argument is passed, expect error
        with pytest.raises(fom.FiftyOneManagementError):
            fom.update_user_group("some group")

        # mock data
        group_data = copy.deepcopy(EMPTY_GROUP)
        payload = {"updateUserGroupInfo": group_data}

        # mock the client and the connection
        self.client.post_graphql_request.return_value = payload
        self.resolve_user_group_id.return_value = group_id

        # update the user group with name only
        name = "new name"
        group_data["name"] = name
        return_group = fom.update_user_group("group-1", name)
        self.resolve_user_group_id.assert_called_with("group-1")
        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._UPDATE_USER_GROUP_QUERY,
            variables={"groupId": group_id, "name": name, "description": None},
        )
        expect_group = fom.UserGroup(**group_data)
        self.assertEqual(return_group, expect_group)

        # update the user group with both name and description
        new_description = "new description"
        group_data["description"] = new_description
        return_group = fom.update_user_group("group-1", name, new_description)

        self.resolve_user_group_id.assert_called_with("group-1")
        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._UPDATE_USER_GROUP_QUERY,
            variables={
                "groupId": group_id,
                "name": name,
                "description": new_description,
            },
        )
        expect_group = fom.UserGroup(**group_data)
        self.assertEqual(return_group, expect_group)

    def test_update_user_group_with_users_invalid_users(
        self,
    ):
        # mock the client and the connection
        self.resolve_user_id.side_effect = ValueError("User not found")
        self.resolve_user_group_id.return_value = "group_id"

        users = ["Test User"]
        with pytest.raises(ValueError):
            fom.update_user_group(
                "group_id", "new name", "new description", users
            )

        self.client.post_graphql_request.assert_not_called()

    @mock.patch("fiftyone.management.user_groups.remove_users_from_group")
    @mock.patch("fiftyone.management.user_groups.add_users_to_group")
    @mock.patch("fiftyone.management.user_groups.get_user_group")
    def test_update_user_group_with_users(
        self,
        get_user_group,
        add_users_to_group,
        remove_users_from_group,
    ):
        # mock data
        name = "new name"
        description = "new description"

        group_data = copy.deepcopy(EMPTY_GROUP)
        group_data["name"] = name
        group_data["description"] = description
        group_id = group_data["id"]
        payload = {"updateUserGroupInfo": group_data}

        # mock the client and the connection
        self.client.post_graphql_request.return_value = payload
        self.resolve_user_id.side_effect = lambda args: args
        self.resolve_user_group_id.return_value = group_id

        # Case 1: update the user group with name, description and users
        users = ["Test User", "Test User 2"]
        fom.update_user_group(group_id, name, description, users)

        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._UPDATE_USER_GROUP_QUERY,
            variables={
                "groupId": group_id,
                "name": name,
                "description": description,
            },
        )

        # since the previous call to update_user_group should succeed,
        # get_user_group should not be called
        get_user_group.assert_not_called()

        # the group has empty user list, so add all users
        # set operation does not return the user list in order, so we need to
        # check the last call arguments to add_users_to_group manually
        last_args, _ = add_users_to_group.call_args
        self.assertEqual(last_args[0], group_id)
        self.assertEqual(set(last_args[1]), set(users))
        remove_users_from_group.assert_not_called()

        # Case 2: update the user group with empty user list, so remove all users
        self._reset_mock(
            [
                self.client.post_graphql_request,
                self.resolve_user_group_id,
                get_user_group,
                add_users_to_group,
                remove_users_from_group,
            ]
        )

        group_data["users"] = [USER1, USER2]
        get_user_group.return_value = fom.UserGroup(**group_data)
        fom.update_user_group(group_id, users=[])

        # since neither name nor description is passed, we should not call
        # to update the group info; get_user_group should be called
        self.client.post_graphql_request.assert_not_called()
        get_user_group.assert_called_with(group_id)

        # remove_users_from_group should be called with all users in the group
        add_users_to_group.assert_not_called()
        last_args, _ = remove_users_from_group.call_args
        self.assertEqual(last_args[0], group_id)
        self.assertEqual(set(last_args[1]), {USER1["id"], USER2["id"]})

        # Case 3: update the user group with a mix of existing and new users
        self._reset_mock(
            [
                self.client.post_graphql_request,
                self.resolve_user_group_id,
                get_user_group,
                add_users_to_group,
                remove_users_from_group,
            ]
        )

        group_data["users"] = [USER1]
        get_user_group.return_value = fom.UserGroup(**group_data)
        fom.update_user_group(group_id, users=[USER2["id"]])

        add_users_to_group.assert_called_with(
            group_id, [USER2["id"]], resolved_users=True
        )
        remove_users_from_group.assert_called_with(
            group_id, [USER1["id"]], resolved_users=True
        )

    def test_add_users_to_group(self):
        # Case 1: add a single user by user string
        username = USER1["name"]
        user_id = USER1["id"]
        group_id = EMPTY_GROUP["id"]

        # mock data
        group_data = copy.deepcopy(EMPTY_GROUP)
        group_data["users"] = [USER1]

        self.resolve_user_group_id.return_value = group_id
        self.resolve_user_id.return_value = user_id

        self.client.post_graphql_request.return_value = {
            "addUserGroupUsers": group_data
        }

        # add a single user by user string
        returned_group = fom.add_users_to_group(group_id, username)
        expected = fom.UserGroup(**group_data)
        self.assertEqual(returned_group, expected)

        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._ADD_USERS_TO_USER_GROUP_QUERY,
            variables={"groupId": group_id, "userIds": [user_id]},
        )

        self.resolve_user_id.assert_called_with(username)
        self.resolve_user_group_id.assert_called_with(group_id)

        # Case 2: add a list of users
        user_ids = [USER1["id"], USER2["id"]]
        group_data["users"] = [USER1, USER2]
        self.resolve_user_id.side_effect = lambda args: args

        returned_group = fom.add_users_to_group(group_id, user_ids)
        expected = fom.UserGroup(**group_data)
        self.assertEqual(returned_group, expected)

        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._ADD_USERS_TO_USER_GROUP_QUERY,
            variables={"groupId": group_id, "userIds": user_ids},
        )

        self.resolve_user_id.has_calls(
            [mock.call(user_id) for user_id in user_ids]
        )

    def test_remove_users_from_group(self):
        # Case 1: add a single user by user string
        username = USER1["name"]
        user_id = USER1["id"]
        group_id = EMPTY_GROUP["id"]

        # mock data
        group_data = copy.deepcopy(EMPTY_GROUP)

        self.resolve_user_group_id.return_value = group_id
        self.resolve_user_id.return_value = user_id

        self.client.post_graphql_request.return_value = {
            "removeUserGroupUsers": group_data
        }

        # remove a single user by user string
        returned_group = fom.remove_users_from_group(group_id, username)
        expected = fom.UserGroup(**group_data)
        self.assertEqual(returned_group, expected)

        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._REMOVE_USERS_FROM_USER_GROUP_QUERY,
            variables={"groupId": group_id, "userIds": [user_id]},
        )

        self.resolve_user_id.assert_called_with(username)
        self.resolve_user_group_id.assert_called_with(group_id)

        # Case 2: remove a list of users
        user_ids = [USER1["id"], USER2["id"]]
        group_data["users"] = [USER1, USER2]
        self.resolve_user_id.side_effect = lambda args: args

        returned_group = fom.remove_users_from_group(group_id, user_ids)
        expected = fom.UserGroup(**group_data)
        self.assertEqual(returned_group, expected)

        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._REMOVE_USERS_FROM_USER_GROUP_QUERY,
            variables={"groupId": group_id, "userIds": user_ids},
        )

        self.resolve_user_id.has_calls(
            [mock.call(user_id) for user_id in user_ids]
        )

    def test_delete_user_group(self):
        # mock the client and the connection
        group_id = EMPTY_GROUP["id"]
        group_name = EMPTY_GROUP["name"]
        self.resolve_user_group_id.return_value = group_id

        # delete the user group
        fom.delete_user_group(group_name)
        self.resolve_user_group_id.assert_called_with(group_name)
        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._DELETE_USER_GROUP_QUERY,
            variables={"groupId": group_id},
        )

    def test_get_user_group(self):
        # mock data
        group_data = copy.deepcopy(EMPTY_GROUP)
        group_name = group_data["name"]

        users = [USER1, USER2]
        group_data["users"] = users

        # mock the client and the connection
        self.client.post_graphql_request.return_value = {
            "userGroup": group_data
        }

        # get the user group by name
        returned_group = fom.get_user_group(group_name)
        expected = fom.UserGroup(**group_data)
        self.assertEqual(returned_group, expected)

        self.client.post_graphql_request.assert_called_with(
            query=fom.user_groups._GET_USER_GROUP_QUERY,
            variables={"groupId": group_name},
        )

        # expect None when group data is not returned
        self.client.post_graphql_request.return_value = {}
        returned_group = fom.get_user_group(group_name)
        self.assertIsNone(returned_group)

        # expect None when FiftyOneTeamsAPIError is raised
        self.client.post_graphql_request.side_effect = (
            fom.FiftyOneTeamsAPIError
        )
        returned_group = fom.get_user_group(group_name)
        self.assertIsNone(returned_group)

    @mock.patch("fiftyone.management.user_groups.get_user_group")
    def test_resolve_user_group_id(self, get_user_group):
        # expect error when argument is None
        with pytest.raises(fom.FiftyOneManagementError):
            fom.resolve_user_group_id(None)

        # return group.id when the argument is a UserGroup
        group_data = copy.deepcopy(EMPTY_GROUP)
        group = fom.UserGroup(**group_data)
        returned_group_id = fom.resolve_user_group_id(group)
        self.assertEqual(returned_group_id, group.id)

        # fetch group when the argument is a string
        # case 1: return value of get_user_group is None
        get_user_group.return_value = None
        with pytest.raises(fom.FiftyOneManagementError):
            fom.resolve_user_group_id("non-existent group")

        # case 2: return value of get_user_group is a Group
        get_user_group.return_value = group
        returned_group_id = fom.resolve_user_group_id("group name")
        self.assertEqual(returned_group_id, group.id)
        get_user_group.assert_called_with("group name")

        # expect error when argument is of invalid type
        with pytest.raises(fom.FiftyOneManagementError):
            fom.resolve_user_group_id(123)
