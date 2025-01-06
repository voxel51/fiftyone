"""
Unit tests for operators utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.operators.utils import is_method_overridden


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


class TestOperatorUtilities(unittest.TestCase):
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
