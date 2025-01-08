"""
FiftyOne operators.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .types import Object, PromptView


BUILTIN_OPERATOR_PREFIX = "@voxel51/operators"


class OperatorConfig(object):
    """A configuration for an operator.

    Args:
        name: the name of the operator
        label (name): a label for the operator
        description (None): a description of the operator
        dynamic (False): whether the operator inputs and outputs should be
            resolved when the input/output changes
        execute_as_generator (False): whether the operator should be executed
            as a generator
        unlisted (False): whether the operator should be hidden from the
            Operator Browser
        on_startup (False): whether the operator should be executed on startup
        on_dataset_open (False): whether the operator should be executed on
            opening a dataset
        disable_schema_validation (False): whether the operator built-in schema
            validation should be disabled
        icon (None): icon to show for the operator in the Operator Browser
        light_icon (None): icon to show for the operator in the Operator Browser
            when the App is in the light mode
        dark_icon (None): icon to show for the operator in the Operator Browser
            when the App is in the dark mode
        allow_immediate_execution (True): whether the operator should allow
            immediate execution
        allow_delegated_execution (False): whether the operator should allow
            delegated execution
        default_choice_to_delegated (False): whether to default to delegated
            execution, if allowed
        resolve_execution_options_on_change (None): whether to resolve
            execution options dynamically when inputs change. By default, this
            behavior will match the ``dynamic`` setting
    """

    def __init__(
        self,
        name,
        label=None,
        description=None,
        dynamic=False,
        execute_as_generator=False,
        unlisted=False,
        on_startup=False,
        on_dataset_open=False,
        disable_schema_validation=False,
        delegation_target=None,
        icon=None,
        light_icon=None,
        dark_icon=None,
        allow_immediate_execution=True,
        allow_delegated_execution=False,
        default_choice_to_delegated=False,
        resolve_execution_options_on_change=None,
        **kwargs
    ):
        self.name = name
        self.label = label or name
        self.description = description
        self.dynamic = dynamic
        self.execute_as_generator = execute_as_generator
        self.unlisted = unlisted
        self.on_startup = on_startup
        self.on_dataset_open = on_dataset_open
        self.disable_schema_validation = disable_schema_validation
        self.delegation_target = delegation_target
        self.icon = icon
        self.light_icon = light_icon
        self.dark_icon = dark_icon
        self.allow_immediate_execution = allow_immediate_execution
        self.allow_delegated_execution = allow_delegated_execution
        self.default_choice_to_delegated = default_choice_to_delegated
        if resolve_execution_options_on_change is None:
            self.resolve_execution_options_on_change = dynamic
        else:
            self.resolve_execution_options_on_change = (
                resolve_execution_options_on_change
            )
        self.kwargs = kwargs  # unused, placeholder for future extensibility

    def to_json(self):
        return {
            "name": self.name,
            "label": self.label,
            "description": self.description,
            "execute_as_generator": self.execute_as_generator,
            "unlisted": self.unlisted,
            "dynamic": self.dynamic,
            "on_startup": self.on_startup,
            "on_dataset_open": self.on_dataset_open,
            "disable_schema_validation": self.disable_schema_validation,
            "delegation_target": self.delegation_target,
            "icon": self.icon,
            "light_icon": self.light_icon,
            "dark_icon": self.dark_icon,
            "allow_immediate_execution": self.allow_immediate_execution,
            "allow_delegated_execution": self.allow_delegated_execution,
            "default_choice_to_delegated": self.default_choice_to_delegated,
            "resolve_execution_options_on_change": self.resolve_execution_options_on_change,
        }


class Operator(object):
    """A FiftyOne operator.

    Operators represent an operation and the details of how to execute it.

    FiftyOne operators contain enough information for a user interface to
    render a form or button allowing a user to execute the operation.
    """

    def __init__(self, _builtin=False):
        # Plugin names are populated when the operators are registered
        plugin_name = BUILTIN_OPERATOR_PREFIX if _builtin else None

        self._builtin = _builtin
        self._plugin_secrets = None
        self.plugin_name = plugin_name

    @property
    def name(self):
        return self.config.name

    @property
    def uri(self):
        """The unique identifier of the operator:
        ``plugin_name/operator_name``.
        """
        return "%s/%s" % (self.plugin_name, self.name)

    @property
    def builtin(self):
        """Whether the operator is builtin."""
        return self._builtin

    @property
    def config(self):
        """The :class:`OperatorConfig` for the operator."""
        raise NotImplementedError("subclass must implement config")

    def resolve_delegation(self, ctx):
        """Returns the resolved *forced* delegation flag.

        Subclasses can implement this method to decide if delegated execution
        should be *forced* for the given operation.

        Args:
            ctx: the :class:`fiftyone.operators.executor.ExecutionContext`

        Returns:
            whether the operation should be delegated (True), run immediately
            (False), or None to defer to :meth:`resolve_execution_options` to
            specify the available options
        """
        return None

    def resolve_execution_options(self, ctx):
        """Returns the resolved execution options.

        Subclasses can implement this method to define the execution options
        available for the operation.

        Args:
            ctx: the :class:`fiftyone.operators.executor.ExecutionContext`

        Returns:
            a :class:`fiftyone.operators.executor.ExecutionOptions` instance
        """
        from .executor import ExecutionOptions

        # Defer to forced delegation, if implemented
        # pylint: disable=assignment-from-none
        delegate = self.resolve_delegation(ctx)
        if delegate is not None:
            return ExecutionOptions(
                allow_immediate_execution=not delegate,
                allow_delegated_execution=delegate,
            )

        return ExecutionOptions(
            allow_immediate_execution=self.config.allow_immediate_execution,
            allow_delegated_execution=self.config.allow_delegated_execution,
            default_choice_to_delegated=self.config.default_choice_to_delegated,
        )

    def execute(self, ctx):
        """Executes the operator.

        Subclasses must implement this method.

        Args:
            ctx: the :class:`fiftyone.operators.executor.ExecutionContext`

        Returns:
            JSON serializable data, or None
        """
        raise NotImplementedError("subclass must implement execute()")

    def resolve_type(self, ctx, type):
        """Returns the resolved input or output property.

        Args:
            ctx: the :class:`fiftyone.operators.executor.ExecutionContext`
            type: the type of property to resolve, either ``"inputs"`` or
                ``"outputs"``

        Returns:
            a :class:`fiftyone.operators.types.Property`, or None
        """
        if type == "inputs":
            # pylint: disable=assignment-from-none
            input_property = self.resolve_input(ctx)
            if input_property and input_property.view is None:
                should_delegate = self.resolve_delegation(ctx)
                if should_delegate:
                    input_property.view = PromptView(
                        submit_button_label="Schedule"
                    )
            return input_property

        if type == "outputs":
            return self.resolve_output(ctx)

        raise ValueError("Invalid type '%s'" % type)

    def resolve_input(self, ctx):
        """Returns the resolved input property.

        Subclasses can implement this method to define the inputs to the
        operator. This method should never be called directly. Instead
        use :meth:`resolve_type`.

        By default, this method is called once when the operator is created.
        If the operator is dynamic, this method is called each time the input
        changes.

        Args:
            ctx: the :class:`fiftyone.operators.executor.ExecutionContext`

        Returns:
            a :class:`fiftyone.operators.types.Property`, or None
        """
        return None

    def resolve_output(self, ctx):
        """Returns the resolved output property.

        Subclasses can implement this method to define the outputs of the
        operator.

        By default, this method is called once when the operator is created.
        If the operator is dynamic, this method is called after the operator is
        executed.

        Args:
            ctx: the :class:`fiftyone.operators.executor.ExecutionContext`

        Returns:
            a :class:`fiftyone.operators.types.Property`, or None
        """
        return None

    def resolve_placement(self, ctx):
        """Returns the resolved placement of the operator.

        Subclasses can implement this method to define the placement of the
        operator.

        Args:
            ctx: the :class:`fiftyone.operators.executor.ExecutionContext`

        Returns:
            a :class:`fiftyone.operators.types.Placement`, or None
        """
        return None

    def method_to_uri(self, method_name):
        """Converts a method name to a URI.

        Args:
            method_name: the method name

        Returns:
            a URI
        """
        return "%s#%s" % (self.uri, method_name)

    def to_json(self):
        """Returns a JSON representation of the operator.

        Returns:
            a JSON dict
        """
        return {
            "config": self.config.to_json(),
            "plugin_name": self.plugin_name,
            "_builtin": self._builtin,
            "uri": self.uri,
        }

    def add_secrets(self, secrets):
        """Adds secrets to the operator.

        Args:
            secrets: a list of secrets
        """
        if not self._plugin_secrets:
            self._plugin_secrets = []
        self._plugin_secrets.extend(secrets)
