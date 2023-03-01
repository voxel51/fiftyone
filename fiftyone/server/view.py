"""
FiftyOne Server view.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
import strawberry as gql
from typing import List, Optional

import fiftyone.core.collections as foc
import fiftyone.core.dataset as fod
from fiftyone.core.expressions import ViewField as F, VALUE
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.stages as fosg
import fiftyone.core.utils as fou
import fiftyone.core.view as fov

from fiftyone.server.aggregations import GroupElementFilter, SampleFilter
from fiftyone.server.scalars import BSONArray, JSON
import fiftyone.server.utils as fosu


_LABEL_TAGS = "_label_tags"


@gql.input
class ExtendedViewForm:
    filters: Optional[JSON] = None
    mixed: Optional[bool] = None
    sample_ids: Optional[List[str]] = None
    slice: Optional[str] = None


async def load_view(
    dataset_name: str,
    serialized_view: BSONArray,
    form: ExtendedViewForm,
    view_name: Optional[str] = None,
) -> foc.SampleCollection:
    def run() -> foc.SampleCollection:
        dataset = fod.load_dataset(dataset_name)
        dataset.reload()
        if view_name:
            return dataset.load_saved_view(view_name)
        else:
            view = get_view(
                dataset_name,
                stages=serialized_view,
                filters=form.filters,
                sample_filter=SampleFilter(
                    group=GroupElementFilter(slice=form.slice)
                ),
            )

            if form.sample_ids:
                view = fov.make_optimized_select_view(view, form.sample_ids)

            if form.mixed:
                view = view.select_group_slices(_allow_mixed=True)

            return view

    loop = asyncio.get_running_loop()

    return await loop.run_in_executor(None, run)


def get_view(
    dataset_name,
    view_name=None,
    stages=None,
    filters=None,
    count_label_tags=False,
    extended_stages=None,
    sample_filter=None,
    sort=False,
):
    """Gets the view defined by the given request parameters.

    Args:
        dataset_name: the dataset name
        view_name (None): the name of a saved view to load
        stages (None): an optional list of serialized
            :class:`fiftyone.core.stages.ViewStage` instances
        filters (None): an optional ``dict`` of App defined filters
        count_label_tags (False): whether to set the hidden ``_label_tags``
            field with counts of tags with respect to all label fields
        only_matches (True): whether to filter unmatches samples when filtering
            labels
        extended_stages (None): extended view stages
        sample_filter (None): an optional
            :class:`fiftyone.server.filters.SampleFilter`
        sort (False): whether to include sort extended stages

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    dataset = fod.load_dataset(dataset_name)
    dataset.reload()

    if view_name is not None:
        return dataset.load_saved_view(view_name)

    if stages:
        view = fov.DatasetView._build(dataset, stages)
    else:
        view = dataset.view()

    if sample_filter is not None:
        if sample_filter.group:
            if sample_filter.group.id:
                view = fov.make_optimized_select_view(
                    view, sample_filter.group.id, groups=True
                )
            if sample_filter.group.slice:
                view.group_slice = sample_filter.group.slice

        elif sample_filter.id:
            view = fov.make_optimized_select_view(view, sample_filter.id)

    if filters or extended_stages or count_label_tags:
        view = get_extended_view(
            view,
            filters,
            count_label_tags=count_label_tags,
            extended_stages=extended_stages,
            sort=sort,
        )

    return view


def get_extended_view(
    view,
    filters=None,
    count_label_tags=False,
    extended_stages=None,
    sort=False,
):
    """Create an extended view with the provided filters.

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        filters: an optional ``dict`` of App defined filters
        count_label_tags (False): whether to set the hidden ``_label_tags``
            field with counts of tags with respect to all label fields
        extended_stages (None): extended view stages
        sort (False): wheter to include sort extended stages

    The function returns a fiftyone.core.collections.SampleCollection
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
        )

        for stage in stages:
            view = view.add_stage(stage)

    if extended_stages:
        view = extend_view(view, extended_stages, sort)

    if count_label_tags:
        view = _add_labels_tags_counts(view, filtered_labels, label_tags)
        if cleanup_fields:
            view = view.mongo([{"$unset": field} for field in cleanup_fields])

    return view


def extend_view(view, extended_stages, sort):

    """If sorting conditions are met, it will the sorting of the sample based on the extended stages defined.
    Then add the stages to the view and return this modified view.
    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        extended_stages: extended view stages
        sort (False): wheter to include sort extended stages
    """

    for cls, d in extended_stages.items():
        kwargs = [[k, v] for k, v in d.items()]
        stage = fosg.ViewStage._from_dict({"_cls": cls, "kwargs": kwargs})
        if sort or not isinstance(stage, (fosg.SortBySimilarity, fosg.SortBy)):
            view = view.add_stage(stage)

    return view


def _add_labels_tags_counts(view, filtered_fields, label_tags):

    """This counts the number of items in the `_LABEL_TAGS` field and returns the modified view.
    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        filtered_fields: filtered fields
        label_tags: label tags
    """
    view = view.set_field(_LABEL_TAGS, [], _allow_missing=True)

    for path, field in fosu.iter_label_fields(view):
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

    """This returns a MongoDB expression that can be used to filter a view based on the field, path and provided filter(args)
    Args:
        field: a :class:`fiftyone.core.fields.Field`
        path: a :class:`str` representing the path to the field
        args: a :class:`dict` representing the filter arguments, usually with keys `values`, `exclude``
    """

    if not path:
        return _make_scalar_expression(F(), args, field)

    keys = path.split(".")
    rest = ".".join(keys[1:])
    field = field.get_field_schema()[keys[0]]
    if isinstance(field, fof.ListField) and not isinstance(
        field, fof.FrameSupportField
    ):
        new_field = field.field
        if args["exclude"]:
            # in ListField, exclude uses match(expr).length() == 0 instead of match(~expr), therefore, exclude needs to be set to False here to get the correct subexpr
            args["exclude"] = False
            expr = (
                lambda subexpr: F(field.db_field or field.name)
                .filter(subexpr)
                .length()
                == 0
            )
        else:
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
    view,
    filters,
    label_tags=None,
    hide_result=False,
):
    """This creates filter stages using the provided filters and label tags."""
    field_schema = view.get_field_schema()
    if view.media_type != fom.IMAGE:
        frame_field_schema = view.get_frame_field_schema()
    else:
        frame_field_schema = None

    tag_expr = (F("tags") != None).if_else(
        F("tags").contains(label_tags), None
    )
    cache = {}
    stages = []
    cleanup = set()
    filtered_labels = set()
    for path in sorted(filters):
        if path == "tags" or path.startswith("_"):
            continue

        args = filters[path]
        is_matching = args.get("isMatching", True)
        only_matches = args.get("onlyMatch", True)

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
            parent = field
            field = view.get_field(path)
            is_keypoints = issubclass(
                parent.document_type, (fol.Keypoint, fol.Keypoints)
            )
            is_list_field = isinstance(field, fof.ListField)

            if is_keypoints and is_list_field:
                expr = _make_keypoint_list_filter(args, view, path, field)
            else:
                key = field.db_field if field.db_field else field.name
                expr = _make_scalar_expression(
                    F(key), args, field, is_label=True
                )

            if expr is not None:
                if hide_result:
                    new_field = "__%s" % path.split(".")[1 if frames else 0]
                    if frames:
                        new_field = "%s%s" % (
                            view._FRAMES_PREFIX,
                            new_field,
                        )
                else:
                    new_field = None

                if is_keypoints:
                    if is_list_field:
                        stage = fosg.FilterKeypoints(
                            prefix + parent.name,
                            _new_field=new_field,
                            only_matches=only_matches,
                            **expr,
                        )
                    else:
                        _field = prefix + parent.name
                        _field = cache.get(_field, _field)

                        stage = fosg.FilterLabels(
                            _field,
                            expr,
                            only_matches=only_matches,
                            _new_field=new_field,
                        )
                elif is_matching:
                    _field = prefix + parent.name
                    _field = cache.get(_field, _field)

                    stage = fosg.MatchLabels(
                        fields=_field,
                        filter=expr,
                        bool=(not args["exclude"]),
                    )
                else:
                    _field = prefix + parent.name
                    _field = cache.get(_field, _field)

                    stage = fosg.FilterLabels(
                        _field,
                        expr,
                        only_matches=only_matches,
                        _new_field=new_field,
                    )

                stages.append(stage)
                filtered_labels.add(path)

                if new_field:
                    cache[prefix + parent.name] = new_field
                    cleanup.add(new_field)
        else:
            expr = _make_expression(view, path, args)
            if expr is not None:
                stages.append(fosg.Match(expr))

    if label_tags is not None and hide_result:
        for path, _ in fosu.iter_label_fields(view):
            if hide_result:
                new_field = _get_filtered_path(
                    view, path, filtered_labels, label_tags
                )
            else:
                new_field = None

            stages.append(
                fosg.FilterLabels(
                    cache.get(path, path),
                    tag_expr,
                    only_matches=False,
                    _new_field=new_field,
                )
            )
            if new_field:
                cache[path] = new_field
                cleanup.add(new_field)

        match_exprs = []
        for path, _ in fosu.iter_label_fields(view):
            match_exprs.append(
                fosg._get_label_field_only_matches_expr(
                    view,
                    cache.get(path, path),
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


def _make_scalar_expression(f, args, field, list_field=False, is_label=False):
    expr = None

    is_matching = args.get("isMatching", False)
    if isinstance(field, fof.ListField):
        expr = f.filter(
            _make_scalar_expression(F(), args, field.field, list_field=True)
        ).length()
        return expr == 0 if args["exclude"] else expr > 0
    elif isinstance(field, fof.BooleanField):
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

        # list_field handles exclude separately
        if exclude and not (is_label and is_matching) and not list_field:
            # pylint: disable=invalid-unary-operand-type
            expr = ~expr

        if none and not (is_label and is_matching) and not list_field:
            if exclude:
                expr &= f.exists()
            else:
                expr |= ~(f.exists())

        return expr

    return _apply_others(expr, f, args, is_label)


def _make_keypoint_list_filter(args, view, path, field):
    name = path.split(".", 1)[0]

    if path.endswith(".points"):
        dataset = view._dataset
        if name in dataset.skeletons:
            skeleton = dataset.skeletons[name]
        else:
            skeleton = dataset.default_skeleton

        values = args.get("values", [])
        if args["exclude"]:
            values = list(set(skeleton.labels).difference(values))

        return {"labels": values}

    if isinstance(field.field, fof.BooleanField):
        true, false = args["true"], args["false"]
        f = F(name)
        if true and false:
            expr = f.is_in([True, False])

        if not true and false:
            expr = f == False

        if true and not false:
            expr = f == True

        if not true and not false:
            expr = (f != True) & (f != False)

        return {"filter": expr}

    if isinstance(field.field, (fof.FloatField, fof.IntField)):
        f = F(name)
        mn, mx = args["range"]
        expr = (f >= mn) & (f <= mx)
        if args["exclude"]:
            expr = ~expr

        return {"filter": expr}


def _apply_others(expr, f, args, is_label):
    is_matching = args.get("isMatching", False)
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

    if (
        "exclude" in args
        and args["exclude"]
        and not (is_matching and is_label)
    ):
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
