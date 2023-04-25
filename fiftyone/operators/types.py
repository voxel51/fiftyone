import enum


class BaseType:
    def __init__(self):
        pass

    def to_json(self):
        return {
            "name": self.__class__.__name__,
        }


class Object(BaseType):
    def __init__(self):
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
        view = kwargs.get("view", None)
        if view is None:
            view = View()
        else:
            view = view.clone()
        if label is not None:
            view.label = label
        if description is not None:
            view.description = description
        args = {**kwargs, "view": view}
        property = Property(type, **args)
        self.add_property(name, property)
        return property

    def str(self, name, **kwargs):
        return self.define_property(name, String(), **kwargs)

    def bool(self, name, **kwargs):
        return self.define_property(name, Boolean(), **kwargs)

    def int(self, name, **kwargs):
        return self.define_property(name, Number(int=True), **kwargs)

    def float(self, name, **kwargs):
        return self.define_property(name, Number(float=True), **kwargs)

    def enum(self, name, choices, **kwargs):
        return self.define_property(name, Enum(choices), **kwargs)

    def list(self, name, element_type, **kwargs):
        return self.define_property(name, List(element_type), **kwargs)

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
        invalid_descendants = self.has_invalid_descendants()
        self.invalid = kwargs.get("invalid", invalid_descendants)
        self.default = kwargs.get("default", None)
        self.required = kwargs.get("required", False)
        self.choices = kwargs.get("choices", None)
        self.error_message = kwargs.get("error_message", "Invalid")
        self.view = kwargs.get("view", None)

    def has_invalid_descendants(self):
        if isinstance(self.type, Object):
            for property in self.type.properties.values():
                if property.invalid or property.has_invalid_descendants():
                    return True
        return False

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
    def __init__(self, min=None, max=None, int=False, float=False):
        self.min = min
        self.max = max
        self.int = int
        self.float = float

    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "min": self.min,
            "max": self.max,
            "int": self.int,
            "float": self.float,
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


class OneOf(BaseType):
    def __init__(self, types):
        self.types = types

    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "types": [type.to_json() for type in self.types],
        }


class Tuple(BaseType):
    def __init__(self, *items):
        self.items = items

    def to_json(self):
        return {
            **super().to_json(),
            "items": [item.to_json() for item in self.items],
        }


class Map(BaseType):
    def __init__(self, key_type, value_type):
        self.key_type = key_type
        self.value_type = value_type

    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "key_type": self.key_type.to_json(),
            "value_type": self.value_type.to_json(),
        }


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
        self.space = kwargs.get("space", None)
        self.placeholder = kwargs.get("placeholder", None)
        self.read_only = kwargs.get("read_only", None)
        self._kwargs = kwargs

    def clone(self):
        return self.__class__(**self._kwargs)

    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "label": self.label,
            "description": self.description,
            "caption": self.caption,
            "space": self.space,
            "placeholder": self.placeholder,
            "read_only": self.read_only,
        }


class Form(View):
    def __init__(
        self,
        live=False,
        submit_button_label="Execute",
        cancel_button_label="Close",
        **kwargs
    ):
        super().__init__(**kwargs)
        self.live = live
        self.submit_button_label = submit_button_label
        self.cancel_button_label = cancel_button_label

    def to_json(self):
        return {
            **super().to_json(),
            "live": self.live,
            "submit_button_label": self.submit_button_label,
            "cancel_button_label": self.cancel_button_label,
        }


class ReadonlyView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.read_only = True


class Choice(View):
    def __init__(self, value, **kwargs):
        super().__init__(**kwargs)
        self.value = value

    def clone(self):
        clone = Choice(self.value, **self._kwargs)
        return clone

    def to_json(self):
        return {**super().to_json(), "value": self.value}


class Choices(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.choices = kwargs.get("choices", [])

    def values(self):
        return [choice.value for choice in self.choices]

    def add_choice(self, value, **kwargs):
        choice = Choice(value, **kwargs)
        self.choices.append(choice)
        return choice

    def clone(self):
        clone = super().clone()
        clone.choices = [choice.clone() for choice in self.choices]
        return clone

    def to_json(self):
        return {
            **super().to_json(),
            "name": self.__class__.__name__,
            "choices": [choice.to_json() for choice in self.choices],
        }


class RadioGroup(Choices):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.orientation = kwargs.get("orientation", None)

    def to_json(self):
        return {
            **super().to_json(),
            "orientation": self.orientation,
        }


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


class Error(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Button(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.href = kwargs.get("href", None)
        self.operator = kwargs.get("operator", None)
        self.params = kwargs.get("params", None)

    def to_json(self):
        return {
            **super().to_json(),
            "href": self.href,
            "operator": self.operator,
            "params": self.params,
        }


class OneOfView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.oneof = kwargs.get("oneof", [])

    def to_json(self):
        return {
            **super().to_json(),
            "oneof": [one.to_json() for one in self.oneof],
        }


class ListView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.items = kwargs.get("items", None)

    def to_json(self):
        return {
            **super().to_json(),
            "items": self.items.to_json() if self.items else None,
        }


class TupleView(View):
    def __init__(self, *itemsView, **options):
        super().__init__(**options)
        self.items = itemsView

    def to_json(self):
        return {
            **super().to_json(),
            "items": [item.to_json() for item in self.items],
        }


class CodeView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.language = kwargs.get("language", None)

    def to_json(self):
        return {**super().to_json(), "language": self.language}


class ColorView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.compact = kwargs.get("compact", False)
        self.variant = kwargs.get("variant", None)

    def to_json(self):
        return {
            **super().to_json(),
            "compact": self.compact,
            "variant": self.variant,
        }


class TabsView(Choices):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.variant = kwargs.get("variant", None)

    def to_json(self):
        return {**super().to_json(), "variant": self.variant}


class JSONView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class AutocompleteView(Choices):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class FileView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class LinkView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.href = kwargs.get("href", None)

    def to_json(self):
        return {**super().to_json(), "href": self.href}


class HiddenView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class LoadingView(ReadonlyView):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class PlotlyView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.data = kwargs.get("data", None)
        self.config = kwargs.get("config", None)
        self.layout = kwargs.get("layout", None)

    def to_json(self):
        return {
            **super().to_json(),
            "data": self.data,
            "config": self.config,
            "layout": self.layout,
        }


class Placement:
    def __init__(self, place, view=None):
        self.place = place
        self.view = view

    def to_json(self):
        return {
            "place": self.place.to_json(),
            "view": self.view.to_json() if self.view else None,
        }


class Places(enum.Enum):
    SAMPLES_GRID_ACTIONS = "samples-grid-actions"
    SAMPLES_GRID_SECONDARY_ACTIONS = "samples-grid-secondary-actions"
    EMBEDDINGS_ACTIONS = "embeddings-actions"
    HISTOGRAM_ACTIONS = "histograms-actions"
    MAP_ACTIONS = "map-actions"
    MAP_SECONDARY_ACTIONS = "map-secondary-actions"
    DISPLAY_OPTIONS = "display-options"

    def to_json(self):
        return self.value


class KeyValueView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Column(View):
    def __init__(self, key, **kwargs):
        super().__init__(**kwargs)
        self.key = key

    def clone(self):
        clone = Column(self.key, **self._kwargs)
        return clone

    def to_json(self):
        return {**super().to_json(), "key": self.key}


class TableView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.columns = kwargs.get("columns", [])

    def keys(self):
        return [column.key for column in self.columns]

    def add_column(self, key, **kwargs):
        column = Column(key, **kwargs)
        self.columns.append(column)
        return column

    def clone(self):
        clone = super().clone()
        clone.columns = [column.clone() for column in self.columns]
        return clone

    def to_json(self):
        return {
            **super().to_json(),
            "columns": [column.to_json() for column in self.columns],
        }


class MapView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.key = kwargs.get("key", None)
        self.value = kwargs.get("value", None)

    def to_json(self):
        return {
            **super().to_json(),
            "key": self.key.to_json() if self.key else None,
            "value": self.value.to_json() if self.value else None,
        }
