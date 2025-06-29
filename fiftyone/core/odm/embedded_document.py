"""
Base classes for documents that back dataset contents.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import re
import mongoengine

from .document import DynamicMixin, MongoEngineBaseDocument


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


class DynamicEmbeddedDocumentException(Exception):
    """Exception raised when an error occurs in a dynamic document operation."""

    pass


class DynamicEmbeddedDocument(
    DynamicMixin,
    BaseEmbeddedDocument,
    mongoengine.DynamicEmbeddedDocument,
):
    """Base class for dynamic documents that are embedded within other
    documents and therefore aren't stored in their own collection in the
    database.

    Dynamic documents can have arbitrary fields added to them.
    """

    meta = {"abstract": True, "allow_inheritance": True}

    def __init__(self, *args, **kwargs):
        try:
            super().__init__(*args, **kwargs)
        except AttributeError as e:
            self._raise_reserved_attribute_exception(e)
            raise e

        self.validate()

    def __setattr__(self, name, value):
        # mongoengine doesn't allow private dynamic attributes out of the box
        # but this `if` block forces it
        if (
            not hasattr(self, name)
            and name.startswith("_")
            and name not in _RESERVED_KEYWORDS
            and name not in self._fields_ordered
        ):
            field = mongoengine.DynamicField(db_field=name, null=True)
            field.name = name
            self._dynamic_fields[name] = field
            self._fields_ordered += (name,)

            try:
                # pylint: disable=no-member
                value = self._BaseDocument__expand_dynamic_values(name, value)
            except:
                pass

        try:
            super().__setattr__(name, value)
        except AttributeError as e:
            self._raise_reserved_attribute_exception(e)
            raise e

    def __hash__(self):
        return hash(str(self))

    def _raise_reserved_attribute_exception(self, e):
        key = self._extract_attribute_from_exception(e)
        if key is not None:
            if isinstance(getattr(self.__class__, key, None), property):
                raise DynamicEmbeddedDocumentException(
                    f"Invalid attribute name '{key}'. '{key}' is a reserved keyword for {self.__class__.__name__} objects"
                )

        if "can't set attribute" in str(e):
            raise DynamicEmbeddedDocumentException(
                f"One or more attributes are reserved keywords for `{self.__class__.__name__}` objects"
            )

    @staticmethod
    def _extract_attribute_from_exception(e):
        pattern = (
            r"(?:property '(?P<attribute1>\w+)' of '[^']+' object has no setter|"
            r"can't set attribute '(?P<attribute2>\w+)')"
        )
        match = re.match(pattern, str(e))

        if match:
            return match.group("attribute1") or match.group("attribute2")

        return None

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


# https://github.com/MongoEngine/mongoengine/blob/e51ee40e7dad8e147992ae762e99a0c189a69028/mongoengine/base/document.py#L50
_RESERVED_KEYWORDS = {
    # from __slots__
    "_changed_fields",
    "_initialised",
    "_created",
    "_data",
    "_dynamic_fields",
    "_auto_id_field",
    "_db_field_map",
    "__weakref__",
    # not in __slots__ but still reserved
    "_instance",
    "_fields",
    "_fields_ordered",
}
