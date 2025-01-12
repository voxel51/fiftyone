"""
FiftyOne document-related unit tests.

To run the unit tests, use the following command:

    pytest tests/unittests/documents.py

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pylint: disable=no-member

import unittest
from mongoengine import EmbeddedDocument
from mongoengine.errors import ValidationError
from fiftyone.core.fields import EmbeddedDocumentListField
from fiftyone.core.odm.dataset import SampleFieldDocument
from fiftyone.core.odm import FiftyOneDynamicDocumentException
import fiftyone as fo


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
    def setUp(self):
        # Set up any necessary test fixtures
        self.valid_detection = {
            "label": "car",
            "bounding_box": [0.1, 0.1, 0.2, 0.2],
            "confidence": 0.95,
        }

    def test_valid_detection_creation(self):
        """Test that a Detection can be created with valid parameters."""
        detection = fo.Detection(**self.valid_detection)
        self.assertEqual(detection.label, "car")
        self.assertEqual(detection.confidence, 0.95)
        self.assertEqual(detection.bounding_box, [0.1, 0.1, 0.2, 0.2])

    def test_reserved_attribute_raises_exception(self):
        """Test that attempting to set a reserved property raises FiftyoneDocumentException."""
        # has_mask is a known property of Detection
        with self.assertRaises(FiftyOneDynamicDocumentException) as context:
            fo.Detection(has_mask=True)

        self.assertTrue(
            "Invalid attribute name 'has_mask'" in str(context.exception)
        )

    def test_multiple_reserved_attributes(self):
        """Test that attempting to set multiple reserved properties raises FiftyoneDocumentException."""
        with self.assertRaises(FiftyOneDynamicDocumentException) as context:
            fo.Detection(
                has_mask=True,
                bounding_box=[0.1, 0.1, 0.2, 0.2],
                is_ground_truth=False,  # Assuming this is another property
            )

        # Should fail on the first reserved property it encounters
        self.assertTrue("Invalid attribute name" in str(context.exception))

    def test_dynamic_attribute_allowed(self):
        """Test that setting a new, non-reserved attribute is allowed."""
        detection = fo.Detection(
            **self.valid_detection,
            custom_field="test",
            another_custom_field=123
        )

        self.assertEqual(detection.custom_field, "test")
        self.assertEqual(detection.another_custom_field, 123)

    def test_detection_setattr(self):
        """Test setting attributes on Detection instances."""

        detection = fo.Detection()

        # Test case 1: Setting a normal attribute (should succeed)
        detection.custom_field = "value"
        assert detection.custom_field == "value"

        # Test case 2: Setting reserved properties (should raise exception)
        with self.assertRaises(FiftyOneDynamicDocumentException) as context:
            detection.has_mask = "new_label"

    def test_extract_attribute_from_error(self):
        # Test property setter pattern
        error_msg1 = "property 'name' of 'MyDoc' object has no setter"
        assert fo.Detection._extract_attribute_from_error(error_msg1) == "name"

        # Test can't set attribute pattern
        error_msg2 = "can't set attribute 'age'"
        assert fo.Detection._extract_attribute_from_error(error_msg2) == "age"

        # Test no match
        error_msg3 = "some other error"
        assert fo.Detection._extract_attribute_from_error(error_msg3) is None
