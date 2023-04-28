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

    def dispose(self):
        pass

    @property
    def uri(self):
        plugin_name = self.plugin_name or "@voxel51"
        return "%s/%s" % (plugin_name, self.name)

    def resolve_definition(self, resolve_dynamic, ctx):
        definition = self.definition.clone()
        if self.is_dynamic and not resolve_dynamic:
            return definition
        input_property = self.resolve_input(ctx)
        output_property = self.resolve_output(ctx)
        if input_property is not None:
            definition.add_property("inputs", input_property)
        if output_property is not None:
            definition.add_property("outputs", output_property)
        return definition

    def execute(self, ctx):
        """Executes the operator. Subclasses must implement this method."""
        raise NotImplementedError("subclass must implement execute()")

    def resolve_type(self, ctx, type):
        if type == "inputs":
            resolved_input_property = self.resolve_input(ctx)
            # TODO support Form in UI
            # if resolved_input_property.view is None:
            #     resolved_input_property.view = Form()
            return resolved_input_property
        elif type == "outputs":
            return self.resolve_output(ctx)
        else:
            raise ValueError("Invalid type '%s'" % type)

    def resolve_input(self, ctx):
        return None

    def resolve_output(self, ctx):
        return None

    def resolve_placement(self, ctx):
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
        }


class DynamicOperator(Operator):
    def __init__(
        self,
        name=None,
        description=None,
    ):
        super().__init__(name, description)
        self.is_dynamic = True
