"""
FiftyOne operators.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .types import Object, Form, Property


class Operator:
    """A FiftyOne operator.

    Operators represent an operation and the details of how to execute it.

    FiftyOne operators contain enough information for a user interface to
    render a form or button allowing a user to execute the operation.

    Args:
        name (None): the name of the operator.
        label (None): a label for the operator.
        description (None): a description of the operator.

    Attributes:
        name: the name of the operator
        label: a label for the operator
        description: a description of the operator
        definition: a read-only Object representation of the default operator definition
        plugin_name: the name of the plugin that registered the operator
        execute_as_generator: whether the operator should be executed as a generator
        unlisted: whether the operator should be listed in the Operator Browser
        is_dynamic: whether the operator inputs and outputs should be resolved when the input/output changes
        uri: The read-only globally unique identifier for the operator in the form ``plugin_name/operator_name``.
    """

    def __init__(self, name, label=None, description=None, **kwargs):
        if name is None:
            raise ValueError("Operator name cannot be None")
        self.name = name
        self.label = label or name
        self.description = description
        self.definition = Object()
        self.plugin_name = None
        self.execute_as_generator = False
        self.unlisted = kwargs.get("unlisted", False)
        self.is_dynamic = False
        self._built_in = False

    def dispose(self):
        """Classes that inherit from Operator can override this method to
        perform any cleanup when the operator is disposed.
        """
        pass

    @property
    def uri(self):
        plugin_name = self.plugin_name or "@voxel51"
        return "%s/%s" % (plugin_name, self.name)

    def resolve_definition(self, resolve_dynamic, ctx):
        """Returns a resolved definition of the operator.

        The resolved definition is a clone of the default definition using
        resolve_input() and resolve_output() to resolve the inputs and output
        :class:`Property` instances.

        ``resolve_dynamic=False`` allows resolution of dynamic operators to be deferred to execution time.

        If the operator ``is_dyanmic`` and ``resolve_dynamic`` is False, a clone of default definition is returned.

        Args:
            resolve_dynamic: whether to resolve dynamic inputs and outputs
        """

        definition = self.definition.clone()
        if self.is_dynamic and not resolve_dynamic:
            return definition
        # pylint: disable=assignment-from-none
        input_property = self.resolve_input(ctx)
        output_property = self.resolve_output(ctx)
        # pylint: enable=assignment-from-none
        if input_property is not None:
            definition.add_property("inputs", input_property)
        if output_property is not None:
            definition.add_property("outputs", output_property)
        return definition

    def execute(self, ctx):
        """Executes the operator. Subclasses must implement this method.

        Args:
            ctx: the :class:`ExecutionContext` for the execution of the operation
        """
        raise NotImplementedError("subclass must implement execute()")

    def resolve_type(self, ctx, type):
        """Returns the resolved input or output :class:`Property`.

        Args:
            ctx: the :class:`ExecutionContext` for the execution of the operation
            type: the type of property to resolve, either "inputs" or "outputs"
        """
        if type == "inputs":
            # pylint: disable=assignment-from-none
            resolved_input_property = self.resolve_input(ctx)
            # pylint: enable=assignment-from-none
            # TODO support Form in UI
            # if resolved_input_property.view is None:
            #     resolved_input_property.view = Form()
            return resolved_input_property
        elif type == "outputs":
            return self.resolve_output(ctx)
        else:
            raise ValueError("Invalid type '%s'" % type)

    def resolve_input(self, ctx):
        """Returns the resolved input :class:`Property`.

        Subclasses can implement this method to define the inputs to the operator.

        By default this method is called once when the operator is created.

        If the operator is dynamic, this method is called each time the input changes.

        Args:
            ctx: the :class:`ExecutionContext` for the execution of the operation
        """
        return None

    def resolve_output(self, ctx):
        """Returns the resolved output :class:`Property`.

        Subclasses can implement this method to define the outputs of the operator.

        By default this method is called once when the operator is created.

        If the operator is dynamic, this method is called after the operator is executed.

        Args:
            ctx: the :class:`ExecutionContext` for the execution of the operation
        """
        return None

    def resolve_placement(self, ctx):
        """Returns the resolved placement of the operator.

        Subclasses can implement this method to define the placement of the operator.

        Args:
            ctx: the :class:`ExecutionContext` for the execution of the operation
        """
        return None

    def to_json(self, ctx, resolve_dynamic=False):
        """Returns a JSON representation of the operator."""
        return {
            "name": self.name,
            "label": self.label,
            "description": self.description,
            "definition": self.resolve_definition(
                resolve_dynamic, ctx
            ).to_json(),
            "plugin_name": self.plugin_name,
            "uri": self.uri,
            "execute_as_generator": self.execute_as_generator,
            "unlisted": self.unlisted,
            "is_dynamic": self.is_dynamic,
            "_built_in": self._built_in,
        }


class DynamicOperator(Operator):
    """A dynamic FiftyOne operator.

    NOTE: this class will be removed.
    """

    def __init__(
        self,
        name=None,
        description=None,
    ):
        super().__init__(name, description)
        self.is_dynamic = True
