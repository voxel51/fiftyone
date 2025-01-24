"""
FiftyOne document-related unit tests.

To run the unit tests, use the following command:

    pytest tests/unittests/documents.py

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

from mongoengine import EmbeddedDocument
from mongoengine.errors import ValidationError

import fiftyone as fo
from fiftyone.core.fields import EmbeddedDocumentListField
from fiftyone.core.odm import (
    SampleFieldDocument,
    DynamicEmbeddedDocumentException,
)


class MockEmbeddedDocument(EmbeddedDocument):
    pass


class TestEmbeddedDocumentListField(unittest.TestCase):
    def test_validate(self):
        list_field = EmbeddedDocumentListField(SampleFieldDocument)

        # Test with valid input
        valid_input = [
            SampleFieldDocument(
                name="id", ftype="fiftyone.core.fields.ObjectIdField"
            ),
            SampleFieldDocument(
                name="filepath", ftype="fiftyone.core.fields.StringField"
            ),
        ]

        list_field.validate(valid_input)

        # Test with invalid input
        invalid_input = valid_input + [None]
        with self.assertRaises(ValidationError):
            list_field.validate(invalid_input)

        # Test with invalid input type
        invalid_input = valid_input + [MockEmbeddedDocument()]
        with self.assertRaises(ValidationError):
            list_field.validate(invalid_input)


class TestDetection(unittest.TestCase):
    def test_valid_detection_creation(self):
        detection = fo.Detection(
            label="car",
            bounding_box=[0.1, 0.1, 0.2, 0.2],
            confidence=0.95,
            custom_attr="test",
            another_custom_attr=123,
        )

        self.assertEqual(detection.label, "car")
        self.assertEqual(detection.bounding_box, [0.1, 0.1, 0.2, 0.2])
        self.assertEqual(detection.confidence, 0.95)

        # pylint: disable=no-member
        self.assertEqual(detection.custom_attr, "test")
        self.assertEqual(detection.another_custom_attr, 123)

        detection.custom_attr = "value"
        self.assertEqual(detection.custom_attr, "value")

    def test_reserved_attribute_raises_exception(self):
        # `has_mask` is a property of `Detection`

        with self.assertRaises(DynamicEmbeddedDocumentException):
            fo.Detection(has_mask="not allowed")

        with self.assertRaises(DynamicEmbeddedDocumentException):
            fo.Detection(
                label="car",
                bounding_box=[0.1, 0.1, 0.2, 0.2],
                confidence=0.95,
                has_mask="not allowed",
                custom_attr="foo",
                another_custom_attr=123,
            )

        detection = fo.Detection()

        with self.assertRaises(DynamicEmbeddedDocumentException):
            detection.has_mask = "not allowed"

    def test_extract_attribute_from_exception(self):
        # Test property setter pattern
        exception1 = AttributeError(
            "property 'name' of 'MyDoc' object has no setter"
        )
        attr1 = fo.Detection._extract_attribute_from_exception(exception1)
        self.assertEqual(attr1, "name")

        # Test can't set attribute pattern
        exception2 = AttributeError("can't set attribute 'age'")
        attr2 = fo.Detection._extract_attribute_from_exception(exception2)
        self.assertEqual(attr2, "age")

        # Test no match
        exception3 = AttributeError("some other error")
        attr3 = fo.Detection._extract_attribute_from_exception(exception3)
        self.assertIsNone(attr3)
