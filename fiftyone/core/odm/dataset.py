"""
Documents that track datasets and their sample schemas in the database.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import inspect

import eta.core.utils as etau

from mongoengine.fields import StringField as MongoStringField

from fiftyone.core.fields import (
    Field,
    BooleanField,
    ClassesField,
    DateTimeField,
    DictField,
    EmbeddedDocumentField,
    EmbeddedDocumentListField,
    IntField,
    ListField,
    ObjectIdField,
    StringField,
    TargetsField,
)

from .document import Document
from .embedded_document import EmbeddedDocument, BaseEmbeddedDocument
from .runs import RunDocument


def create_field(
    name,
    ftype,
    embedded_doc_type=None,
    subfield=None,
    db_field=None,
    fields=None,
    parent=None,
    **field_kwargs
):
    """Creates the :class:`fiftyone.core.fields.Field` instance defined by the
    given specification.

    .. note::

        This method is used exclusively to create user-defined (non-default)
        fields. Any parameters accepted here must be stored on
        :class:`SampleFieldDocument` or else datasets will "lose" any
        additional decorations when they are loaded from the database.

    Args:
        name: the field name
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
            ``name`` is used
        fields (None): the subfields of the
            :class:`fiftyone.core.fields.EmbeddedDocumentField`
            Only applicable when ``ftype`` is
            :class:`fiftyone.core.fields.EmbeddedDocumentField`
        parent (None): a parent
        **field_kwargs: mongoengine field kwargs

    Returns:
        a :class:`fiftyone.core.fields.Field` instance
    """
    if db_field is None:
        db_field = name

    # All user-defined fields are nullable
    kwargs = dict(null=True, db_field=db_field)
    kwargs.update(field_kwargs)

    if fields is not None:
        for idx, value in enumerate(fields):
            if isinstance(value, (Field, MongoStringField)):
                continue

            fields[idx] = create_field(**value)

    if issubclass(ftype, (ListField, DictField)):
        if subfield is not None:
            if inspect.isclass(subfield):
                if issubclass(subfield, EmbeddedDocumentField):
                    subfield = create_field(
                        name,
                        subfield,
                        embedded_doc_type=embedded_doc_type,
                        fields=fields or [],
                        parent=parent,
                    )

                else:
                    subfield = subfield()

                subfield.name = name

            if not isinstance(subfield, Field):
                raise ValueError(
                    "Invalid subfield type %s; must be a subclass of %s"
                    % (type(subfield), Field)
                )

            kwargs["field"] = subfield

    if issubclass(ftype, EmbeddedDocumentField):
        if embedded_doc_type is None or not issubclass(
            embedded_doc_type, BaseEmbeddedDocument
        ):
            raise ValueError(
                "Invalid embedded_doc_type %s; must be a subclass of %s"
                % (embedded_doc_type, BaseEmbeddedDocument)
            )

        kwargs.update(
            {"document_type": embedded_doc_type, "fields": fields or []}
        )

    field = ftype(**kwargs)
    field.name = name

    return field


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

    def merge_doc(self, other):
        if self.ftype != other.ftype:
            raise TypeError("Cannot merge")

        if other.ftype == etau.get_class_name(ListField):
            if (
                self.subfield
                and other.subfield
                and self.subfield != other.subfield
            ):
                raise TypeError("Cannot merge")

            self.subfield = other.subfield or self.subfield

        if self.name == other.name and self.db_field is None:
            self.db_field = other.db_field or self.db_field

        embedded_doc = etau.get_class_name(EmbeddedDocumentField)
        if other.ftype == embedded_doc or self.subfield == embedded_doc:
            if (
                self.embedded_doc_type
                and other.embedded_doc_type
                and self.embedded_doc_type != other.embedded_doc_type
            ):
                raise TypeError("Cannot merge")

            self.embedded_doc_type = (
                other.embedded_doc_type or self.embedded_doc_type
            )

            others = {f.name: f for f in other.fields}

            new = []
            for i, field in enumerate(self.fields):
                if field.name in others:
                    self.fields[i] = field.merge_doc(others[field.name])
                else:
                    new.append(field)

            self.fields = self.fields + new

        return self

    @staticmethod
    def _get_attr_repr(field, attr_name):
        attr = getattr(field, attr_name, None)
        return etau.get_class_name(attr) if attr else None

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


class SidebarGroupDocument(EmbeddedDocument):
    """Description of a Sidebar Group in the App."""

    name = StringField(required=True)
    paths = ListField(StringField(), default=[])


class KeypointSkeleton(EmbeddedDocument):
    """Description of a keypoint skeleton.

    Keypoint skeletons can be associated with
    :class:`fiftyone.core.labels.Keypoint` or
    :class:`fiftyone.core.labels.Keypoints` fields whose
    :attr:`points <fiftyone.core.labels.Keypoint.points>` attributes all
    contain a fixed number of semantically ordered points.

    The ``edges`` argument contains lists of integer indexes that define the
    connectivity of the points in the skeleton, and the optional ``labels``
    argument defines the label strings for each node in the skeleton.

    For example, the skeleton below is defined by edges between the following
    nodes::

        left hand <-> left shoulder <-> right shoulder <-> right hand
        left eye <-> right eye <-> mouth

    Example::

        import fiftyone as fo

        # A skeleton for an object made of 7 points
        skeleton = fo.KeypointSkeleton(
            labels=[
                "left hand" "left shoulder", "right shoulder", "right hand",
                "left eye", "right eye", "mouth",
            ],
            edges=[[0, 1, 2, 3], [4, 5, 6]],
        )

    Args:
        labels (None): an optional list of label strings for each node
        edges: a list of lists of integer indexes defining the connectivity
            between nodes
    """

    labels = ListField(StringField(), null=True)
    edges = ListField(ListField(IntField()))


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
    skeletons = DictField(
        EmbeddedDocumentField(document_type=KeypointSkeleton)
    )
    default_skeleton = EmbeddedDocumentField(document_type=KeypointSkeleton)
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
