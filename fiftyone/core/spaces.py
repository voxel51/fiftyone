from bson import ObjectId
from mongoengine.errors import ValidationError

import fiftyone.core.fields as fof
from fiftyone.core.odm import EmbeddedDocument


def _validate_children(children):
    if children is not None:
        if not all(isinstance(c, Component) for c in children):
            raise ValidationError("All children must be %s" % Component)

        if len(set(type(c) for c in children)) > 1:
            raise ValidationError("All children must have same type")


class Component(EmbeddedDocument):

    meta = {"abstract": True, "allow_inheritance": True}

    id = fof.ObjectIdField(
        default=lambda: str(ObjectId()),
        db_field="_id",
    )


class Panel(Component):

    meta = {"strict": False, "allow_inheritance": True}

    type = fof.StringField()
    pinned = fof.BooleanField(default=False)


class Space(Component):

    meta = {"strict": False, "allow_inheritance": True}

    children = fof.ListField(
        fof.EmbeddedDocumentField(Component),
        validation=_validate_children,
    )
    orientation = fof.StringField(
        choices=["horizontal", "vertical"], default=None
    )
    active_child = fof.StringField(default=None)


default_spaces = Space(
    children=[Panel(type="Samples", pinned=True)],
    active_child="default-samples-node",
)
