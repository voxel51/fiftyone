"""
Scenario plugin.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.operators as foo
import fiftyone.operators.types as types
import fiftyone.core.fields as fof
from fiftyone.operators.cache import execution_cache

from bson import ObjectId
from fiftyone.core.expressions import ViewField as F
from .utils import (
    get_scenario_example,
    SCENARIO_BUILDING_CHOICES,
    ALLOWED_BY_TYPES,
    KEY_COLOR,
    COMPARE_KEY_COLOR,
    MAX_CATEGORIES,
    CustomCodeViewReason,
    ShowOptionsMethod,
    ScenarioType,
)
from plugins.utils import get_subsets_from_custom_code

STORE_NAME = "model_evaluation_panel_builtin"


class ConfigureScenario(foo.Operator):
    # tracks the last view type opened
    last_view_type_used = None

    @property
    def config(self):
        return foo.OperatorConfig(
            name="model_evaluation_configure_scenario",
            label="Configure scenario",
            dynamic=True,
            unlisted=True,
        )

    def render_name_input(self, ctx, inputs):
        params = ctx.params
        scenario_name = params.get("scenario_name", None)

        is_edit_mode = True if ctx.params.get("scenario_id", None) else False
        scenario_names = self.get_scenario_names(ctx)

        is_invalid = False
        error_message = ""

        if is_edit_mode:
            original_name = params.get("original_name", None)
            if scenario_name != original_name:
                if scenario_name in scenario_names:
                    is_invalid = True
                    error_message = "Scenario name already exists"
        else:
            if scenario_name in scenario_names:
                is_invalid = True
                error_message = "Scenario name already exists"

        inputs.str(
            "scenario_name",
            label="Scenario name",
            default=scenario_name,
            required=True,
            view=types.TextFieldView(
                label="Scenario Name",
                placeholder="Enter a name for the scenario",
            ),
            invalid=is_invalid,
            error_message=error_message,
        )

    def render_scenario_types(self, inputs, selected_type):
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

    def extract_evaluation_keys(self, ctx):
        key = ctx.params.get("key", None)
        compare_key = ctx.params.get("compare_key", None)
        return key, compare_key

    def extract_evaluation_id(self, ctx):
        return ctx.params.get("eval_id")

    def get_subset_def_data_for_eval_key(
        self, ctx, eval_key, _, name, subset_def
    ):
        """
        Builds and returns an execution cache key for each type of scenario.
        - eval key + name + type + subset definition
        """
        scenario_type = self.get_scenario_type(ctx.params)

        if scenario_type == ScenarioType.CUSTOM_CODE:
            key = [
                "sample-distribution-data",
                eval_key,
                name,
                scenario_type,
                str(subset_def),
            ]
        elif scenario_type == ScenarioType.VIEW:
            key = [
                "sample-distribution-data",
                eval_key,
                name,
                scenario_type,
                subset_def.get("view", ""),
            ]
        else:
            if isinstance(subset_def, list):
                subset_def = subset_def[0]

            key = [
                "sample-distribution-data",
                eval_key,
                name,
                scenario_type,
                str(subset_def),
            ]

        return key

    @execution_cache(key_fn=get_subset_def_data_for_eval_key)
    def get_subset_def_data_for_eval(
        self, ctx, _, eval_result, name, subset_def
    ):
        x, y = [], []
        with eval_result.use_subset(subset_def):
            x.append(name)
            y.append(len(eval_result.ytrue_ids))
        return x, y

    def get_sample_distribution(self, ctx, subset_expressions):
        try:
            eval_key_a, eval_key_b = self.extract_evaluation_keys(ctx)

            eval_result_a = ctx.dataset.load_evaluation_results(eval_key_a)
            if eval_key_b:
                eval_result_b = ctx.dataset.load_evaluation_results(eval_key_b)

            plot_data = []
            x = []
            y = []
            for name, subset_def in subset_expressions.items():
                more_x, more_y = self.get_subset_def_data_for_eval(
                    ctx, eval_key_a, eval_result_a, name, subset_def
                )
                x += more_x
                y += more_y

            plot_data.append(
                {
                    "x": x,
                    "y": y,
                    "type": "bar",
                    "name": eval_key_a,
                    "marker": {"color": KEY_COLOR},
                }
            )

            if eval_key_b and eval_result_b:
                compare_x = []
                compare_y = []

                for name, subset_def in subset_expressions.items():
                    more_x, more_y = self.get_subset_def_data_for_eval(
                        ctx, eval_key_b, eval_result_b, name, subset_def
                    )
                    compare_x += more_x
                    compare_y += more_y

                plot_data.append(
                    {
                        "x": compare_x,
                        "y": compare_y,
                        "type": "bar",
                        "name": eval_key_b,
                        "marker": {"color": COMPARE_KEY_COLOR},
                    }
                )

            return plot_data
        except Exception as e:
            # TODO show Alert / error
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
                    }
                )

        return plot_data

    def is_sample_distribution_enabled_for_custom_code(self, params):
        # NOTE: performance might lack if it is on by default.
        return (
            params.get("custom_code_stack", {})
            .get("control_stack", {})
            .get("view_sample_distribution", False)
        )

    def render_empty_sample_distribution(
        self, inputs, params, description=None
    ):
        scenario_type = self.get_scenario_type(params)
        # NOTE: custom code validation happens at render_custom_code when exec() is called
        is_invalid = scenario_type != ScenarioType.CUSTOM_CODE

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
            invalid=is_invalid,
            error_message="No values selected" if is_invalid else None,
        )

    def get_label_attribute_path(self, params):
        """
        Returns the last part of the label attribute path to use in use_subset(type="attribute", ...)
        """
        field_name = params.get("scenario_label_attribute")
        if not field_name:
            field_name = params.get("scenario_field")

        if "." in field_name:
            field_name = field_name.split(".")[-1]

        return field_name

    def render_sample_distribution(self, ctx, inputs, scenario_type, values):
        if not values:
            return self.render_empty_sample_distribution(inputs, ctx.params)

        subsets = {}
        if scenario_type == ScenarioType.LABEL_ATTRIBUTE:
            field_name = self.get_label_attribute_path(ctx.params)
            for v in values:
                subsets[v] = dict(type="attribute", field=field_name, value=v)
            self.render_sample_distribution_graph(ctx, inputs, subsets)

        if scenario_type == ScenarioType.SAMPLE_FIELD:
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

        if scenario_type == ScenarioType.VIEW:
            for v in values:
                subsets[v] = dict(type=ScenarioType.VIEW, view=v)
            self.render_sample_distribution_graph(ctx, inputs, subsets)

        if scenario_type == ScenarioType.CUSTOM_CODE:
            if not self.is_sample_distribution_enabled_for_custom_code(
                ctx.params
            ):
                return self.render_empty_sample_distribution(
                    inputs,
                    ctx.params,
                    description="You can toggle the 'View sample distribution' to see the preview.",
                )
            else:
                # NOTE: values for custom_code is the parsed custom code expression
                self.render_sample_distribution_graph(ctx, inputs, values)

    def render_sample_distribution_graph(
        self, ctx, inputs, subset_expressions
    ):
        plot_data = self.get_sample_distribution(ctx, subset_expressions)

        preview_container = inputs.grid("grid", height="400px", width="100%")
        preview_height = "300px"
        preview_container.plot(
            "plot_preview",
            label="Sample distribution preview",
            config=dict(
                scrollZoom=False,  # Disable zoom on scroll
            ),
            data=plot_data,
            height=preview_height,
            width="100%",
        )

    def get_custom_code_key(self, params):
        scenario_type = self.get_scenario_type(params)

        if scenario_type in [
            ScenarioType.LABEL_ATTRIBUTE,
            ScenarioType.SAMPLE_FIELD,
        ]:
            scenario_field = params.get("scenario_field", "")
            return f"custom_code_{scenario_type}_{scenario_field}"

        return ScenarioType.CUSTOM_CODE

    def extract_custom_code(self, ctx, example_type=ScenarioType.CUSTOM_CODE):
        # NOTE: this was causing infinite loop if missing replace
        key = self.get_custom_code_key(ctx.params).replace(".", "_")

        custom_code = (
            ctx.params.get("custom_code_stack", {})
            .get("body_stack", {})
            .get(key, "")
        )

        if not custom_code:
            custom_code = ctx.params.get("scenario_subsets_code", None)

        if not custom_code:
            custom_code = get_scenario_example(example_type)

        return custom_code, key

    def render_custom_code(
        self, ctx, inputs, example_type=ScenarioType.CUSTOM_CODE
    ):
        custom_code, code_key = self.extract_custom_code(ctx, example_type)
        stack = self.render_custom_code_content(inputs, custom_code, code_key)
        self.last_view_type_used = ShowOptionsMethod.CODE

        if custom_code:
            custom_code_expression, error = get_subsets_from_custom_code(
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
                    error_message="There is an error in custom code.",
                    invalid=True,
                )
            else:
                self.render_sample_distribution(
                    ctx,
                    inputs,
                    ScenarioType.CUSTOM_CODE,
                    custom_code_expression,
                )

    def render_no_values_warning(self, inputs, field_name, link=""):
        inputs.view(
            "no_values_warning",
            types.AlertView(
                severity="warning",
                label="No values found",
                description=(
                    f"Field {field_name} has no values to display. {link}"
                ),
            ),
            error_message="No values found.",
            invalid=True,
        )

    def render_use_custom_code_warning(
        self, inputs, reason=CustomCodeViewReason.TOO_MANY_CATEGORIES
    ):
        label, description, severity = None, None, "warning"

        if reason == CustomCodeViewReason.TOO_MANY_CATEGORIES:
            label = "Too many categories."
            description = (
                f"Selected field has too many values to display. "
                + "Please use the custom code to define the scenario."
            )
        if reason == CustomCodeViewReason.TOO_MANY_INT_CATEGORIES:
            label = "Too many distinct integer values."
            description = (
                f"Selected field has too many values to display. "
                + "Please use the custom code to define the scenario."
            )
        if reason == CustomCodeViewReason.FLOAT_TYPE:
            label = "Float type."
            description = f"To create scenarios based on float fields, please use the custom code mode. "
        if reason == CustomCodeViewReason.SLOW:
            severity = "info"
            label = "Too many values."
            description = f"Found too many distinct values. Please use the auto-complete mode to select the values you want to analyze. "

        inputs.view(
            "use_custom_code_instead_warning",
            types.AlertView(
                severity=severity,
                label=label,
                description=description,
            ),
        )

    def render_use_custom_code_instead(
        self, ctx, inputs, reason=CustomCodeViewReason.TOO_MANY_CATEGORIES
    ):
        self.render_use_custom_code_warning(inputs, reason)
        self.render_custom_code(ctx, inputs, example_type=reason)

    def get_saved_view_scenarios_picker_type(self, ctx):
        """
        Returns the view mode for saved views based on the number of available saved views.
        """
        view_names = ctx.dataset.list_saved_views()
        if not view_names:
            return ShowOptionsMethod.EMPTY, []

        view_names = sorted(view_names)
        view_len = len(view_names)

        if view_len > MAX_CATEGORIES:
            return ShowOptionsMethod.AUTOCOMPLETE, view_names

        return ShowOptionsMethod.CHECKBOX, view_names

    def render_saved_views(self, ctx, inputs):
        """Renders sample distribution for subsets using saved views."""
        view_type, view_names = self.get_saved_view_scenarios_picker_type(ctx)
        self.last_view_type_used = view_type

        if view_type == ShowOptionsMethod.EMPTY:
            # TODO: Implement design for this case
            self.render_no_values_warning(
                inputs,
                "saved views",
                link="[Learn how to create a saved view](https://docs.voxel51.com/user_guide/using_views.html#saving-views)",
            )
            return

        if view_type not in {
            ShowOptionsMethod.AUTOCOMPLETE,
            ShowOptionsMethod.CHECKBOX,
        }:
            raise ValueError(f"Invalid view type: {view_type}")

        if view_type == ShowOptionsMethod.AUTOCOMPLETE:
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
        - certain scenario type. has to be one of type ScenarioType
        - certain scenario field (ex: "tags", "labels")
        """
        scenario_type = self.get_scenario_type(params)
        if scenario_type == ScenarioType.VIEW:
            return f"{scenario_type}_values"

        # sample_field selected
        scenario_field = params.get("scenario_field", "")
        if not scenario_field:
            # label attribute selected
            scenario_field = params.get("scenario_label_attribute", "")

        if not scenario_field:
            raise ValueError("Scenario field is missing")

        return f"{scenario_type}_{scenario_field}_values".replace(".", "_")

    def get_selected_values(self, params):
        key = self.get_scenario_values_key(params)
        selected_values = None

        # checkbox
        if self.last_view_type_used == ShowOptionsMethod.CHECKBOX:
            selection_view = params.get("checkbox_view_stack", {}) or {}
            selected_values = selection_view.get(key, None) or None

        # auto-complete
        if self.last_view_type_used == ShowOptionsMethod.AUTOCOMPLETE:
            selected_values = params.get(key, None)

        # maybe values were passed in. ex: Edit flow
        if not selected_values:
            selected_values = params.get("scenario_subsets", {}) or {}

        if isinstance(selected_values, list):
            return key, selected_values

        return key, [key for key, val in selected_values.items() if val]

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

        stack.define_property(key, obj)

        if selected_values:
            self.render_sample_distribution(
                ctx, inputs, scenario_type, selected_values
            )
        else:
            sub = (
                "attribute"
                if scenario_type == ScenarioType.LABEL_ATTRIBUTE
                else (
                    "field"
                    if scenario_type == ScenarioType.SAMPLE_FIELD
                    else "saved view"
                )
            )
            self.render_empty_sample_distribution(
                inputs,
                ctx.params,
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
            return ShowOptionsMethod.CODE, CustomCodeViewReason.FLOAT_TYPE
        if isinstance(field, fof.BooleanField):
            # example counts {True: 2, None: 135888}
            counts = ctx.dataset.count_values(field_name)
            return ShowOptionsMethod.CHECKBOX, {
                "true": counts.get(True, 0),
                "false": counts.get(False, 0),
                "none": counts.get(None, 0),
            }

        # Retrieve distinct values (may be slow for large datasets)
        distinct_values = ctx.dataset.distinct(field_name)
        distinct_count = len(distinct_values)

        if distinct_count == 0:
            return ShowOptionsMethod.EMPTY, None

        if distinct_count > MAX_CATEGORIES:
            if isinstance(field, fof.StringField):
                return ShowOptionsMethod.AUTOCOMPLETE, distinct_values
            if isinstance(field, fof.IntField):
                return (
                    ShowOptionsMethod.CODE,
                    CustomCodeViewReason.TOO_MANY_INT_CATEGORIES,
                )
            else:
                return (
                    ShowOptionsMethod.CODE,
                    CustomCodeViewReason.TOO_MANY_CATEGORIES,
                )

        # NOTE: may be slow for large datasets
        values = ctx.dataset.count_values(field_name)
        return (
            (ShowOptionsMethod.EMPTY, None)
            if not values
            else (ShowOptionsMethod.CHECKBOX, dict(sorted(values.items())))
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
        component_key, selected_values = self.get_selected_values(ctx.params)

        self.render_use_custom_code_warning(
            inputs, reason=CustomCodeViewReason.SLOW
        )

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
                invalid=True if not selected_values else False,
                error_message=(
                    "No values selected" if not selected_values else ""
                ),
            ),
        )

        if selected_values:
            self.render_sample_distribution(
                ctx, inputs, scenario_type, selected_values
            )
        else:
            sub = (
                "attribute"
                if scenario_type == ScenarioType.LABEL_ATTRIBUTE
                else (
                    "field"
                    if scenario_type == ScenarioType.SAMPLE_FIELD
                    else "saved view"
                )
            )
            self.render_empty_sample_distribution(
                inputs,
                ctx.params,
                description=f"Select a {sub} to view sample distribution",
            )

    def render_scenario_picker_view(self, ctx, field_name, inputs):
        """
        Renders the appropriate UI component based on the picker type.
        """
        view_type, values = self.get_scenarios_picker_type(ctx, field_name)
        self.last_view_type_used = view_type

        render_methods = {
            ShowOptionsMethod.EMPTY: lambda: self.render_no_values_warning(
                inputs, field_name
            ),
            ShowOptionsMethod.CODE: lambda: self.render_use_custom_code_instead(
                ctx, inputs, reason=values
            ),
            ShowOptionsMethod.AUTOCOMPLETE: lambda: self.render_auto_complete_view(
                ctx, values, inputs
            ),
            ShowOptionsMethod.CHECKBOX: lambda: self.render_checkbox_view(
                ctx, values, inputs
            ),
        }

        render_methods.get(view_type, lambda: None)()

    def get_valid_label_attribute_path_options(self, schema, gt_field):
        """
        Returns all the paths in the dataset schema that are valid label attributes types.
        - primitives
        - OR list of primitives
        - AND path starts with gt_field
        """
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
            # NOTE: we show the last part of the path as the label attribute
            label_choices.add_choice(option, label=option.split(".")[-1])

        label_attr_exists = True if label_attr in valid_options else False

        inputs.enum(
            "scenario_label_attribute",
            label_choices.values(),
            default=label_attr if label_attr_exists else None,
            label="Label attribute",
            description="Select a label attribute",
            view=label_choices,
            required=True,
        )

        if label_attr and label_attr_exists:
            self.render_scenario_picker_view(ctx, label_attr, inputs)
        else:
            self.render_empty_sample_distribution(
                inputs,
                ctx.params,
                description=f"Select an attribute to view sample distribution",
            )

    def get_valid_sample_field_path_options(self, flat_field_schema):
        """
        Get valid sample field path options based on the schema.
        - Filters out
            - fields having roots with type as List of documents
            - non-primitives
            - non-list of primitives
        """
        options = []

        # Build a list of bad root paths: any path that is a list of documents
        # Fields inside a list of documents should be filtered out in sample_fields dropdown filtering.
        # TODO: BMoore/Ritchie to take a look at this
        bad_roots = tuple(
            k + "."
            for k, v in flat_field_schema.items()
            if isinstance(v, fof.ListField)
            and isinstance(v.field, fof.EmbeddedDocumentField)
        )

        for field_path, field in flat_field_schema.items():
            if field_path.startswith(bad_roots):
                continue

            if isinstance(field, ALLOWED_BY_TYPES):
                options.append(field_path)
            elif isinstance(field, fof.ListField) and isinstance(
                field.field, ALLOWED_BY_TYPES
            ):
                options.append(field_path)

        return options

    def render_sample_fields(self, ctx, inputs, field_name=None):
        schema = ctx.dataset.get_field_schema(flat=True)
        valid_options = self.get_valid_sample_field_path_options(schema)

        field_choices = types.Choices()
        for option in valid_options:
            field_choices.add_choice(option, label=option)

        label_attr_exists = True if field_name in valid_options else False

        inputs.str(
            "scenario_field",
            default=field_name if label_attr_exists else None,
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
                ctx.params,
                description=f"Select a field to view sample distribution",
            )

    def get_scenario_type(self, params):
        scenario_type = params.get("scenario_type", None)

        if scenario_type not in [
            ScenarioType.VIEW,
            ScenarioType.CUSTOM_CODE,
            ScenarioType.LABEL_ATTRIBUTE,
            ScenarioType.SAMPLE_FIELD,
        ]:
            return ScenarioType.CUSTOM_CODE

        return scenario_type

    def get_modal_title(self, ctx):
        scenario_id = ctx.params.get("scenario_id", None)
        label = "Edit scenario" if scenario_id else "Create scenario"
        return label

    def get_scenario_names(self, ctx):
        store = ctx.store(STORE_NAME)
        scenarios = store.get("scenarios") or {}

        eval_id_a = self.extract_evaluation_id(ctx)
        scenarios = scenarios.get(eval_id_a) or {}

        return [scenario.get("name") for _, scenario in scenarios.items()]

    def resolve_input(self, ctx):
        inputs = types.Object()

        self.render_name_input(ctx, inputs)
        inputs.str(
            "key",
            view=types.HiddenView(),
        )

        scenario_type = self.get_scenario_type(ctx.params)
        self.render_scenario_types(inputs, scenario_type)

        scenario_id = ctx.params.get("scenario_id", None)
        loaded_scenario_changes = ctx.params.get("panel_state", {}).get(
            f"scenario_{scenario_id}_changes"
        )

        if loaded_scenario_changes:
            for change in loaded_scenario_changes.get("changes", []):
                inputs.view(
                    f"changes_alert_{change.get('label', '')}",
                    types.AlertView(
                        severity="warning",
                        label=change.get("label", ""),
                        description=change.get("description", ""),
                    ),
                )

        inputs.str("compare_key", view=types.HiddenView())
        inputs.str("scenario_id", view=types.HiddenView())

        selected_scenario_field = ctx.params.get("scenario_field", None)
        gt_field = ctx.params.get("gt_field", None)

        if scenario_type == ScenarioType.CUSTOM_CODE:
            self.render_custom_code(ctx, inputs)
        if scenario_type == ScenarioType.LABEL_ATTRIBUTE:
            selected_scenario_field = ctx.params.get(
                "scenario_label_attribute", None
            )
            if not selected_scenario_field:
                selected_scenario_field = ctx.params.get(
                    "scenario_field", None
                )

            self.render_label_attribute(
                ctx, inputs, gt_field, selected_scenario_field
            )
        if scenario_type == ScenarioType.VIEW:
            self.render_saved_views(ctx, inputs)
        if scenario_type == ScenarioType.SAMPLE_FIELD:
            self.render_sample_fields(ctx, inputs, selected_scenario_field)

        prompt = types.PromptView(
            submit_button_label="Analyze scenario",
            label=self.get_modal_title(ctx),
        )
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
            default=False,
            label="View sample distribution",
            view=types.CheckboxView(
                componentsProps={
                    "container": {
                        "sx": {
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

        eval_id_a = self.extract_evaluation_id(ctx)
        if eval_id_a is None:
            raise ValueError("No evaluation ids found")

        store = ctx.store(STORE_NAME)
        scenarios = store.get("scenarios") or {}

        scenarios_for_eval = scenarios.get(eval_id_a) or {}
        scenario_field = None

        if scenario_type in [
            ScenarioType.LABEL_ATTRIBUTE,
            ScenarioType.SAMPLE_FIELD,
        ]:
            if scenario_type == ScenarioType.SAMPLE_FIELD:
                scenario_field = ctx.params.get("scenario_field", "")
            elif scenario_type == ScenarioType.LABEL_ATTRIBUTE:
                scenario_field = ctx.params.get("scenario_label_attribute", "")

            # for example uniqueness scenario_field in sample_field mode would show custom code
            if self.last_view_type_used == ShowOptionsMethod.CODE:
                custom_code, _ = self.extract_custom_code(ctx)
                if custom_code:
                    # NOTE: we have to do this to reconstruct the custom code back when edit / view later.
                    scenario_type = ScenarioType.CUSTOM_CODE
                    scenario_subsets = custom_code
                    scenario_field = None  # save None when custom code is used
                else:
                    raise ValueError("Cannot extract custom code for scenario")
            else:
                _, scenario_subsets = self.get_selected_values(ctx.params)

        elif scenario_type == ScenarioType.CUSTOM_CODE:
            custom_code, _ = self.extract_custom_code(ctx)
            _, error = get_subsets_from_custom_code(ctx, custom_code)
            if error:
                raise ValueError(f"Error in custom code: {error}")

            scenario_subsets = custom_code
            scenario_field = None  # save None when custom code is used
        elif scenario_type == ScenarioType.VIEW:
            _, scenario_subsets = self.get_selected_values(ctx.params)

            if len(scenario_subsets) == 0:
                raise ValueError("No saved views selected")

            scenario_field = None

        existing_scenario_id = ctx.params.get("scenario_id", None)
        if existing_scenario_id:
            scenario_id = existing_scenario_id
        else:
            scenario_id = ObjectId()

        scenario_id_str = str(scenario_id)
        scenarios_for_eval[scenario_id_str] = {
            "id": scenario_id_str,
            "name": scenario_name,
            "type": scenario_type,
            "subsets": scenario_subsets,
        }

        if scenario_field:
            scenarios_for_eval[scenario_id_str]["field"] = scenario_field

        scenarios[eval_id_a] = scenarios_for_eval
        store.set("scenarios", scenarios)

        ctx.ops.track_event(
            "scenario_created",
            {
                "id": scenario_id_str,
                "name": scenario_name,
                "type": scenario_type,
                "subsets": scenario_subsets,
            },
        )

        return {
            "scenario_type": ctx.params.get("radio_choices", ""),
            "scenario_field": ctx.params.get("scenario_field", ""),
            ScenarioType.LABEL_ATTRIBUTE: ctx.params.get(
                ScenarioType.LABEL_ATTRIBUTE, ""
            ),
            "name": scenario_name,
            "id": scenario_id_str,
        }
