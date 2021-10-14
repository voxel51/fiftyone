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
import fiftyone.core.utils as fou


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


def get_extended_view(
    view, filters, count_labels_tags=False, only_matches=True
):
    """Create an extended view with the provided filters.
    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        filters: a `dict` of App defined filters
        count_labels_tags (False): whether to set the hidden `_label_tags` field
            with counts of tags with respect to all label fields
        only_matches (True): whether to filter unmatches samples when filtering
            labels
    """
    cleanup_fields = set()
    filtered_labels = set()

    label_tags = None
    if filters is not None and len(filters):
        if "tags" in filters:
            tags = filters.get("tags")
            if "label" in tags:
                label_tags = tags["label"]

            if not count_labels_tags and label_tags:
                view = view.select_labels(tags=label_tags)

            if "sample" in tags:
                view = view.match_tags(tags=tags["sample"])

        stages, cleanup_fields, filtered_labels = _make_filter_stages(
            view,
            filters,
            label_tags=label_tags,
            hide_result=count_labels_tags,
            only_matches=only_matches,
        )

        for stage in stages:
            view = view.add_stage(stage)

    if count_labels_tags:
        view = _add_labels_tags_counts(view, filtered_labels, label_tags)
        if cleanup_fields:
            view = view.mongo([{"$unset": field} for field in cleanup_fields])

    return view


def _add_labels_tags_counts(view, filtered_fields, label_tags):
    fields = fos.DatasetStatistics.labels(view)
    view = view.set_field(_LABEL_TAGS, [], _allow_missing=True)
    for path, field in fields:
        if not issubclass(
            field.document_type, (fol._HasID, fol._HasLabelList)
        ):
            continue

        path = _get_filtered_path(view, path, filtered_fields, label_tags)
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


def _make_filter_stages(
    view, filters, label_tags=None, hide_result=False, only_matches=True
):
    field_schema = view.get_field_schema()
    if view.media_type == fom.VIDEO:
        frame_field_schema = view.get_frame_field_schema()
    else:
        frame_field_schema = None

    tag_expr = (F("tags") != None).if_else(
        F("tags").contains(label_tags), None
    )

    stages = []
    cleanup = set()
    filtered_labels = set()
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
            expr = _make_scalar_expression(F(keys[-1]), args, field)
            if expr is not None:
                if hide_result:
                    new_field = "__%s" % path.split(".")[0]
                    if frames:
                        new_field = "%s%s" % (view._FRAMES_PREFIX, new_field,)
                else:
                    new_field = None
                stages.append(
                    fosg.FilterLabels(
                        path,
                        expr,
                        _new_field=new_field,
                        only_matches=only_matches,
                    )
                )

                filtered_labels.add(path)
                if new_field:
                    cleanup.add(new_field)
        else:
            view_field = get_view_field(fields_map, path)

            if isinstance(field, fof.ListField) and not isinstance(
                field, fof.FrameSupportField
            ):
                filter = _make_scalar_expression(F(), args, field.field)
                if filter is not None:
                    expr = view_field.filter(filter).length() > 0
            else:
                expr = _make_scalar_expression(view_field, args, field)

            if expr is not None:
                stages.append(fosg.Match(expr))

    if label_tags is not None and hide_result:
        for path, _ in fos.DatasetStatistics.labels(view):
            if hide_result and path not in filtered_labels:
                new_field = _get_filtered_path(
                    view, path, filtered_labels, label_tags
                )
            else:
                new_field = None

            if path in filtered_labels:
                prefix = "__"
            else:
                prefix = ""

            stages.append(
                fosg.FilterLabels(
                    path,
                    tag_expr,
                    only_matches=False,
                    _new_field=new_field,
                    _prefix=prefix,
                )
            )
            if new_field:
                cleanup.add(new_field)

        match_exprs = []
        for path, _ in fos.DatasetStatistics.labels(view):
            prefix = "__" if hide_result else ""
            match_exprs.append(
                fosg._get_label_field_only_matches_expr(
                    view, path, prefix=prefix
                )
            )

        stages.append(fosg.Match(F.any(match_exprs)))

    return stages, cleanup, filtered_labels


def _is_support(field):
    if isinstance(field, fof.FrameSupportField):
        return True

    if isinstance(field, fof.EmbeddedDocumentField):
        if field.document_type in (
            fol.TemporalDetection,
            fol.TemporalDetections,
        ):
            return True

    return False


def _is_datetime(field):
    return isinstance(field, (fof.DateField, fof.DateTimeField))


def _make_scalar_expression(f, args, field):
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

    elif cls == _NUMERIC_FILTER and _is_support(field):
        mn, mx = args["range"]
        expr = (f[0] >= mn) & (f[1] <= mx)
    elif cls == _NUMERIC_FILTER and _is_datetime(field):
        mn, mx = args["range"]
        p = fou.timestamp_to_datetime
        expr = (f >= p(mn)) & (f <= p(mx))
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


def _get_filtered_path(view, path, filtered_fields, label_tags):
    if path not in filtered_fields and not label_tags:
        return path

    if path.startswith(view._FRAMES_PREFIX):
        return "%s__%s" % (view._FRAMES_PREFIX, path.split(".")[1])

    return "__%s" % path


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
