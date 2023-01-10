import fiftyone as fo

from bson import ObjectId
from fiftyone.core.odm import EmbeddedDocument
from mongoengine.errors import ValidationError


def _validate_children(children):
    if children is not None:
        if not all(isinstance(c, Component) for c in children):
            raise ValidationError("All children must be %s" % Component)

        if len(set(type(c) for c in children)) > 1:
            raise ValidationError("All children must have same type")


class Component(EmbeddedDocument):

    meta = {"abstract": True, "allow_inheritance": True}

    id = fo.ObjectIdField(
        default=lambda: str(ObjectId()),
        db_field="_id",
    )


class Panel(Component):

    meta = {"strict": False, "allow_inheritance": True}

    type = fo.StringField()
    pinned = fo.BooleanField(default=False)


class Space(Component):

    meta = {"strict": False, "allow_inheritance": True}

    children = fo.ListField(
        fo.EmbeddedDocumentField(Component),
        validation=_validate_children,
    )
    orientation = fo.StringField(
        choices=["horizontal", "vertical"], default=None
    )
    active_child = fo.StringField(default=None)


default_spaces = Space(
    children=[Panel(type="Samples", pinned=True, id="default-samples-node")],
    active_child="default-samples-node",
    id="root",
)
