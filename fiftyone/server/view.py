"""
FiftyOne Server view.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import List, Optional

from bson import ObjectId
import strawberry as gql

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
        if view_name:
            view = dataset.load_saved_view(view_name)
            if serialized_view:
                for stage in serialized_view:
                    view.add_stage(fosg.ViewStage._from_dict(stage))
        else:
            view = get_view(
                dataset_name,
                stages=serialized_view,
                filters=form.filters,
                sample_filter=SampleFilter(
                    group=GroupElementFilter(
                        slices=[form.slice] if form.slice else None
                    )
                ),
            )

            if form.sample_ids:
                view = fov.make_optimized_select_view(view, form.sample_ids)

            if form.mixed:
                view = view.select_group_slices(_allow_mixed=True)

            return view

    return await fou.run_sync_task(run)


def get_view(
    dataset_name,
    view_name=None,
    stages=None,
    filters=None,
    pagination_data=False,
    count_label_tags=False,
    extended_stages=None,
    sample_filter=None,
    reload=True,
):
    """Gets the view defined by the given request parameters.

    Args:
        dataset_name: the dataset name
        view_name (None): the name of a saved view to load
        stages (None): an optional list of serialized
            :class:`fiftyone.core.stages.ViewStage` instances
        filters (None): an optional ``dict`` of App defined filters
        count_label_tags (False): whether to includes hidden ``_label_tags``
            counts on sample documents
        pagination_data (False): whether process samples as pagination data
            - excludes all :class:`fiftyone.core.fields.DictField` values
            - filters label fields
        only_matches (True): whether to filter unmatches samples when filtering
            labels
        extended_stages (None): extended view stages
        sample_filter (None): an optional
            :class:`fiftyone.server.filters.SampleFilter`
        reload (None): whether to reload the dataset

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    dataset = fod.load_dataset(dataset_name)

    if reload:
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
            if sample_filter.group.slices:
                view = view.select_group_slices(sample_filter.group.slices)

        elif sample_filter.id:
            view = fov.make_optimized_select_view(view, sample_filter.id)

    # omit all dict field values for performance, not needed by grid
    if pagination_data:
        excluded = [
            path
            for path, field in view.get_field_schema(flat=True).items()
            if isinstance(field, fof.DictField)
        ]
        view = view.select_fields(
            [
                path
                for path in view.get_field_schema(flat=True)
                if all(not path.startswith(exclude) for exclude in excluded)
            ]
        )

    if filters or extended_stages:
        view = get_extended_view(
            view,
            filters,
            count_label_tags=count_label_tags,
            pagination_data=pagination_data,
            extended_stages=extended_stages,
        )

    return view


def get_extended_view(
    view,
    filters=None,
    count_label_tags=False,
    extended_stages=None,
    pagination_data=False,
):
    """Create an extended view with the provided filters.

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        filters: an optional ``dict`` of App defined filters
        count_label_tags (False): whether to set the hidden ``_label_tags``
            field with counts of tags with respect to all label fields
        extended_stages (None): extended view stages
        pagination_data (False): filters label data

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    label_tags = None

    if extended_stages:
        view = extend_view(view, extended_stages)

    if filters:
        if "tags" in filters:
            tags = filters.get("tags")
            exclude = tags["exclude"]
            tags = tags["values"]

            if tags and not exclude:
                view = view.match_tags(tags)

            if tags and exclude:
                view = view.match_tags(tags, bool=False)

        if _LABEL_TAGS in filters:
            label_tags = filters.get(_LABEL_TAGS)
            label_fields = [path for path in view._get_label_fields()]

            if (
                not count_label_tags
                and label_tags
                and not label_tags["exclude"]
                and not label_tags["isMatching"]
            ):
                view = view.select_labels(
                    tags=label_tags["values"],
                    fields=label_fields,
                )

            if (
                not count_label_tags
                and label_tags
                and label_tags["exclude"]
                and not label_tags["isMatching"]
            ):
                view = view.exclude_labels(
                    tags=label_tags["values"],
                    omit_empty=False,
                    fields=label_fields,
                )

            if (
                not count_label_tags
                and label_tags
                and not label_tags["exclude"]
                and label_tags["isMatching"]
            ):
                view = view.match_labels(
                    tags=label_tags["values"], fields=label_fields
                )

            if (
                not count_label_tags
                and label_tags
                and label_tags["exclude"]
                and label_tags["isMatching"]
            ):
                view = view.match_labels(
                    tags=label_tags["values"],
                    bool=False,
                    fields=label_fields,
                )

        stages = _make_filter_stages(
            view,
            filters,
            label_tags=label_tags,
            count_label_tags=count_label_tags,
            pagination_data=pagination_data,
        )

        for stage in stages:
            view = view.add_stage(stage)

    if count_label_tags:
        view = _add_labels_tags_counts(view, label_tags)

    return view


def extend_view(view, extended_stages):
    """Adds the given extended stages to the view.

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        extended_stages: an extended stages dict

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    for _cls, d in extended_stages.items():
        kwargs = [[k, v] for k, v in d.items()]
        stage = fosg.ViewStage._from_dict({"_cls": _cls, "kwargs": kwargs})
        view = view.add_stage(stage)

    return view


def _add_labels_tags_counts(view, label_tags):
    """Adds stages necessary to count label tags to the view.

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        label_tags: label tags

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    view = view.set_field(_LABEL_TAGS, [], _allow_missing=True)

    for path, field in foc._iter_label_fields(view):
        if isinstance(field, fof.ListField) or (
            isinstance(field, fof.EmbeddedDocumentField)
            and issubclass(field.document_type, fol._HasLabelList)
        ):
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
    view,
    filters,
    label_tags=None,
    count_label_tags=False,
    pagination_data=False,
):
    stages = []
    queries = []
    for path, field, prefix, args in _iter_paths(view, filters):
        is_matching = args.get("isMatching", True)
        only_matches = args.get("onlyMatch", True)

        is_label_field = _is_label(field)
        if is_label_field and issubclass(
            field.document_type, (fol.Keypoint, fol.Keypoints)
        ):
            continue

        if not is_label_field or (is_matching or only_matches):
            queries.append(_make_query(path, view.get_field(path), args))

    if queries:
        stages.append(fosg.Match({"$and": queries}))

    stages += _match_label_tags(view, label_tags, count_label_tags)
    for path, field, prefix, args in _iter_paths(view, filters):
        is_matching = args.get("isMatching", True)
        only_matches = args.get("onlyMatch", True)

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

            if expr is None:
                continue

            if is_keypoints:
                if is_list_field:
                    stages.append(
                        fosg.FilterKeypoints(
                            prefix + parent.name,
                            only_matches=only_matches,
                            **expr,
                        )
                    )
                else:
                    stages.append(
                        fosg.FilterLabels(
                            prefix + parent.name,
                            expr,
                            only_matches=only_matches,
                        )
                    )

            if not is_matching and (pagination_data or not count_label_tags):
                stages.append(
                    fosg.FilterLabels(
                        prefix + parent.name,
                        expr,
                        only_matches=False,
                    )
                )

    return stages


def _iter_paths(view, filters):
    field_schema = view.get_field_schema()
    if view.media_type != fom.IMAGE:
        frame_field_schema = view.get_frame_field_schema()
    else:
        frame_field_schema = None

    for path in sorted(filters):
        if path == "tags" or path.startswith("_"):
            continue

        args = filters[path]
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

        yield path, field, prefix, args


def _match_label_tags(view, label_tags, count_label_tags):
    label_tags_values = (
        label_tags["values"] if label_tags is not None else None
    )
    label_tags_exclude = (
        label_tags["exclude"] if label_tags is not None else None
    )
    label_tags_is_matching = (
        label_tags["isMatching"] if label_tags is not None else None
    )

    tag_expr = (F("tags") != None).if_else(
        F("tags").contains(label_tags_values), None
    )

    tag_expr = (
        ~tag_expr
        if label_tags_exclude and not label_tags_is_matching
        else tag_expr
    )

    stages = []
    if label_tags is not None and count_label_tags:
        is_matching = label_tags.get("isMatching", False)
        exclude = label_tags.get("exclude", False)

        for path in view._get_label_fields():
            stages.append(
                fosg.FilterLabels(
                    path,
                    tag_expr,
                    only_matches=False,
                )
            )

        match_exprs = []
        for path in view._get_label_fields():
            expr = fosg._get_label_field_only_matches_expr(
                view,
                path,
            )
            if exclude and is_matching:
                # pylint: disable=invalid-unary-operand-type
                expr = ~expr

            match_exprs.append(expr)

        if match_exprs:
            matcher = F.all if exclude else F.any
            stages.append(fosg.Match(matcher(match_exprs)))

    return stages


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


def _make_query(path, field, args):
    if isinstance(field, fof.ListField):
        field = field.field

    if isinstance(
        field, (fof.DateField, fof.DateTimeField, fof.FloatField, fof.IntField)
    ):
        mn, mx = args["range"]
        if isinstance(field, (fof.DateField, fof.DateTimeField)):
            mn, mx = [fou.timestamp_to_datetime(d) for d in args["range"]]

        if args["exclude"]:
            return {
                "$or": [
                    {path: {"$lt": mn}},
                    {path: {"$gt": mx}},
                ]
            }

        return {
            "$and": [
                {path: {"$gte": mn}},
                {path: {"$lte": mx}},
            ]
        }

    values = args["values"]
    if isinstance(field, fof.ObjectIdField):
        values = list(map(lambda v: ObjectId(v), args["values"]))

    if isinstance(field, (fof.ObjectIdField, fof.StringField)):
        return {path: {"$nin" if args["exclude"] else "$in": values}}

    if isinstance(field, fof.BooleanField):
        true, false = args["true"], args["false"]
        if true and false:
            return {
                path: {"$nin" if args["exclude"] else "$in": [True, False]}
            }

        if not true and false:
            return {path: {"$neq" if args["exclude"] else "$eq": False}}

        if true and not false:
            return {path: {"$neq" if args["exclude"] else "$eq": True}}

        if not true and not false:
            return {
                path: {"$in" if args["exclude"] else "$nin": [True, False]}
            }

    raise ValueError("unexpected filter")


def _make_scalar_expression(f, args, field, list_field=False, is_label=False):
    expr = None
    if _is_support(field):
        mn, mx = args["range"]
        expr = (f[0] >= mn) & (f[1] <= mx)
    elif isinstance(field, fof.ListField):
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

        if none and not is_label and not list_field:
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

    if isinstance(field.field, (fof.StringField)):
        f = F(name)
        if "values" in args:
            val = args["values"]
            expr = f.is_in(val)
            if args["exclude"]:
                expr = ~expr

            return {"filter": expr}

    raise ValueError(f"Filtering {field} keypoint fields is not supported")


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
    if label_tags is not None:
        excludes = label_tags.get("exclude", None)
        label_tags = label_tags.get("values", None)
    else:
        excludes = None

    if path not in filtered_fields and not label_tags and not excludes:
        return path

    if path.startswith(view._FRAMES_PREFIX):
        return "%s___%s" % (view._FRAMES_PREFIX, path.split(".")[1])

    return "___%s" % path


def _add_frame_labels_tags(path, field, view):
    path = path[len("frames.") :]
    items = path
    if isinstance(field, fof.ListField):
        field = field.field

    if issubclass(field.document_type, fol._HasLabelList):
        items = "%s.%s" % (path, field.document_type._LABEL_LIST_FIELD)

    reduce = F(items).reduce(VALUE.extend(F("tags")), [])
    view = view.set_field(
        _LABEL_TAGS,
        F(_LABEL_TAGS).extend(
            F("frames").reduce(
                VALUE.extend(F(items).exists().if_else(reduce, [])),
                [],
            )
        ),
        _allow_missing=True,
    )
    return view


def _add_frame_label_tags(path, field, view):
    path = path[len("frames.") :]
    tags = "%s.tags" % path
    view = view.set_field(
        _LABEL_TAGS,
        F(_LABEL_TAGS).extend(
            F("frames").reduce(
                VALUE.extend((F(tags) != None).if_else(F(tags), [])), []
            )
        ),
        _allow_missing=True,
    )
    return view


def _add_labels_tags(path, field, view):
    items = path
    if isinstance(field, fof.ListField):
        field = field.field

    if issubclass(field.document_type, fol._HasLabelList):
        items = "%s.%s" % (path, field.document_type._LABEL_LIST_FIELD)

    view = view.set_field(
        _LABEL_TAGS,
        F(path)
        .exists()
        .if_else(
            F(_LABEL_TAGS).extend(
                F(items).reduce(VALUE.extend(F("tags")), [])
            ),
            F(_LABEL_TAGS),
        ),
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
