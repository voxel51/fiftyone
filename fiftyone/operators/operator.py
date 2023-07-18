"""
FiftyOne operators.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .types import Object, Form, Property


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
        disable_schema_validation (False): whether the operator built-in schema
            validation should be disabled
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
        disable_schema_validation=False,
        icon=None,
        light_icon=None,
        dark_icon=None,
    ):
        self.name = name
        self.label = label or name
        self.description = description
        self.dynamic = dynamic
        self.execute_as_generator = execute_as_generator
        self.unlisted = unlisted
        self.on_startup = on_startup
        self.disable_schema_validation = disable_schema_validation
        self.icon = icon
        self.dark_icon = dark_icon
        self.light_icon = light_icon

    def to_json(self):
        return {
            "name": self.name,
            "label": self.label,
            "description": self.description,
            "execute_as_generator": self.execute_as_generator,
            "unlisted": self.unlisted,
            "dynamic": self.dynamic,
            "on_startup": self.on_startup,
            "disable_schema_validation": self.disable_schema_validation,
            "icon": self.icon,
            "dark_icon": self.dark_icon,
            "light_icon": self.light_icon,
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
        self.plugin_name = plugin_name
        self.definition = Object()
        self.definition.define_property("inputs", Object())
        self.definition.define_property("outputs", Object())

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

    def resolve_definition(self, resolve_dynamic, ctx):
        """Returns a resolved definition of the operator.

        The resolved definition is a clone of the default definition using
        :meth:`resolve_input` and :meth:`resolve_output` to resolve the inputs
        and output properties of the operator.

        Passing ``resolve_dynamic=False`` allows resolution of dynamic
        operators to be deferred to execution time. If the operator
        ``is_dyanmic`` and ``resolve_dynamic`` is False, a clone of default
        definition is returned.

        Args:
            resolve_dynamic: whether to resolve dynamic inputs and outputs
            ctx: the :class:`fiftyone.operators.executor.ExecutionContext`

        Returns:
            a definition :class:`fiftyone.operators.types.Object`
        """
        definition = self.definition.clone()
        if self.config.dynamic and not resolve_dynamic:
            return definition

        # pylint: disable=assignment-from-none
        input_property = self.resolve_input(ctx)
        output_property = self.resolve_output(ctx)

        if input_property is not None:
            definition.add_property("inputs", input_property)

        if output_property is not None:
            definition.add_property("outputs", output_property)

        return definition

    def execute(self, ctx):
        """Executes the operator.

        Subclasses must implement this method.

        Args:
            ctx: the :class:`fiftyone.operators.executor.ExecutionContext`
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
            # @todo support forms in UI
            # if input_property.view is None:
            #     input_property.view = Form()
            return self.resolve_input(ctx)

        if type == "outputs":
            return self.resolve_output(ctx)

        raise ValueError("Invalid type '%s'" % type)

    def resolve_input(self, ctx):
        """Returns the resolved input property.

        Subclasses can implement this method to define the inputs to the
        operator.

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

    def to_json(self, ctx, resolve_dynamic=False):
        """Returns a JSON representation of the operator.

        Args:
            ctx: the :class:`fiftyone.operators.executor.ExecutionContext`
            resolve_dynamic (False): whether to resolve dynamic inputs and
                outputs

        Returns:
            a JSON dict
        """
        definition = self.resolve_definition(resolve_dynamic, ctx)
        return {
            "config": self.config.to_json(),
            "definition": definition.to_json(),
            "plugin_name": self.plugin_name,
            "_builtin": self._builtin,
            "uri": self.uri,
        }
