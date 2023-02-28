class BaseType:
    def __init__(self):
        pass

    def to_json(self):
        return {
            "name": self.__class__.__name__,
        }


class Object(BaseType):
    def __init__(self):
        self.properties = []

    def add_property(self, property):
        self.properties.append(property)
        return property

    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "properties": [p.to_json() for p in self.properties],
        }


class Property:
    def __init__(self, name, type, **kwargs):
        self.name = name
        self.type = type
        self.default = kwargs.get("default", None)
        self.required = kwargs.get("required", False)
        self.choices = kwargs.get("choices", None)

    def to_json(self):
        return {
            "name": self.name,
            "type": self.type.to_json(),
            "default": self.default,
            "required": self.required,
            "choices": self.choices,
        }


class String(BaseType):
    def __init__(self):
        pass


class Boolean(BaseType):
    def __init__(self):
        pass


class Number(BaseType):
    def __init__(self):
        pass


class List(BaseType):
    def __init__(self, element_type):
        self.element_type = element_type

    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "element_type": self.element_type.to_json(),
        }


class Enum(BaseType):
    def __init__(self, values):
        self.values = values

    def to_json(self):
        return {"name": self.__class__.__name__, "values": self.values}


class Plot(BaseType):
    def __init__(self):
        pass


class Trigger(BaseType):
    def __init__(self, operator_name):
        self.operator_name = operator_name

    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "operator_name": self.operator_name,
        }


class SelectSamples(Trigger):
    def __init__(self):
        super().__init__("select_samples")
