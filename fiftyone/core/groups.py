"""
Sample groups.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId

import fiftyone.core.fields as fof
import fiftyone.core.data as fod


class Group(fod.Data):
    """A named group membership.

    Args:
        id (None): the group ID
        name (None): the group name
    """

    _id: ObjectId
    id: str = fod.field(
        load=str, dump=ObjectId, link="_id", default=lambda: str(ObjectId())
    )
    name: str

    @property
    def _id(self):
        return ObjectId(self.id)

    def element(self, name):
        return self.__class__(id=self.id, name=name)


def is_group_field(field):
    """Determines whether the given field is a group field.

    Args:
        field: a :class:`fiftyone.core.fields.Field`

    Returns:
        True/False
    """
    return isinstance(field, fof.EmbeddedDocumentField) and issubclass(
        field.document_type, Group
    )
