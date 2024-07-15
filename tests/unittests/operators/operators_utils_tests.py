"""
Unit tests for operators utilities.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import unittest
import pytest

from unittest.mock import patch

from fiftyone.operators.utils import (
    is_method_overridden,
    resolve_operation_user,
    _API_URL,
    _USER_QUERY,
    _DATASET_USER_QUERY,
    _VIEWER_QUERY,
    _DATASET_VIEWER_QUERY,
)


api_url = f"{_API_URL}/graphql/v1"


class MockOperator:
    def resolve_input(self):
        return "default_input"

    def resolve_output(self):
        return "default_output"


class MockOperatorOne(MockOperator):
    def resolve_input(self):
        return "custom_input"


class MockOperatorTwo(MockOperator):
    def resolve_input(self):
        return "custom_input"

    def resolve_output(self):
        return "custom_output"


class MockOperatorThree(MockOperator):
    def resolve_output(self):
        return "custom_output"


class MockOperatorFour(MockOperator):
    pass


class TestOperatorUtilities(unittest.IsolatedAsyncioTestCase):
    def test_is_method_overridden(self):

        op_one = MockOperatorOne()
        op_two = MockOperatorTwo()
        op_three = MockOperatorThree()
        op_four = MockOperatorFour()

        self.assertTrue(
            is_method_overridden(MockOperator, op_one, "resolve_input")
        )
        self.assertFalse(
            is_method_overridden(MockOperator, op_one, "resolve_output")
        )
        self.assertTrue(
            is_method_overridden(MockOperator, op_two, "resolve_input")
        )
        self.assertTrue(
            is_method_overridden(MockOperator, op_two, "resolve_output")
        )
        self.assertFalse(
            is_method_overridden(MockOperator, op_three, "resolve_input")
        )
        self.assertTrue(
            is_method_overridden(MockOperator, op_three, "resolve_output")
        )
        self.assertFalse(
            is_method_overridden(MockOperator, op_four, "resolve_input")
        )
        self.assertFalse(
            is_method_overridden(MockOperator, op_four, "resolve_output")
        )

    @patch("fiftyone.operators.utils.make_request")
    async def test_resolve_operator_user_without_args(self, mock_make_request):
        mock_make_request.return_value = {"data": {"viewer": {"id": "123"}}}
        user = await resolve_operation_user()
        mock_make_request.assert_called_with(
            api_url, None, _VIEWER_QUERY, variables={}
        )
        self.assertEqual(user, {"id": "123"})

        # Test TTL caching
        mock_make_request.return_value = None
        user_two = await resolve_operation_user()
        self.assertEqual(user_two, {"id": "123"})
        mock_make_request.assert_called_once()

    @patch("fiftyone.operators.utils.make_request")
    async def test_resolve_operator_user_with_id(self, mock_make_request):
        mock_make_request.return_value = {"data": {"user": {"id": "123"}}}
        user = await resolve_operation_user(id="123")
        mock_make_request.assert_called_with(
            api_url, None, _USER_QUERY, variables={"userId": "123"}
        )
        self.assertEqual(user, {"id": "123"})

        # Test exception is raised if user cannot be resolved when it is expected to be resolvable
        os.environ["FIFTYONE_API_KEY"] = "test_key"
        mock_make_request.return_value = Exception("failure")
        with self.assertRaises(Exception) as e:
            await resolve_operation_user(id="345")
        self.assertEqual(
            str(e.exception), "Failed to resolve user for the operation"
        )

    @patch("fiftyone.operators.utils.make_request")
    async def test_resolve_operator_user_with_dataset(self, mock_make_request):
        mock_make_request.return_value = {
            "data": {"dataset": {"viewer": {"id": "123"}}}
        }
        user = await resolve_operation_user(dataset="123")
        mock_make_request.assert_called_with(
            api_url, None, _DATASET_VIEWER_QUERY, variables={"dataset": "123"}
        )
        self.assertEqual(user, {"id": "123"})

    @patch("fiftyone.operators.utils.make_request")
    async def test_resolve_operator_user(self, mock_make_request):
        mock_make_request.return_value = {
            "data": {"dataset": {"user": {"id": "123"}}}
        }
        user = await resolve_operation_user(id="123", dataset="456")
        mock_make_request.assert_called_with(
            api_url,
            None,
            _DATASET_USER_QUERY,
            variables={"userId": "123", "dataset": "456"},
        )
        self.assertEqual(user, {"id": "123"})

        # Test with token
        mock_make_request.return_value = {
            "data": {"dataset": {"viewer": {"id": "789"}}}
        }
        user = await resolve_operation_user(dataset="789", token="token")
        mock_make_request.assert_called_with(
            api_url,
            "token",
            _DATASET_VIEWER_QUERY,
            variables={"dataset": "789"},
        )
        self.assertEqual(user, {"id": "789"})
