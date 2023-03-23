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
        self._needsResolution = False

    def add_property(self, property):
        self.properties.append(property)
        return property

    def define_property(self, name, type, **kwargs):
        property = Property(name, type, **kwargs)
        self.properties.append(property)
        return property

    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "properties": [p.to_json() for p in self.properties],
            "needsResolution": self._needsResolution,
        }

    def dynamic(self):
        self._needsResolution = True


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
    def __init__(self, min=None, max=None, int=False):
        self.min = min
        self.max = max
        self.int = int
    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "min": self.min,
            "max": self.max,
            "int": self.int,
        }


class List(BaseType):
    def __init__(self, element_type):
        self.element_type = element_type

    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "element_type": self.element_type.to_json(),
        }

class SampleID(String):
    def __init__(self):
        pass

class Enum(BaseType):
    def __init__(self, values):
        self.values = values

    def to_json(self):
        return {"name": self.__class__.__name__, "values": self.values}

class Plot(BaseType):
    def __init__(self):
        pass
