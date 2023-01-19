"""
App Space configuration.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId
from mongoengine.errors import ValidationError
import uuid

import fiftyone.core.fields as fof
from fiftyone.core.odm import EmbeddedDocument


def _validate_children(children):
    if children is not None:
        if not all(isinstance(c, Component) for c in children):
            raise ValidationError("All children must be %s" % Component)

        if len(set(type(c) for c in children)) > 1:
            raise ValidationError("All children must have same type")


class Component(EmbeddedDocument):
    """Base class for App components."""

    meta = {"abstract": True, "allow_inheritance": True}

    # common id between api and app
    component_id = fof.StringField(default=lambda: str(uuid.uuid4()))


class Panel(Component):
    """A Panel (tab) within a Space in the App.

    Args:
        component_id: the component ID
        type: the Panel type
        pinned: whether the Panel is currently pinned
        state: an optional Panel state dict
    """

    meta = {"strict": False, "allow_inheritance": True}

    type = fof.StringField()
    pinned = fof.BooleanField(default=False)
    state = fof.DictField()


class Space(Component):
    """Configuration of a Space in the App.

    Args:
        component_id: the component's ID
        children: the list of :class:`Component` children of this space, if any
        orientation (["horizontal", "vertical"]): the orientation of this
            space's children
        active_child: the ``component_id`` of this space's currently active
            chilld
    """

    meta = {"strict": False, "allow_inheritance": True}

    children = fof.ListField(
        fof.EmbeddedDocumentField(Component),
        validation=_validate_children,
    )
    orientation = fof.StringField(
        choices=["horizontal", "vertical"], default=None
    )
    active_child = fof.StringField(default=None)


samples_panel = Panel(type="Samples", pinned=True)
default_spaces = Space(
    children=[samples_panel], active_child=samples_panel.component_id
)
