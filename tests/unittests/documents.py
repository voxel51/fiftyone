import unittest
from mongoengine import EmbeddedDocument
from mongoengine.errors import ValidationError
from fiftyone.core.fields import EmbeddedDocumentListField
from fiftyone.core.odm.dataset import SampleFieldDocument


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
