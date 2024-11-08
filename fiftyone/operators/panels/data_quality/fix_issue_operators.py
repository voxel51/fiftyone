import fiftyone as fo
import fiftyone.operators as foo
import fiftyone.operators.types as types


class DeleteSamples(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_samples",
            label="Delete Quality Issue Samples",
            dynamic=True,
            unlisted=True,
        )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.md(
            """Are you sure you want to remove these samples from your dataset?
                  """
        )
        radio_group = types.RadioGroup()
        radio_group.add_choice(
            "yes", label="Yes", description="Remove the selected samples"
        )
        radio_group.add_choice(
            "no",
            label="No",
            description="Will not remove the selected samples",
        )
        inputs.enum("choice", radio_group.values(), view=radio_group)

        # Ask user if they want to make this the default method for handling
        # this issue
        radio_group2 = types.RadioGroup()
        radio_group2.add_choice(
            "yes",
            label="Yes",
            description="Make this the default method for handling this issue",
        )
        radio_group2.add_choice(
            "no",
            label="No",
            description="Do not make this the default method for handling this issue",
        )
        inputs.enum("save_default", radio_group2.values(), view=radio_group2)
        inputs.view_target(ctx)
        return types.Property(inputs)

    def execute(self, ctx):
        target_view = ctx.target_view()
        if ctx.params["choice"] == "yes":
            if ctx.params["save_default"] == "yes":
                issue_config = ctx.panel.state.issue_config
                issue_config[ctx.panel.state.issue_type][
                    "default_method"
                ] = "delete"
                ctx.panel.state.issue_config = issue_config
            ctx.dataset.delete_samples(target_view)
            ctx.ops.set_view(ctx.dataset.view())


class TagSamples(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="tag_samples",
            label="Tag Quality Issue Samples",
            dynamic=True,
            unlisted=True,
        )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.md(
            """What names would you like to tag these samples with?
                  """
        )
        # Add text input for tag name
        inputs.str("tag_name", label="Tag Name", required=True)

        # Ask user if they want to make this the default method for handling
        # this issue
        radio_group2 = types.RadioGroup()
        radio_group2.add_choice(
            "yes",
            label="Yes",
            description="Make this the default method for handling this issue",
        )
        radio_group2.add_choice(
            "no",
            label="No",
            description="Do not make this the default method for handling this issue",
        )
        inputs.enum("save_default", radio_group2.values(), view=radio_group2)

        inputs.view_target(ctx)
        return types.Property(inputs)

    def execute(self, ctx):
        target_view = ctx.target_view()
        if ctx.params["save_default"] == "yes":
            issue_config = ctx.panel.state.issue_config
            issue_config[ctx.panel.state.issue_type]["default_method"] = "tag"
            ctx.panel.state.issue_config = issue_config
        target_view.tag_samples(ctx.params["tag_name"])


class SaveView(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="save_view",
            label="Data Quality Panel Save View",
            dynamic=True,
            unlisted=True,
        )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str(
            "temp_text",
            view=types.HeaderView(
                title="title",
                label="Create View",
            ),
        )
        inputs.str("view_name", description="Name", view=types.TextFieldView())
        inputs.str(
            "description", description="Description", view=types.FieldView()
        )
        # TODO: Fix color picker
        inputs.str("Color", view=types.ColorView())

        # Ask user if they want to make this the default method for handling
        # this issue
        radio_group2 = types.RadioGroup()
        radio_group2.add_choice(
            "yes",
            label="Yes",
            description="Make this the default method for handling this issue",
        )
        radio_group2.add_choice(
            "no",
            label="No",
            description="Do not make this the default method for handling this issue",
        )
        inputs.enum("save_default", radio_group2.values(), view=radio_group2)

        inputs.view_target(ctx)
        return types.Property(inputs)

    def execute(self, ctx):
        ctx.ops.track_event("data_quality_panel_save_view")
        target_view = ctx.target_view()

        if ctx.params["save_default"] == "yes":
            issue_config = ctx.panel.state.issue_config
            issue_config[ctx.panel.state.issue_type][
                "default_method"
            ] = "save_view"
            ctx.panel.state.issue_config = issue_config

        ctx.dataset.save_view(
            ctx.params["view_name"], target_view, ctx.params["description"]
        )
        ctx.ops.set_view(name=ctx.params["view_name"])
