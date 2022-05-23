"""
FiftyOne Server view

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from numpy import full
import fiftyone.core.dataset as fod
from fiftyone.core.expressions import ViewField as F, VALUE
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.stages as fosg
import fiftyone.core.utils as fou
import fiftyone.core.view as fov

from fiftyone.server.utils import iter_label_fields


_LABEL_TAGS = "_label_tags"


def get_view(
    dataset_name,
    stages=None,
    filters=None,
    count_label_tags=False,
    only_matches=True,
    similarity=None,
):
    """Get the view from request paramters

    Args:
        dataset_names: the dataset name
        stages (None): an optional list of serialized
            :class:`fiftyone.core.stages.ViewStage`s
        filters (None): an optional `dict` of App defined filters
        count_label_tags (False): whether to set the hidden `_label_tags` field
            with counts of tags with respect to all label fields
        only_matches (True): whether to filter unmatches samples when filtering
            labels
        similarity (None): sort by similarity paramters
    """
    view = fod.load_dataset(dataset_name)

    if stages:
        view = fov.DatasetView._build(view, stages)

    if filters or similarity or count_label_tags:
        view = get_extended_view(
            view,
            filters,
            count_label_tags=count_label_tags,
            only_matches=only_matches,
            similarity=similarity,
        )

    return view


def get_extended_view(
    view,
    filters=None,
    count_label_tags=False,
    only_matches=True,
    similarity=None,
):
    """Create an extended view with the provided filters.

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        filters: an optional `dict` of App defined filters
        count_label_tags (False): whether to set the hidden `_label_tags` field
            with counts of tags with respect to all label fields
        only_matches (True): whether to filter unmatches samples when filtering
            labels
        similarity (None): sort by similarity paramters
    """
    cleanup_fields = set()
    filtered_labels = set()

    label_tags = None
    if filters is not None and len(filters):
        if "tags" in filters:
            tags = filters.get("tags")
            if "label" in tags:
                label_tags = tags["label"]

            if not count_label_tags and label_tags:
                view = view.select_labels(tags=label_tags)

            if "sample" in tags:
                view = view.match_tags(tags=tags["sample"])

        stages, cleanup_fields, filtered_labels = _make_filter_stages(
            view,
            filters,
            label_tags=label_tags,
            hide_result=count_label_tags,
            only_matches=only_matches,
        )

        for stage in stages:
            view = view.add_stage(stage)

    if similarity:
        view = view.sort_by_similarity(**similarity)

    if count_label_tags:
        view = _add_labels_tags_counts(view, filtered_labels, label_tags)
        if cleanup_fields:
            view = view.mongo([{"$unset": field} for field in cleanup_fields])

    return view


def _add_labels_tags_counts(view, filtered_fields, label_tags):
    view = view.set_field(_LABEL_TAGS, [], _allow_missing=True)

    for path, field in iter_label_fields(view):
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


def _make_expression(field, path, args):
    if not path:
        return _make_scalar_expression(F(), args, field)

    keys = path.split(".")
    rest = ".".join(keys[1:])
    field = field.get_field_schema()[keys[0]]
    if isinstance(field, fof.ListField) and not isinstance(
        field, fof.FrameSupportField
    ):
        new_field = field.field
        expr = (
            lambda subexpr: F(field.db_field or field.name)
            .filter(subexpr)
            .length()
            > 0
        )
    else:
        new_field = field
        expr = lambda subexpr: F(field.db_field or field.name).apply(subexpr)

    subexpr = _make_expression(new_field, rest, args)
    if subexpr is not None:
        return expr(subexpr)

    return None


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
    for path, args in filters.items():
        if path == "tags" or path.startswith("_"):
            continue

        frames = path.startswith(view._FRAMES_PREFIX)
        keys = path.split(".")
        if frames:
            field = frame_field_schema[keys[1]]
            keys = keys[2:]
            prefix = "frames."
        else:
            field = field_schema[keys[0]]
            keys = keys[1:]
            prefix = ""

        if _is_label(field):
            keypoints = issubclass(
                field.document_type, (fol.Keypoint, fol.Keypoints)
            )

            if keypoints:
                if path.endswith(".id") or path.endswith(".label"):
                    keypoints = False

            parent = field
            field = view.get_field(path)
            key = field.db_field if field.db_field else field.name
            view_field = F(key)
            expr = (
                _make_keypoint_kwargs(
                    args,
                    view,
                    path if path.endswith(".points") else None,
                )
                if keypoints
                else _make_scalar_expression(view_field, args, field)
            )
            if expr is not None:
                if hide_result:
                    new_field = "__%s" % path.split(".")[-1]
                    if frames:
                        new_field = "%s%s" % (
                            view._FRAMES_PREFIX,
                            new_field,
                        )
                else:
                    new_field = None

                if keypoints:
                    stage = fosg.FilterKeypoints(
                        prefix + parent.name,
                        _new_field=new_field,
                        **expr,
                    )
                else:
                    stage = fosg.FilterLabels(
                        prefix + parent.name,
                        expr,
                        _new_field=new_field,
                        only_matches=only_matches,
                    )

                stages.append(stage)
                filtered_labels.add(path)
                if new_field:
                    cleanup.add(new_field)
        else:
            expr = _make_expression(view, path, args)
            if expr is not None:
                stages.append(fosg.Match(expr))

    if label_tags is not None and hide_result:
        for path, _ in iter_label_fields(view):
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
        for path, _ in iter_label_fields(view):
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


def _is_label(field):
    return isinstance(field, fof.EmbeddedDocumentField) and issubclass(
        field.document_type, fol.Label
    )


def _make_scalar_expression(f, args, field):
    expr = None
    if isinstance(field, fof.BooleanField):
        true, false = args["true"], args["false"]
        if true and false:
            expr = f.is_in([True, False])

        if not true and false:
            expr = f == False

        if true and not false:
            expr = f == True

        if not true and not false:
            expr = (f != True) & (f != False)

    elif _is_support(field):
        mn, mx = args["range"]
        expr = (f[0] >= mn) & (f[1] <= mx)
    elif _is_datetime(field):
        mn, mx = args["range"]
        p = fou.timestamp_to_datetime
        expr = (f >= p(mn)) & (f <= p(mx))
    elif isinstance(field, (fof.FloatField, fof.IntField)):
        mn, mx = args["range"]
        expr = (f >= mn) & (f <= mx)
    else:
        values = args["values"]
        if not values:
            return None

        if isinstance(field, fof.ObjectIdField):
            f = f.to_string()

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

    return _apply_others(expr, f, args)


def _make_keypoint_kwargs(args, view, points):
    if points:
        ske = view._dataset.default_skeleton
        name = points.split(".")[0]

        if name in view._dataset.skeletons:
            ske = view._dataset.skeletons[name]

        values = args.get("values", [])
        if args["exclude"]:
            values = set(ske.labels).difference(values)

        return {"labels": values}

    f = F("confidence")
    mn, mx = args["range"]
    return {"filter": (f >= mn) & (f <= mx)}


def _apply_others(expr, f, args):
    nonfinites = {
        "nan": float("nan"),
        "ninf": -float("inf"),
        "inf": float("inf"),
    }
    include = []
    for k, v in nonfinites.items():
        if k in args and args[k]:
            include.append(v)

    if expr is None:
        expr = f.is_in(include)
    else:
        expr |= f.is_in(include)

    if "none" in args:
        expr = _apply_none(expr, f, args["none"])

    if "exclude" in args and args["exclude"]:
        # pylint: disable=invalid-unary-operand-type
        expr = ~expr

    return expr


def _apply_none(expr, f, none):
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
