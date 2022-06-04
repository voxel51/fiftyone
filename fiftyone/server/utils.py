"""
FiftyOne Server utils

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.core.expressions import ViewField as F
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
    if not changes:
        return

    tag_expr = _get_tag_expr(changes)
    edit_fcn = _get_tag_modifier(changes)
    sample_collection.match(tag_expr)._edit_sample_tags(edit_fcn)


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
    if not changes:
        return

    if label_fields is None:
        label_fields = sample_collection._get_label_fields()

    tag_expr = _get_tag_expr(changes)
    edit_fcn = _get_tag_modifier(changes)

    for label_field in label_fields:
        tag_view = sample_collection.select_fields(label_field).filter_labels(
            label_field, tag_expr
        )
        tag_view._edit_label_tags(edit_fcn, label_fields=[label_field])


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


def _get_tag_expr(changes):
    tag_exprs = []
    for tag, add in changes.items():
        if add:
            # We need to tag objects that don't contain the tag
            tag_exprs.append(~F("tags").contains(tag))
        else:
            # We need to untag objects that do contain the tag
            tag_exprs.append(F("tags").contains(tag))

    if any(changes.values()):
        # If no tags exist, we'll always have to add
        tag_expr = F.any([F("tags") == None] + tag_exprs)
    else:
        # We're only deleting tags, so we skip objects with no tags
        tag_expr = (F("tags") != None) & F.any(tag_exprs)

    return tag_expr


def _get_tag_modifier(changes):
    def edit_tags(tags):
        if not tags:
            return [tag for (tag, add) in changes.items() if add]

        for tag, add in changes.items():
            if add and tag not in tags:
                tags = tags + [tag]
            elif not add and tag in tags:
                tags = [t for t in tags if t != tag]

        return tags

    return edit_tags
