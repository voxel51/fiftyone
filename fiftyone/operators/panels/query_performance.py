import eta.core.utils as etau
import fiftyone as fo
from ..types import (
    TabsView,
    AutocompleteView,
    Object,
    Property,
    Notice,
    ImageView,
    TableView,
    GridView,
)
from fiftyone.management.dataset import DatasetPermission
from ..operator import Operator, OperatorConfig
from ..panel import Panel, PanelConfig
from fiftyone.operators.utils import create_summary_field_inputs
import fiftyone.core.fields as fof


_INDEXABLE_FIELDS = (
    fo.IntField,
    fo.ObjectIdField,
    fo.BooleanField,
    fo.DateField,
    fo.DateTimeField,
    fo.FloatField,
    fo.StringField,
    fo.ListField,
)

PERMISSION = [DatasetPermission.EDIT, DatasetPermission.MANAGE]


def _get_existing_indexes(ctx):
    return ctx.dataset.get_index_information(include_stats=True)


def _get_default_indexes(ctx):
    index_names = ctx.dataset._get_default_indexes()
    if ctx.dataset._has_frame_fields():
        index_names.extend(
            "frames." + name
            for name in ctx.dataset._get_default_indexes(frames=True)
        )

    return index_names


def _is_unique(name, index_info):
    # The `id` index is unique, but backend doesn't report it
    # https://github.com/voxel51/fiftyone/blob/cebfdbbc6dae4e327d2c3cfbab62a73f08f2d55c/fiftyone/core/collections.py#L8552
    return (
        True
        if name in ("id", "frames.id")
        else index_info.get("unique", False)
    )


def _get_droppable_indexes(ctx):
    index_names = set(ctx.dataset.list_indexes())
    index_names -= set(_get_default_indexes(ctx))
    return sorted(index_names)


def _get_summary_fields(ctx):
    if hasattr(ctx.dataset, "list_summary_fields"):
        return ctx.dataset.list_summary_fields()
    else:
        return []


def _get_indexable_paths(ctx):
    schema = ctx.view.get_field_schema(flat=True)
    if ctx.view._has_frame_fields():
        schema.update(
            {
                "frames." + k: v
                for k, v in ctx.view.get_frame_field_schema(flat=True).items()
            }
        )

    paths = set()
    for path, field in schema.items():
        # Skip non-leaf paths
        if any(p.startswith(path + ".") for p in schema.keys()):
            continue

        if isinstance(field, _INDEXABLE_FIELDS):
            paths.add(path)

    # Discard paths within dicts
    for path, field in schema.items():
        if isinstance(field, fo.DictField):
            for p in list(paths):
                if p.startswith(path + "."):
                    paths.discard(p)

    # Discard fields that are already indexed
    for index_name in ctx.dataset.list_indexes():
        paths.discard(index_name)

    # Discard fields that are already being newly indexed
    for obj in ctx.params.get("create", []):
        paths.discard(obj.get("field_name", None))

    return sorted(paths)


def _get_frame_fields(ctx):
    schema = ctx.view.get_frame_field_schema(flat=True).items()
    result = []
    supported_types = [
        fof.StringField,
        fof.BooleanField,
        fof.FloatField,
        fof.IntField,
        fof.DateField,
        fof.DateTimeField,
    ]
    if schema:
        for item in schema:
            if isinstance(item[1], tuple(supported_types)):
                result.append("frames." + item[0])
    return sorted(result)


class IndexFieldCreationOperator(Operator):
    @property
    def config(self):
        return OperatorConfig(
            name="index_field_creation_operator",
            label="Index Field Creation Operator",
            dynamic=True,
            unlisted=True,
        )

    def resolve_input(self, ctx):
        inputs = Object()

        field_choices = TabsView()
        field_choices.add_choice("index_field", label="Index Field")
        if ctx.dataset._has_frame_fields:
            field_choices.add_choice("summary_field", label="Summary Field")
        default_field = (
            "summary_field"
            if ctx.params.get("is_frame_filter")
            else "index_field"
        )
        inputs.enum(
            "field_type",
            field_choices.values(),
            required=True,
            default=default_field,
            label="CREATE NEW INDEX",
            description="Choose your field to create: index field for faster queries, summary field for frame aggregation",
            view=field_choices,
        )
        field_type = ctx.params.get("field_type", "index_field")

        fields = []
        if field_type == "index_field":
            dropdown_choices = AutocompleteView(
                label="Choose your field to create index"
            )
            fields = _get_indexable_paths(ctx) or []
            for index in fields:
                dropdown_choices.add_choice(
                    index,
                    label=index,
                    description=f"Index {index}",
                )

        elif field_type == "summary_field":
            dropdown_choices = AutocompleteView(
                label="Choose your frame field to create summary field"
            )
            create_summary_field_inputs(ctx, inputs)
        path = ctx.params.get("nonperformant_field")
        if fields:
            inputs.enum(
                "path",
                dropdown_choices.values(),
                default=path
                if any(
                    choice.value == path for choice in dropdown_choices.choices
                )
                else dropdown_choices.choices[0].value,
                view=dropdown_choices,
            )
        return Property(inputs)

    def execute(self, ctx):
        field_type = ctx.params.get("field_type", "index_field")
        field_choice = ctx.params.get("path", "None provided")
        ctx.ops.open_panel("query_performance_panel")
        if field_choice != "None provided":
            if field_type == "index_field":
                try:
                    ctx.dataset.create_index(
                        field_choice, unique=False, wait=False
                    )
                    ctx.trigger("reload_dataset")
                except Exception:
                    ctx.dataset.create_index(field_choice)
                return {
                    "field_to_create": field_choice,
                    "field_type": "Index Field",
                }
            else:
                try:
                    summary_field_name = ctx.params.get("field_name", None)
                    sidebar_group = ctx.params.get("sidebar_group", None)
                    include_counts = ctx.params.get("include_counts", False)
                    group_by = ctx.params.get("group_by", None)
                    read_only = ctx.params.get("read_only", True)

                    if not sidebar_group:
                        sidebar_group = False

                    ctx.dataset.create_summary_field(
                        field_choice,
                        field_name=summary_field_name,
                        sidebar_group=sidebar_group,
                        include_counts=include_counts,
                        group_by=group_by,
                        read_only=read_only,
                        create_index=True,
                    )

                    ctx.trigger("reload_dataset")

                    return {
                        "field_to_create": field_choice,
                        "field_type": "Summary Field",
                    }
                except Exception as e:
                    return {"field_to_create": str(e), "field_type": "N/A"}
        else:
            return {"field_to_create": "None provided", "field_type": "N/A"}


class IndexFieldRemovalConfirmationOperator(Operator):
    @property
    def config(self):
        return OperatorConfig(
            name="index_field_removal_confirmation",
            label="Index Field Removal Confirmation",
            dynamic=True,
            unlisted=True,
        )

    def resolve_input(self, ctx):
        inputs = Object()
        field_name = ctx.params.get("field_to_delete", "N/A")
        field_type = ctx.params.get("field_type", "N/A")

        if field_type == "summary_field":
            message = (
                f"Are you sure you would like to delete Summary Field: {field_name}?"
                f"\n\nThis action cannot be undone."
            )
        else:
            message = (
                f"Are you sure you would like to delete Indexed Field: {field_name}?"
                f"\n\nThis action cannot be undone."
            )

        inputs.view(
            "confirmation",
            Notice(
                label=message,
            ),
        )
        return Property(inputs)

    def execute(self, ctx):
        field_type = ctx.params.get("field_type", "N/A")
        field_name = ctx.params.get("field_to_delete", "N/A")
        if field_type == "summary_field":
            ctx.dataset.delete_summary_field(field_name)
        elif field_type == "index_field":
            ctx.dataset.drop_index(field_name)

        return {
            "field_to_delete": field_name,
            "field_type": field_type,
        }


class QueryPerformancePanel(Panel):
    @property
    def config(self):
        return PanelConfig(
            name="query_performance_panel",
            label="Query Performance Panel",
            description="A place to optimize the query performance of datasets.",
            surfaces="grid",
            icon="/assets/icon-light.svg",
            light_icon="/assets/icon-light.svg",  # light theme only
            dark_icon="/assets/icon-dark.svg",  # dark theme only
            allow_multiple=False,
        )

    def _get_index_table_data(self, ctx):
        indexes = _get_existing_indexes(ctx)
        default_indexes = set(_get_default_indexes(ctx))
        rows = []
        for name in sorted(indexes):
            index_info = indexes[name]
            default = name in default_indexes
            size = (
                "In progress"
                if index_info.get("in_progress")
                else etau.to_human_bytes_str(index_info.get("size", 0))
            )

            types = ["Index"]
            if default:
                types.append("Default")
            if _is_unique(name, index_info):
                types.append("Unique")

            rows.append(
                {
                    "FIELD": name,
                    "SIZE": str(size),
                    "TYPE": ", ".join(types),
                }
            )

        # sort the rows, with default field first and then alphabetical order
        rows = sorted(
            rows, key=lambda x: ("Default" not in x["TYPE"], x["FIELD"])
        )

        # add summary fields
        summary_field_supported = hasattr(ctx.dataset, "list_summary_fields")

        if summary_field_supported:
            summary_fields = _get_summary_fields(ctx)
            for name in sorted(summary_fields):
                rows.append(
                    {
                        "FIELD": name,
                        "SIZE": "N/A",
                        "TYPE": "Summary",
                    }
                )

        table_data = {
            "rows": [[r["FIELD"], r["SIZE"], r["TYPE"]] for r in rows],
            "columns": ["FIELD", "SIZE", "TYPE"],
            "selected_cells": [],
            "selected_rows": [0],
            "selected_columns": [],
        }
        return table_data

    def _build_view(self, ctx):
        ctx.panel.set_data("table", self._get_index_table_data(ctx))

    def on_refresh_button_click(self, ctx):
        self._build_view(ctx)

    def on_load(self, ctx):
        self._build_view(ctx)
        ctx.ops.track_event("query_performance_panel")

    def on_click_row(self, ctx):
        table_data = self._get_index_table_data(ctx)
        table_data["selected_rows"] = [int(ctx.params.get("row"))]
        ctx.panel.set_data("table", table_data)

    def on_click_delete(self, ctx):
        if ctx.user.dataset_permission in PERMISSION:
            row = int(ctx.params.get("row"))
            table_data = self._get_index_table_data(ctx)
            field_name = table_data["rows"][row][0]
            field_type = table_data["rows"][row][2]
            params = {"field_to_delete": field_name}

            if field_type == "Summary":
                params["field_type"] = "summary_field"
                ctx.ops.notify(f"Dropping summary field {field_name}")
            else:
                default_indexes = set(_get_default_indexes(ctx))
                if field_name in default_indexes:
                    ctx.ops.notify(f"Cannot drop default index {field_name}.")
                    return

                ctx.ops.notify(f"Dropping index {field_name}")
                params["field_type"] = "index_field"

            ctx.prompt(
                "index_field_removal_confirmation",
                on_success=self.refresh,
                params=params,
            )
        else:
            ctx.ops.notify("You do not have permission to delete.")

    def toggle_qp(self, ctx):
        if ctx.query_performance:
            ctx.ops.notify("Disabling query performance mode")
            ctx.prompt("disable_query_performance", on_success=self.refresh)
        else:
            ctx.ops.notify("Enabling query performance mode")
            ctx.prompt("enable_query_performance", on_success=self.refresh)

        self._build_view(ctx)

    def refresh(self, ctx):
        self._build_view(ctx)

    def reload(self, ctx):
        self._build_view(ctx)
        ctx.ops.clear_sidebar_filters()

    def create_index_or_summary(self, ctx):
        if ctx.user.dataset_permission in PERMISSION:
            ctx.ops.track_event(
                "index_field_creation_operator",
                {"location": "query_performance_panel"},
            )
            ctx.prompt(
                "index_field_creation_operator",
                on_success=self.refresh,
            )
        else:
            ctx.ops.notify("You do not have permission to create an index.")

    def update_summary_field(self, ctx):
        ctx.ops.notify(f"Opening `update_summary_field` operator")
        ctx.prompt("update_summary_field", on_success=self.refresh)

    def render(self, ctx):
        panel = Object()
        droppable_index = _get_droppable_indexes(ctx)
        summary_fields = _get_summary_fields(ctx)

        if not (droppable_index or summary_fields):
            lines = [
                "Improve Query Performance with Indexing",
                "Index the most critical fields for efficient data loading and improved query experience.",
            ]

            v_stack = panel.v_stack("v_stack", width=50, align_x="center")
            v_stack.str(
                "img",
                view=ImageView(width="32px", height="32px"),
                default="https://upload.wikimedia.org/wikipedia/commons/f/fc/Lightning_bolt_inside_dark_orange_circle.svg",
            )
            v_stack.md(f"#### {lines[0]}", align_x="center")
            v_stack.md(lines[1], name="desc", align_x="center")
            v_stack.btn(
                "add_btn",
                label="Create index",
                on_click=self.create_index_or_summary,
                variant="contained",
            )
            return Property(
                panel,
                view=GridView(
                    align_x="center", align_y="center", height=100, width=100
                ),
            )
        else:
            all_indices = ctx.dataset.list_indexes()
            if all_indices and summary_fields:
                message = f"{len(all_indices)} Indexed and {len(summary_fields)} Summary Fields"
            else:
                message = f"{len(all_indices)} Indexed Fields"

            message = f"Existent indexes and fields for dataset `{ctx.dataset.name}`: {message}"

            h_stack = panel.h_stack("v_stack", align_y="center")
            h_stack.md(f"{message}", width=49, gap=2)

            # The row of buttons
            button_menu = h_stack.h_stack(
                "create_menu", align_x="right", width=49
            )

            button_menu.btn(
                "refresh_btn",
                label="Refresh",
                on_click=self.on_refresh_button_click,
            )

            if ctx.query_performance:
                button_menu.btn(
                    "lightning_btn",
                    label="Enabled",
                    on_click=self.toggle_qp,
                    variant="contained",
                )
            else:
                button_menu.btn(
                    "lightning_btn",
                    label="Disabled",
                    on_click=self.toggle_qp,
                )

            if ctx.user.dataset_permission in PERMISSION:
                button_menu.btn(
                    "add_btn",
                    label="Create Index",
                    on_click=self.create_index_or_summary,
                    variant="contained",
                )

            if summary_fields:
                button_menu.btn(
                    "update_summary_field_btn",
                    label="Refresh summary field",
                    on_click=self.update_summary_field,
                    variant="contained",
                )

            table = TableView(
                on_click_row=self.on_click_row,
            )
            table.add_column("FIELD", label="FIELD")
            table.add_column("SIZE", label="SIZE")
            table.add_column("TYPE", label="TYPE")

            if ctx.user.dataset_permission in PERMISSION:
                # Calculating row conditionality for the delete button
                rows = (
                    [False] * (len(all_indices) - len(droppable_index))
                    + [True] * len(droppable_index)
                    + [True] * len(summary_fields)
                )

                table.add_row_action(  # pylint: disable=E1101
                    "delete", self.on_click_delete, icon="delete", rows=rows
                )

            panel.list("table", Object(), view=table)

        return Property(panel)
