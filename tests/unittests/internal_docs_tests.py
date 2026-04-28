"""
Unit tests for internal documentation helpers.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.internal.docs import hide_from_docs, is_hidden_from_docs


class InternalDocsTests(unittest.TestCase):
    def test_hides_class(self):
        @hide_from_docs
        class Hidden:
            pass

        self.assertTrue(is_hidden_from_docs(Hidden))

    def test_hides_instance_method(self):
        class Container:
            @hide_from_docs
            def method(self):
                pass

        self.assertTrue(is_hidden_from_docs(Container.method))
        self.assertTrue(is_hidden_from_docs(Container().method))

    def test_hides_property_with_inner_decorator(self):
        class Container:
            @property
            @hide_from_docs
            def value(self):
                return 1

        self.assertTrue(is_hidden_from_docs(Container.__dict__["value"]))

    def test_hides_property_with_outer_decorator(self):
        class Container:
            @hide_from_docs
            @property
            def value(self):
                return 1

        self.assertTrue(is_hidden_from_docs(Container.__dict__["value"]))

    def test_hides_classmethod(self):
        class Container:
            @hide_from_docs
            @classmethod
            def method(cls):
                pass

        self.assertTrue(is_hidden_from_docs(Container.__dict__["method"]))
        self.assertTrue(is_hidden_from_docs(Container.method))

    def test_hides_staticmethod(self):
        class Container:
            @hide_from_docs
            @staticmethod
            def method():
                pass

        self.assertTrue(is_hidden_from_docs(Container.__dict__["method"]))
        self.assertTrue(is_hidden_from_docs(Container.method))


if __name__ == "__main__":
    unittest.main(verbosity=2)
