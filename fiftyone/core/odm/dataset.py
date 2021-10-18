"""
Documents that track datasets and their sample schemas in the database.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import inspect

import eta.core.utils as etau

from fiftyone.core.fields import (
    Field,
    BooleanField,
    ClassesField,
    DateTimeField,
    DictField,
    EmbeddedDocumentField,
    EmbeddedDocumentListField,
    ListField,
    StringField,
    TargetsField,
)

from .document import Document
from .embedded_document import EmbeddedDocument, BaseEmbeddedDocument
from .runs import RunDocument


def create_field(
    field_name,
    ftype,
    embedded_doc_type=None,
    subfield=None,
    db_field=None,
    fields=None,
):
    """Creates the :class:`fiftyone.core.fields.Field` instance defined by the
    given specification.

    .. note::

        This method is used exclusively to create user-defined (non-default)
        fields. Any parameters accepted here must be stored on
        :class:`SampleFieldDocument` or else datasets will "lose" any
        additional decorations when they are loaded from the database.

    Args:
        field_name: the field name
        ftype: the field type to create. Must be a subclass of
            :class:`fiftyone.core.fields.Field`
        embedded_doc_type (None): the
            :class:`fiftyone.core.odm.BaseEmbeddedDocument` type of the field.
            Only applicable when ``ftype`` is
            :class:`fiftyone.core.fields.EmbeddedDocumentField`
        subfield (None): the :class:`fiftyone.core.fields.Field` type of the
            contained field. Only applicable when ``ftype`` is
            :class:`fiftyone.core.fields.ListField` or
            :class:`fiftyone.core.fields.DictField`
        db_field (None): the database field to store this field in. By default,
            ``field_name`` is used
        fields (None): the subfields of the
            :class:`fiftyone.core.fields.EmbeddedDocumentField`
            Only applicable when ``ftype`` is
            :class:`fiftyone.core.fields.EmbeddedDocumentField`

    Returns:
        a :class:`fiftyone.core.fields.Field` instance
    """
    if not issubclass(ftype, Field):
        raise ValueError(
            "Invalid field type %s; must be a subclass of %s" % (ftype, Field)
        )

    if db_field is None:
        db_field = field_name

    # All user-defined fields are nullable
    kwargs = dict(null=True, db_field=db_field)

    if fields is not None:
        fields = {
            name: create_field(name, **field_kwargs)
            for name, field_kwargs in fields.items()
        }

    if issubclass(ftype, (ListField, DictField)):
        if subfield is not None:
            if inspect.isclass(subfield):
                if (
                    issubclass(subfield, EmbeddedDocumentField)
                    and fields is not None
                ):
                    subfield = subfield(
                        fields=fields, document_type=embedded_doc_type
                    )
                else:
                    subfield = subfield()

            if not isinstance(subfield, Field):
                raise ValueError(
                    "Invalid subfield type %s; must be a subclass of %s"
                    % (type(subfield), Field)
                )

            kwargs["field"] = subfield

    if issubclass(ftype, EmbeddedDocumentField):
        if not issubclass(embedded_doc_type, BaseEmbeddedDocument):
            raise ValueError(
                "Invalid embedded_doc_type %s; must be a subclass of %s"
                % (embedded_doc_type, BaseEmbeddedDocument)
            )

        kwargs.update({"document_type": embedded_doc_type})

        if fields is not None:
            kwargs["fields"] = fields

    field = ftype(**kwargs)
    field.name = field_name

    return field


class SampleFieldDocument(EmbeddedDocument):
    """Description of a sample field."""

    name = StringField()
    ftype = StringField()
    subfield = StringField(null=True)
    embedded_doc_type = StringField(null=True)
    db_field = StringField(null=True)
    fields = DictField(
        EmbeddedDocumentField(document_type="SampleFieldDocument")
    )

    def to_field(self):
        """Creates the :class:`fiftyone.core.fields.Field` specified by this
        document.

        Returns:
            a :class:`fiftyone.core.fields.Field`
        """
        ftype = etau.get_class(self.ftype)

        embedded_doc_type = self.embedded_doc_type
        if embedded_doc_type is not None:
            embedded_doc_type = etau.get_class(embedded_doc_type)

        subfield = self.subfield
        if subfield is not None:
            subfield = etau.get_class(subfield)()

        fields = None
        if self.fields is not None:
            fields = {
                name: field_doc.to_field()
                for name, field_doc in self.fields.items()
            }

        return create_field(
            self.name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            db_field=self.db_field,
            fields=fields,
        )

    @classmethod
    def from_field(cls, field):
        """Creates a :class:`SampleFieldDocument` for a field.

        Args:
            field: a :class:`fiftyone.core.fields.Field` instance

        Returns:
            a :class:`SampleFieldDocument`
        """
        return cls(
            name=field.name,
            ftype=etau.get_class_name(field),
            subfield=cls._get_attr_repr(field, "field"),
            embedded_doc_type=cls._get_attr_repr(field, "document_type"),
            db_field=field.db_field,
            fields=cls._get_field_documents(field),
        )

    def matches_field(self, field):
        """Determines whether this sample field matches the given field.

        Args:
            field: a :class:`fiftyone.core.fields.Field` instance

        Returns:
            True/False
        """
        if self.name != field.name:
            return False

        if self.ftype != etau.get_class_name(field):
            return False

        if self.subfield and self.subfield != etau.get_class_name(field.field):
            return False

        if (
            self.embedded_doc_type
            and self.embedded_doc_type
            != etau.get_class_name(field.document_type)
        ):
            return False

        if self.db_field != field.db_field:
            return False

        cur_fields = getattr(self, "fields", None)
        fields = getattr(field, "fields", None)
        if cur_fields and fields:
            if len(fields) != len(cur_fields):
                return False

            if any([name not in cur_fields for name in fields]):
                return False

            return any(
                [not cur_fields[name].matches(fields[name]) for name in fields]
            )

        return True

    @staticmethod
    def _get_attr_repr(field, attr_name):
        attr = getattr(field, attr_name, None)
        return etau.get_class_name(attr) if attr else None

    @classmethod
    def _get_field_documents(cls, field):
        if not isinstance(field, EmbeddedDocumentField):
            return None

        if not hasattr(field, "fields"):
            return None

        return {
            name: cls.from_field(value) for name, value in field.fields.items()
        }


class DatasetDocument(Document):
    """Backing document for datasets."""

    meta = {"collection": "datasets"}

    name = StringField(unique=True, required=True)
    version = StringField(required=True, null=True)
    created_at = DateTimeField()
    last_loaded_at = DateTimeField()
    sample_collection_name = StringField(unique=True, required=True)
    frame_collection_name = StringField()
    persistent = BooleanField(default=False)
    media_type = StringField()
    info = DictField()
    classes = DictField(ClassesField())
    default_classes = ClassesField()
    mask_targets = DictField(TargetsField())
    default_mask_targets = TargetsField()
    sample_fields = EmbeddedDocumentListField(
        document_type=SampleFieldDocument
    )
    frame_fields = EmbeddedDocumentListField(document_type=SampleFieldDocument)
    annotation_runs = DictField(
        EmbeddedDocumentField(document_type=RunDocument)
    )
    brain_methods = DictField(EmbeddedDocumentField(document_type=RunDocument))
    evaluations = DictField(EmbeddedDocumentField(document_type=RunDocument))
