"""
Documents that track datasets and their sample schemas in the database.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
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
from .embedded_document import EmbeddedDocument
from .runs import RunDocument
from .utils import create_field


class SampleFieldDocument(EmbeddedDocument):
    """Description of a sample field."""

    name = StringField()
    ftype = StringField()
    subfield = StringField(null=True)
    embedded_doc_type = StringField(null=True)
    db_field = StringField(null=True)
    fields = ListField(
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
            subfield = etau.get_class(subfield)

        fields = None
        if self.fields is not None:
            fields = [field_doc.to_field() for field_doc in list(self.fields)]

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
        embedded_doc_type = cls._get_attr_repr(field, "document_type")
        if isinstance(field, (ListField, DictField)) and field.field:
            embedded_doc_type = cls._get_attr_repr(
                field.field, "document_type"
            )

        return cls(
            name=field.name,
            ftype=etau.get_class_name(field),
            subfield=cls._get_attr_repr(field, "field"),
            embedded_doc_type=embedded_doc_type,
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

        cur_fields = {f.name: f for f in list(getattr(self, "fields", []))}
        fields = {f.name: f for f in getattr(field, "fields", [])}
        if cur_fields and fields:
            if len(fields) != len(cur_fields):
                return False

            if any([name not in cur_fields for name in fields]):
                return False

            return any(
                [not cur_fields[name].matches(fields[name]) for name in fields]
            )

        return True

    @classmethod
    def _get_field_documents(cls, field):
        if isinstance(field, ListField):
            field = field.field

        if not isinstance(field, EmbeddedDocumentField):
            return None

        if not hasattr(field, "fields"):
            return None

        return [
            cls.from_field(value)
            for value in field.get_field_schema().values()
        ]

    @staticmethod
    def _get_attr_repr(field, attr_name):
        attr = getattr(field, attr_name, None)
        return etau.get_class_name(attr) if attr else None


class SidebarGroupDocument(EmbeddedDocument):
    """Description of a sidebar group in the App."""

    name = StringField(required=True)
    paths = ListField(StringField(), default=[])


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
    app_sidebar_groups = ListField(
        EmbeddedDocumentField(document_type=SidebarGroupDocument), default=None
    )
