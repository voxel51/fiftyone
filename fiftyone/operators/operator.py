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
    ):
        if name is None:
            raise ValueError("Operator name cannot be None")

        self.name = name
        self.definition = OperatorDefinition(description)

    def __eq__(self, other):
        return type(other) == type(self) and self.name == other.name

    def __copy__(self):
        return self  # operators are singletons

    def __deepcopy__(self, memo):
        return self  # operators are singletons

    def execute(self, ctx):
        """Executes the operator. Subclasses must implement this method."""
        raise NotImplementedError("subclass must implement execute()")

    def to_json(self):
        """Returns a JSON representation of the operator."""
        return {
            "name": self.name,
            "definition": self.definition.to_json(),
        }
