class BaseType:
    def __init__(self):
        pass

    def to_json(self):
        return {
            "name": self.__class__.__name__,
        }


class Object(BaseType):
    def __init__(self, **kwargs):
        self.properties = {}
        self._needsResolution = False

    def add_property(self, name, property):
        self.properties[name] = property
        return property

    def get_property(self, name):
        return self.properties.get(name, None)

    def define_property(self, name, type, **kwargs):
        label = kwargs.get("label", None)
        description = kwargs.get("description", None)
        view = kwargs.get("view", View())
        if label is not None:
            view.label = label
        if description is not None:
            view.description = description
        args = {**kwargs, "view": view}
        property = Property(type, **args)
        self.add_property(name, property)
        return property

    def to_json(self):
        # convert properties to json
        properties = {}
        for name, property in self.properties.items():
            properties[name] = property.to_json()
        return {
            "name": self.__class__.__name__,
            "properties": properties,
            "needsResolution": self._needsResolution,
        }

    def dynamic(self):
        self._needsResolution = True


class Property(BaseType):
    def __init__(self, type, **kwargs):
        self.type = type
        self.default = kwargs.get("default", None)
        self.required = kwargs.get("required", False)
        self.choices = kwargs.get("choices", None)
        self.view = kwargs.get("view", None)

    def to_json(self):
        return {
            "type": self.type.to_json(),
            "default": self.default,
            "required": self.required,
            "choices": self.choices,
            "view": self.view.to_json() if self.view else None,
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
    def __init__(self, element_type, min_items=None, max_items=None):
        self.element_type = element_type
        self.min_items = min_items
        self.max_items = max_items

    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "element_type": self.element_type.to_json(),
            "min_items": self.min_items,
            "max_items": self.max_items,
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
    def __init__(self, **kwargs):
        self.title = kwargs.get("title", None)
        self.description = kwargs.get("description", None)
        self.caption = kwargs.get("caption", None)
        self.spaces = kwargs.get("spaces", None)

    def to_json(self):
        return {"name": self.__class__.__name__, "values": self.values}


#
# Trigger
#


class Trigger(BaseType):
    def __init__(self, operator, params=None):
        self.operator = operator
        self.params = params

    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "operator": self.operator,
            "params": self.params,
        }


#
# Views
#


class View:
    def __init__(self, **kwargs):
        self.label = kwargs.get("label", None)
        self.description = kwargs.get("description", None)
        self.caption = kwargs.get("caption", None)
        self.spaces = kwargs.get("spaces", None)

    def to_json(self):
        return {
            "label": self.label,
        }


class Choice(View):
    def __init__(self, value, **kwargs):
        super().__init__(**kwargs)
        self.value = value


class Choices(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.choices = kwargs.get("choices", [])

    def values(self):
        return [choice.value for choice in self.choices]

    def to_json(self):
        return {
            **super().to_json(),
            "name": self.__class__.__name__,
            "choices": self.choices,
        }


class RadioGroup(Choices):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Dropdown(Choices):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Notice(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Header(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Warning(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Button(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
