"""
Dynamic grouping operator

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone as fo
import fiftyone.operators as foo
import fiftyone.operators.types as types
import fiftyone.core.stages as fosg


class GroupBy(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="load_group_by",
            label="Group by",
            dynamic=True,
            icon="merge",
        )

    def resolve_placement(self, ctx):
        return types.Placement(
            types.Places.SAMPLES_GRID_ACTIONS,
            types.Button(
                label="Create dynamic groups", icon="merge", prompt=True
            ),
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _create(ctx, inputs)

        return types.Property(
            inputs, view=types.View(label="Create dynamic groups")
        )

    def execute(self, ctx):
        if ctx.params.get("compound_field", None):
            key = [ctx.params["group_by"], ctx.params["compound_field"]]
        else:
            key = ctx.params["group_by"]

        view = _get_base_view(ctx)
        view = view.group_by(
            key,
            order_by=ctx.params.get("order_by", None),
            order_by_key=ctx.params.get("order_by_key", None),
            reverse=ctx.params.get("reverse", False),
        )

        for stage in _get_following_stages(ctx):
            view = view.add_stage(stage)

        ctx.ops.set_view(view)


def _create(ctx, obj):
    choices = types.DropdownView(space=12)
    for path in _get_paths(ctx, _GROUP_FIELDS):
        choices.add_choice(path, label=path)
    obj.str(
        "group_by",
        required=True,
        label="Group by",
        description="The field or ``embedded.field.name`` to group by",
        view=choices,
    )
    if ctx.params.get("group_by", None):
        compound_choices = types.DropdownView(space=12)
        for path in _get_paths(ctx, _GROUP_FIELDS):
            if ctx.params["group_by"] == path:
                continue

            compound_choices.add_choice(path, label=path)

        obj.str(
            "compound_field",
            required=False,
            label="Compound field",
            description=(
                "An optional compound field or ``embedded.field.name`` to "
                "group by"
            ),
            view=compound_choices,
        )

    order_choices = types.DropdownView(space=12)
    for path in _get_paths(ctx, _ORDER_FIELDS):
        order_choices.add_choice(path, label=path)

    obj.str(
        "order_by",
        required=False,
        label="Order by",
        description="A field to order by",
        view=order_choices,
    )

    order_by = ctx.params.get("order_by", None)
    if order_by:
        field = ctx.view.get_field(order_by)

        if isinstance(field, fo.FloatField):
            input = obj.float
        elif isinstance(field, fo.IntField):
            input = obj.int
        elif isinstance(field, fo.StringField):
            input = obj.str
        else:
            raise ValueError(f"invalid 'order_by' field '{order_by}'")

        input(
            "order_by_key",
            required=False,
            label="Order by key",
            description=(
                "An optional fixed ``order_by`` value representing the first "
                "sample in a group. Required for "
                "[optimized performance](https://docs.voxel51.com/user_guide/app.html#app-query-performant-stages)"
            ),
        )

    obj.bool(
        "reverse",
        default=False,
        required=False,
        label="Reverse",
        description="Whether to return the results in descending order",
    )


_GROUP_FIELDS = (
    fo.IntField,
    fo.ObjectIdField,
    fo.BooleanField,
    fo.DateField,
    fo.StringField,
)

_ORDER_FIELDS = (
    fo.IntField,
    fo.FloatField,
    fo.StringField,
)


def _get_following_stages(ctx):
    view = ctx.view.view()
    stages = []
    found = False
    for stage in view._all_stages:
        if found:
            stages.append(stage)

        if isinstance(stage, fosg.GroupBy):
            found = True

    return stages


def _get_base_view(ctx):
    view = ctx.view.view()

    stages = []
    for stage in view._all_stages:
        if isinstance(stage, fosg.GroupBy):
            break

        stages.append(stage)

    view = ctx.dataset.view()
    for stage in stages:
        view = view.add_stage(stage)

    return view


def _get_paths(ctx, fields):
    view = _get_base_view(ctx)
    schema = view.get_field_schema(flat=True)

    paths = set()
    for path, field in schema.items():
        # Skip non-leaf paths
        if any(p.startswith(path + ".") for p in schema.keys()):
            continue

        if isinstance(field, fields):
            paths.add(path)

    # Discard paths within dicts
    for path, field in schema.items():
        if isinstance(field, fo.DictField):
            for p in list(paths):
                if p.startswith(path + "."):
                    paths.discard(p)

    return sorted(paths)
