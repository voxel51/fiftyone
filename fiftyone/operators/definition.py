"""
FiftyOne operator definitions.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .types import Object, Property


class OperatorDefinition:
    def __init__(self):
        self._inputs = Object()
        self._outputs = Object()

    @property
    def input_properties(self):
        return self._inputs or []

    @property
    def output_properties(self):
        return self._outputs or []

    def add_input_property(self, name, type, **kwargs):
        property = Property(name, type, **kwargs)
        return self._inputs.add_property(property)

    def add_output_property(self, name, type, **kwargs):
        property = Property(name, type, **kwargs)
        return self._outputs.add_property(property)

    def to_json(self):
        return {
            "inputs": self._inputs.to_json(),
            "outputs": self._outputs.to_json(),
        }
