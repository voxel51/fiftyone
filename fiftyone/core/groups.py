"""
Sample groups.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy

from bson import ObjectId

import fiftyone.core.fields as fof
import fiftyone.core.odm as foo


class Group(foo.EmbeddedDocument):
    """A named group membership.

    Args:
        id (None): the group ID
        name (None): the group name
    """

    id = fof.ObjectIdField(default=lambda: str(ObjectId()), db_field="_id")
    name = fof.StringField()

    def __deepcopy__(self, memo):
        # Custom implementation that does NOT exclude `id` field, since `Group`
        # instances often do need to share the same IDs
        # pylint: disable=no-member, unsubscriptable-object
        return self.__class__(
            **{
                f: deepcopy(self.get_field(f), memo)
                for f in self._fields_ordered
            }
        )

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
