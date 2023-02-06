"""
FiftyOne operator definitions.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


class OperatorDefinition:
    def __init__(self):
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
        return self._trigger or OperationTrigger()

    def add_input_property(
        self, name, type, default=None, required=False, choices=None
    ):
        self._inputs.append(
            OperatorProperty(name, type, default, required, choices)
        )

    def add_output_property(
        self, name, type, default=None, required=False, choices=None
    ):
        self._outputs.append(
            OperatorProperty(name, type, default, required, choices)
        )

    def set_trigger(self, trigger):
        self._trigger = trigger


class OperatorProperty:
    def __init__(self, name, type):
        self.name = name
        self.type = type
        self.default = None
        self.required = False
        self.choices = None
        self.component = None


class OperatorTrigger:
    def __init__(self):
        print("OperatorTrigger.__init__()")
