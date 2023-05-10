import enum


class BaseType:
    """Base class for all types."""

    def __init__(self):
        pass

    def to_json(self):
        return {
            "name": self.__class__.__name__,
        }


class Void(BaseType):
    """Represents a void type."""

    def __init__(self):
        pass

    def to_json(self):
        return {
            "name": self.__class__.__name__,
        }


class Object(BaseType):
    """Represents a JSON object."""

    def __init__(self):
        self.properties = {}

    def add_property(self, name, property):
        """Adds a property to the object.

        Args:
            name: the name of the :class:`Property`
            property: the :class:`Property` to add
        Returns:
            the :class:`Property` that was added
        """
        self.properties[name] = property
        return property

    def get_property(self, name):
        """Gets a property by name.

        Args:
            name: the name of the :class:`Property`
        Returns:
            the :class:`Property`, or None if not found
        """
        return self.properties.get(name, None)

    def define_property(self, name, type, **kwargs):
        """Defines a property on the object.

        Args:
            name: the name of the :class:`Property`
            type: the type of the :class:`Property`
            label (None): the :class:`View`.label of the :class:`Property`
            description (None): the :class:`View`.description of the :class:`Property`
            view (None): the :class:`View` of the :class:`Property`

        Returns:
            the :class:`Property` that was added
        """
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
        """Defines a property on the object that is a string.

        Args:
            name: the name of the :class:`Property`
            label (None): the :class:`View`.label of the :class:`Property`
            description (None): the :class:`View`.description of the :class:`Property`
            view (None): the :class:`View` of the :class:`Property`
        """
        return self.define_property(name, String(), **kwargs)

    def bool(self, name, **kwargs):
        """Defines a property on the object that is a boolean.

        Args:
            name: the name of the :class:`Property`
            label (None): the :class:`View`.label of the :class:`Property`
            description (None): the :class:`View`.description of the :class:`Property`
            view (None): the :class:`View` of the :class:`Property`
        """
        return self.define_property(name, Boolean(), **kwargs)

    def int(self, name, **kwargs):
        """Defines a property on the object that is an integer.

        Args:
            name: the name of the :class:`Property`
            label (None): the :class:`View`.label of the :class:`Property`
            description (None): the :class:`View`.description of the :class:`Property`
            view (None): the :class:`View` of the :class:`Property`
        """
        return self.define_property(name, Number(int=True), **kwargs)

    def float(self, name, **kwargs):
        """Defines a property on the object that is a float.

        Args:
            name: the name of the :class:`Property`
        """
        return self.define_property(name, Number(float=True), **kwargs)

    def enum(self, name, values, **kwargs):
        """Defines a property on the object that is an enum.

        Args:
            name: the name of the :class:`Property`
            values: a list of values that define the enum
            label (None): the :class:`View`.label of the :class:`Property`
            description (None): the :class:`View`.description of the :class:`Property`
            view (None): the :class:`View` of the :class:`Property`

        Note:
            The view can be a :class:`Choices`, :class:`RadioGroup`, or :class:`Dropdown`
        """
        return self.define_property(name, Enum(values), **kwargs)

    def list(self, name, element_type, **kwargs):
        """Defines a property on the object that is a list.

        Args:
            name: the name of the :class:`Property`
            element_type: the type of the elements in the list
            label (None): the :class:`View`.label of the :class:`Property`
            description (None): the :class:`View`.description of the :class:`Property`
            view (None): the :class:`View` of the :class:`Property`
        """
        return self.define_property(name, List(element_type), **kwargs)

    def obj(self, name, **kwargs):
        """Defines a property on the object that is an object.

        Args:
            name: the name of the :class:`Property`
            label (None): the :class:`View`.label of the :class:`Property`
            description (None): the :class:`View`.description of the :class:`Property`
            view (None): the :class:`View` of the :class:`Property`
        """

        return self.define_property(name, Object(), **kwargs)

    def view(self, view):
        """Defines a :class:`Void` view-only property.

        Examples::

            import fiftyone.operator.types as types

            inputs = types.Object()
            inputs.view(types.Notice(label="Hello World"))

        Args:
            view: the :class:`View` to define
        """
        return Property(Void(), view=view)

    def message(self, label, **kwargs):
        """Defines a message to display to the user.

        Args:
            label: the :class:`View`.label of the :class:`Notice`
            description (None): the :class:`View`.description of the :class:`Notice`
            view (None): the :class:`View` of the :class:`Notice`
        """
        view = kwargs.get("view", Notice())
        if label is None:
            view.label = label
        return self.view(view)

    def clone(self):
        """Clones the definition of the object."""
        clone = Object()
        clone.properties = self.properties.copy()
        return clone

    def to_json(self):
        """Converts the object definition to json."""
        properties = {}
        for name, property in self.properties.items():
            properties[name] = property.to_json()
        return {"name": self.__class__.__name__, "properties": properties}


class Property(BaseType):
    """Represents a property on an :class:`Operator` :class:`Object`.

    Properties are used to define the data that an :class:`Operator` can accept as input and return as output.

    Properties may also define a :class:`View` that can be used to customize how the property behaves in the FiftyOne App.

    Examples::

        import fiftyone.operators.types as types

        my_object = types.Object()
        # define a string property
        my_object.str("name", label="Name", description="The name of the object")

        # define a enum property with a custom view
        radio_group = types.RadioGroup()
        radio_group.add_choice("car", "A Brand New Car")
        radio_group.add_choice("truck", "A Fancy Truck")
        my_object.enum("type", radio_group.values(), view=radio_group)

    Args:
        type: the type of the :class:`Property`
        invalid (False): whether the :class:`Property` is invalid
        default (None): the default value of the :class:`Property`
        required (False): whether the :class:`Property` is required
        error_message ("Invalid"): the error message of the :class:`Property`
        view (None): the :class:`View` of the :class:`Property`

    Attributes:
        type: the type of the :class:`Property`
        invalid: whether the :class:`Property` is invalid
        default: the default value of the :class:`Property`
        required: whether the :class:`Property` is required
        error_message: the error message of the :class:`Property`
        view: the :class:`View` of the :class:`Property`
    """

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
            "invalid": self.invalid,
            "error_message": self.error_message,
            "view": self.view.to_json() if self.view else None,
        }


class String(BaseType):
    """Represents a string."""

    def __init__(self):
        pass


class Boolean(BaseType):
    """Represents a boolean."""

    def __init__(self):
        pass


class Number(BaseType):
    """Represents a number.

    Args:
        min (None): the minimum value of the :class:`Number`
        max (None): the maximum value of the :class:`Number`
        int (False): whether the :class:`Number` is an integer
        float (False): whether the :class:`Number` is a float
    """

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
    """Represents a list.

    Args:
        element_type: the type of the elements in the :class:`List`
        min_items (None): the minimum number of items in the :class:`List`
        max_items (None): the maximum number of items in the :class:`List`
    """

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
    """Represents a :class:`fiftyone.core.Sample` ID."""

    def __init__(self):
        pass


class Enum(BaseType):
    """Represents an enum.

    Args:
        values: the values of the :class:`Enum`
    """

    def __init__(self, values):
        self.values = values

    def to_json(self):
        return {"name": self.__class__.__name__, "values": self.values}


class OneOf(BaseType):
    """Represents a one-of type.

    Example:

        import fiftyone.operators.types as types

        my_object = types.Object()
        my_object.define_property("my_property", types.OneOf([types.String(), types.Number()])

    Args:
        types: the types of the :class:`OneOf`
    """

    def __init__(self, types):
        self.types = types

    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "types": [type.to_json() for type in self.types],
        }


class Tuple(BaseType):
    """Represents a tuple.

    Example:

        import fiftyone.operators.types as types
        inputs = types.Object()
        inputs.define_property("image", types.Tuple(types.String(), types.Number()))

    Args:
        *items: the types of the :class:`Tuple`
    """

    def __init__(self, *items):
        self.items = items

    def to_json(self):
        return {
            **super().to_json(),
            "items": [item.to_json() for item in self.items],
        }


class Map(BaseType):
    """Represents a map.

    Example:

        import fiftyone.operators.types as types
        inputs = types.Object()
        inputs.define_property("image", types.Map(types.String(), types.Number()))

    Args:
        key_type: the type of the keys in the :class:`Map`
        value_type: the type of the values in the :class:`Map`
    """

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
# Views
#


class View:
    """Represents a view of a :class:`Property`.

    A ``View`` is used to define how a :class:`Property` is displayed in the FiftyOne App.

    Args:
        label (None): a label for the :class:`View`
        description (None): a description for the :class:`View`
        caption (None): a caption for the :class:`View`
        space (12): An ``int`` specifying how much vertical space to allocate out of ``12``.
        placeholder (None): string to display placeholder text
        read_only (False): whether the :class:`View` is read-only
    """

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
            **self._kwargs,
        }


class InferredView(View):
    """Represents a view of a :class:`Property` that is inferred from the data.

    Note:
        You cannot only use an ``InferredView`` for an input :class:`Property`.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


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
    """An alias for :class:`View` with ``read_only=True``."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.read_only = True


class Choice(View):
    """Represents a choice in a :class:`Choices` :class:`View`.

    Args:
        value: the value of the choice
        label (None): a label for the :class:`Choice`
        description (None): a description for the :class:`Choice`
        caption (None): a caption for the :class:`Choice`
    """

    def __init__(self, value, **kwargs):
        super().__init__(**kwargs)
        self.value = value

    def clone(self):
        """Clones the :class:`Choice`.

        Returns:
            a :class:`Choice`
        """
        clone = Choice(self.value, **self._kwargs)
        return clone

    def to_json(self):
        return {**super().to_json(), "value": self.value}


class Choices(View):
    """Represents a set of choices in a :class:`View`.

    Use this :class:`View` to define a set of choices for a :class:`Property` that
    can be selected by the user and require labels and optional descriptions.

    Example::

        import fiftyone.operators.types as types

        inputs = types.Object()
        choices = types.Choices()
        choices.add_choice("cat", label="Cat", description="A cat")
        choices.add_choice("dog", label="Dog", description="A dog")
        inputs.enum("animal", choices.values(), view=choices)

        # you can also replace ``Choices`` with any class that inherits from it.
        choices = types.RadioGroup()
        # or
        choices = types.Dropdown()

    Args:
        choices (None): a list of :class:`Choice` instances
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.choices = kwargs.get("choices", [])

    def values(self):
        """Returns the values of the :class:`Choice` instances in this :class:`Choices`."""
        return [choice.value for choice in self.choices]

    def add_choice(self, value, **kwargs):
        """Adds a :class:`Choice` to this :class:`Choices`."""
        choice = Choice(value, **kwargs)
        self.choices.append(choice)
        return choice

    def clone(self):
        """Clones the :class:`Choices`."""
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
    """Represents a set of choices in a :class:`View` that are displayed as a radio group.

    Examples::
        import fiftyone.operators.types as types

        inputs = types.Object()
        choices = types.Choices()
        choices.add_choice("cat", label="Cat", description="A cat")
        choices.add_choice("dog", label="Dog", description="A dog")
        inputs.enum("animal", choices.values(), view=choices)

        # you can also replace ``Choices`` with any class that inherits from it.
        choices = types.RadioGroup()
        # or
        choices = types.Dropdown()

    Args:
        orientation ("horizontal"): the orientation of the radio group Can be ``"horizontal"`` or ``"vertical"``.
        label (None): a label for the :class:`RadioGroup`
        description (None): a description for the :class:`RadioGroup`
        caption (None): a caption for the :class:`RadioGroup`
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.orientation = kwargs.get("orientation", None)

    def to_json(self):
        return {
            **super().to_json(),
            "orientation": self.orientation,
        }


class Dropdown(Choices):
    """Represents a set of choices in a :class:`View` that are displayed as a dropdown.

    Examples::
        import fiftyone.operators.types as types

        inputs = types.Object()
        choices = types.Dropdown()
        choices.add_choice("cat", label="Cat", description="A cat")
        choices.add_choice("dog", label="Dog", description="A dog")
        inputs.enum("animal", choices.values(), view=choices)

    Args:
        label (None): a label for the :class:`Dropdown`
        description (None): a description for the :class:`Dropdown`
        caption (None): a caption for the :class:`Dropdown`
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Notice(View):
    """Represents a notice in a :class:`View`.

    Use this :class:`View` to display a notice to the user.

    Examples::

        import fiftyone.operators.types as types

        inputs = types.Object()
        inputs.notice("This is a notice")

    Args:
        label (None): a label for the :class:`Notice`
        description (None): a description for the :class:`Notice`
        caption (None): a caption for the :class:`Notice`
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Header(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Warning(View):
    """Represents a warning in a :class:`View`."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Error(View):
    """Represents an error in a :class:`View`."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Button(View):
    """Represents a button in a :class:`View`.

    Example:

        import fiftyone.operators.types as types

        inputs = types.Object()
        inputs.view("btn", types.Button(label="Click me", operator="print_stdout", params={"message": "Hello World"}))

    Args:
        label (None): a label for the :class:`Button`
        description (None): a description for the :class:`Button`
        caption (None): a caption for the :class:`Button`
        operator (None): the name of the operator to execute when the button is clicked
        params (None): the parameters to pass to the operator
    """

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
    """Displays one of the given :class:`View` instances.

    Examples::

        import fiftyone.operators.types as types

        # allow the user to pick which type to input or display
        inputs = types.Object()
        choices = types.RadioGroup()
        choices.add_choice("cat", label="Cat", description="A cat")
        choices.add_choice("dog", label="Dog", description="A dog")
        view = types.OneOfView(oneof=[types.Enum(choices.values()), types.String()])
        inputs.define_property(types.OneOfView(oneof=[choices]), view=view)

    Args:
        oneof (None): a list of :class:`View` instances
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.oneof = kwargs.get("oneof", [])

    def to_json(self):
        return {
            **super().to_json(),
            "oneof": [one.to_json() for one in self.oneof],
        }


class ListView(View):
    """Displays a list of :class:`View` instances."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.items = kwargs.get("items", None)

    def to_json(self):
        return {
            **super().to_json(),
            "items": self.items.to_json() if self.items else None,
        }


class TupleView(View):
    """Displays a tuple of :class:`View` instances."""

    def __init__(self, *itemsView, **options):
        super().__init__(**options)
        self.items = itemsView

    def to_json(self):
        return {
            **super().to_json(),
            "items": [item.to_json() for item in self.items],
        }


class CodeView(View):
    """Displays a code editor for the given :class:`View` instance.

    Examples::

        import fiftyone.operators.types as types

        # allow the user to input a python expression
        inputs = types.Object()
        inputs.string("src", types.CodeView(language="python"))

    Args:
        language (None): the language to use for syntax highlighting
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.language = kwargs.get("language", None)

    def to_json(self):
        return {**super().to_json(), "language": self.language}


class ColorView(View):
    """Displays a color picker for the given :class:`View` instance.

    Args:
        compact (None): whether to display the color picker in compact mode
        variant (None): the variant of the color picker. See https://casesandberg.github.io/react-color
    """

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
    """Displays a tabbed view for the given :class:`View` instances.

    Args:
        variant (None): the variant of the tabs. See https://material-ui.com/components/tabs
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.variant = kwargs.get("variant", None)

    def to_json(self):
        return {**super().to_json(), "variant": self.variant}


class JSONView(View):
    """Displays a JSON viewer for the given :class:`View` instance."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class AutocompleteView(Choices):
    """Displays an autocomplete input for the given :class:`View` instance.

    Note:
        This can be used in place of :class:`Choices`
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class FileView(View):
    """Displays a file input for the given :class:`View` instance."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class LinkView(View):
    """Displays a link for the given :class:`View` instance.

    Args:
        href (None): the URL to link to. Defaults to the property ``value.href``.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.href = kwargs.get("href", None)

    def to_json(self):
        return {**super().to_json(), "href": self.href}


class HiddenView(View):
    """Allows properties to be hidden from the user."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class LoadingView(ReadonlyView):
    """Displays a loading indicator for the given :class:`View` instance."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class PlotlyView(View):
    """Displays a Plotly chart for the given :class:`View` instance.

    Note:
        See https://github.com/plotly/react-plotly.js/#basic-props for documentation.

    Args:
        data (None): the chart data
        config (None): the chart config
        layout (None): the chart layout
    """

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
    SAMPLES_VIEWER_ACTIONS = "samples-viewer-actions"
    EMBEDDINGS_ACTIONS = "embeddings-actions"
    HISTOGRAM_ACTIONS = "histograms-actions"
    MAP_ACTIONS = "map-actions"
    MAP_SECONDARY_ACTIONS = "map-secondary-actions"
    DISPLAY_OPTIONS = "display-options"

    def to_json(self):
        return self.value


class KeyValueView(View):
    """Displays a key-value editor for the given :class:`View` instance."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Column(View):
    """Defines a column in a :class:`TableView`.

    Args:
        key: the name of the property to use for data
    """

    def __init__(self, key, **kwargs):
        super().__init__(**kwargs)
        self.key = key

    def clone(self):
        clone = Column(self.key, **self._kwargs)
        return clone

    def to_json(self):
        return {**super().to_json(), "key": self.key}


class TableView(View):
    """Displays a table for the given :class:`View` instance.

    Args:
        columns (None): a list of :class:`Column` objects to display
    """

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
    """Displays a map for the given :class:`View` instance."""

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


class ProgressView(View):
    """Displays a progress bar for the given :class:`View` instance.

    Example::

        import fiftyone.operators as foo
        import fiftyone.operators.types as types

        class ProgressExample(foo.Operator):
            def __init__(self):
                super().__init__("progress-example", "Progress Example")
                self.execute_as_generator = True

            async def execute(self, ctx):
                outputs = types.Object()
                schema = types.Property(outputs)
                MAX = 100
                for i in range(MAX):
                    progress_label = f"Loading {i} of {MAX}"
                    progress_view = types.ProgressView(label=progress_label)
                    loading_schema = types.Object()
                    loading_schema.int("percent_complete", view=progress_view)
                    show_output_params = {
                        "outputs": types.Property(loading_schema).to_json(),
                        "results": {"percent_complete": i / MAX}
                    }
                    yield ctx.trigger("show_output", show_output_params)
                    # simulate computation
                    await asyncio.sleep(0.5)

    Args:
        label (None): the label to display under the progress bar.
        variant (None): "linear" | "circular" the variant of the progress bar.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.variant = kwargs.get("variant", "linear")

    def to_json(self):
        return {**super().to_json(), "variant": self.variant}


class ImageView(View):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
