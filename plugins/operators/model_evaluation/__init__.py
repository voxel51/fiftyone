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
                label="Create scenario",  # TODO: adapt for edit
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

    def should_render_sample_distribution(self, params):
        return (
            params.get("custom_code_stack", {})
            .get("control_stack", {})
            .get("view_sample_distribution", False)
        )

    def render_sample_distribution(self, ctx, inputs, subset_expressions):
        if not self.should_render_sample_distribution(ctx.params):
            return

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
                ),
            ),
        )

    def extract_custom_code(self, ctx, example_type):
        active_scenario_type = self.get_scenario_type(ctx.params)
        code_key = f"code|{active_scenario_type}|{example_type}"

        custom_code = (
            ctx.params.get("custom_code_stack", {})
            .get("body_stack", {})
            .get(code_key, "")
        )

        if not custom_code:
            custom_code = get_scenario_example(example_type)

        return custom_code, code_key

    def render_custom_code(self, ctx, inputs, example_type="NORMAL"):
        custom_code, code_key = self.extract_custom_code(ctx, example_type)

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
                label="Custom code",
                divider=False,
            ),
        )

        custom_code_controls.bool(
            "view_sample_distribution",
            required=True,
            default=True,
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
            code_key,
            default=custom_code,
            view=types.CodeView(
                language="python",
                space=2,
                height=250,
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

    def render_use_custom_code_warning(
        self, inputs, field_name, reason="TOO_MANY_CATEGORIES"
    ):
        label, description = None, None

        if reason == "TOO_MANY_CATEGORIES":
            label = "Too many categories."
            description = (
                f"Field {field_name} has too many values to display. "
                + "Please use custom code to define the scenario."
            )
        if reason == "TOO_MANY_INT_CATEGORIES":
            label = "Too many integer values."
            description = (
                f"Field {field_name} has too many values to display. "
                + "Please use custom code to define the scenario."
            )
        if reason == "FLOAT_TYPE":
            label = "Float type."
            description = f"To create scenarios based on float fields, please use the custom code mode. "
        if reason == "SLOW":
            label = "Too many values."
            description = f"Found too many distinct values for this field. "

        inputs.view(
            "use_custom_code_instead_warning",
            types.AlertView(
                severity="warning",
                label=label,
                description=description,
            ),
        )

    def render_use_custom_code_instead(
        self, ctx, inputs, field_name, reason="TOO_MANY_CATEGORIES"
    ):
        self.render_use_custom_code_warning(inputs, field_name, reason)
        self.render_custom_code(ctx, inputs, example_type=reason)

    def get_saved_view_scenarios_picker_type(self, ctx):
        view_names = ctx.dataset.list_saved_views()
        if not view_names:
            return "EMPTY", None

        view_names = sorted(view_names)
        view_len = len(view_names)

        if view_len > MAX_CATEGORIES:
            return "AUTO-COMPLETE", view_names

        return "CHECKBOX", view_names

    def render_saved_views(self, ctx, inputs):
        view_type, view_names = self.get_saved_view_scenarios_picker_type(ctx)

        if view_type == "EMPTY":
            self.render_no_values_warning(inputs, "saved views")
            # TODO: we have design for this
        elif view_type == "AUTO-COMPLETE":
            self.render_auto_complete_view("saved views", view_names, inputs)
        elif view_type == "CHECKBOX":
            stack = inputs.v_stack(
                "checkbox_view_stack",
                width="100%",
                componentsProps={
                    "grid": {
                        "sx": {
                            "border": "1px solid #333",
                            "display": "flex",
                            "flexDirection": "column",
                            "padding": "1rem",
                            "height": "210px",
                            "overflowY": "auto",
                        }
                    },
                },
            )
            stack.view(
                "info_header_saved_views",
                types.Header(
                    label="",
                    description=f"{len(view_names)} saved views available",
                    divider=False,
                ),
            )
            self.render_checkbox_view("saved_views_values", view_names, stack)

    def render_checkbox_view(self, key, values, stack):
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

        stack.define_property(key, obj)

    def get_scenarios_picker_type(self, ctx, field_name):
        """
        Determines the picker type for a given field.

        Returns:
            Tuple[str, Any]: Picker type and corresponding values.
        """
        # Validate field name
        schema = ctx.dataset.get_field_schema(flat=True)
        field = schema.get(field_name)
        if field is None:
            raise ValueError(f"Field {field_name} does not exist")

        # Field type-based selection
        if isinstance(field, fof.FloatField):
            return "CODE", "FLOAT_TYPE"
        if isinstance(field, fof.BooleanField):
            return "CHECKBOX", [True, False]

        # Retrieve distinct values (may be slow for large datasets)
        distinct_values = ctx.dataset.distinct(field_name)
        distinct_count = len(distinct_values)

        if distinct_count == 0:
            return "EMPTY", None

        if distinct_count > MAX_CATEGORIES:
            if isinstance(field, fof.StringField):
                return "AUTO-COMPLETE", distinct_values
            if isinstance(field, fof.IntField):
                return "CODE", "TOO_MANY_INT_CATEGORIES"
            else:
                return "CODE", "TOO_MANY_CATEGORIES"

        # NOTE: may be slow for large datasets
        values = ctx.dataset.count_values(field_name)
        return (
            ("EMPTY", None)
            if not values
            else ("CHECKBOX", dict(sorted(values.items())))
        )

    def render_auto_complete_view(self, field_name, values, inputs):
        self.render_use_custom_code_warning(inputs, field_name, reason="SLOW")

        inputs.list(
            f"classes_{field_name}",
            types.String(),
            default=None,
            required=True,
            label="Classes",
            description=("Select saved views to get started..."),
            view=types.AutocompleteView(
                multiple=True,
                choices=[types.Choice(value=v, label=v) for v in values],
                allow_duplicates=False,
                allow_user_input=False,
            ),
        )

    def render_scenario_picker_view(self, ctx, field_name, inputs):
        """
        Renders the appropriate UI component based on the picker type.
        """
        view_type, values = self.get_scenarios_picker_type(ctx, field_name)

        render_methods = {
            "EMPTY": lambda: self.render_no_values_warning(inputs, field_name),
            "CODE": lambda: self.render_use_custom_code_instead(
                ctx, inputs, field_name, reason=values
            ),
            "AUTO-COMPLETE": lambda: self.render_auto_complete_view(
                field_name, values, inputs
            ),
            "CHECKBOX": lambda: self.render_checkbox_view(
                "field_option_values", values, inputs
            ),
        }

        render_methods.get(view_type, lambda: None)()

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
            self.render_scenario_picker_view(ctx, label_attr, inputs)

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
            self.render_scenario_picker_view(ctx, field_name, inputs)

    def get_scenario_type(self, params):
        scenario_type = params.get("scenario_type", None)
        # TODO: constant and typed enum
        if scenario_type not in [
            "view",
            "custom_code",
            "label_attribute",
            "sample_field",
        ]:
            raise ValueError("Invalid scenario type")
        return scenario_type

    def resolve_input(self, ctx):
        inputs = types.Object()
        self.render_header(inputs)

        chosen_scenario_name = ctx.params.get("scenario_name", None)
        self.render_name_input(inputs, chosen_scenario_name)

        scenario_type = self.get_scenario_type(ctx.params)
        self.render_scenario_types(inputs, scenario_type)

        chosen_scenario_field_name = ctx.params.get("scenario_field", None)
        chosen_scenario_label_attribute = ctx.params.get(
            "scenario_label_attribute", None
        )

        gt_field = ctx.params.get("gt_field", None)

        if scenario_type == "custom_code":
            self.render_custom_code(ctx, inputs)

        if scenario_type == "label_attribute":
            self.render_label_attribute(
                ctx, inputs, gt_field, chosen_scenario_label_attribute
            )

        if scenario_type == "view":
            self.render_saved_views(ctx, inputs)

        if scenario_type == "sample_field":
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
