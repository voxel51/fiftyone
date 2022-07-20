"""
Sample groups.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId

import fiftyone.core.fields as fof
from fiftyone.core.odm import EmbeddedDocument


class Group(EmbeddedDocument):
    """A named group membership.

    Args:
        id (None): the group ID
        name (None): the group name
    """

    id = fof.ObjectIdField(default=lambda: str(ObjectId()), db_field="_id")
    name = fof.StringField()

    @property
    def _id(self):
        return ObjectId(self.id)

    def element(self, name):
        return self.__class__(id=self.id, name=name)
