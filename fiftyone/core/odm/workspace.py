"""
App Space configuration.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from mongoengine.errors import ValidationError
import uuid

from fiftyone.core.fields import (
    BooleanField,
    ColorField,
    DateTimeField,
    DictField,
    EmbeddedDocumentField,
    FloatField,
    ListField,
    ObjectIdField,
    StringField,
)
from .document import Document
from .embedded_document import EmbeddedDocument


def _validate_children(children):
    if children is not None:
        if not all(isinstance(c, AppComponent) for c in children):
            raise ValidationError("All children must be %s" % AppComponent)

        if len(set(type(c) for c in children)) > 1:
            raise ValidationError("All children must have same type")


class AppComponent(EmbeddedDocument):
    """Base class for App components."""

    # common id between api and app
    component_id = StringField(default=lambda: str(uuid.uuid4()))


class Panel(AppComponent):
    """Document for a panel (tab) within a Workspace in the App.

    Args:
        component_id: the component ID
        type: the Panel type
        pinned: whether the Panel is currently pinned
        state: an optional Panel state dict
    """

    meta = {"strict": False, "allow_inheritance": True}

    type = StringField()
    pinned = BooleanField(default=False)
    state = DictField()


class Space(AppComponent):
    """Document for configuration of a Space in the App.

    Args:
        component_id: the component's ID
        children: the list of :class:`Component` children of this space, if any
        orientation (["horizontal", "vertical"]): the orientation of this
            space's children
        active_child: the ``component_id`` of this space's currently active
            child
        sizes: the ordered list of relative sizes for children of a space in
            ``[0, 1]``
    """

    meta = {"strict": False, "allow_inheritance": True}

    children = ListField(
        EmbeddedDocumentField(AppComponent),
        validation=_validate_children,
    )
    orientation = StringField(choices=["horizontal", "vertical"], default=None)
    active_child = StringField(default=None)
    sizes = ListField(FloatField(), default=None)


class WorkspaceDocument(Document):
    """Document for configuration of a saved workspace in the App.

    Contains a single :class:`Space` as a child, which can in turn contain
    multiple children.
    """

    meta = {
        "collection": "workspaces",
        "strict": False,
    }

    _EDITABLE_FIELDS = {
        "color",
        "description",
        "name",
    }

    child = EmbeddedDocumentField(Space)
    color = ColorField()
    created_at = DateTimeField()
    dataset_id = ObjectIdField(db_field="_dataset_id")
    description = StringField(default=None)
    last_loaded_at = DateTimeField()
    last_modified_at = DateTimeField()
    name = StringField()
    slug = StringField()


def default_workspace_factory():
    """Creates a default top-level instance of :class:`Space`

    Returns:
        a default :class:`Space` instance
    """
    samples_panel = Panel(type="Samples", pinned=True)
    return Space(
        children=[samples_panel], active_child=samples_panel.component_id
    )
