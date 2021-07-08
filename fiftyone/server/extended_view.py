"""
FiftyOne extended view.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.core.expressions import ViewField as F, VALUE
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.stages as fosg
import fiftyone.core.state as fos


_BOOL_FILTER = "bool"
_NUMERIC_FILTER = "numeric"
_STR_FILTER = "str"

_LABEL_TAGS = "_label_tags"


def get_view_field(fields_map, path):
    """Returns the proper view field, even for special paths like "id"

    Returns:
        :class:`fiftyone.core.expressions.ViewField`
    """
    if path in fields_map:
        return F(fields_map[path]).to_string()

    return F(path)


def get_extended_view(view, filters, match=False, count_label_tags=False):
    """Create an extended view with the provided filters.

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        filters: a `dict` of App defined filters
        match: whether to match instead of filter
        count_labels_tags (False): whether to set the hideen `_label_tags` field
            with counts of tags with respect to all label fields
    """
    label_tags = None
    if filters is None or not filters:
        return view

    if "tags" in filters:
        tags = filters.get("tags")
        if "label" in tags:
            label_tags = tags["label"]

        if label_tags:
            view = view.select_labels(tags=label_tags)

        if "sample" in tags:
            view = view.match_tags(tags=tags["sample"])

    stages = _make_filter_stages(view, filters, match=match)

    for stage in stages:
        view = view.add_stage(stage)

    if count_label_tags:
        view = _add_labels_tags_counts(view)

    return view


def _add_labels_tags_counts(view):
    fields = fos.DatasetStatistics.labels(view)
    view = view.set_field(_LABEL_TAGS, [], _allow_missing=True)
    for path, field in fields:
        if not issubclass(
            field.document_type, (fol._HasID, fol._HasLabelList)
        ):
            continue

        if issubclass(field.document_type, fol._HasLabelList):
            if path.startswith(view._FRAMES_PREFIX):
                add_tags = _add_frame_labels_tags
            else:
                add_tags = _add_labels_tags
        else:
            if path.startswith(view._FRAMES_PREFIX):
                add_tags = _add_frame_label_tags
            else:
                add_tags = _add_label_tags

        view = add_tags(path, field, view)

    view = _count_list_items(_LABEL_TAGS, view)

    return view


def _make_filter_stages(view, filters, match=False):
    field_schema = view.get_field_schema()
    if view.media_type == fom.VIDEO:
        frame_field_schema = view.get_frame_field_schema()
    else:
        frame_field_schema = None

    stages = []
    fields_map = view._get_db_fields_map()
    for path, args in filters.items():
        if path == "tags":
            continue

        keys = path.split(".")
        frames = path.startswith(view._FRAMES_PREFIX)
        if frames:
            schema = frame_field_schema
            field = schema[keys[1]]
            path = ".".join(keys[:2])
        else:
            schema = field_schema
            path = keys[0]
            field = schema[path]

        if isinstance(field, fof.EmbeddedDocumentField):
            expr = _make_scalar_expression(F(keys[-1]), args)
            if expr is not None:
                if match:
                    stage = fosg.MatchLabels(fields=path, filter=expr)
                else:
                    stage = fosg.FilterLabels(path, expr)

                stages.append(stage)

        else:
            view_field = get_view_field(fields_map, path)
            expr = _make_scalar_expression(view_field, args)
            if expr is not None:
                stages.append(fosg.Match(expr))

    return stages


def _make_scalar_expression(f, args):
    expr = None
    cls = args["_CLS"]
    if cls == _BOOL_FILTER:
        true, false = args["true"], args["false"]
        if true and false:
            expr = f.is_in([True, False])

        if not true and false:
            expr = f == False

        if true and not false:
            expr = f == True

        if not true and not false:
            expr = (f != True) & (f != False)

    elif cls == _NUMERIC_FILTER:
        mn, mx = args["range"]
        expr = (f >= mn) & (f <= mx)
    elif cls == _STR_FILTER:
        values = args["values"]
        if not values:
            return None

        none = any(map(lambda v: v is None, values))
        values = filter(lambda v: v is not None, values)
        expr = f.is_in(values)
        exclude = args["exclude"]

        if exclude:
            # pylint: disable=invalid-unary-operand-type
            expr = ~expr

        if none:
            if exclude:
                expr &= f.exists()
            else:
                expr |= ~(f.exists())

        return expr

    none = args["none"]
    if not none:
        if expr is not None:
            expr &= f.exists()
        else:
            expr = f.exists()
    elif expr is not None:
        expr |= ~(f.exists())

    return expr


def _add_frame_labels_tags(path, field, view):
    frames, path = path.split(".")
    items = "%s.%s" % (path, field.document_type._LABEL_LIST_FIELD)
    view = view.set_field(
        _LABEL_TAGS,
        F(_LABEL_TAGS).extend(
            F(frames).reduce(
                VALUE.extend(F(items).reduce(VALUE.extend(F("tags")), [])), []
            )
        ),
        _allow_missing=True,
    )
    return view


def _add_frame_label_tags(path, field, view):
    frames, path = path.split(".")
    tags = "%s.tags" % path
    view = view.set_field(
        _LABEL_TAGS,
        F(_LABEL_TAGS).extend(
            F(frames).reduce(
                VALUE.extend((F(tags) != None).if_else(F(tags), [])), []
            )
        ),
        _allow_missing=True,
    )
    return view


def _add_labels_tags(path, field, view):
    items = "%s.%s" % (path, field.document_type._LABEL_LIST_FIELD)
    view = view.set_field(
        _LABEL_TAGS,
        F(_LABEL_TAGS).extend(F(items).reduce(VALUE.extend(F("tags")), [])),
        _allow_missing=True,
    )
    return view


def _add_label_tags(path, field, view):
    tags = "%s.tags" % path
    return view.set_field(
        _LABEL_TAGS,
        F(_LABEL_TAGS).extend((F(tags) != None).if_else(F(tags), [])),
        _allow_missing=True,
    )


def _count_list_items(path, view):
    function = (
        "function(items) {"
        "let counts = {};"
        "items && items.forEach((i) => {"
        "counts[i] = 1 + (counts[i] || 0);"
        "});"
        "return counts;"
        "}"
    )

    return view.set_field(
        path, F(path)._function(function), _allow_missing=True
    )
