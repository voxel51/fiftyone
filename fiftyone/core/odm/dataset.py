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
    ArrayField,
    BooleanField,
    ClassesField,
    DateTimeField,
    DictField,
    EmbeddedDocumentField,
    EmbeddedDocumentListField,
    IntField,
    ListField,
    ObjectIdField,
    ReferenceField,
    StringField,
    TargetsField,
)

from .document import Document
from .embedded_document import EmbeddedDocument, BaseEmbeddedDocument
from .runs import RunDocument
from .views import ViewDocument


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
        if issubclass(ftype, ObjectIdField) and not name.startswith("_"):
            db_field = "_" + name
        else:
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

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"strict": False}

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
    """Description of a sidebar group in the App.

    Args:
        name: the name of the sidebar group
        paths: the list of ``field`` or ``embedded.field.name`` paths in the
            group
    """

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"strict": False}

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

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"strict": False}

    labels = ListField(StringField(), null=True)
    edges = ListField(ListField(IntField()))


class DatasetAppConfig(EmbeddedDocument):
    """Dataset-specific settings that customize how a dataset is visualized in
    the App.

    Args:
        media_fields (["filepath"]): the list of sample fields that contain
            media and should be available to choose from the App's settings
            menus
        grid_media_field ("filepath"): the default sample field from which to
            serve media in the App's grid view
        modal_media_field ("filepath"): the default sample field from which to
            serve media in the App's modal view
        sidebar_groups (None): an optional list of
            :class:`SidebarGroupDocument` describing sidebar groups to create
            in the App
        plugins ({}): an optional dict mapping plugin names to plugin
            configuration dicts. Builtin plugins include:

            -   ``"map"``: See the :ref:`map plugin docs <app-map-tab>` for
                supported options
            -   ``"point-cloud"``: See the
                :ref:`3D visualizer docs <3d-visualizer-config>` for supported
                options
    """

    media_fields = ListField(StringField(), default=["filepath"])
    grid_media_field = StringField(default="filepath")
    modal_media_field = StringField(default="filepath")
    sidebar_groups = ListField(
        EmbeddedDocumentField(document_type=SidebarGroupDocument), default=None
    )
    plugins = DictField()

    def is_custom(self):
        """Determines whether this app config differs from the default one.

        Returns:
            True/False
        """
        return self != self.__class__()

    def _delete_path(self, path):
        if self.sidebar_groups:
            for sidebar_group in self.sidebar_groups:
                _delete_path(sidebar_group.paths, path)

        _delete_path(self.media_fields, path)

        if _matches_path(self.grid_media_field, path):
            self.grid_media_field = "filepath"

        if _matches_path(self.modal_media_field, path):
            self.modal_media_field = "filepath"

    def _delete_paths(self, paths):
        for path in paths:
            self._delete_path(path)

    def _rename_path(self, path, new_path):
        if self.sidebar_groups:
            for sidebar_group in self.sidebar_groups:
                _rename_path(sidebar_group.paths, path, new_path)

        _rename_path(self.media_fields, path, new_path)

        if _matches_path(self.grid_media_field, path):
            self.grid_media_field = _update_path(
                self.grid_media_field, path, new_path
            )

        if _matches_path(self.modal_media_field, path):
            self.modal_media_field = _update_path(
                self.modal_media_field, path, new_path
            )

    def _rename_paths(self, paths, new_paths):
        for path, new_path in zip(paths, new_paths):
            self._rename_path(path, new_path)


def _delete_path(paths, path):
    del_inds = []
    for idx, p in enumerate(paths):
        if _matches_path(p, path):
            del_inds.append(idx)

    for idx in sorted(del_inds, reverse=True):
        del paths[idx]


def _rename_path(paths, path, new_path):
    for idx, p in enumerate(paths):
        if _matches_path(p, path):
            paths[idx] = _update_path(p, path, new_path)


def _matches_path(p, path):
    return p == path or p.startswith(path + ".")


def _update_path(p, path, new_path):
    return new_path + p[len(path) :]


class DatasetDocument(Document):
    """Backing document for datasets."""

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"collection": "datasets", "strict": False}

    name = StringField(unique=True, required=True)
    version = StringField(required=True, null=True)
    created_at = DateTimeField()
    last_loaded_at = DateTimeField()
    sample_collection_name = StringField(unique=True, required=True)
    frame_collection_name = StringField()
    persistent = BooleanField(default=False)
    media_type = StringField()
    group_field = StringField()
    group_media_types = DictField(StringField())
    default_group_slice = StringField()
    tags = ListField(StringField())
    info = DictField()
    app_config = EmbeddedDocumentField(document_type=DatasetAppConfig)
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
    annotation_runs = DictField(ReferenceField(RunDocument))
    brain_methods = DictField(ReferenceField(RunDocument))
    evaluations = DictField(ReferenceField(RunDocument))
    views = ListField(ReferenceField(ViewDocument))
