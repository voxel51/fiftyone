"""
FiftyOne Server utils

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.collections as foc
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom


def change_sample_tags(sample_collection, changes):
    """Applies the changes to tags to all samples of the collection, if
    necessary.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        changes: a dict of tags as keys and bools as values. A ``True`` value
            adds the tag to all samples, if necessary. A ``False`` value
            removes the tag from all samples, if necessary
    """
    add_tags, del_tags = _parse_changes(changes)

    if add_tags:
        sample_collection.tag_samples(add_tags)

    if del_tags:
        sample_collection.untag_samples(del_tags)


def change_label_tags(sample_collection, changes, label_fields=None):
    """Applies the changes to tags to all labels in the specified label
    field(s) of the collection, if necessary.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        changes: a dict of tags as keys and bools as values. A ``True`` value
            adds the tag to all labels, if necessary. A ``False`` value removes
            the tag from all labels, if necessary
        label_fields (None): an optional name or iterable of names of
            :class:`fiftyone.core.labels.Label` fields. By default, all label
            fields are used
    """
    add_tags, del_tags = _parse_changes(changes)

    if add_tags:
        sample_collection.tag_labels(add_tags, label_fields=label_fields)

    if del_tags:
        sample_collection.untag_labels(del_tags, label_fields=label_fields)


def iter_label_fields(view: foc.SampleCollection):
    """
    Yields the labels of the
    :class:`fiftyone.core.collections.SampleCollection`

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
    """
    for field_name, field in view.get_field_schema(
        ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
    ).items():
        yield field_name, field

    if view.media_type != fom.VIDEO:
        return

    for field_name, field in view.get_frame_field_schema(
        ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
    ).items():
        yield "frames.%s" % field_name, field


def meets_type(field: fof.Field, type_or_types):
    """
    Determines whether the field meets type or types, or the field
    is a :class:`fiftyone.core.fields.ListField` that meets the type or types

    Args:
        field: a class:`fiftyone.core.fields.Field`
        type: a field type or `tuple` of field types
    """
    return isinstance(field, type_or_types) or (
        isinstance(field, fof.ListField)
        and isinstance(field.field, type_or_types)
    )


def _parse_changes(changes):
    add_tags = []
    del_tags = []
    for tag, add in changes.items():
        if add:
            add_tags.append(tag)
        else:
            del_tags.append(tag)

    return add_tags, del_tags
