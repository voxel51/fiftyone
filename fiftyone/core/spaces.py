from bson import ObjectId
from mongoengine.errors import ValidationError

import fiftyone.core.fields as fof
from fiftyone.core.odm import EmbeddedDocument
import uuid


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

    # common id between api and app
    component_id = fof.StringField(default=lambda: str(uuid.uuid4()))


class Panel(Component):

    meta = {"strict": False, "allow_inheritance": True}

    type = fof.StringField()
    pinned = fof.BooleanField(default=False)
    state = fof.DictField()


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


samples_panel = Panel(type="Samples", pinned=True)
default_spaces = Space(
    children=[samples_panel], active_child=samples_panel.component_id
)
