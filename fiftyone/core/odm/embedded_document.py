"""
Base classes for documents that back dataset contents.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import mongoengine

import fiftyone.core.fields as fof

from .document import MongoEngineBaseDocument
from .utils import (
    create_field,
    get_implied_field_kwargs,
    validate_fields_match,
)


class BaseEmbeddedDocument(MongoEngineBaseDocument):
    """Base class for documents that are embedded within other documents and
    therefore are not stored in their own collection in the database.
    """

    _parent = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self._custom_fields = {}

        # pylint: disable=no-member
        for name, field in self._fields.items():
            if isinstance(field, (fof.DictField, fof.ListField)):
                field = field.field

            if isinstance(field, fof.EmbeddedDocumentField):
                field.name = name

        for name in getattr(self, "_dynamic_fields", {}):
            value = self._data[name]
            if value is not None:
                self.add_implied_field(name, value)

    def has_field(self, name):
        # pylint: disable=no-member
        if name in self._fields:
            return True

        if name in self._get_custom_fields():
            return True

        return False

    def __setattr__(self, name, value):
        if not name.startswith("_"):
            custom_fields = self._get_custom_fields()
            if name in custom_fields and value is not None:
                custom_fields[name].validate(value)

        super().__setattr__(name, value)

    def __setitem__(self, name, value):
        self.set_field(name, value, create=True)

    def set_field(self, name, value, create=False):
        if hasattr(self, name) and not self.has_field(name):
            raise ValueError("Cannot use reserved keyword '%s'" % name)

        if not self.has_field(name) and value is not None:
            if create:
                self.add_implied_field(name, value)
            else:
                raise ValueError(
                    "%s has no field '%s'" % (self.__class__, name)
                )

        setattr(self, name, value)

    def add_field(
        self,
        name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        fields=None,
        expand_schema=True,
        **kwargs,
    ):
        """Adds a new field to the embedded document, if necessary.

        Args:
            name: the field name
            ftype: the field type to create. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): the
                :class:`fiftyone.core.odm.BaseEmbeddedDocument` type of the
                field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            subfield (None): the :class:`fiftyone.core.fields.Field` type of
                the contained field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.ListField` or
                :class:`fiftyone.core.fields.DictField`
            fields (None): the field definitions of the
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
                Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            expand_schema (True): whether to add new fields to the schema
                (True) or simply validate that the field already exists with a
                consistent type (False)

        Returns:
            True/False whether one or more fields or embedded fields were added
            to the document or its children

        Raises:
            ValueError: if a field in the schema is not compliant with an
                existing field of the same name
        """
        field = create_field(
            name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            fields=fields,
            **kwargs,
        )

        return self._add_field(field, expand_schema=expand_schema)

    def add_implied_field(self, name, value, expand_schema=True):
        """Adds the field to the document, if necessary, inferring the field
        type from the provided value.

        Args:
            name: the field name
            value: the field value
            expand_schema (True): whether to add new fields to the schema
                (True) or simply validate that the field already exists with a
                consistent type (False)

        Returns:
            True/False whether one or more fields or embedded fields were added
            to the document or its children

        Raises:
            ValueError: if a field in the schema is not compliant with an
                existing field of the same name
        """
        field = create_field(name, **get_implied_field_kwargs(value))
        return self._add_field(field, expand_schema=expand_schema)

    def _add_field(self, field, expand_schema=True):
        name = field.name
        added = False

        if self.has_field(name):
            existing_field = self._get_field(name)
            validate_fields_match(name, field, existing_field)
            if isinstance(existing_field, fof.EmbeddedDocumentField):
                added = existing_field._merge_fields(
                    field, expand_schema=expand_schema
                )
        elif not expand_schema:
            raise ValueError("%s has no field '%s'" % (self.__class__, name))
        else:
            self._declare_field(field)
            added = True

        return added

    def _get_field(self, name):
        # pylint: disable=no-member

        if name in self._fields:
            return self._fields[name]

        if self._parent is None:
            return self._custom_fields[name]

        for field in getattr(self._parent, "fields", []):
            if field.name == name:
                return field

    def _get_custom_fields(self):
        if self._parent is None:
            return self._custom_fields

        fields = getattr(self._parent, "fields", [])
        return {field.name: field for field in fields}

    def _merge_fields(self, field, expand_schema=True):
        for _field in field.get_field_schema().values():
            self._add_field(_field, expand_schema=expand_schema)

    def _declare_field(self, field):
        field._set_parent(self)

        if self._parent is None:
            self._custom_fields[field.name] = field
        else:
            self._parent._save_field(field, [field.name])

    def _set_parent(self, parent):
        self._parent = parent

        # pylint: disable=no-member
        custom_fields = getattr(self, "_custom_fields", {})
        for name, field in {**self._fields, **custom_fields}.items():
            set_field = field
            if isinstance(field, (fof.DictField, fof.ListField)):
                set_field = field.field

            if isinstance(field, fof.EmbeddedDocumentField):
                set_field._set_parent(parent)

            if name in custom_fields:
                self._declare_field(field)

        self._custom_fields = {}


class EmbeddedDocument(MongoEngineBaseDocument, mongoengine.EmbeddedDocument):
    """Base class for documents that are embedded within other documents and
    therefore are not stored in their own collection in the database.
    """

    meta = {"abstract": True, "allow_inheritance": True}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.validate()


class DynamicEmbeddedDocument(
    BaseEmbeddedDocument, mongoengine.DynamicEmbeddedDocument,
):
    """Base class for dynamic documents that are embedded within other
    documents and therefore aren't stored in their own collection in the
    database.

    Dynamic documents can have arbitrary fields added to them.
    """

    meta = {"abstract": True, "allow_inheritance": True}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.validate()
