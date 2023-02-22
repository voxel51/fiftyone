class BaseType:
    def __init__(self):
        pass

    def to_json(self):
        return {
            "name": self.__class__.__name__,
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
            "element_type": self.element_type,
        }


class Enum(BaseType):
    def __init__(self, values):
        self.values = values

    def to_json(self):
        return {"name": self.__class__.__name__, "values": self.values}


class Plot(BaseType):
    def __init__(self):
        pass
