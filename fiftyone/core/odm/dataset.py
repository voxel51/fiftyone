"""
Documents that track datasets and their sample schemas in the database.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

from bson import DBRef, ObjectId

import eta.core.utils as etau

from fiftyone.core.fields import (
    BooleanField,
    ClassesField,
    ColorField,
    DateTimeField,
    DictField,
    EmbeddedDocumentField,
    EmbeddedDocumentListField,
    FloatField,
    IntField,
    ListField,
    MaskTargetsField,
    ObjectIdField,
    ReferenceField,
    StringField,
)
import fiftyone.core.utils as fou

from .database import (
    patch_annotation_runs,
    patch_brain_runs,
    patch_evaluations,
    patch_runs,
    patch_saved_views,
    patch_workspaces,
)
from .document import Document
from .embedded_document import EmbeddedDocument
from .runs import RunDocument
from .utils import create_field
from .views import SavedViewDocument
from .workspace import WorkspaceDocument

fol = fou.lazy_import("fiftyone.core.labels")
fom = fou.lazy_import("fiftyone.core.metadata")
fop = fou.lazy_import("fiftyone.core.plots.plotly")


logger = logging.getLogger(__name__)


class SampleFieldDocument(EmbeddedDocument):
    """Description of a sample field."""

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"strict": False}

    name = StringField()
    ftype = StringField()
    embedded_doc_type = StringField(null=True)
    subfield = StringField(null=True)
    fields = ListField(EmbeddedDocumentField("SampleFieldDocument"))
    db_field = StringField(null=True)
    description = StringField(null=True)
    info = DictField(null=True)

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
            fields=fields,
            db_field=self.db_field,
            description=self.description,
            info=self.info,
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
            embedded_doc_type=embedded_doc_type,
            subfield=cls._get_attr_repr(field, "field"),
            fields=cls._get_field_documents(field),
            db_field=field.db_field,
            description=field.description,
            info=field.info,
        )

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

        return [
            cls.from_field(value)
            for value in field.get_field_schema().values()
        ]


class SidebarGroupDocument(EmbeddedDocument):
    """Description of a sidebar group in the App.

    Args:
        name: the name of the sidebar group
        paths ([]): the list of ``field`` or ``embedded.field.name`` paths in
            the group
        expanded (None): whether this group should be expanded by default
    """

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"strict": False}

    name = StringField(required=True)
    paths = ListField(StringField(), default=[])
    expanded = BooleanField(default=None)


class ColorScheme(EmbeddedDocument):
    """Description of a color scheme in the App.

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        # Store a custom color scheme for a dataset
        dataset.app_config.color_scheme = fo.ColorScheme(
            color_by="field",
            color_pool=[
                "#ff0000",
                "#00ff00",
                "#0000ff",
                "pink",
                "yellowgreen",
            ],
            fields=[
                {
                    "path": "ground_truth",
                    "fieldColor": "#ff00ff",
                    "colorByAttribute": "label",
                    "valueColors": [{"value": "dog", "color": "yellow"}],
                    "maskTargetsColors": [
                        {"intTarget": 2, "color": "#ff0000"},
                        {"intTarget": 12, "color": "#99ff00"},
                    ],
                }
            ],
            label_tags={
                "fieldColor": "#00ffff",
                "valueColors": [
                    {"value": "correct", "color": "#ff00ff"},
                    {"value": "mistake", "color": "#00ff00"},
                ],
            },
            colorscales=[
                {
                    "path": "heatmap1",
                    "list": [
                        {"value": 0, "color": "rgb(0, 0, 255)"},
                        {"value": 1, "color": "rgb(0, 255, 255)"},
                    ],
                },
                {
                    "path": "heatmap2",
                    "name": "hsv",
                },
            ],
            multicolor_keypoints=False,
            opacity=0.5,
            show_skeletons=True,
            default_mask_targets_colors=[
                {"intTarget": 1, "color": "#FEC0AA"},
                {"intTarget": 2, "color": "#EC4E20"},
            ],
            default_colorscale={"name": "sunset", "list": None},
        )

        session = fo.launch_app(dataset)

    Args:
        color_by (None): whether annotations should be colored by ``"field"``,
            ``"value"``, or ``"instance"``
        color_pool (None): an optional list of colors to use as a color pool
            for this dataset
        multicolor_keypoints (None): whether to use multiple colors for
            keypoints
        opacity (None): transparency of the annotation, between 0 and 1
        show_skeletons (None): whether to show skeletons of keypoints
        fields (None): an optional list of dicts of per-field custom colors
            with the following keys:

            -   ``path`` (required): the fully-qualified path to the field
                you're customizing
            -   ``fieldColor`` (optional): a color to assign to the field in
                the App sidebar
            -   ``colorByAttribute`` (optional): the attribute to use to assign
                per-value colors. Only applicable when the field is an embedded
                document
            -   ``valueColors`` (optional): a list of dicts specifying colors
                to use for individual values of this field
            -   ``maskTargetsColors`` (optional): a list of dicts specifying
                index and color for 2D masks
        default_mask_targets_colors (None): a list of dicts with the following
            keys specifying index and color for 2D masks of the dataset. If a
            field does not have field specific mask targets colors, this list
            will be used:

            -   ``intTarget``: integer target value
            -   ``color``: a color string
        default_colorscale (None): dataset default colorscale dict with the
            following keys:

            -   ``name`` (optional): a named plotly colorscale, e.g. ``"hsv"``.
                See https://plotly.com/python/builtin-colorscales
            -   ``list`` (optional): a list of dicts of colorscale values

                -   ``value``: a float number between 0 and 1. A valid list
                    must have have colors defined for 0 and 1
                -   ``color``: an rgb color string
        colorscales (None): an optional list of dicts of per-field custom
            colorscales with the following keys:

            -   ``path`` (required): the fully-qualified path to the field
                you're customizing. use "dataset" if you are setting the
                default colorscale for dataset
            -   ``name`` (optional): a named colorscale plotly recognizes
            -   ``list`` (optional): a list of dicts of colorscale values with
                the following keys:

                -   ``value``: a float number between 0 and 1. A valid list
                    must have have colors defined for 0 and 1
                -   ``color``: an rgb color string
        label_tags (None): an optional dict specifying custom colors for label
            tags with the following keys:

            -   ``fieldColor`` (optional): a color to assign to all label tags
            -   ``valueColors`` (optional): a list of dicts
    """

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"strict": False}

    id = ObjectIdField(
        required=True,
        default=lambda: str(ObjectId()),
        db_field="_id",
    )
    color_pool = ListField(ColorField(), null=True)
    color_by = StringField(null=True)
    fields = ListField(DictField(), null=True)
    label_tags = DictField(null=True)
    multicolor_keypoints = BooleanField(null=True)
    opacity = FloatField(null=True)
    show_skeletons = BooleanField(null=True)
    default_mask_targets_colors = ListField(DictField(), null=True)
    colorscales = ListField(DictField(), null=True)
    default_colorscale = DictField(null=True)

    @property
    def _id(self):
        return ObjectId(self.id)

    @_id.setter
    def _id(self, value):
        self.id = str(value)


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
        media_fallback (False): whether to fall back to the default media field
            (``"filepath"``) when the alternate media field value for a sample
            is not defined
        sidebar_mode (None): an optional default mode for the App sidebar.
            Supported values are ``("fast", "all", "best", "disabled")``
        sidebar_groups (None): an optional list of
            :class:`SidebarGroupDocument` describing sidebar groups to use in
            the App
        color_scheme (None): an optional :class:`ColorScheme` for the dataset
        plugins ({}): an optional dict mapping plugin names to plugin
            configuration dicts. Builtin plugins include:

            -   ``"map"``: See the :ref:`map plugin docs <app-map-panel>` for
                supported options
            -   ``"point-cloud"``: See the
                :ref:`3D visualizer docs <app-3d-visualizer-config>` for
                supported options
    """

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"strict": False}

    media_fields = ListField(StringField(), default=["filepath"])
    grid_media_field = StringField(default="filepath")
    modal_media_field = StringField(default="filepath")
    media_fallback = BooleanField(default=False)
    sidebar_mode = StringField(default=None)
    sidebar_groups = ListField(
        EmbeddedDocumentField(SidebarGroupDocument), default=None
    )
    color_scheme = EmbeddedDocumentField(ColorScheme, default=None)
    plugins = DictField()

    @staticmethod
    def default_sidebar_groups(sample_collection):
        """Generates the default ``sidebar_groups`` for the given collection.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            sidebar_groups = fo.DatasetAppConfig.default_sidebar_groups(dataset)
            dataset.app_config.sidebar_groups = sidebar_groups
            print(dataset.app_config)

        Args:
            sample_collection: a
                :class:`fiftyone.core.collections.SampleCollection`

        Returns:
            a list of :class:`SidebarGroupDocument` instances
        """
        return _make_default_sidebar_groups(sample_collection)

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


def _make_default_sidebar_groups(sample_collection):
    # Possible sidebar groups
    metadata = []
    labels = []
    frame_labels = []
    custom = []
    primitives = []
    other = []

    # Parse sample fields
    schema = sample_collection.get_field_schema()
    _parse_schema(
        schema,
        metadata,
        labels,
        frame_labels,
        custom,
        primitives,
        other,
    )

    # Parse frame fields
    if sample_collection._contains_videos():
        schema = sample_collection.get_frame_field_schema()
        _parse_schema(
            schema,
            metadata,
            labels,
            frame_labels,
            custom,
            primitives,
            other,
            frames=True,
        )

    sidebar_groups = [
        SidebarGroupDocument(name="tags", paths=["tags", "_label_tags"]),
        SidebarGroupDocument(name="metadata", paths=metadata),
        SidebarGroupDocument(name="labels", paths=labels),
    ]

    if frame_labels:
        sidebar_groups.append(
            SidebarGroupDocument(name="frame labels", paths=frame_labels)
        )

    for name, paths in custom:
        sidebar_groups.append(SidebarGroupDocument(name=name, paths=paths))

    sidebar_groups.append(
        SidebarGroupDocument(name="primitives", paths=primitives)
    )

    if other:
        sidebar_groups.append(SidebarGroupDocument(name="other", paths=other))

    return sidebar_groups


def _parse_schema(
    schema,
    metadata,
    labels,
    frame_labels,
    custom,
    primitives,
    other,
    frames=False,
):
    for name, field in schema.items():
        if frames:
            name = "frames." + name
        else:
            if name == "tags":
                continue

        if isinstance(field, EmbeddedDocumentField):
            if issubclass(field.document_type, fol.Label):
                if frames:
                    frame_labels.append(name)
                else:
                    labels.append(name)
            else:
                paths = [
                    name + "." + n for n in field.get_field_schema().keys()
                ]
                if issubclass(field.document_type, fom.Metadata):
                    metadata.extend(paths)
                else:
                    custom.append((name, paths))
        elif isinstance(
            field,
            (ObjectIdField, IntField, FloatField, StringField, BooleanField),
        ):
            if frames:
                other.append(name)
            else:
                primitives.append(name)
        else:
            other.append(name)


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
    meta = {
        "collection": "datasets",
        "strict": False,
    }

    name = StringField(unique=True, required=True)
    slug = StringField()
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
    description = StringField()
    info = DictField()
    app_config = EmbeddedDocumentField(
        DatasetAppConfig, default=DatasetAppConfig
    )
    classes = DictField(ClassesField())
    default_classes = ClassesField()
    mask_targets = DictField(MaskTargetsField())
    default_mask_targets = MaskTargetsField()
    skeletons = DictField(EmbeddedDocumentField(KeypointSkeleton))
    default_skeleton = EmbeddedDocumentField(KeypointSkeleton)
    sample_fields = EmbeddedDocumentListField(SampleFieldDocument)
    frame_fields = EmbeddedDocumentListField(SampleFieldDocument)
    saved_views = ListField(ReferenceField(SavedViewDocument))
    workspaces = ListField(ReferenceField(WorkspaceDocument))
    annotation_runs = DictField(ReferenceField(RunDocument))
    brain_methods = DictField(ReferenceField(RunDocument))
    evaluations = DictField(ReferenceField(RunDocument))
    runs = DictField(ReferenceField(RunDocument))

    def get_saved_views(self):
        saved_views = []
        for view_doc in self.saved_views:
            if not isinstance(view_doc, DBRef):
                saved_views.append(view_doc)
            else:
                logger.warning(
                    "This dataset's saved view references are corrupted. "
                    "Run %s('%s') and dataset.reload() to resolve",
                    etau.get_function_name(patch_saved_views),
                    self.name,
                )

        return saved_views

    def get_workspaces(self):
        workspaces = []
        for workspace_doc in self.workspaces:
            if not isinstance(workspace_doc, DBRef):
                workspaces.append(workspace_doc)
            else:
                logger.warning(
                    "This dataset's workspace references are corrupted. "
                    "Run %s('%s') and dataset.reload() to resolve",
                    etau.get_function_name(patch_workspaces),
                    self.name,
                )

        return workspaces

    def get_annotation_runs(self):
        annotation_runs = {}
        for key, run_doc in self.annotation_runs.items():
            if not isinstance(run_doc, DBRef):
                annotation_runs[key] = run_doc
            else:
                logger.warning(
                    "This dataset's annotation run references are corrupted. "
                    "Run %s('%s') and dataset.reload() to resolve",
                    etau.get_function_name(patch_annotation_runs),
                    self.name,
                )

        return annotation_runs

    def get_brain_methods(self):
        brain_methods = {}
        for key, run_doc in self.brain_methods.items():
            if not isinstance(run_doc, DBRef):
                brain_methods[key] = run_doc
            else:
                logger.warning(
                    "This dataset's brain method run references are corrupted. "
                    "Run %s('%s') and dataset.reload() to resolve",
                    etau.get_function_name(patch_brain_runs),
                    self.name,
                )

        return brain_methods

    def get_evaluations(self):
        evaluations = {}
        for key, run_doc in self.evaluations.items():
            if not isinstance(run_doc, DBRef):
                evaluations[key] = run_doc
            else:
                logger.warning(
                    "This dataset's evaluation run references are corrupted. "
                    "Run %s('%s') and dataset.reload() to resolve",
                    etau.get_function_name(patch_evaluations),
                    self.name,
                )

        return evaluations

    def get_runs(self):
        runs = {}
        for key, run_doc in self.runs.items():
            if not isinstance(run_doc, DBRef):
                runs[key] = run_doc
            else:
                logger.warning(
                    "This dataset's run references are corrupted. "
                    "Run %s('%s') and dataset.reload() to resolve",
                    etau.get_function_name(patch_runs),
                    self.name,
                )

        return runs

    def to_dict(self, *args, no_dereference=False, **kwargs):
        d = super().to_dict(*args, **kwargs)

        # Sadly there appears to be no builtin way to tell mongoengine to
        # serialize reference fields like this
        if no_dereference:
            d["saved_views"] = [v.to_dict() for v in self.get_saved_views()]
            d["annotation_runs"] = {
                k: v.to_dict() for k, v in self.get_annotation_runs().items()
            }
            d["brain_methods"] = {
                k: v.to_dict() for k, v in self.get_brain_methods().items()
            }
            d["evaluations"] = {
                k: v.to_dict() for k, v in self.get_evaluations().items()
            }
            d["runs"] = {k: v.to_dict() for k, v in self.get_runs().items()}

        return d
