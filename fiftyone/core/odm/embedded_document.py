"""
Base classes for documents that back dataset contents.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import mongoengine

from .document import DynamicMixin, MongoEngineBaseDocument


class FiftyoneDocumentException(Exception):
    """Exception raised when an error occurs in a document operation."""
    pass


class BaseEmbeddedDocument(MongoEngineBaseDocument):
    """Base class for documents that are embedded within other documents and
    therefore are not stored in their own collection in the database.
    """

    pass


class EmbeddedDocument(BaseEmbeddedDocument, mongoengine.EmbeddedDocument):
    """Base class for documents that are embedded within other documents and
    therefore are not stored in their own collection in the database.
    """

    meta = {"abstract": True, "allow_inheritance": True}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.validate()


class DynamicEmbeddedDocument(
    DynamicMixin,
    BaseEmbeddedDocument,
    mongoengine.DynamicEmbeddedDocument,
):
    """Base class for dynamic documents that are embedded within other
    documents and therefore aren't stored in their own collection in the
    database.

    Dynamic documents can have arbitrary fields added to them.

    Raises FiftyoneDocumentException if a kwarg attribute is reserved.
    """

    meta = {"abstract": True, "allow_inheritance": True}

    def __init__(self, *args, **kwargs):
        for key, value in kwargs.items():
            # Skip MongoDB internal fields
            if key.startswith('_'):
                continue

            # Check if the key exists and is a property
            if hasattr(self.__class__, key) and isinstance(getattr(self.__class__, key), property):
               raise FiftyoneDocumentException(f"Attribute {key} already exists for {self.__class__.__name__}")

        super().__init__(*args, **kwargs)
        self.validate()

    def __hash__(self):
        return hash(str(self))

    def _get_field(self, field_name, allow_missing=False):
        # pylint: disable=no-member
        chunks = field_name.split(".", 1)
        if len(chunks) > 1:
            field = self._fields.get(chunks[0], None)
            if field is None:
                field = self._dynamic_fields.get(chunks[0], None)

            if field is not None:
                field = field.get_field(chunks[1])
        else:
            field = self._fields.get(field_name, None)
            if field is None:
                field = self._dynamic_fields.get(field_name, None)

        if field is None and not allow_missing:
            raise AttributeError(
                "%s has no field '%s'" % (self.__class__.__name__, field_name)
            )

        return field
