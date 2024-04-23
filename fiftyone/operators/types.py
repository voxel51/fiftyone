"""
FiftyOne operator types.

| Copyright 2017-2024, Voxel51, Inc.
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
    """Represents a JSON object.

    Args:
        root_view (None): the :class:`View` used to display the object
    """

    def __init__(self, root_view=None):
        self.properties = {}
        self.root_view = root_view

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

    def str(self, name, allow_empty=False, **kwargs):
        """Defines a property on the object that is a string.

        Args:
            name: the name of the property
            label (None): the label of the property
            description (None): the description of the property
            view (None): the :class:`View` of the property

        Returns:
            a :class:`Property`
        """
        return self.define_property(
            name, String(allow_empty=allow_empty), **kwargs
        )

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

    def int(self, name, min=None, max=None, **kwargs):
        """Defines a property on the object that is an integer.

        Args:
            name: the name of the property
            min: minimum value of the property
            max: maximum value of the property
            label (None): the label of the property
            description (None): the description of the property
            view (None): the :class:`View` of the property

        Returns:
            a :class:`Property`
        """
        return self.define_property(
            name, Number(int=True, min=min, max=max), **kwargs
        )

    def float(self, name, min=None, max=None, **kwargs):
        """Defines a property on the object that is a float.

        Args:
            name: the name of the property
            min: minimum value of the property
            max: maximum value of the property
            label (None): the label of the property
            description (None): the description of the property
            view (None): the :class:`View` of the property

        Returns:
            a :class:`Property`
        """
        return self.define_property(
            name, Number(float=True, min=min, max=max), **kwargs
        )

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

    def file(self, name, **kwargs):
        """Defines a property on the object that is a file.

        Args:
            name: the name of the property
            view (None): the :class:`View` of the property
        """
        return self.define_property(name, File(), **kwargs)

    def uploaded_file(self, name, **kwargs):
        """Defines a property on the object that is an uploaded file.

        Args:
            name: the name of the property
            view (None): the :class:`View` of the property
        """
        return self.define_property(name, UploadedFile(), **kwargs)

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

    def view_target(self, ctx, name="view_target", view_type=None, **kwargs):
        """Defines a view target property.

        Examples::

            import fiftyone.operators.types as types

            #
            # in resolve_input()
            #

            inputs = types.Object()

            vt = inputs.view_target(ctx)

            # or add the property directly
            # vt = types.ViewTargetProperty(ctx)
            # inputs.add_property("view_target", vt)

            return types.Property(inputs)

            #
            # in execute()
            #

            target_view = ctx.target_view()

        Args:
            ctx: the :class:`fiftyone.operators.ExecutionContext`
            name: the name of the property
            view_type (RadioGroup): the view type to use (RadioGroup, Dropdown,
                etc.)

        Returns:
            a :class:`ViewTargetProperty`
        """
        view_type = view_type or RadioGroup
        property = ViewTargetProperty(ctx, view_type)
        self.add_property(name, property)
        return property

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
        # todo: deprecate and remove
        self.choices = kwargs.get("choices", None)
        self.error_message = kwargs.get("error_message", "")
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
    """Represents a string.

    Args:
        allow_empty (False): allow an empty string value
    """

    def __init__(self, allow_empty=False):
        self.allow_empty = allow_empty

    def to_json(self):
        return {
            **super().to_json(),
            "allow_empty": self.allow_empty,
        }


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


class File(Object):
    """Represents a file and related metadata for use with
    :class:`FileExplorerView`.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.str(
            "absolute_path", label="Path", description="The path to the file"
        )
        self.str("name", label="Name", description="The name of the file")
        self.str(
            "type",
            label="Type",
            description="The type of the file - either file or directory",
        )
        self.define_property(
            "size",
            Number(int=True),
            label="Size",
            description="The size of the file in bytes",
        )
        self.str(
            "date_modified",
            label="Last Modified",
            description="The last modified time of the file in isoformat",
        )


class UploadedFile(Object):
    """Represents an object with uploaded file content and its metadata in
    properties.

    Properties:
        name: the name of the file
        type: the mime type of the file
        size: the size of the file in bytes
        content: the base64 encoded content of the file
        last_modified: the last modified time of the file in ms since epoch
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.str(
            "name", label="Name", description="The name of the uploaded file"
        )
        self.str(
            "type",
            label="Type",
            description="The mime type of the uploaded file",
        )
        self.int(
            "size",
            label="Size",
            description="The size of the uploaded file in bytes",
        )
        self.str(
            "content",
            label="Content",
            description="The base64 encoded content of the uploaded file",
        )
        self.int(
            "last_modified",
            label="Last Modified",
            description="The last modified time of the uploaded file in ms since epoch",
        )


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
        componentsProps (None): dict for providing props to components rendered
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
        self.componentsProps = kwargs.get("componentsProps", None)
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
            "componentsProps": self.componentsProps,
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

    def __init__(self, value, include=True, **kwargs):
        super().__init__(**kwargs)
        self.value = value
        self.include = include

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
        self._choices = kwargs.get("choices", [])

    @property
    def choices(self):
        return [choice for choice in self._choices if choice.include]

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
        self.append(choice)
        return choice

    def append(self, choice):
        """Appends a :class:`Choice` to the list of choices.

        Args:
            choice: a :class:`Choice` instance
        """
        self._choices.append(choice)

    def clone(self):
        clone = super().clone()
        clone._choices = [choice.clone() for choice in self.choices]
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
        inputs.str("src", types.CodeView(language="python"))

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
    """Displays a JSON viewer.

    Examples::

        # Show an object/dictionary in a JSON viewer
        outputs.obj("my_property", label="My Object", view=types.JSONView())

    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class AutocompleteView(Choices):
    """Displays an autocomplete input.

    .. note::

        This view can be used in place of :class:`Choices`.

    Args:
        choices (None): a list of :class:`Choice` instances
        read_only (False): whether the view is read-only
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class FileView(View):
    """Displays a file input.

    .. note::

        This view can be used on :class:`String` or :class:`UploadedFile`
        properties. If used on a :class:`String` property, the value will be
        the base64-encoded contents. If used on a :class:`UploadedFile`, the
        value will be a :class:`UploadedFile` object.

    Args:
        max_size (None): a maximum allowed size of the file, in bytes
        max_size_error_message (None): an error message to display if the file
            exceeds the max size
        types (None): a string containing the comma-separated file types to
            accept
    """

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
    """Displays a loading indicator.

    Args:
        label ("Loading"): a label for the loading indicator
    """

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
    """Displays an image.

    Examples::

        def execute():
            return {"image": "https://voxel51.com/your/image.png"}

        def resolve_output(self, ctx):
            outputs = types.Object()
            outputs.define_property(
                "image",
                types.String(),
                label="Image",
                view=types.ImageView(),
            )
            return types.Property(outputs)
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class AlertView(View):
    """Displays an alert.

    Args:
        severity (None): the severity of the alert displayed, one of
            ``(info", "success", "warning", "error")``
        componentsProps (None): an optional dict with the following keys:

            -   ``'label'`` (None): props to pass to the label subcomponents
            -   ``'description'`` (None): props to pass to the description
                subcomponents
            -   ``'caption'`` (None): props to pass to the caption subcomponents
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.severity = kwargs.get("severity", "info")

    def to_json(self):
        return {**super().to_json(), "severity": self.severity}


class CheckboxView(View):
    """Displays a checkbox.

    Examples::

        inputs.bool(
            "my_property_name",
            default=True,
            label="My Checkbox",
            description="A checkbox description.",
            view=types.CheckboxView(),
        )

    .. note::

        Must be used with :class:`Boolean` properties.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class ErrorView(View):
    """Displays an error.

    Args:
        detailed (False): whether to display a detailed error message
        popout (None): if provided, displays a popout button with the given
            dictionary of props
        left (False): whether to display on the left side of the popout button
    """

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


class LazyFieldView(View):
    """Displays a lazy text input which only apply input field changes on blur
    or when user clicks the save button within the field.

    .. note::

        Must be used with :class:`String` or :class:`Number` properties.

    Args:
        save_on_blur (True): when set to False, changes in input field will not
            be automatically applied when user moves mouse out of the changed
            field. To apply changes, user must click the save button.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.save_on_blur = kwargs.get("save_on_blur", True)

    def to_json(self):
        return {**super().to_json(), "save_on_blur": self.save_on_blur}


class DropdownView(Dropdown):
    """Displays a dropdown selector input."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class LabelValueView(View):
    """Displays a label-value component. Used for displaying a label and a
    corresponding value.

    .. note::

        Must be used with :class:`String`, :class:`Number`, or :class:`Boolean`
        properties, or lists of such properties. Also this view is not supported
        for input properties.
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


class FileExplorerView(View):
    """Displays a file explorer for interacting with files.

    Examples::

        import os
        import fiftyone.operators.types as types

        inputs = types.Object()

        # Create an explorer that allows the user to choose a directory
        file_explorer = types.FileExplorerView(
            choose_dir=True,
            button_label="Choose a directory...",
            choose_button_label="Accept"
        )

        # Define a types.File property
        file_prop = inputs.file(
            "directory",
            required=True,
            label="Directory",
            description="Choose a directory",
            view=file_explorer,
        )

        directory = ctx.params.get("directory", {}).get("absolute_path", None)
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class PromptView(View):
    """Customizes how a prompt is rendered.

    Examples::

        import fiftyone.operators.types as types

        # in resolve_input
        prompt = types.Prompt(
            label="This is the title",
            submit_button_label="Click me",
            cancel_button_label="Abort"
        )
        inputs = types.Object()
        inputs.str("message", label="Message")
        return types.Property(inputs, view=prompt)

    Args:
        label (None): the title for the prompt
        submit_button_label (None): the label for the submit button
        cancel_button_label (None): the label for the cancel button
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class ViewTargetOptions(object):
    """Represents the options for a :class:`ViewTargetProperty`.

    Attributes:
        entire_dataset: a :class:`Choice` for the entire dataset
        current_view: a :class:`Choice` for the current view
        selected_samples: a :class:`Choice` for the selected samples
    """

    def __init__(self, choices_view, **kwargs):
        super().__init__(**kwargs)
        self.choices_view = choices_view
        self.entire_dataset = Choice(
            "DATASET",
            label="Entire dataset",
            description="Run on the entire dataset",
            include=False,
        )
        self.current_view = Choice(
            "CURRENT_VIEW",
            label="Current view",
            description="Run on the current view",
            include=False,
        )
        self.selected_samples = Choice(
            "SELECTED_SAMPLES",
            label="Selected samples",
            description="Run on the selected samples",
            include=False,
        )
        [
            choices_view.append(choice)
            for choice in [
                self.entire_dataset,
                self.current_view,
                self.selected_samples,
            ]
        ]

    def values(self):
        return self.choices_view.values()


class ViewTargetProperty(Property):
    """Displays a view target selector.

    Examples::

        import fiftyone.operators.types as types

        # in resolve_input
        inputs = types.Object()
        vt = inputs.view_target(ctx)
        # or add the property directly
        # vt = types.ViewTargetProperty(ctx)
        # inputs.add_property("view_target", vt)
        return types.Property(inputs)

        # in execute()
        target_view = ctx.target_view()

    Attributes:
        options: a :class:`ViewTargetOptions` instance

    Args:
        ctx: the :class:`fiftyone.operators.ExecutionContext`
        view_type (RadioGroup): the type of view to use (RadioGroup or Dropdown)
    """

    def __init__(self, ctx, view_type=RadioGroup, **kwargs):
        choice_view = view_type()
        options = ViewTargetOptions(choice_view)

        self._options = options

        # Entire dataset is always an option
        default_target = options.entire_dataset.value
        options.entire_dataset.include = True

        has_custom_view = ctx.has_custom_view
        if has_custom_view:
            options.current_view.include = True
            default_target = options.current_view.value

        has_selected = bool(ctx.selected)
        if has_selected:
            options.selected_samples.include = True
            default_target = options.selected_samples.value

        _type = Enum(options.values())

        # Only 1 option so no need for a radio group, just hide it.
        if len(options.values()) == 1:
            choice_view = HiddenView(read_only=True)

        super().__init__(
            _type, default=default_target, view=choice_view, **kwargs
        )

    @property
    def options(self):
        return self._options


class DrawerView(View):
    """Renders an operator prompt as a left or right side drawer.

    Examples::

        import fiftyone.operators.types as types

        # in resolve_input
        inputs = types.Object()
        inputs.str("message", label="Message")
        prompt = types.DrawerView(placement="left")
        return types.Property(inputs, view=prompt)

    Args:
        placement (None): the placement of the drawer. Can be one of the
            following

            -   ``'left'``: display to the left of the main or expanded view
            -   ``'right'``: display to the right of the main or expanded view
    """

    def __init__(self, **kwargs):
        placement = kwargs.get("placement", None)
        if placement not in ["left", "right"]:
            raise ValueError('placement must be either "left" or "right".')
        super().__init__(**kwargs)
