"""
Unit tests for operators utilities.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.operators.executor import ExecutionContext, ExecutionContextUser


class TestOperatorExecutionContext(unittest.TestCase):
    def test_execution_context_user(self):
        user_dict = {
            "email": "testuser@voxel51.com",
            "id": "test_user",
            "name": "Test User",
            "role": "MEMBER",
            "dataset_permission": "MANAGE",
        }
        user_from_dict = ExecutionContextUser.from_dict(user_dict)
        user = ExecutionContextUser(
            email="testuser@voxel51.com",
            id="test_user",
            name="Test User",
            role="MEMBER",
            dataset_permission="MANAGE",
        )
        self.assertEqual(user_from_dict.serialize(), user_dict)
        self.assertEqual(user_from_dict.to_dict(), user_dict)
        self.assertEqual(user.serialize(), user_dict)
        self.assertEqual(user.to_dict(), user_dict)

    def test_execution_context(self):
        request_params = {
            "dataset_name": "test_dataset",
            "params": {"name": "Jon"},
            "view": [
                {
                    "_cls": "fiftyone.core.stages.Limit",
                    "kwargs": [["limit", 3]],
                }
            ],
            "selected": ["sample_id_one"],
        }
        user = ExecutionContextUser(
            email="testuser@voxel51.com",
            id="test_user",
            name="Test User",
            role="MEMBER",
            dataset_permission="MANAGE",
        )
        ctx = ExecutionContext(
            operator_uri="test_operator",
            request_params=request_params,
            user=user,
        )
        self.assertEqual(
            ctx.serialize(),
            {
                "params": request_params["params"],
                "request_params": request_params,
                "user": user.id,
            },
        )
        self.assertEqual(
            ctx.to_dict(),
            {
                "executor": None,
                "params": request_params["params"],
                "request_params": request_params,
                "user": user,
            },
        )
        self.assertEqual(ctx.user, user)
        self.assertEqual(ctx.params, request_params["params"])
        self.assertEqual(ctx.request_params, request_params)
        self.assertEqual(ctx.executor, None)
        self.assertEqual(ctx.user_id, user.id)
        self.assertEqual(ctx.delegated, False)
        self.assertEqual(ctx.dataset_name, request_params["dataset_name"])
        self.assertEqual(ctx.dataset_id, None)
        self.assertEqual(ctx.has_custom_view, True)
        self.assertEqual(ctx.selected, request_params["selected"])

        # delegated
        delegated_request_params = {
            **request_params,
            "delegated": True,
            "request_delegation": True,
            "delegation_target": "scheduler-one",
        }
        delegated_ctx = ExecutionContext(
            operator_uri="test_delegated_operator",
            request_params=delegated_request_params,
            user=user,
        )
        self.assertEqual(delegated_ctx.delegated, True)
        self.assertEqual(delegated_ctx.requesting_delegated_execution, True)
        self.assertEqual(delegated_ctx.delegation_target, "scheduler-one")
