"""
Base classes for documents that back dataset contents.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import re
import mongoengine

from .document import DynamicMixin, MongoEngineBaseDocument


class FiftyOneDynamicDocumentException(Exception):
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
        try:
            super().__init__(*args, **kwargs)
            self.validate()
        except AttributeError as e:
            self._check_reserved_attribute(str(e))
            raise e

    def __setattr__(self, name, value):
        try:
            super().__setattr__(name, value)
        except AttributeError as e:
            self._check_reserved_attribute(str(e))
            raise e

    def __hash__(self):
        return hash(str(self))

    @staticmethod
    def _extract_attribute_from_error(error_message):
        """Extract the attribute name from an AttributeError message.

        Args:
            error_message (str): The error message from AttributeError

        Returns:
            str or None: The extracted attribute name, or None if no match found
        """
        pattern = (
            r"(?:property '(?P<attribute1>\w+)' of '[^']+' object has no setter|"
            r"can't set attribute '(?P<attribute2>\w+)')"
        )
        match = re.match(pattern, error_message)

        if match:
            return match.group("attribute1") or match.group("attribute2")
        return None

    def _check_reserved_attribute(self, exception_message):
        """Check if the message is about a reserved attribute and raise an exception if it is.

        Args:
            exception_message (str): The message from the AttributeError

        Raises:
            FiftyOneDynamicDocumentException: If the attribute is reserved
        """
        key = self._extract_attribute_from_error(exception_message)
        if key is not None:
            if hasattr(self.__class__, key) and isinstance(
                getattr(self.__class__, key), property
            ):
                raise FiftyOneDynamicDocumentException(
                    f"Invalid attribute name '{key}'. '{key}' is a reserved keyword for {self.__class__.__name__} objects"
                )
        elif "can't set attribute" in exception_message:
            # If the attribute name is not in the message
            raise FiftyOneDynamicDocumentException(
                f"One or more attributes are reserved keywords for `{self.__class__.__name__}` objects"
            )
        return

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
