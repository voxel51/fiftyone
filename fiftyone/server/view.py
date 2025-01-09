"""
FiftyOne Server view.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import List, Optional, Tuple

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

from fiftyone.server.filters import GroupElementFilter, SampleFilter
from fiftyone.server.scalars import BSONArray, JSON


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
                    group=GroupElementFilter(slice=form.slice)
                ),
            )

            if form.sample_ids:
                view = fov.make_optimized_select_view(view, form.sample_ids)

            if form.mixed and view.media_type == fom.GROUP:
                view = view.select_group_slices(_force_mixed=True)
                view = get_extended_view(view, form.filters)

            return view

    return await fou.run_sync_task(run)


def get_view(
    dataset,
    view_name=None,
    stages=None,
    filters=None,
    pagination_data=False,
    extended_stages=None,
    sample_filter=None,
    reload=True,
    awaitable=False,
):
    """Gets the view defined by the given request parameters.

    Args:
        dataset: the dataset name or :class:`fiftyone.core.dataset.Dataset`
            instance
        view_name (None): the name of a saved view to load
        stages (None): an optional list of serialized
            :class:`fiftyone.core.stages.ViewStage` instances
        filters (None): an optional ``dict`` of App defined filters
        pagination_data (False): whether process samples as pagination data
            - excludes all :class:`fiftyone.core.fields.DictField` values
            - filters label fields
        extended_stages (None): extended view stages
        sample_filter (None): an optional
            :class:`fiftyone.server.filters.SampleFilter`
        reload (True): whether to reload the dataset
        awaitable (False): whether to return an awaitable coroutine

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """

    def run(dataset, stages):
        if isinstance(dataset, str):
            dataset = fod.load_dataset(dataset)

        if reload:
            dataset.reload()

        if view_name is not None:
            return dataset.load_saved_view(view_name)

        if stages:
            view = fov.DatasetView._build(dataset, stages)
        else:
            view = dataset.view()

        media_types = None
        if sample_filter is not None:
            if sample_filter.group:
                view, media_types = handle_group_filter(
                    dataset, view, sample_filter.group
                )

            elif sample_filter.id:
                view = fov.make_optimized_select_view(view, sample_filter.id)

        if filters or extended_stages or pagination_data:
            view = get_extended_view(
                view,
                filters,
                pagination_data=pagination_data,
                extended_stages=extended_stages,
                media_types=media_types,
            )

        return view

    if awaitable:
        return fou.run_sync_task(run, dataset, stages)

    return run(dataset, stages)


def get_extended_view(
    view,
    filters=None,
    extended_stages=None,
    pagination_data=False,
    media_types=None,
):
    """Create an extended view with the provided filters.

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        filters: an optional ``dict`` of App defined filters
        extended_stages (None): extended view stages
        pagination_data (False): filters label data
        media_types (None): the media types to consider

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    label_tags = None

    if extended_stages:
        # extend view with similarity search, etc. first
        view = extend_view(view, extended_stages)

    if pagination_data:
        # omit all dict field values for performance, not needed by grid
        view = _project_pagination_paths(view, media_types)

    if filters:
        if "tags" in filters:
            tags = filters.get("tags")
            exclude = tags["exclude"]
            tags = tags["values"]

            if tags and not exclude:
                view = view.match_tags(tags)

            if tags and exclude:
                view = view.match_tags(tags, bool=False)

        label_tags = filters.get(_LABEL_TAGS, None)
        if label_tags:
            view = _match_label_tags(view, label_tags)

        match_stage = _make_match_stage(view, filters)
        stages = []
        if match_stage:
            stages = [match_stage]

        stages.extend(_make_field_filter_stages(view, filters))
        stages.extend(_make_label_filter_stages(view, filters))

        for stage in stages:
            view = view.add_stage(stage)

    if pagination_data:
        view = _add_labels_tags_counts(view)

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


def handle_group_filter(
    dataset: fod.Dataset,
    view: foc.SampleCollection,
    filter: GroupElementFilter,
) -> fov.DatasetView:
    """Handle a group filter for App view requests.

    Args:
        dataset: the :class:`fiftyone.core.dataset.Dataset`
        view: the base :class:`fiftyone.core.collections.SampleCollection`
        filter: the :class:`fiftyone.server.aggregations.GroupElementFilter`

    Returns:
        a :class:`fiftyone.core.view.DatasetView` with a group or slice
        selection
    """
    if not filter.id and not filter.slice and not filter.slices:
        # nothing to do
        return view, None

    stages = view._stages
    group_field = dataset.group_field

    unselected = not any(
        isinstance(stage, fosg.SelectGroupSlices) for stage in stages
    )
    group_by = any(isinstance(stage, fosg.GroupBy) for stage in stages)

    view = dataset.view()
    if filter.slice:
        view.group_slice = filter.slice

    if unselected and filter.slices:
        # flatten the collection if the view has no slice(s) selected
        view = dataset.select_group_slices(_force_mixed=True)

        if filter.id:
            # use 'match' to select a group by 'id'
            view = view.match(
                {group_field + "._id": {"$in": [ObjectId(filter.id)]}}
            )

        for stage in stages:
            # add stages after flattening and group match
            if group_by and isinstance(stage, fosg.GroupBy) and filter.slices:
                view = view.match(
                    {group_field + ".name": {"$in": filter.slices}}
                )

            # if selecting a group, filter out select/reorder stages
            if (
                not filter.id
                or type(stage) not in fosg._STAGES_THAT_SELECT_OR_REORDER
            ):
                view = view._add_view_stage(stage, validate=False)

    elif filter.id:
        view = fov.make_optimized_select_view(view, filter.id, groups=True)

    if not group_by and filter.slices:
        # use 'match' to select requested slices, and avoid media type
        # validation
        view = view.match({group_field + ".name": {"$in": filter.slices}})

    media_types = None
    if dataset.group_media_types:
        media_types = (
            set(dataset.group_media_types[s] for s in filter.slices)
            if filter.slices
            else set(dataset.group_media_types.values())
        )
    return view, media_types


def _add_labels_tags_counts(view):
    view = view.set_field(_LABEL_TAGS, [], _allow_missing=True)

    for path, field in foc._iter_label_fields(view):
        if isinstance(field, fof.ListField) or (
            isinstance(field, fof.EmbeddedDocumentField)
            and issubclass(field.document_type, fol._HasLabelList)
        ):
            if view._is_frame_field(path):
                add_tags = _add_frame_labels_tags
            else:
                add_tags = _add_labels_tags
        else:
            if view._is_frame_field(path):
                add_tags = _add_frame_label_tags
            else:
                add_tags = _add_label_tags

        view = add_tags(path, field, view)

    return _count_list_items(_LABEL_TAGS, view)


def _project_pagination_paths(
    view: foc.SampleCollection, media_types: Optional[Tuple[str]] = None
):
    schema = view.get_field_schema(flat=True)
    frame_schema = view.get_frame_field_schema(flat=True)
    if frame_schema:
        schema.update(
            **{f"frames.{path}": field for path, field in frame_schema.items()}
        )

    excluded = [
        path
        for path, field in schema.items()
        if isinstance(field, fof.DictField)
    ]

    return view.add_stage(
        fosg.SelectFields(
            [
                path
                for path in schema
                if all(not path.startswith(exclude) for exclude in excluded)
            ],
            _media_types=media_types,
        )
    )


def _make_match_stage(view, filters):
    queries = []

    for path, parent_path, args in _iter_paths(view, filters):
        is_matching = args.get("isMatching", True)
        path_field = view.get_field(path)

        field = view.get_field(parent_path)
        is_label_field = _is_label_type(field)
        if (
            is_label_field
            and issubclass(field.document_type, (fol.Keypoint, fol.Keypoints))
            and isinstance(path_field, (fof.KeypointsField, fof.ListField))
        ):
            continue

        if args.get("exclude") and not is_matching:
            continue

        queries.append(_make_query(path, path_field, args))

    if queries:
        return fosg.Match({"$and": queries})


def _make_field_filter_stages(view, filters):
    stages = []
    for path, parent_path, args in _iter_paths(
        view, filters, label_types=False
    ):
        if args.get("isMatching", False):
            continue

        field = view.get_field(path)
        parent_field = view.get_field(parent_path)
        if not isinstance(parent_field, fof.ListField) or not isinstance(
            parent_field.field, fof.EmbeddedDocumentField
        ):
            continue

        set_field = parent_path

        expr = _make_scalar_expression(F(path.split(".")[-1]), args, field)

        if expr is None:
            continue

        expr = F(parent_path).filter(expr)
        stages.append(fosg.SetField(set_field, expr, _allow_missing=True))

    return stages


def _make_label_filter_stages(
    view,
    filters,
):
    stages = []
    for path, label_path, args in _iter_paths(view, filters, label_types=True):
        if args.get("isMatching", False):
            continue

        field = view.get_field(path)
        label_field = view.get_field(label_path)
        if issubclass(
            label_field.document_type, (fol.Keypoint, fol.Keypoints)
        ) and isinstance(field, fof.ListField):
            expr = _make_keypoint_list_filter(args, view, path, field)
            if expr is not None:
                stages.append(
                    fosg.FilterKeypoints(
                        label_path,
                        only_matches=True,
                        **expr,
                    )
                )
                continue

        key = field.db_field if field.db_field else field.name
        expr = _make_scalar_expression(
            F(key),
            args,
            field,
            is_label=True,
        )
        if expr is None:
            continue

        stages.append(
            fosg.FilterLabels(
                label_path,
                expr,
                only_matches=not args.get("exclude", False),
            )
        )

    return stages


def _iter_paths(
    view,
    filters,
    label_types=None,
):
    for path in sorted(filters):
        if path == "tags" or path.startswith("_"):
            continue

        if "." in path:
            parent_path = ".".join(path.split(".")[:-1])
        else:
            parent_path = path

        parent_field = view.get_field(parent_path)
        is_list_field = isinstance(parent_field, fof.ListField) and isinstance(
            parent_field.field, fof.EmbeddedDocumentField
        )
        if is_list_field and issubclass(
            parent_field.field.document_type, fol.Label
        ):
            parent_path = ".".join(parent_path.split(".")[:-1])
            parent_field = view.get_field(parent_path)

        if label_types is not None:
            _is_label = _is_label_type(parent_field)
            if label_types != _is_label:
                continue

        yield path, parent_path, filters[path]


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


def _is_label_type(field):
    return isinstance(field, fof.EmbeddedDocumentField) and issubclass(
        field.document_type, fol.Label
    )


def _make_query(path: str, field: fof.Field, args):
    keys = path.split(".")
    path = ".".join(keys[:-1] + [field.db_field or field.name])
    if isinstance(field, fof.ListField) and field.field:
        field = field.field

    if isinstance(
        field,
        (fof.DateField, fof.DateTimeField, fof.FloatField, fof.IntField),
    ):
        return _make_range_query(path, field, args)

    values = args.get("values", None)
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
            return {path: {"$ne" if args["exclude"] else "$eq": False}}

        if true and not false:
            return {path: {"$ne" if args["exclude"] else "$eq": True}}

        if not true and not false:
            return {
                path: {"$in" if args["exclude"] else "$nin": [True, False]}
            }

    raise ValueError("unexpected filter")


_NONFINITES = {
    "inf": float("inf"),
    "nan": float("nan"),
    "ninf": float("-inf"),
    "none": None,
}


def _make_range_query(path: str, field: fof.Field, args):
    range_ = args.get("range", None)
    if range_:
        mn, mx = range_
        if isinstance(field, (fof.DateField, fof.DateTimeField)):
            mn, mx = [fou.timestamp_to_datetime(d) for d in range_]
    else:
        mn, mx = None, None

    exclude = args.get("exclude", False)

    min_expr = {path: {"$gte": mn}} if mn is not None else None
    max_expr = {path: {"$lte": mx}} if mx is not None else None
    if not exclude and range_:
        return {
            "$and": [
                e
                for e in [
                    min_expr,
                    max_expr,
                ]
                if e
            ]
        }

    min_expr = {path: {"$lt": mn}} if mn is not None else None
    max_expr = {path: {"$gt": mx}} if mx is not None else None
    if range_:
        return {
            "$or": [
                e
                for e in [
                    min_expr,
                    max_expr,
                ]
                if e
            ]
        }

    if exclude:
        return {
            "$and": [
                {path: {"$eq": v}}
                for k, v in _NONFINITES.items()
                if k in args and not args[k]
            ]
        }

    return {
        "$and": [
            {path: {"$ne": v}}
            for k, v in _NONFINITES.items()
            if k in args and not args[k]
        ]
    }


def _make_scalar_expression(f, args, field, list_field=None, is_label=False):
    expr = None
    if _is_support(field):
        if "range" in args:
            mn, mx = args["range"]
            expr = (f[0] >= mn) & (f[1] <= mx)
    elif isinstance(field, fof.ListField):
        if isinstance(list_field, str):
            return f.filter(
                _make_scalar_expression(F(list_field), args, field.field)
            )

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
        if "range" in args:
            mn, mx = args["range"]
            p = fou.timestamp_to_datetime
            expr = (f >= p(mn)) & (f <= p(mx))
    elif isinstance(field, (fof.FloatField, fof.IntField)):
        if "range" in args:
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


def _match_label_tags(view: foc.SampleCollection, label_tags):
    label_paths = [
        (
            f"{path}.{field.document_type._LABEL_LIST_FIELD}"
            if isinstance(field, fof.EmbeddedDocumentField)
            and issubclass(field.document_type, fol._HasLabelList)
            else path
        )
        for path, field in foc._iter_label_fields(view)
    ]
    values = label_tags["values"]
    exclude = label_tags["exclude"]
    matching = label_tags["isMatching"]
    expr = lambda exclude, values: {"$nin" if exclude else "$in": values}

    if not exclude or matching:
        view = view.mongo(
            [
                {
                    "$match": {
                        "$or": [
                            {f"{path}.tags": expr(exclude, values)}
                            for path in label_paths
                        ]
                    }
                }
            ]
        )

    if not matching and exclude:
        view = view.exclude_labels(
            tags=label_tags["values"],
            omit_empty=False,
            fields=view._get_label_fields(),
        )
    elif not matching:
        view = view.select_labels(
            tags=label_tags["values"],
            fields=view._get_label_fields(),
        )

    return view
