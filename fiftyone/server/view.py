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

            if form.mixed and view.media_type == fom.GROUP:
                view = view.select_group_slices(_force_mixed=True)

            return view

    return await fou.run_sync_task(run)


def get_view(
    dataset_name,
    view_name=None,
    stages=None,
    filters=None,
    pagination_data=False,
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
            if sample_filter.group.slice:
                view.group_slice = sample_filter.group.slice

            if sample_filter.group.id:
                view = fov.make_optimized_select_view(
                    view, sample_filter.group.id, groups=True
                )
            if sample_filter.group.slices:
                view = view.select_group_slices(
                    sample_filter.group.slices, _force_mixed=True
                )

        elif sample_filter.id:
            view = fov.make_optimized_select_view(view, sample_filter.id)

    if pagination_data:
        # omit all dict field values for performance, not needed by grid
        view = _project_pagination_paths(view)

    if filters or extended_stages or pagination_data:
        view = get_extended_view(
            view,
            filters,
            pagination_data=pagination_data,
            extended_stages=extended_stages,
        )

    return view


def get_extended_view(
    view,
    filters=None,
    extended_stages=None,
    pagination_data=False,
):
    """Create an extended view with the provided filters.

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        filters: an optional ``dict`` of App defined filters
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

        label_tags = filters.get(_LABEL_TAGS, None)
        if label_tags:
            view = _match_label_tags(view, label_tags)

        stages = _make_filter_stages(view, filters)

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


def _add_labels_tags_counts(view):
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


def _project_pagination_paths(view: foc.SampleCollection):
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

    return view.select_fields(
        [
            path
            for path in schema
            if all(not path.startswith(exclude) for exclude in excluded)
        ]
    )


def _make_filter_stages(
    view,
    filters,
):
    stages = []
    queries = []
    for path, label_path, field, args in _iter_paths(view, filters):
        is_matching = args.get("isMatching", True)
        path_field = view.get_field(path)
        is_label_field = _is_label(field)
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
        stages.append(fosg.Match({"$and": queries}))

    for path, label_path, label_field, args in _iter_paths(
        view, filters, labels=True
    ):
        is_matching = args.get("isMatching", True)
        field = view.get_field(path)
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

        elif not is_matching:
            key = field.db_field if field.db_field else field.name
            expr = _make_scalar_expression(F(key), args, field, is_label=True)
            if expr is not None:
                stages.append(
                    fosg.FilterLabels(
                        label_path,
                        expr,
                        only_matches=not args.get("exclude", False),
                    )
                )

    return stages


def _iter_paths(view, filters, labels=False):
    for path in sorted(filters):
        if path == "tags" or path.startswith("_"):
            continue

        if "." in path:
            parent_path = ".".join(path.split(".")[:-1])
        else:
            parent_path = path

        parent_field = view.get_field(parent_path)
        if isinstance(parent_field, fof.ListField) and isinstance(
            parent_field.field, fof.EmbeddedDocumentField
        ):
            if issubclass(parent_field.field.document_type, fol.Label):
                parent_path = ".".join(parent_path.split(".")[:-1])
                parent_field = view.get_field(parent_path)

        if labels and not _is_label(parent_field):
            continue

        yield path, parent_path, parent_field, filters[path]


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
    keys = path.split(".")
    path = ".".join(keys[:-1] + [field.db_field or field.name])
    if isinstance(field, fof.ListField) and field.field:
        field = field.field

    if isinstance(
        field,
        (fof.DateField, fof.DateTimeField, fof.FloatField, fof.IntField),
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
        f"{path}.{field.document_type._LABEL_LIST_FIELD}"
        if isinstance(field, fof.EmbeddedDocumentField)
        and issubclass(field.document_type, fol._HasLabelList)
        else path
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
