"""
Scenario plugin.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from bson import ObjectId
import fiftyone.operators as foo
import fiftyone.operators.types as types
import fiftyone.core.fields as fof

from .utils import (
    get_scenario_example,
    SCENARIO_BUILDING_CHOICES,
    ALLOWED_BY_TYPES,
    KEY_COLOR,
    COMPARE_KEY_COLOR,
    MAX_CATEGORIES,
)

# STORE_NAME = "scenarios"
STORE_NAME = "model_evaluation_panel_builtin"


class ConfigureScenario(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="model_evaluation_configure_scenario",
            label="Configure scenario",
            dynamic=True,
            unlisted=True,
        )

    def render_header(self, inputs):
        inputs.view(
            "header",
            types.Header(
                label="Configure scenario",
                divider=True,
                description="Create a scenario of your dataset to analyze",
            ),
        )

    def render_name_input(self, inputs, default):
        inputs.str(
            "scenario_name",
            label="Scenario Name",
            default=default,
            required=True,
            view=types.TextFieldView(
                label="Scenario Name",
                placeholder="Enter a name for the scenario",
            ),
        )

    def render_scenario_types(self, inputs, selected_type):
        inputs.view(
            "info_header_2",
            types.Header(
                label="Define scenario",
                divider=False,
                description="The field that defines the scenario you want to analyze",
            ),
        )

        groups = types.RadioGroup()
        for choice in SCENARIO_BUILDING_CHOICES:
            groups.add_choice(choice["type"], label=choice["label"])

        radio_view = types.RadioView(
            label="Scenario type",
            description="Select the type of scenario to analyze",
            variant="button",
            choices=[
                types.Choice(
                    choice["type"],
                    label=choice["label"],
                    icon=choice["icon"],
                )
                for choice in SCENARIO_BUILDING_CHOICES
            ],
            componentsProps={
                "container": {
                    "sx": {
                        "width": "100%",
                    }
                },
            },
        )

        inputs.enum(
            "scenario_type",
            groups.values(),
            label="Scenario building type",
            default=selected_type,
            view=radio_view,
        )

    def process_custom_code(self, ctx, custom_code):
        try:
            local_vars = {}
            exec(custom_code, {"ctx": ctx}, local_vars)
            data = local_vars.get("subsets", {})
            return data, None
        except Exception as e:
            return None, str(e)

    def extract_evaluation_keys(self, ctx):
        eval_key_a, eval_key_b = None, None
        eval_keys = ctx.params.get("panel_state", {}).get("evaluations", [])

        if len(eval_keys) > 0:
            eval_key_a = eval_keys[0]["key"]
        else:
            raise ValueError("No evaluation keys found")

        if len(eval_keys) > 1:
            eval_key_b = eval_keys[1]["key"]

        return eval_key_a, eval_key_b

    def extract_evaluation_ids(self, ctx):
        eval_id_a, eval_id_b = None, None
        evaluations = ctx.params.get("panel_state", {}).get("evaluations", [])

        if len(evaluations) > 0:
            eval_id_a = evaluations[0]["id"]
        else:
            raise ValueError("No evaluation ids found")

        if len(evaluations) > 1:
            eval_id_b = evaluations[1]["id"]

        return eval_id_a, eval_id_b

    # TODO: use @cache(ttl=x)
    def get_sample_distribution(self, ctx, subset_expressions):
        try:
            eval_key_a, eval_key_b = self.extract_evaluation_keys(ctx)

            eval_result_a = ctx.dataset.load_evaluation_results(eval_key_a)
            if eval_key_b:
                eval_result_b = ctx.dataset.load_evaluation_results(eval_key_b)

            counts = {eval_key_a: {"color": KEY_COLOR}}
            for name, subset_def in subset_expressions.items():
                with eval_result_a.use_subset(subset_def):
                    counts[eval_key_a][name] = len(eval_result_a.ytrue_ids)

            if eval_key_b and eval_result_b:
                counts[eval_key_b] = {"color": COMPARE_KEY_COLOR}
                for name, subset_def in subset_expressions.items():
                    with eval_result_b.use_subset(subset_def):
                        counts[eval_key_b][name] = len(eval_result_b.ytrue_ids)

            return counts
        except Exception as e:
            # TODO show Alert with error?
            print(e)
            return

    def convert_to_plotly_data(self, ctx, preview_data):
        if preview_data is None or len(preview_data) == 0:
            return []

        order = ctx.params.get("plot_controls", {}).get(
            "order", "alphabetical"
        )
        limit = ctx.params.get("plot_controls", {}).get("limit", 10)
        reverse = ctx.params.get("plot_controls", {}).get("reverse", False)

        plot_data = []
        for eval_key, counts in preview_data.items():
            for name, count in counts.items():
                if name == "color":
                    continue
                plot_data.append(
                    {
                        "x": [name],
                        "y": [count],
                        "type": "bar",
                        "name": eval_key,
                        "marker": {"color": preview_data[eval_key]["color"]},
                        "width": 0.25,
                    }
                )

        if order == "alphabetical":
            plot_data.sort(key=lambda x: x["x"][0])
        elif order == "frequency":
            plot_data.sort(key=lambda x: x["y"][0], reverse=True)
        else:
            raise ValueError(f"Invalid order: {order}")
        if limit:
            # TODO: handle case where 1 model eval is selected vs. 2
            plot_data = plot_data[:limit]
        if reverse:
            plot_data = plot_data[::-1]
        return plot_data

    def render_sample_distribution(self, ctx, inputs, subset_expressions):
        show_sample_distribution = (
            ctx.params.get("custom_code_stack", {})
            .get("control_stack", {})
            .get("view_sample_distribution", False)
        )

        if not show_sample_distribution:
            return

        # render controls
        stack = inputs.v_stack(
            "plot_controls",
            width="100%",
            align_x="center",
            gap=2,
            align_y="start",
            componentsProps={
                "grid": {
                    "sx": {
                        "display": "flex",
                        "flexDirection": "row",
                    }
                },
            },
        )
        order_choices = types.Choices(label="Order", space=3)
        order_choices.add_choice(
            "alphabetical",
            label="Alphabetical",
            description="Sort categories alphabetically",
        )
        order_choices.add_choice(
            "frequency",
            label="Frequency",
            description="Sort categories by frequency",
        )
        stack.enum(
            "order",
            values=order_choices.values(),
            view=order_choices,
            default="alphabetical",
            label="Order",
            description="The order to display the categories",
            space=3,
        )
        stack.int(
            "limit",
            default=None,
            label="Limit bars",
            view=types.View(space=3),
            description="Optional max bars to display",
            space=3,
        )
        stack.bool(
            "reverse",
            default=False,
            label="Reverse order",
            description="Reverse the order of the categories",
            view=types.View(space=3),
        )

        # render plot
        preview_data = self.get_sample_distribution(ctx, subset_expressions)
        plot_data = self.convert_to_plotly_data(ctx, preview_data)
        preview_container = inputs.grid("grid", height="400px", width="100%")
        preview_height = "300px"
        preview_container.plot(
            "plot_preview",
            label="Sample distribution preview",
            config=dict(
                displayModeBar=False,
                scrollZoom=False,  # Disable zoom on scroll
            ),
            layout=dict(
                barmode="group",  # Group bars side by side
                bargap=0.05,  # Minimal space within a group
                bargroupgap=0.2,  # Small gap between different groups
                yaxis=dict(automargin=True),
            ),
            data=plot_data,
            height=preview_height,
            width="100%",
            yaxis=dict(automargin=True),
            xaxis=dict(
                title=dict(
                    text="Count",
                    # standoff=20,
                ),
            ),
        )

    def render_custom_code(self, ctx, inputs, custom_code=None):
        stack = inputs.v_stack(
            "custom_code_stack",
            width="100%",
            align_x="center",
            componentsProps={
                "grid": {
                    "sx": {
                        "border": "1px solid #333",
                        "display": "flex",
                        "flexDirection": "column",
                    }
                },
            },
        )

        custom_code_controls = stack.h_stack(
            "control_stack",
            width="100%",
            align_x="space-between",
            py=2,
            px=2,
        )

        body_stack = stack.v_stack(
            "body_stack",
            width="100%",
            componentsProps={
                "grid": {
                    "sx": {
                        "display": "flex",
                    }
                },
            },
        )

        custom_code_controls.view(
            "info_header_3",
            types.Header(
                label="Code Editor",
                divider=False,
            ),
        )

        custom_code_controls.bool(
            "view_sample_distribution",
            required=True,
            default=False,
            label="View sample distribution",
            view=types.CheckboxView(
                componentsProps={
                    "container": {
                        "sx": {
                            "border": "1px solid #333",
                            "padding": "0 2rem 0 1rem",
                        }
                    },
                }
            ),
        )

        body_stack.view(
            "custom_code",
            default=get_scenario_example(),
            view=types.CodeView(
                language="python",
                space=2,
                height=175,
                width="100%",
                componentsProps={
                    "editor": {
                        "width": "100%",
                        "options": {
                            "minimap": {"enabled": False},
                            "scrollBeyondLastLine": False,
                            "cursorBlinking": "phase",
                        },
                    },
                    "container": {
                        "width": "100%",
                    },
                },
            ),
        )

        if custom_code:
            custom_code_expression, error = self.process_custom_code(
                ctx, custom_code
            )
            if error:
                stack.view(
                    "custom_code_error",
                    view=types.AlertView(
                        severity="error",
                        label="Error in custom code",
                        description=error,
                    ),
                )
            else:
                print("custom_code_expression", custom_code_expression)
                self.render_sample_distribution(
                    ctx, inputs, custom_code_expression
                )

    def render_no_values_warning(self, inputs, field_name):
        inputs.view(
            "no_values_warning",
            types.AlertView(
                severity="warning",
                label="No values found",
                description=(f"Field {field_name} has no values to display. "),
            ),
        )

    def render_use_custom_code_instead(
        self, inputs, field_name, reason="TOO_MANY_CATEGORIES"
    ):
        label, description = None, None

        if reason == "TOO_MANY_CATEGORIES":
            label = "Too many categories"
            description = (
                f"Field {field_name} has too many values to display. "
            )
        if reason == "FLOAT_TYPE_SUPPORT":
            label = "Float type."
            description = (
                f"Field with  is only supported in custom code mode. "
            )

        inputs.view(
            "use_custom_code_instead",
            types.AlertView(
                severity="warning",
                label=label,
                description=(
                    description
                    + "Please use custom code to define the scenario."
                ),
            ),
        )

    def render_saved_views(self, ctx, inputs):
        view_names = ctx.dataset.list_saved_views()

        if view_names:
            inputs.view(
                "info_header_4_saved_views",
                types.Header(
                    label="",
                    description=f"{len(view_names)} saved views available",
                    divider=False,
                ),
            )
            self.render_checkbox_view_options(
                "saved_views_values", sorted(view_names), inputs
            )
        else:
            # TODO: there is design for this - replace
            inputs.view(
                "no_views",
                types.AlertView(
                    severity="warning",
                    label="Could not find any saved views",
                ),
            )

    def render_checkbox_view_options(self, key, values, inputs):
        obj = types.Object()
        if isinstance(values, list):
            values = {v: 0 for v in values}

        for label, count in values.items():
            formatted_count = f"{count:,}"
            label = f"{label}" + (f" - {formatted_count}" if count > 0 else "")
            obj.bool(
                label,
                default=False,
                label=label,
                view=types.CheckboxView(space=4),
            )

        inputs.define_property(key, obj)

    def render_checkbox_view(self, ctx, field_name, inputs):
        """
        Render checkbox view for the given field value options based on schema and
        other conditions.
        """
        # validate field name by checking if it exists in the schema
        schema = ctx.dataset.get_field_schema(flat=True)
        field = schema[field_name]
        if field is None:
            raise ValueError(f"Field {field_name} does not exist")

        # Float type should show custom code view
        if isinstance(field, fof.FloatField):
            print("field", field)
            self.render_use_custom_code_instead(
                inputs, field_name, reason="FLOAT_TYPE_SUPPORT"
            )
            return

        # Checkbox type should show two checkboxes
        if isinstance(field, fof.BooleanField):
            self.render_checkbox_view_options(
                "field_option_values", [True, False], inputs
            )
            return

        # NOTE: can be slow for large datasets
        values = ctx.dataset.distinct(field_name)

        if len(values) > MAX_CATEGORIES:
            # TODO: show code view instead? (worth negotiating with design/product)
            self.render_use_custom_code_instead(inputs, field_name)
        else:
            # NOTE: can be slow for large datasets
            values = ctx.dataset.count_values(field_name)

            if len(values) == 0:
                # TODO: design (negotiate current state)
                self.render_no_values_warning(inputs, field_name)
                return

            sorted_values = {k: v for k, v in sorted(values.items())}
            self.render_checkbox_view_options(
                "field_option_values", sorted_values, inputs
            )

    def get_valid_label_attribute_path_options(self, schema, gt_field):
        return [
            path
            for path, field in schema.items()
            if (
                (
                    isinstance(field, ALLOWED_BY_TYPES)
                    or (
                        isinstance(field, fof.ListField)
                        and isinstance(field.field, ALLOWED_BY_TYPES)
                    )
                )
                and path.startswith(f"{gt_field}.")
            )
        ]

    def render_label_attribute(self, ctx, inputs, gt_field, label_attr=None):
        schema = ctx.dataset.get_field_schema(flat=True)
        valid_options = self.get_valid_label_attribute_path_options(
            schema, gt_field
        )

        label_choices = types.Choices()
        for option in valid_options:
            label_choices.add_choice(option, label=option)

        inputs.enum(
            "scenario_label_attribute",
            label_choices.values(),
            default=None,
            label="Label attribute",
            description="Select a label attribute",
            view=label_choices,
            required=True,
        )

        if label_attr:
            self.render_checkbox_view(ctx, label_attr, inputs)

    def get_valid_sample_field_path_options(self, flat_field_schema):
        """
        Get valid sample field path options based on the schema.
        """
        options = []

        bad_roots = tuple(
            k + "."
            for k, v in flat_field_schema.items()
            if isinstance(v, fof.ListField)
        )

        # TODO: any field inside a list of documents not allowed
        for field_path, field in flat_field_schema.items():
            if field_path.startswith(bad_roots):
                continue
            if isinstance(field, ALLOWED_BY_TYPES):
                options.append(field_path)
            if isinstance(field, fof.ListField):
                if isinstance(field.field, ALLOWED_BY_TYPES):
                    options.append(field_path)

        return options

    def render_sample_fields(self, ctx, inputs, field_name=None):
        schema = ctx.dataset.get_field_schema(flat=True)
        valid_options = self.get_valid_sample_field_path_options(schema)

        field_choices = types.Choices()
        for option in valid_options:
            field_choices.add_choice(option, label=option)

        inputs.str(
            "scenario_field",
            default=None,
            label="Field",
            description=("Choose applicable sample field values."),
            view=field_choices,
            required=True,
        )

        if field_name:
            self.render_checkbox_view(ctx, field_name, inputs)

    def resolve_input(self, ctx):
        inputs = types.Object()
        self.render_header(inputs)

        # model name
        chosen_scenario_name = ctx.params.get("scenario_name", None)
        self.render_name_input(inputs, chosen_scenario_name)

        chosen_scenario_type = ctx.params.get("scenario_type", None)
        self.render_scenario_types(inputs, chosen_scenario_type)

        chosen_scenario_field_name = ctx.params.get("scenario_field", None)
        chosen_scenario_label_attribute = ctx.params.get(
            "scenario_label_attribute", None
        )
        chosen_custom_code = (
            ctx.params.get("custom_code_stack", {})
            .get("body_stack", {})
            .get("custom_code", "")
        )
        gt_field = ctx.params.get("gt_field", None)

        if chosen_scenario_type == "custom_code":
            self.render_custom_code(ctx, inputs, chosen_custom_code)

        if chosen_scenario_type == "label_attribute":
            self.render_label_attribute(
                ctx, inputs, gt_field, chosen_scenario_label_attribute
            )

        if chosen_scenario_type == "view":
            self.render_saved_views(ctx, inputs)

        if chosen_scenario_type == "sample_field":
            self.render_sample_fields(ctx, inputs, chosen_scenario_field_name)

        prompt = types.PromptView(submit_button_label="Analyze scenario")
        return types.Property(inputs, view=prompt)

    def execute(self, ctx):
        scenario_type = ctx.params.get("scenario_type", None)
        if scenario_type is None:
            raise ValueError("Scenario type must be selected")

        scenario_name = ctx.params.get("scenario_name", None)
        if scenario_name is None or len(scenario_name) < 2:
            raise ValueError("Scenario name is missing")

        store = ctx.store(STORE_NAME)
        scenarios = store.get("scenarios") or {}

        eval_id_a, eval_id_b = self.extract_evaluation_ids(ctx)
        if eval_id_a is None:
            raise ValueError("No evaluation ids found")

        scenarios_for_eval = scenarios.get(eval_id_a) or {}

        # TODO: label-attribute and sample-field
        if scenario_type == "custom_code":
            custom_code = (
                ctx.params.get("custom_code_stack", {})
                .get("body_stack", {})
                .get("custom_code", "")
            )
            _, error = self.process_custom_code(ctx, custom_code)
            if error:
                raise ValueError(f"Error in custom code: {error}")

            scenario_subsets = custom_code
        if scenario_type == "view":
            saved_views = ctx.params.get("saved_views_values", {})
            scenario_subsets = [
                name for name, selected in saved_views.items() if selected
            ]
            if len(scenario_subsets) == 0:
                raise ValueError("No saved views selected")

        # TODO: edit
        scenario_id = ObjectId()
        scenarios_for_eval[str(scenario_id)] = {
            "id": str(scenario_id),
            "name": scenario_name,
            "type": scenario_type,
            "subsets": scenario_subsets,
            "compare_id": eval_id_b,
        }

        scenarios[eval_id_a] = scenarios_for_eval
        store.set("scenarios", scenarios)

        return {
            "scenario_type": ctx.params.get("radio_choices", ""),
            "scenario_field": ctx.params.get("scenario_field", ""),
            "label_attribute": ctx.params.get("label_attribute", ""),
        }
