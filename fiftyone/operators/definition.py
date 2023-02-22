"""
FiftyOne operator definitions.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


class OperatorDefinition:
    def __init__(self, description):
        self.description = description
        self._inputs = []
        self._outputs = []
        self._trigger = None

    @property
    def input_properties(self):
        return self._inputs or []

    @property
    def output_properties(self):
        return self._outputs or []

    @property
    def trigger(self):
        return self._trigger

    def add_input_property(self, name, type):
        self._inputs.append(OperatorProperty(name, type))

    def add_output_property(self, name, type):
        self._outputs.append(OperatorProperty(name, type))

    def set_trigger(self, trigger):
        self._trigger = trigger

    def to_json(self):
        return {
            "inputs": [p.to_json() for p in self.input_properties],
            "outputs": [p.to_json() for p in self.output_properties],
            "trigger": self.trigger.to_json() if self.trigger else None,
        }


class OperatorProperty:
    def __init__(self, name, type):
        self.name = name
        self.type = type
        self.default = None
        self.required = False
        self.choices = None
        self.component = None

    def to_json(self):
        return {
            "name": self.name,
            "type": self.type.to_json(),
            "default": self.default,
            "required": self.required,
            "choices": self.choices,
            "component": self.component,
        }


class OperatorTrigger:
    def __init__(self):
        print("OperatorTrigger.__init__()")

    def to_json(self):
        return {}
