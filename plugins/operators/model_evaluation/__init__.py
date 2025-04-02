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
from fiftyone.core.expressions import ViewField as F

from .utils import (
    get_scenario_example,
    SCENARIO_BUILDING_CHOICES,
    ALLOWED_BY_TYPES,
    KEY_COLOR,
    COMPARE_KEY_COLOR,
    MAX_CATEGORIES,
)

STORE_NAME = "model_evaluation_panel_builtin"


class ConfigureScenario(foo.Operator):
    custom_code_views = {
        "CUSTOM_CODE": False,
        "TOO_MANY_CATEGORIES": False,
        "TOO_MANY_INT_CATEGORIES": False,
        "FLOAT_TYPE": False,
        "SLOW": False,
    }

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
                "container": {"sx": {"width": "100%"}},
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

    def convert_to_plotly_data(self, preview_data):
        if preview_data is None or len(preview_data) == 0:
            return []

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

        return plot_data

    def is_sample_distribution_enabled_for_custom_code(self, params):
        return (
            params.get("custom_code_stack", {})
            .get("control_stack", {})
            .get("view_sample_distribution", False)
        )

    def render_empty_sample_distribution(self, inputs, description=None):
        inputs.view(
            "empty_sample_distribution",
            types.HeaderView(
                label="Subset's sample distribution preview",
                description=description
                or "Select a value to view the sample distribution",
                divider=True,
                componentsProps={
                    "container": {
                        "sx": {
                            "justifyContent": "center",
                            "padding": "3rem",
                            "background": "background.secondary",
                            "color": "text.secondary",
                        }
                    },
                    "label": {
                        "sx": {
                            "display": "flex",
                            "justifyContent": "center",
                            "padding": ".5rem 0",
                            "color": "text.secondary",
                        }
                    },
                },
            ),
        )

    def render_sample_distribution(self, ctx, inputs, scenario_type, values):
        if not values:
            return self.render_empty_sample_distribution(inputs)

        subsets = {}
        # NOTE: this case is exact same as "sample_field". the only difference is in their UI - we filter differently.
        if scenario_type == "label_attribute":
            scenario_label_attribute = ctx.params.get(
                "scenario_label_attribute"
            )
            for v in values:
                subsets[v] = dict(
                    type="field", field=scenario_label_attribute, value=v
                )
            self.render_sample_distribution_graph(ctx, inputs, subsets)

        if scenario_type == "sample_field":
            scenario_field = ctx.params.get("scenario_field")
            for v in values:
                subsets[v] = dict(
                    type="field",
                    field=scenario_field,
                    value=(
                        True if v == "true" else False if v == "false" else v
                    ),
                )
            self.render_sample_distribution_graph(ctx, inputs, subsets)

        if scenario_type == "view":
            for v in values:
                subsets[v] = dict(type="view", view=v)
            self.render_sample_distribution_graph(ctx, inputs, subsets)

        if scenario_type == "custom_code":
            if not self.is_sample_distribution_enabled_for_custom_code(
                ctx.params
            ):
                return self.render_empty_sample_distribution(
                    inputs,
                    description="You can toggle the 'View sample distribution' to see the preview.",
                )
            else:
                # NOTE: values for custom_code is the parsed custom code expression
                self.render_sample_distribution_graph(ctx, inputs, values)

    def render_sample_distribution_graph(
        self, ctx, inputs, subset_expressions
    ):
        preview_data = self.get_sample_distribution(ctx, subset_expressions)
        plot_data = self.convert_to_plotly_data(preview_data)

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

    def get_custom_code_key(self, params):
        scenario_type = self.get_scenario_type(params)

        if scenario_type in ["label_attribute", "sample_field"]:
            scenario_field = params.get("scenario_field", "")
            return f"custom_code_{scenario_type}_{scenario_field}"

        return "custom_code"

    def extract_custom_code(self, ctx, example_type="CUSTOM_CODE"):
        # NOTE: this was causing infinite loop
        key = self.get_custom_code_key(ctx.params).replace(".", "_")

        custom_code = (
            ctx.params.get("custom_code_stack", {})
            .get("body_stack", {})
            .get(key, "")
        )

        custom_code = custom_code or get_scenario_example(example_type)
        return custom_code, key

    def render_custom_code(self, ctx, inputs, example_type="CUSTOM_CODE"):
        custom_code, code_key = self.extract_custom_code(ctx, example_type)
        stack = self.render_custom_code_content(inputs, custom_code, code_key)

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
                    ctx, inputs, "custom_code", custom_code_expression
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
        self, inputs, reason="TOO_MANY_CATEGORIES"
    ):
        label, description = None, None

        if reason == "TOO_MANY_CATEGORIES":
            label = "Too many categories."
            description = (
                f"Selected field has too many values to display. "
                + "Please use the custom code to define the scenario."
            )
        if reason == "TOO_MANY_INT_CATEGORIES":
            label = "Too many distinct integer values."
            description = (
                f"Selected field has too many values to display. "
                + "Please use the custom code to define the scenario."
            )
        if reason == "FLOAT_TYPE":
            label = "Float type."
            description = f"To create scenarios based on float fields, please use the custom code mode. "
        if reason == "SLOW":
            label = "Too many values."
            description = f"Found too many distinct values. Please use the auto-complete mode to select the values you want to analyze. "

        inputs.view(
            "use_custom_code_instead_warning",
            types.AlertView(
                severity="warning",
                label=label,
                description=description,
            ),
        )

    def render_use_custom_code_instead(
        self, ctx, inputs, reason="TOO_MANY_CATEGORIES"
    ):
        self.render_use_custom_code_warning(inputs, reason)
        self.render_custom_code(ctx, inputs, example_type=reason)

    def get_saved_view_scenarios_picker_type(self, ctx):
        """
        Returns the view mode for saved views based on the number of available saved views.
        """
        view_names = ctx.dataset.list_saved_views()
        if not view_names:
            return "EMPTY", []

        view_names = sorted(view_names)
        view_len = len(view_names)

        if view_len > MAX_CATEGORIES:
            return "AUTO-COMPLETE", view_names

        return "CHECKBOX", view_names

    def render_saved_views(self, ctx, inputs):
        """Renders sample distribution for subsets using saved views."""

        view_type, view_names = self.get_saved_view_scenarios_picker_type(ctx)

        if view_type == "EMPTY":
            # TODO: Implement design for this case
            self.render_no_values_warning(inputs, "saved views")
            return

        if view_type not in {"AUTO-COMPLETE", "CHECKBOX"}:
            raise ValueError(f"Invalid view type: {view_type}")

        if view_type == "AUTO-COMPLETE":
            self.render_auto_complete_view(ctx, view_names, inputs)
        else:  # CHECKBOX
            self.render_checkbox_view(
                ctx,
                view_names,
                inputs,
                with_description=f"{len(view_names)} saved views available",
            )

    def get_scenario_values_key(self, params):
        """
        returns a unique key that holds the latest selected values for a
        - certain scenario type. has to be one of ("view", "label_attribute", "sample_field")
        - certain scenario field (ex: "tags", "labels")
        """
        scenario_type = self.get_scenario_type(params)
        if scenario_type == "view":
            return f"{scenario_type}_values"

        # a field has to be selected at this point
        scenario_field = params.get("scenario_field", "")
        if not scenario_field:
            raise ValueError("Scenario field is missing")

        return f"{scenario_type}_{scenario_field}_values"

    def get_selected_values(self, params):
        key = self.get_scenario_values_key(params)

        # check if checkbox was used
        selection_view = params.get("checkbox_view_stack", {}) or {}
        selected_values_map = selection_view.get(key, {}) or None

        # check if auto-complete was used
        if not selected_values_map:
            selected_values_map = params.get(key, {}) or {}

        # TODO: why? cleanup
        if isinstance(selected_values_map, list):
            return key, selected_values_map

        return key, [key for key, val in selected_values_map.items() if val]

    def render_checkbox_view(self, ctx, values, inputs, with_description=None):
        scenario_type = self.get_scenario_type(ctx.params)
        key, selected_values = self.get_selected_values(ctx.params)

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
                        "max-height": "275px",
                        "overflowY": "auto",
                    }
                },
            },
        )

        if with_description:
            stack.view(
                "info_header_{scenario_type}_description",
                types.Header(
                    label="",
                    description=with_description,
                    divider=False,
                ),
            )

        obj = types.Object()
        # NOTE: saved views goes through this
        if isinstance(values, list):
            values = {v: 0 for v in values}

        for label, count in values.items():
            formatted_count = f"{count:,}"
            formatted_label = f"{label}" + (
                f" - {formatted_count}" if count > 0 else ""
            )
            obj.bool(
                label,
                default=True if label in selected_values else False,
                label=formatted_label,
                view=types.CheckboxView(space=4),
            )

        # TODO: if none selected, set invalid true
        stack.define_property(key, obj)

        if selected_values:
            self.render_sample_distribution(
                ctx, inputs, scenario_type, selected_values
            )
        else:
            sub = (
                "attribute"
                if scenario_type == "attribute"
                else (
                    "field"
                    if scenario_type == "sample_field"
                    else "saved view"
                )
            )
            self.render_empty_sample_distribution(
                inputs,
                description=f"Select a {sub} to view sample distribution",
            )

    def get_scenarios_picker_type(self, ctx, field_name):
        """
        Determines the scenario picker type for a given field based on its type and distinct values.
        - if the field is of type float, shows custom code mode
        - if the field is boolean, shows checkbox mode
        - if the field has no distinct values, shows empty mode
        - if the field has too many distinct values, shows auto-complete or custom code mode
        - if the field has a manageable number of distinct values, shows checkbox mode

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
            # example counts {True: 2, None: 135888}
            counts = ctx.dataset.count_values(field_name)
            return "CHECKBOX", {
                "true": counts.get(True, 0),
                "false": counts.get(False, 0),
                "none": counts.get(None, 0),
            }

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

    def render_auto_complete_view(self, ctx, values, inputs):
        """
        Renders an auto-complete view as a more compact/efficient input option when,
        - There are too many distinct values to display and The field is of type string.
        - There are too many distinct saved views to display as checkbox.

        Eventually, if there are selected values, it attempts to render the sample distribution preview graph
        """
        values = values or []

        scenario_type = self.get_scenario_type(ctx.params)
        component_key = self.get_scenario_values_key(ctx.params)
        selected_values = ctx.params.get(component_key, []) or []

        self.render_use_custom_code_warning(inputs, reason="SLOW")

        inputs.list(
            component_key,
            types.String(),
            default=selected_values,
            required=True,
            label="",
            description=(
                f"Select saved views to get started. {len(selected_values)} selected"
            ),
            view=types.AutocompleteView(
                multiple=True,
                choices=[types.Choice(value=v, label=v) for v in values],
                allow_duplicates=False,
                allow_user_input=False,
            ),
        )

        if selected_values:
            self.render_sample_distribution(
                ctx, inputs, scenario_type, selected_values
            )
        else:
            sub = (
                "attribute"
                if scenario_type == "attribute"
                else (
                    "field"
                    if scenario_type == "sample_field"
                    else "saved view"
                )
            )
            self.render_empty_sample_distribution(
                inputs,
                description=f"Select a {sub} to view sample distribution",
            )

    def render_scenario_picker_view(self, ctx, field_name, inputs):
        """
        Renders the appropriate UI component based on the picker type.
        """
        view_type, values = self.get_scenarios_picker_type(ctx, field_name)

        render_methods = {
            "EMPTY": lambda: self.render_no_values_warning(inputs, field_name),
            "CODE": lambda: self.render_use_custom_code_instead(
                ctx, inputs, reason=values
            ),
            "AUTO-COMPLETE": lambda: self.render_auto_complete_view(
                ctx, values, inputs
            ),
            "CHECKBOX": lambda: self.render_checkbox_view(ctx, values, inputs),
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
        else:
            self.render_empty_sample_distribution(
                inputs,
                description=f"Select an attribute to view sample distribution",
            )

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
        else:
            self.render_empty_sample_distribution(
                inputs,
                description=f"Select a field to view sample distribution",
            )

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

    def render_custom_code_content(self, inputs, custom_code, code_key):
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

        return stack

    def execute(self, ctx):
        scenario_type = self.get_scenario_type(ctx.params)
        if scenario_type is None:
            raise ValueError("Scenario type must be selected")

        scenario_name = ctx.params.get("scenario_name", None)
        if scenario_name is None or len(scenario_name) < 2:
            raise ValueError("Scenario name is missing")

        store = ctx.store(STORE_NAME)
        scenarios = store.get("scenarios") or {}

        eval_id_a, _ = self.extract_evaluation_ids(ctx)
        if eval_id_a is None:
            raise ValueError("No evaluation ids found")

        scenarios_for_eval = scenarios.get(eval_id_a) or {}

        # TODO
        if scenario_type == "label_attribute":
            print(
                "saving label attribute",
                ctx.params.get("scenario_label_attribute", ""),
            )
        elif scenario_type == "sample_field":
            _, scenario_subsets = self.get_selected_values(ctx.params)

            if not scenario_subsets:
                # check custom_code
                custom_code, _ = self.extract_custom_code(ctx)
                if custom_code:
                    # NOTE: we have to do this to reconstruct the custom code back when edit / view later.
                    scenario_type = "custom_code"
                    scenario_subsets = custom_code
                else:
                    raise ValueError("No sample field selected")
        elif scenario_type == "custom_code":
            custom_code, _ = self.extract_custom_code(ctx)
            _, error = self.process_custom_code(ctx, custom_code)
            if error:
                raise ValueError(f"Error in custom code: {error}")

            scenario_subsets = custom_code
        elif scenario_type == "view":
            _, scenario_subsets = self.get_selected_values(ctx.params)

            if len(scenario_subsets) == 0:
                raise ValueError("No saved views selected")

        # TODO: edit
        scenario_id = ObjectId()
        scenarios_for_eval[str(scenario_id)] = {
            "id": str(scenario_id),
            "name": scenario_name,
            "type": scenario_type,
            "subsets": scenario_subsets,
        }

        scenarios[eval_id_a] = scenarios_for_eval
        store.set("scenarios", scenarios)

        return {
            "scenario_type": ctx.params.get("radio_choices", ""),
            "scenario_field": ctx.params.get("scenario_field", ""),
            "label_attribute": ctx.params.get("label_attribute", ""),
        }
