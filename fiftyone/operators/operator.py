"""
FiftyOne operators.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .types import Object, Form


class Operator:
    """A FiftyOne operator.

    Operators represent an operation and the details of how to execute it.

    FiftyOne operators contain enough information for a user interface to
    render a form or button allowing a user to execute the operation.
    Args:
        name (None): the name of the operator.
    """

    def __init__(self, name, label=None, description=None, **kwargs):
        if name is None:
            raise ValueError("Operator name cannot be None")
        self.name = name
        self.label = label or name
        self.description = description
        self.definition = Object()
        self.definition.define_property("inputs", Object(), view=Form())
        self.definition.define_property("outputs", Object())
        self.plugin_name = None
        self.execute_as_generator = False
        self.unlisted = kwargs.get("unlisted", False)

    def dispose(self):
        pass

    @property
    def uri(self):
        plugin_name = self.plugin_name or "@voxel51"
        return "%s/%s" % (plugin_name, self.name)

    @property
    def inputs(self):
        return self.definition.get_property("inputs")

    @property
    def outputs(self):
        return self.definition.get_property("outputs")

    def define_input_property(self, name, type, **kwargs):
        return self.inputs.type.define_property(name, type, **kwargs)

    def define_output_property(self, name, type, **kwargs):
        return self.outputs.type.define_property(name, type, **kwargs)

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
            resolved_input_property = self.resolve_input(ctx)
            if resolved_input_property.view is None:
                resolved_input_property.view = Form()
            return resolved_input_property
        elif type == "outputs":
            return self.resolve_output(ctx)
        else:
            raise ValueError("Invalid type '%s'" % type)

    def resolve_input(self, ctx):
        return self.definition.get_property("inputs")

    def resolve_output(self, ctx):
        return self.definition.get_property("outputs")

    def resolve_placement(self, ctx):
        return None

    def to_json(self):
        """Returns a JSON representation of the operator."""
        return {
            "name": self.name,
            "label": self.label,
            "description": self.description,
            "definition": self.definition.to_json(),
            "plugin_name": self.plugin_name,
            "uri": self.uri,
            "execute_as_generator": self.execute_as_generator,
            "unlisted": self.unlisted,
        }


class DynamicOperator(Operator):
    def __init__(
        self,
        name=None,
        description=None,
    ):
        super().__init__(name, description)
        self.definition.get_property("inputs").type.dynamic()
