"""
FiftyOne operators.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .definition import OperatorDefinition


class Operator:
    """A FiftyOne operator.

    Operators represent an operation and the details of how to execute it.

    FiftyOne operators contain enough information for a user interface to
    render a form or button allowing a user to execute the operation.
    Args:
        name (None): the name of the operator.
    """

    def __init__(
        self,
        name=None,
        description=None,
        input_view=None,
        output_view=None,
    ):
        if name is None:
            raise ValueError("Operator name cannot be None")

        self.name = name
        defintion = types.Object()

        self.definition.define_property(
            "inputs", types.Object(), view=input_view
        )
        self.definition.define_property(
            "outputs", types.Object(), view=output_view
        )

    @property
    def inputs(self):
        return self.definition.get_property("inputs")

    @property
    def outputs(self):
        return self.definition.get_property("outputs")

    def __eq__(self, other):
        return type(other) == type(self) and self.name == other.name

    def __copy__(self):
        return self  # operators are singletons

    def __deepcopy__(self, memo):
        return self  # operators are singletons

    def execute(self, ctx):
        """Executes the operator. Subclasses must implement this method."""
        raise NotImplementedError("subclass must implement execute()")

    def resolve_type(self, ctx, type):
        if type == "inputs":
            return self.resolve_input(ctx)
        elif type == "outputs":
            return self.resolve_output(ctx)
        else:
            raise ValueError("Invalid type '%s'" % type)

    def resolve_input(self, ctx):
        return self.definition.get_property("inputs")

    def resolve_output(self, ctx):
        return self.definition.get_property("outputs")

    def to_json(self):
        """Returns a JSON representation of the operator."""
        return {
            "name": self.name,
            "definition": self.definition.to_json(),
        }


class DynamicOperator(Operator):
    def __init__(
        self,
        name=None,
        description=None,
    ):
        super().__init__(name, description)
        self.definition.get_property("inputs").dynamic()
