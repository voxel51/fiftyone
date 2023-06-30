"""
FiftyOne operator types.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import enum


class BaseType(object):
    """Base class for all types."""

    def to_json(self):
        return {"name": self.__class__.__name__}


class Void(BaseType):
    """Represents a void type."""

    def __init__(self):
        pass

    def to_json(self):
        return {"name": self.__class__.__name__}


class Object(BaseType):
    """Represents a JSON object."""

    def __init__(self):
        self.properties = {}

    def add_property(self, name, property):
        """Adds a property to the object.

        Args:
            name: the name of the property
            property: the property to add

        Returns:
            the :class:`Property` that was added
        """
        self.properties[name] = property
        return property

    def get_property(self, name):
        """Gets a property by name.

        Args:
            name: the name of the property

        Returns:
            the :class:`Property`, or None
        """
        return self.properties.get(name, None)

    def define_property(self, name, type, **kwargs):
        """Defines a property on the object.

        Args:
            name: the name of the property
            type: the type of the property
            label (None): the label of the property
            description (None): the description of the property
            view (None): the :class:`View` of the property

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
            name: the name of the property
            label (None): the label of the property
            description (None): the description of the property
            view (None): the :class:`View` of the property

        Returns:
            a :class:`Property`
        """
        return self.define_property(name, String(), **kwargs)

    def bool(self, name, **kwargs):
        """Defines a property on the object that is a boolean.

        Args:
            name: the name of the property
            label (None): the label of the property
            description (None): the description of the property
            view (None): the :class:`View` of the property

        Returns:
            a :class:`Property`
        """
        return self.define_property(name, Boolean(), **kwargs)

    def int(self, name, **kwargs):
        """Defines a property on the object that is an integer.

        Args:
            name: the name of the property
            label (None): the label of the property
            description (None): the description of the property
            view (None): the :class:`View` of the property

        Returns:
            a :class:`Property`
        """
        return self.define_property(name, Number(int=True), **kwargs)

    def float(self, name, **kwargs):
        """Defines a property on the object that is a float.

        Args:
            name: the name of the property
            label (None): the label of the property
            description (None): the description of the property
            view (None): the :class:`View` of the property

        Returns:
            a :class:`Property`
        """
        return self.define_property(name, Number(float=True), **kwargs)

    def enum(self, name, values, **kwargs):
        """Defines a property on the object that is an enum.

        Args:
            name: the name of the property
            values: a list of values that define the enum
            label (None): the label of the property
            description (None): the description of the property
            view (None): the :class:`View` of the property, which must be a
                :class:`Choices` or a subclass of it

        Returns:
            a :class:`Property`
        """
        return self.define_property(name, Enum(values), **kwargs)

    def list(
        self, name, element_type, min_items=None, max_items=None, **kwargs
    ):
        """Defines a property on the object that is a list.

        Args:
            name: the name of the property
            element_type: the type of the elements in the list
            label (None): the label of the property
            description (None): the description of the property
            view (None): the :class:`View` of the property

        Returns:
            a :class:`Property`
        """
        return self.define_property(
            name, List(element_type, min_items, max_items), **kwargs
        )

    def obj(self, name, **kwargs):
        """Defines a property on the object that is an object.

        Args:
            name: the name of the property
            label (None): the label of the property
            description (None): the description of the property
            view (None): the :class:`View` of the property

        Returns:
            a :class:`Property`
        """
        return self.define_property(name, Object(), **kwargs)

    def view(self, name, view, **kwargs):
        """Defines a view-only property.

        Examples::

            import fiftyone.operators.types as types

            notice = types.Notice(label="a label", description="a description")
            inputs = types.Object()
            inputs.view("notice", notice)

        Args:
            name: the name of the property
            view: the :class:`View` to define

        Returns:
            a :class:`Property`
        """
        return self.define_property(name, Void(), view=view, **kwargs)

    def message(self, name, label, **kwargs):
        """Defines a message to display to the user as a :class:`Notice`.

        Args:
            name: the name of the property
            label: the label of the notice
            description (None): the description of the notice
            view (None): the :class:`View` of the notice

        Returns:
            a :class:`Property`
        """
        view = kwargs.get("view", Notice(label=label))
        return self.view(name, view, **kwargs)

    def clone(self):
        """Clones the definition of the object.

        Returns:
            an :class:`Object`
        """
        clone = Object()
        clone.properties = self.properties.copy()
        return clone

    def to_json(self):
        """Converts the object definition to JSON.

        Returns:
            a JSON dict
        """
        properties = {}
        for name, prop in self.properties.items():
            properties[name] = prop.to_json()

        return {"name": self.__class__.__name__, "properties": properties}


class Property(BaseType):
    """Represents a property on an :class:`fiftyone.operators.Operator`.

    Properties are used to define the data that an operator can accept as input
    and return as output.

    Properties may also define a :class:`View` that can be used to customize
    how the property behaves in the FiftyOne App.

    Examples::

        import fiftyone.operators.types as types

        my_object = types.Object()

        # Define a string property
        my_object.str("name", label="Name", description="a description")

        # Define an enum property with a custom view
        radio_group = types.RadioGroup()
        radio_group.add_choice("car", "A brand new car")
        radio_group.add_choice("truck", "A fancy truck")
        my_object.enum("type", radio_group.values(), view=radio_group)

    Args:
        type: the type of the property
        invalid (False): whether the property is invalid
        default (None): the default value of the property
        required (False): whether the property is required
        error_message ("Invalid"): the error message of the property
        view (None): the :class:`View` of the property
    """

    def __init__(self, type, **kwargs):
        self.type = type
        self.invalid = kwargs.get("invalid", False)
        self.default = kwargs.get("default", None)
        self.required = kwargs.get("required", False)
        self.choices = kwargs.get("choices", None)
        self.error_message = kwargs.get("error_message", "Invalid property")
        self.view = kwargs.get("view", None)

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
        int (False): whether the number is an integer
        float (False): whether the number is a float
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
        element_type: the type of the elements in the list
        min_items (None): the minimum number of items in the list
        max_items (None): the maximum number of items in the list
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
    """Represents a :class:`fiftyone.core.samples.Sample` ID."""

    def __init__(self):
        pass


class Enum(BaseType):
    """Represents an enum.

    Args:
        values: the values of the enum
    """

    def __init__(self, values):
        self.values = values

    def to_json(self):
        return {"name": self.__class__.__name__, "values": self.values}


class OneOf(BaseType):
    """Represents a one-of type.

    Examples::

        import fiftyone.operators.types as types

        my_object = types.Object()
        my_object.define_property(
            "my_property",
            types.OneOf([types.String(), types.Number()],
        )

    Args:
        types: the possible types
    """

    def __init__(self, types):
        self.types = types

    def to_json(self):
        return {
            "name": self.__class__.__name__,
            "types": [type.to_json() for type in self.types],
        }


class Tuple(BaseType):
    """Represents a tuple of types.

    Examples::

        import fiftyone.operators.types as types

        inputs = types.Object()
        inputs.define_property(
            "image", types.Tuple(types.String(), types.Number())
        )

    Args:
        *items: the types
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

    Examples::

        import fiftyone.operators.types as types

        inputs = types.Object()
        inputs.define_property(
            "image", types.Map(types.String(), types.Number())
        )

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


class View(object):
    """Represents a view of a :class:`Property`.

    Views are used to define how properties are displayed in the FiftyOne App.

    Args:
        label (None): a label for the view
        description (None): a description for the view
        caption (None): a caption for the view
        space (12): An int specifying how much vertical space to allocate out
            of ``12``
        placeholder (None): string to display placeholder text
        read_only (False): whether the view is read-only
        component (None): specifying custom component to use as the view
        componentProps (None): dict for providing props to components rendered
            by a view
    """

    def __init__(self, **kwargs):
        self.label = kwargs.get("label", None)
        self.description = kwargs.get("description", None)
        self.caption = kwargs.get("caption", None)
        self.space = kwargs.get("space", None)
        self.placeholder = kwargs.get("placeholder", None)
        self.read_only = kwargs.get("read_only", None)
        self.component = kwargs.get("component", None)
        self.componentProps = kwargs.get("componentProps", None)
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
            "component": self.component,
            "componentProps": self.componentProps,
            **self._kwargs,
        }


class InferredView(View):
    """Represents a view of a :class:`Property` that is inferred from the data.

    .. note::

        You can only use inferred views for input properties.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Form(View):
    """A form view."""

    def __init__(
        self,
        live=False,
        submit_button_label="Execute",
        cancel_button_label="Close",
        **kwargs,
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


class ReadOnlyView(View):
    """A read-only :class:`View`."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.read_only = True


class Choice(View):
    """Represents a choice in a :class:`Choices` view.

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

    Use this view to define a set of choices for a :class:`Property` that can
    be selected by the user and require labels and optional descriptions.

    Examples::

        import fiftyone.operators.types as types

        choices = types.Choices()
        choices.add_choice("cat", label="Cat", description="A cat")
        choices.add_choice("dog", label="Dog", description="A dog")

        inputs = types.Object()
        inputs.enum("animal", choices.values(), view=choices)

    Args:
        choices (None): a list of :class:`Choice` instances
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.choices = kwargs.get("choices", [])

    def values(self):
        """Returns the choice values for this instance.

        Returns:
            a list of values
        """
        return [choice.value for choice in self.choices]

    def add_choice(self, value, **kwargs):
        """Adds a choice value to this instance.

        Args:
            value: a choice value

        Returns:
            the :class:`Choice` that was added
        """
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
    """Represents a set of choices in a :class:`View` that are displayed as a
    radio group.

    Examples::

        import fiftyone.operators.types as types

        choices = types.RadioGroup()
        choices.add_choice("cat", label="Cat", description="A cat")
        choices.add_choice("dog", label="Dog", description="A dog")

        inputs = types.Object()
        inputs.enum("animal", choices.values(), view=choices)

    Args:
        orientation ("horizontal"): the orientation of the radio group Can be
            ``"horizontal"`` or ``"vertical"``
        label (None): a label for the radio group
        description (None): a description for the radio group
        caption (None): a caption for the radio group
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
    """Represents a set of choices in a :class:`View` that are displayed as a
    dropdown.

    Examples::

        import fiftyone.operators.types as types

        choices = types.Dropdown()
        choices.add_choice("cat", label="Cat", description="A cat")
        choices.add_choice("dog", label="Dog", description="A dog")

        inputs = types.Object()
        inputs.enum("animal", choices.values(), view=choices)

    Args:
        label (None): a label for the dropdown
        description (None): a description for the dropdown
        caption (None): a caption for the dropdown
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Notice(View):
    """Represents a notice in a :class:`View`.

    You can use this view to display notices to the user.

    Examples::

        import fiftyone.operators.types as types

        inputs = types.Object()
        inputs.notice("This is a notice")

    Args:
        label (None): a label for the notice
        description (None): a description for the notice
        caption (None): a caption for the notice
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Header(View):
    """Represents a header in a :class:`View`."""

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

    Examples::

        import fiftyone.operators.types as types

        button = types.Button(
            label="Click me",
            operator="print_stdout",
            params={"message": "Hello World"},
        )

        inputs = types.Object()
        inputs.view("btn", button)

    Args:
        label (None): a label for the button
        description (None): a description for the button
        caption (None): a caption for the button
        operator (None): the name of the operator to execute when the button is
            clicked
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

        choices = types.RadioGroup()
        choices.add_choice("cat", label="Cat", description="A cat")
        choices.add_choice("dog", label="Dog", description="A dog")
        view = types.OneOfView(
            oneof=[types.Enum(choices.values()), types.String()]
        )

        inputs = types.Object()
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
    """Displays a code editor.

    Examples::

        import fiftyone.operators.types as types

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
    """Displays a color picker.

    Args:
        compact (None): whether to display the color picker in compact mode
        variant (None): the variant of the color picker. See
            https://casesandberg.github.io/react-color
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
    """Displays a tabbed view.

    Args:
        variant (None): the variant of the tabs. See
            https://material-ui.com/components/tabs
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.variant = kwargs.get("variant", None)

    def to_json(self):
        return {**super().to_json(), "variant": self.variant}


class JSONView(View):
    """Displays a JSON viewer."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class AutocompleteView(Choices):
    """Displays an autocomplete input.

    .. note::

        This view can be used in place of :class:`Choices`.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class FileView(View):
    """Displays a file input."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class LinkView(View):
    """Displays a hyperlink.

    Args:
        href (None): the URL to link to. Defaults to the property
            ``value.href``
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


class LoadingView(ReadOnlyView):
    """Displays a loading indicator."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class PlotlyView(View):
    """Displays a Plotly chart.

    .. note::

        See https://github.com/plotly/react-plotly.js/#basic-props for
        documentation.

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


class Placement(object):
    """Represents the placement of an operator in the FiftyOne App.

    Args:
        place: the :class:`Places` value
        view (None): a :class:`View` to render
    """

    def __init__(self, place, view=None):
        self.place = place
        self.view = view

    def to_json(self):
        return {
            "place": self.place.to_json(),
            "view": self.view.to_json() if self.view else None,
        }


class Places(enum.Enum):
    """The places available to operators in the FiftyOne App."""

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
    """Displays a key-value editor."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Column(View):
    """A column in a :class:`TableView`.

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
    """Displays a table.

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
    """Displays a key-value mapping."""

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
    """Displays a progress bar.

    Examples::

        import fiftyone.operators as foo
        import fiftyone.operators.types as types

        class ExampleProgress(foo.Operator):
            @property
            def config(self):
                return foo.OperatorConfig(
                    name="example_progress",
                    label="Examples: Progress",
                    execute_as_generator=True,
                )

            async def execute(self, ctx):
                outputs = types.Object()
                schema = types.Property(outputs)
                n = 100
                for i in range(n):
                    label = f"Loading {i} of {n}"
                    progress_view = types.ProgressView(label=label)
                    loading_schema = types.Object()
                    loading_schema.int("percent_complete", view=progress_view)
                    show_output_params = {
                        "outputs": types.Property(loading_schema).to_json(),
                        "results": {"percent_complete": i / n}
                    }
                    yield ctx.trigger("show_output", show_output_params)

                    # Simulate computation
                    await asyncio.sleep(0.5)

    Args:
        label (None): the label to display under the progress bar
        variant (None): bar variant. Supported values are ``"linear"`` and
            ``"circular"``
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.variant = kwargs.get("variant", "linear")

    def to_json(self):
        return {**super().to_json(), "variant": self.variant}


class ImageView(View):
    """Displays an image."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class AlertView(View):
    """Displays an alert.

    Args:
        severity (None): the severity of the alert displayed, one of
        ``(info", "success", "warning", "error")``
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.severity = kwargs.get("severity", "info")

    def to_json(self):
        return {**super().to_json(), "severity": self.severity}


class CheckboxView(View):
    """Displays a checkbox.

    .. note::

        Must be used with :class:`Boolean` properties.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class ErrorView(View):
    """Displays an error."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class HeaderView(View):
    """Displays a header component.

    Headers can have a ``title``, ``description``, and ``caption``, each of
    which are displayed in a separate line.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class ObjectView(View):
    """Displays an object component."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class RadioView(RadioGroup):
    """Displays a radio component for the given :class:`RadioGroup` instance."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class SwitchView(View):
    """Displays a toggle switch.

    .. note::

        Must be used with :class:`Boolean` properties.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class TextFieldView(View):
    """Displays a text input.

    .. note::

        Must be used with :class:`String` or :class:`Number` properties.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class FieldView(View):
    """Displays a text input.

    .. note::

        Must be used with :class:`String` or :class:`Number` properties.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class DropdownView(Dropdown):
    """Displays a dropdown selector input."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class LabelValueView(View):
    """Displays a label-value component.

    .. note::

        Must be used with :class:`String`, :class:`Number`, or :class:`Boolean`
        properties, or lists of such properties.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class PrimitiveView(View):
    """Displays a primitive value component.

    .. note::

        Must be used with :class:`String`, :class:`Number`, or :class:`Boolean`
        properties.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class SliderView(View):
    """Displays a slider component.

    .. note::

        This view must be used with :class:`Number` properties.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class TagsView(View):
    """Displays a list of tags component.

    .. note::

        Must be used with :class:`List` properties whose items are
        :class:`String`, :class:`Number:, or :class:`Boolean` instances
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Success(View):
    """Represents a success in a :class:`View`."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class ButtonView(Button):
    """Represents a button in a :class:`Button`."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class MarkdownView(View):
    """Renders a markdown string as HTML."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
