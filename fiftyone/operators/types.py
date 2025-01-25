"""
FiftyOne operator types.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import enum
from textwrap import dedent


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

    def btn(
        self,
        name,
        label,
        icon=None,
        variant=None,
        disabled=False,
        on_click=None,
        prompt=False,
        params=None,
        space=None,
        href=None,
        icon_position="left",
        **kwargs,
    ):
        """Defines a button or icon button to display to the user as a :class:`Button`.

        Examples::

            import fiftyone.operators.types as types

            inputs = types.Object()
            inputs.btn(
                "greet",
                label="Say Hi!",
                icon="waving_hand",
                variant="round",
                on_click="print_stdout",
                params={"msg": "Hi!"},
            )

        Args:
            name: the name of the property
            label: the label of the button
            icon (None): the name of the icon to display
            icon_position ("left"): the position of the icon. Can be ``"left"`` or ``"right"``
            disabled (False): whether the button is disabled
            variant (None): the variant of the button. Can be ``"contained"``, ``"outlined"``,
                ``"round"`` or ``"square"``
            on_click (None): the name of the operator to execute when the button is clicked
            prompt (False): whether to prompt the user before executing the operator
            params (None): the parameters to pass to the operator
            space (None): An int specifying how much vertical/horizontal space to allocate out
                of ``12`` depending on the orientation of the parent container
            href (None): the URL to navigate to when the button is clicked
        """
        btn = Button(
            href=href,
            icon=icon,
            icon_position=icon_position,
            disabled=disabled,
            label=label,
            operator=on_click,
            params=params,
            prompt=prompt,
            space=space,
            variant=variant,
            **kwargs,
        )

        return self.view(name, btn)

    def img(
        self,
        name,
        href=None,
        on_click=None,
        prompt=False,
        params=None,
        point_on_hover=True,
        height=None,
        width=None,
        alt_text=None,
        **kwargs,
    ):
        """Defines an image to display to the user as a :class:`ImageView`.

        Examples::

            import fiftyone.operators.types as types
            ctx.panel.state.my_img = "/path/to/my/image.jpg"

            panel = types.Object()
            panel.img(
                "my_img", # uses the value in ctx.panel.state.my_img
                href="https://path/to/navigate/to",
                on_click=self.do_something,
                prompt=False,
                params={"foo": "bar"},
                point_on_hover=True,
                height="100px",
                width="100px",
                alt_text="My image alt text"
            )

        Args:
            name: the name of the state variable to use as the image source
            href (None): the url to navigate to when the image is clicked
            on_click (None): the name of the operator to execute when the button is clicked
            prompt (False): whether to prompt the user before executing the operator
            params (None): the parameters to pass to the operator
            point_on_hover (True): whether to show a pointer when hovering over the image
            height (None): the height of the image
            width (None): the width of the image
            alt_text (None): the alt text of the image

        """
        img = ImageView(
            href=href,
            operator=on_click,
            params=params,
            prompt=prompt,
            cursor=point_on_hover,
            height=height,
            width=width,
            alt=alt_text,
            **kwargs,
        )

        return self.view(name, img)

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

    def grid(self, name, **kwargs):
        """Defines a grid view as a :class:`View`."""
        grid = GridView(**kwargs)
        obj = Object()
        self.define_property(name, obj, view=grid)
        return obj

    def dashboard(self, name, **kwargs):
        """Defines a dashboard view as a :class:`View`.

        See :class:`DashboardView` for more information.

        Args:
            name: the name of the property

        Returns:
            an :class:`Object`

        See :class:`DashboardView` for more information.
        """
        dashboard = DashboardView(**kwargs)
        obj = Object()
        self.define_property(name, obj, view=dashboard)
        return obj

    def plot(self, name, **kwargs):
        """Defines an object property displayed as a plot.

        Args:
            name: the name of the property
            config (None): the chart config
            layout (None): the chart layout

        See :class:`PlotlyView` for more information.
        """
        plot = PlotlyView(**kwargs)
        obj = Object()
        self.define_property(name, obj, view=plot)
        return obj

    def h_stack(self, name, **kwargs):
        """Defines a horizontal stack object.

        Args:
            name: the name of the property

        Returns:
            a :class:`Object`
        """
        stack = HStackView(**kwargs)
        obj = Object()
        self.define_property(name, obj, view=stack)
        return obj

    def v_stack(self, name, **kwargs):
        """Defines a vertical stack object.

        Args:
            name: the name of the property

        Returns:
            a :class:`Object`
        """
        stack = VStackView(**kwargs)
        obj = Object()
        self.define_property(name, obj, view=stack)
        return obj

    def menu(self, name, **kwargs):
        """Defined an :class:`Object` property that is displayed as a menu.

        .. note::
            Can be used for an :class:`Button` type with properties whose views are one of
            :class:`Button`, :class:`Dropdown`, :class:`DropdownView`, and :class;`Choices`. The variant
            and color of the items can be set using the `variant` and `color` parameters.

        Args:
            name: the name of the property
            variant (None): the variant for the items of the menu. Can be ``"contained"``,
                ``"outlined"``, ``"round"`` or ``"square"``
            color (None): the color for the items of the menu.
            overlay (None): whether to display the menu as an overlay. Can be ``"top-left"``,
            ``"top-center"``, ``"top-right"``, ``"bottom-left"``, `"bottom-center"``, or
            ``"bottom-right"``. Overlay is useful when you want to display a floating menu on top of
            another content (for example, menu for full-panel-width plot)
            icon (None): when set, the icon will be displayed as the menu button instead of the label.
            Can be "SettingsIcon", "MoreVertIcon".

        Returns:
            a :class:`Object`
        """
        menu_kwargs = {"pad": 1, "variant": "square", **kwargs}
        menu = MenuView(**menu_kwargs)
        obj = Object()
        self.define_property(name, obj, view=menu)
        return obj

    def btn_group(self, name, **kwargs):
        """Defines a button group object.

        Args:
            name: the name of the property

        Returns:
            a :class:`Object`
        """
        btn_group = ButtonGroupView(**kwargs)
        obj = Object()
        self.define_property(name, obj, view=btn_group)
        return obj

    def md(self, markdown, name="markdown", **kwargs):
        """Defines a markdown object.

        Args:
            markdown: the markdown to display
            name: the name of the property
        """
        return self.str(
            name, default=dedent(markdown), view=MarkdownView(**kwargs)
        )

    def media_player(self, name, url, **kwargs):
        """Defines a media player object.

        Args:
            name: the name of the property
            url: the URL of the media to display
            on_start (None): the operator to execute when the media starts
            on_play (None): the operator to execute when the media is played
            on_pause (None): the operator to execute when the media is paused
            on_buffer (None): the operator to execute when the media is buffering
            on_buffer_end (None): the operator to execute when the media stops buffering
            on_ended (None): the operator to execute when the media ends
            on_error (None): the operator to execute when the media errors
            on_duration (None): the operator to execute when the media duration is loaded
            on_seek (None): the operator to execute when the media is seeked
            on_progress (None): the operator to execute when the media progresses

        Returns:
            a :class:`Object`
        """
        media_player = MediaPlayerView(**kwargs)
        obj = Object()
        self.define_property(
            name, obj, view=media_player, default={"url": url}
        )
        return obj

    def arrow_nav(
        self,
        name,
        forward=None,
        backward=None,
        position=None,
        **kwargs,
    ):
        """Defines a floating navigation arrows as a :class:`ArrowNavView`.

        Args:
            forward (True): Whether to display the forward arrow
            backward (True): Whether to display the backward arrow
            on_forward (None): The operator to execute when the forward arrow is clicked
            on_backward (None): The operator to execute when the backward arrow is clicked
            position ("center"): The position of the arrows. Can be either ``"top"``, ``center``,
                ``"bottom"``, ``"left"``, ``middle` (center horizontally), or ``"right"``

        Returns:
            a :class:`Property`
        """
        view = ArrowNavView(
            forward=forward,
            backward=backward,
            position=position,
            **kwargs,
        )
        return self.view(name, view, **kwargs)

    def map(self, name, key_type, value_type, **kwargs):
        """Defines a map property on the object.

        Args:
            name: the name of the property
            key_type: the type of the keys in the map
            value_type: the type of the values in the map


        Returns:
            a :class:`Map`
        """
        map_view = MapView(**kwargs)
        map_type = Map(key_type=key_type, value_type=value_type)
        self.define_property(name, map_type, view=map_view, **kwargs)
        return map_type

    def oneof(self, name, types, **kwargs):
        """Defines a one-of property on the object.

        Args:
            name: the name of the property
            types: list of types that are instances of :class:`BaseType`


        Returns:
            a :class:`OneOf`
        """

        one_of = OneOf(types)
        self.define_property(name, one_of, **kwargs)
        return one_of

    def tuple(self, name, *items, **kwargs):
        """Defines a tuple property on the object.

        Args:
            name: the name of the property
            *items: the types of the items in the tuple

        Returns:
            a :class:`Tuple`
        """
        tuple_view = TupleView(**kwargs)
        tuple_type = Tuple(*items)
        self.define_property(name, tuple_type, view=tuple_view, **kwargs)
        return tuple_type

    def tree(self, name, **kwargs):
        """Defines a tree property on the object.
        Args:
            name: the name of the property

        Returns:
            a :class:`Tree`
        """
        tree_selection_view = TreeSelectionView(**kwargs)
        tree_type = List(String())
        self.define_property(
            name, tree_type, view=tree_selection_view, **kwargs
        )
        return tree_type

    def clone(self):
        """Clones the definition of the object.

        Args:
            name: the name of the property

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
        self.on_change = kwargs.get("on_change", None)

    def to_json(self):
        return _convert_callables_to_operator_uris(
            {
                "type": self.type.to_json(),
                "default": self.default,
                "required": self.required,
                "choices": self.choices,
                "invalid": self.invalid,
                "error_message": self.error_message,
                "on_change": self.on_change,
                "view": self.view.to_json() if self.view else None,
            }
        )


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


class Tree(BaseType):
    """Represents a tree selection type.
    Examples::

        import fiftyone.operators.types as types
        inputs = types.Object()

    Args:
    *items: the tree structure of items
    """

    def __init__(self, *items):
        self.items = items

    def to_json(self):
        return {
            "name": self.__class__.__name__,
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


def _convert_callables_to_operator_uris(d):
    updated = {**d}
    for key, value in updated.items():
        if callable(value):
            updated[key] = f"{value.__self__.uri}#{value.__name__}"
    return updated


class View(object):
    """Represents a view of a :class:`Property`.

    Views are used to define how properties are displayed in the FiftyOne App.

    Args:
        label (None): a label for the view
        description (None): a description for the view
        caption (None): a caption for the view
        space (12): An int specifying how much vertical/horizontal space to allocate out
            of ``12`` depending on the orientation of the parent container
        placeholder (None): string to display placeholder text
        read_only (False): whether the view is read-only
        component (None): specifying custom component to use as the view
        componentsProps (None): dict for providing props to components rendered
            by a view
        container (None): the container (instance of :class:`BaseType`) of the view
    """

    def __init__(self, container=None, **kwargs):
        self.label = kwargs.get("label", None)
        self.description = kwargs.get("description", None)
        self.caption = kwargs.get("caption", None)
        self.space = kwargs.get("space", None)
        self.placeholder = kwargs.get("placeholder", None)
        self.read_only = kwargs.get("read_only", None)
        self.component = kwargs.get("component", None)
        self.componentsProps = kwargs.get("componentsProps", None)
        self.container = container
        self._kwargs = kwargs

    def clone(self):
        return self.__class__(container=self.container, **self._kwargs)

    def kwargs_to_json(self):
        view_kwargs = {**self._kwargs}
        return _convert_callables_to_operator_uris(view_kwargs)

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
            "container": (
                self.container.to_json() if self.container else None
            ),
            **self.kwargs_to_json(),
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
            params={"msg": "Hello World"},
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
        href (None): the URL to navigate to when the button is clicked
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.href = kwargs.get("href", None)
        self.operator = kwargs.get("operator", None)
        self.prompt = kwargs.get("prompt", False)
        self.params = kwargs.get("params", None)

    def to_json(self):
        return _convert_callables_to_operator_uris(
            {
                **super().to_json(),
                "href": self.href,
                "operator": self.operator,
                "params": self.params,
                "prompt": self.prompt,
            }
        )


class OperatorExecutionButtonView(Button):
    """Represents an operator execution button in a :class:`View`.

    Examples::

        import fiftyone.operators.types as types

        exec_button = types.OperatorExecutionButtonView(
            label="Execute Simple Op",
            variant="contained",
            operator="@voxel51/panel-examples/simple_op",
            on_success=self.on_success,
            on_error=self.on_error,
            on_option_selected=self.on_select,
            params={"msg": "Hello World!"},
        )

        inputs = types.Object()
        inputs.view("operator_btn", view=exec_button)

    Args:
        icon: an icon for the button. Defaults to "expand_more" if not provided.
        label: a label for the button.
        variant: the variant of the button. Can be "contained" or "outlined".
        description: a description for the button.
        title: a tooltip title for the button.
        operator: the URI of the operator to execute when the button is clicked.
        on_success: the URI of the operator to execute when the operator execution is successful.
        on_error: the URI of the operator to execute when the operator execution fails.
        on_option_selected: the URI of the operator to execute when an option is selected.
        params: the parameters dict to pass to the operator.
        disabled: whether the button is disabled.
    """

    def __init__(self, **kwargs):
        if "operator" not in kwargs or (
            not isinstance(kwargs["operator"], str)
            and not callable(kwargs["operator"])
        ):
            raise ValueError(
                "The 'operator' parameter of type str or callable is required."
            )
        super().__init__(**kwargs)


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


class TreeSelectionView(View):
    """Displays a tree selection checkbox groups.

    Examples::

        import fiftyone.operators.types as types

        structure = [
            ["group_id_1", ["sample_id_1", "sample_id_2"]],
            ["group_id_2", ["sample_id_3", "sample_id_4", "sample_id_5"], ["group_id_8", ["sample_id_6"]]],
        ]

        tree_view = types.TreeSelectionView(
            data=structure # this data represents the basic group structure;
        )

        panel.view('exact_duplicate_selections', view=tree_view, on_change=self.toggle_select)

        def toggle_select(self, ctx):
            selected = ctx.params['value']
            print('selected samples:', selected)

    Args:
        data (None): a list of lists representing the tree structure of groups and its children
        on_change (None): the operator to execute when the tree selection changes
    """

    def __init__(self, **options):
        super().__init__(**options)

    def to_json(self):
        return {
            **super().to_json(),
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
        allow_user_input (True): when True the user can input a value that is not in the choices
        allow_duplicates (True): when True the user can select the same choice multiple times
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
        text ("Loading"): a label for the loading indicator
        variant ("spinner"): the variant of the loading indicator
        color ("primary"): the color of the loading indicator
        size ("medium"): the size of the loading indicator
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class PillBadgeView(View):
    """Displays a pill shaped badge.

    Args:
        text ("Reviewed" | ["Reviewed", "Not Reviewed"] | [["Not Started", "primary"], ["Reviewed", "success"], ["In Review", "warning"]): a label or set of label options with or without a color for the pill badge
        color ("primary"): the color of the pill
        variant ("outlined"): the variant of the pill
        show_icon (False | True): whether to display indicator icon
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class PlotlyView(View):
    """Displays a Plotly chart.

    .. note::

        See https://github.com/plotly/react-plotly.js/#basic-props for
        documentation.

    All event handlers have the following default params:

    - ``id``: the corresponding data.ids[idx]
    - ``path``: the path of the property
    - ``relative_path``: the relative path of the property
    - ``schema``: the schema of the property
    - ``view``: the value of the PlotlyView
    - ``event``: the event name (eg. onClick, onSelected, onDoubleClick)
    - ``value``: the value of the clicked point (only pie chart-like plots)
    - ``label``: the label of the clicked point (only pie chart-like plots)
    - ``shift_pressed``: whether the shift key was pressed

    Examples::

        def render(self, ctx):
            panel.plot("my_plot", on_click=self.on_click, on_selected=self.on_selected)

        def print_params(self, ctx, params):
            for key, value in params.items():
                ctx.print(f"{key}: {value}")

        def on_click(self, ctx):
            # available params
            self.print_prams(ctx, {
                "id": "id", # the corresponding data.ids[idx]
                "idx": 1, # the index of the clicked point
                "label": "label", # label (eg. on pie charts)
                "shift_pressed": false, # whether the shift key was pressed
                "trace": "my_trace", # data[trace_idx].name
                "trace_idx": 0,
                "value": "my_value", # data[trace_idx].values[idx] (eg. on a pie chart)
                "x": 2, # data[trace_idx].x[idx] (the x value on most plot types)
                "y": 3, # data[trace_idx].y[idx] (the y value on most plot types)
                "z": 4, # data[trace_idx].z[idx] (the z value on 3d plots eg. heatmap)
            })

        def on_selected(self, ctx):
            prin(ctx.params['data'])
            # [
            #     {
            #       "trace": "trace 0", # data[trace_idx].name
            #       "trace_idx": 0, # the index of the trace
            #       "idx": 1, # the index of the selected point
            #       "id": "one", # the corresponding data.ids[idx]
            #       "x": 2, # the x value of the selected point
            #       "y": 15, # the y value of the selected point
            #       "z": 22 # the z value of the selected point
            #     }
            # ]

    Args:
        data (None): the chart data
        config (None): the chart config
        layout (None): the chart layout
        on_click (None): event handler for click events
        on_selected (None): event handler for selected events
        on_double_click (None): event handler for double click events
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


class Action(View):
    """An action (currently supported only in a :class:`TableView`).

    Args:
        name: the name of the action
        label (None): the label of the action
        icon (None): the icon of the action
        tooltip (None): the tooltip of the action
        on_click: the operator to execute when the action is clicked
    """

    def __init__(self, name, **kwargs):
        super().__init__(**kwargs)
        self.name = name

    def clone(self):
        clone = Action(self.name, **self._kwargs)
        return clone

    def to_json(self):
        return {**super().to_json(), "name": self.name}


class Tooltip(View):
    """A tooltip (currently supported only in a :class:`TableView`).

    Args:
        value: the value of the tooltip
        row: the row of the tooltip
        column: the column of the tooltip
    """

    def __init__(self, row, column, **kwargs):
        super().__init__(**kwargs)
        self.row = row
        self.column = column

    def clone(self):
        clone = Tooltip(self.row, self.column, **self._kwargs)
        return clone

    def to_json(self):
        return {**super().to_json(), "row": self.row, "column": self.column}


class TableView(View):
    """Displays a table.

    Args:
        columns (None): a list of :class:`Column` objects to display
        row_actions (None): a list of :class:`Action` objects to display
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.columns = kwargs.get("columns", [])
        self.row_actions = kwargs.get("row_actions", [])
        self.tooltips = kwargs.get("tooltips", [])
        self._tooltip_map = {}

    def keys(self):
        return [column.key for column in self.columns]

    def add_column(self, key, **kwargs):
        for column in self.columns:
            if column.key == key:
                raise ValueError(f"Column with key '{key}' already exists")

        column = Column(key, **kwargs)
        self.columns.append(column)
        return column

    def add_row_action(
        self, name, on_click, label=None, icon=None, tooltip=None, **kwargs
    ):
        for action in self.row_actions:
            if action.name == name:
                raise ValueError(f"Action with name '{name}' already exists")

        row_action = Action(
            name=name,
            on_click=on_click,
            label=label,
            icon=icon,
            tooltip=tooltip,
            **kwargs,
        )
        self.row_actions.append(row_action)
        return row_action

    def add_tooltip(self, row, column, value, **kwargs):
        if (row, column) in self._tooltip_map:
            raise ValueError(
                f"Tooltip for row '{row}' and column '{column}' already exists"
            )

        tooltip = Tooltip(row=row, column=column, value=value, **kwargs)
        self.tooltips.append(tooltip)
        self._tooltip_map[(row, column)] = tooltip
        return tooltip

    def clone(self):
        clone = super().clone()
        clone.columns = [column.clone() for column in self.columns]
        clone.row_actions = [action.clone() for action in self.row_actions]
        clone.tooltips = [tooltip.clone() for tooltip in self.tooltips]
        clone._tooltip_map = {
            (tooltip.row, tooltip.column): tooltip
            for tooltip in clone.tooltips  # pylint: disable=no-member
        }
        return clone

    def to_json(self):
        return {
            **super().to_json(),
            "columns": [column.to_json() for column in self.columns],
            "row_actions": [action.to_json() for action in self.row_actions],
            "tooltips": [tooltip.to_json() for tooltip in self.tooltips],
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
            schema = {
                "height": "100px",
                "width": "100px",
                "alt": "My image alt text",
                "href": "https://voxel51.com",
                "operator": "@my/plugin/my_operator" | self.my_operator (in Python Panels),
                "prompt": False,
                "params": {"foo": "bar"},
            }
            outputs = types.Object()
            outputs.define_property(
                "image",
                types.String(),
                label="Image",
                view=types.ImageView(),
            )
            return types.Property(outputs)

    Args:
        height (None): the height of the image
        width (None): the width of the image
        alt (None): the alt text of the image
        href (None): the url to navigate to when the image is clicked
        operator (None): the name of the callable operator to execute when the image is clicked
        prompt (False): whether to prompt the user before executing the operator
        params (None): the parameters to pass to the operator
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class AlertView(View):
    """Displays an alert.

    Args:
        severity (None): the severity of the alert displayed, one of
            ``("info", "success", "warning", "error")``
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


class ToastView(View):
    """Displays a snackbar style toast element.

    Examples::

    schema = {
            "message": "Test",
            "duration": 30000,
            "layout": {
                "vertical": "top",
                "horizontal": "center",
                "top": "200px"
            },
        }
        snackbar = types.ToastView(**schema)
        panel.obj("toast", view=snackbar)

    Args:
        message: the message to display
        duration (None): the duration to stay on screen in milliseconds
        layout (None): the layout of the toast
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


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


class TextView(View):
    """Displays a text.
    .. note::
        Must be used with :class:`String` properties.
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


class StatusButtonView(View):
    """Renders a status button.

    Args:
        severity (None): the severity of the alert displayed, one of
            ``("info", "success", "warning", "error", "enabled", "disabled")``
        on_click (None): an operator to execute when the button is clicked
        params (None): the parameters to pass to the operator
        disabled: whether the button is disabled
        title: tooltip title for the button
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class MediaPlayerView(View):
    """Renders a media player for audio and video files.

    Args:
        name: the name of the property
        url: the URL of the media to display
        on_start (None): the operator to execute when the media starts
        on_play (None): the operator to execute when the media is played
        on_pause (None): the operator to execute when the media is paused
        on_buffer (None): the operator to execute when the media is buffering
        on_buffer_end (None): the operator to execute when the media stops buffering
        on_ended (None): the operator to execute when the media ends
        on_error (None): the operator to execute when the media errors
        on_duration (None): the operator to execute when the media duration is loaded
        on_seek (None): the operator to execute when the media is seeked
        on_progress (None): the operator to execute when the media progresses
    """

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
        prompt = types.PromptView(
            label="This is the title",
            submit_button_label="Click me",
            cancel_button_label="Abort"
        )
        inputs = types.Object()
        inputs.md("Hello world!")
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


class GridView(View):
    """Displays properties of an object as a grid of components in horizontal
    or vertical orientation.

    .. note::

        Must be used with :class:`Object` properties.

    Args:
        orientation ("2d"): the orientation of the stack. Can be either ``"2d"``,
            ``"horizontal"`` or ``"vertical"``
        gap (1): the gap between the components
        align_x ("left"): the alignment of the components. Can be either ``"left"``, ``"center"``,
            or ``"right"``
        align_y ("top"): the alignment of the components. Can be either ``"top"``, ``"center"``,
            or ``"bottom"``
        variant (None): the variant of the grid. Can be either ``"paper"`` or ``"outline"``
        elevation (None): the elevation of the grid. Only applicable when ``variant="paper"``
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.orientation = kwargs.get("orientation", None)
        self.gap = kwargs.get("gap", 1)
        self.align_x = kwargs.get("align_x", "left")
        self.align_y = kwargs.get("align_y", "top")
        variant = kwargs.get("variant", None)
        elevation = kwargs.get("elevation", None)
        if variant == "paper":
            self.container = PaperContainer(elevation=elevation)
        elif variant == "outline":
            self.container = OutlinedContainer()

    def to_json(self):
        return {
            **super().to_json(),
            "orientation": self.orientation,
            "gap": self.gap,
            "align_x": self.align_x,
            "align_y": self.align_y,
        }


class DashboardView(View):
    """Defines a Dashboard view.

    Args:
        layout (None): the layout of the dashboard.
        on_save_layout (None): event triggered when the layout changes
        on_add_item (None): event triggered when an item is added
        on_remove_item (None): event triggered when an item is closed
        on_edit_item (None): event triggered when an item is edited
        allow_addition (True): whether to allow adding items
        allow_deletion (True): whether to allow deleting items
        allow_edit (True): whether to allow editing items
        cta_title (None): the title of the call to action
        cta_body (None): the body of the call to action
        cta_button_label (None): the label of the call to action button
        rows (None): the number of rows in the dashboard
        cols (None): the number of columns in the dashboard
        items (None): the custom layout of the dashboard
        auto_layout (True): whether to automatically layout the dashboard
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.allow_addition = kwargs.get("allow_addition", True)
        self.allow_deletion = kwargs.get("allow_deletion", True)
        self.allow_edit = kwargs.get("allow_edit", True)
        self.cta_title = kwargs.get("cta_title", None)
        self.cta_body = kwargs.get("cta_body", None)
        self.cta_button_label = kwargs.get("cta_button_label", None)
        self.rows = kwargs.get("rows", None)
        self.cols = kwargs.get("cols", None)
        self.items = kwargs.get("items", None)
        self.auto_layout = kwargs.get("auto_layout", None)

    def to_json(self):
        return {
            **super().to_json(),
            "allow_addition": self.allow_addition,
            "allow_deletion": self.allow_deletion,
            "allow_edit": self.allow_edit,
            "cta_title": self.cta_title,
            "cta_body": self.cta_body,
            "cta_button_label": self.cta_button_label,
            "rows": self.rows,
            "cols": self.cols,
            "items": self.items,
            "auto_layout": self.auto_layout,
        }


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


class IconButtonView(Button):
    """Represents a button in a :class:`View`.

    Examples::

        import fiftyone.operators.types as types

        iconButtonView = types.IconButtonView(
            icon="waving_hand",
            operator="print_stdout",
            params={"msg": "Hi!"},
        )

        inputs = types.Object()
        inputs.view("icon_btn", iconButtonView)

    Args:
        icon (None): a icon for the button. See https://marella.me/material-icons/demo/
        variant (None): the optional variant of the icon button. Can be ``"round"``, ``"square"``,
            ``"outlined"``, or ``"contained"``.
        label (None): a label for the button
        description (None): a description for the button
        caption (None): a caption for the button
        operator (None): the name of the operator to execute when the button is
            clicked
        params (None): the parameters to pass to the operator
        href (None): the URL to navigate to when the button is clicked
    """

    def __init__(self, **kwargs):
        if "icon" not in kwargs or not isinstance(kwargs["icon"], str):
            raise ValueError("The 'icon' parameter of type str is required.")
        super().__init__(**kwargs)


class ModalView(Button):
    """Represents a button in a :class:`View` that opens up an interactive modal.

    Examples::

        import fiftyone.operators.types as types

        schema = {
            "modal": {"icon": "local_offer", "iconVariant": "outlined", "title": "Modal Title", "subtitle": "Modal Subtitle", "body": "Modal Body", textAlign: {title: "center", subtitle: "left", body: "right"}},
            "primaryButton": {"primaryText": "This is the primary button", "primaryColor": "primary", "params": {"foo": "bar", "multiple": True}},
            "secondaryButton": {"secondaryText": "This is the secondary button", "secondaryColor": "secondary"},
            "primaryCallback": self.do_something(),
            "secondaryCallback": self.do_nothing(),
            "functionality": "tagging",
        }
        modal = types.ModalView(**schema, label="This is a modal", variant="outlined", icon="local_offer")

        .. note::
            The primary callback is called when the primary button is clicked and the secondary callback is called when the secondary button is clicked.
            Secondary callback defaults to a closure of the modal unless defined.
            Buttons of ModalView inherit all functionality of ButtonView.

        inputs = types.Object()
        inputs.view("modal_btn", modal)

    Args:
        modal: the textual content of the modal
        primaryButton (None): the properties of the primary button
        secondaryButton (None): the properties of the secondary button
        primaryCallback (None): the function to execute when the primary button is clicked
        secondaryCallback (None): the function to execute when the secondary button is clicked
        functionality (None): the name of the functionality to execute when the primary button is clicked. Available options are 'tagging'
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class HStackView(GridView):
    """Displays properties of an object as a horizontal stack of components.

    .. note::

        Must be used with :class:`Object` properties.
    """

    def __init__(self, orientation="horizontal", **kwargs):
        super().__init__(orientation=orientation, **kwargs)


class VStackView(GridView):
    """Displays properties of an object as a vertical stack of components.

    .. note::

        Must be used with :class:`Object` properties.
    """

    def __init__(self, orientation="vertical", **kwargs):
        super().__init__(orientation=orientation, **kwargs)

    def to_json(self):
        return {**super().to_json()}


class ButtonGroupView(GridView):
    """Displays a group of buttons in a horizontal stack.

    .. note::

        Must be used with :class:`Button` properties.
    """

    def __init__(self, orientation="horizontal", **kwargs):
        kwargs["align_y"] = kwargs.get("align_y", "center")
        super().__init__(orientation=orientation, **kwargs)

    def to_json(self):
        return {**super().to_json()}


class MenuView(GridView):
    """Displays a menu of options in a vertical stack.

    .. note::
        Can be used for an :class:`Button` type with properties whose views are one of
        :class:`Button`, :class:`Dropdown`, :class:`DropdownView`, and :class;`Choices`. The variant
        and color of the items can be set using the `variant` and `color` parameters.

    Args:
        name: the name of the property
        variant (None): the variant for the items of the menu. Can be ``"contained"``,
            ``"outlined"``, ``"round"`` or ``"square"``
        color (None): the color for the items of the menu.
        overlay (None): whether to display the menu as an overlay. Can be ``"top-left"``,
        ``"top-center"``, ``"top-right"``, ``"bottom-left"``, `"bottom-center"``, or
        ``"bottom-right"``. Overlay is useful when you want to display a floating menu on top of
        another content (for example, menu for full-panel-width plot)
        icon (None): when set, the icon button will be displayed as the menu trigger,
        instead of the selected value. Can be "SettingsIcon" or "MoreVertIcon"
    Returns:
        a :class:`Object`
    """

    def __init__(self, orientation="horizontal", **kwargs):
        super().__init__(orientation=orientation, **kwargs)

    def to_json(self):
        return {**super().to_json()}


class ArrowNavView(View):
    """Displays a floating navigation arrows.

    Args:
        forward (True): Whether to display the forward arrow
        backward (True): Whether to display the backward arrow
        on_forward (None): The operator to execute when the forward arrow is clicked
        on_backward (None): The operator to execute when the backward arrow is clicked
        position ("center"): The position of the arrows. Can be either ``"top"``, ``center``,
            ``"bottom"``, ``"left"``, ``middle` (center horizontally), or ``"right"``
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.forward = kwargs.get("forward", True)
        self.backward = kwargs.get("backward", True)
        self.position = kwargs.get("position", "center")

    def to_json(self):
        return {
            **super().to_json(),
            "forward": self.forward,
            "backward": self.backward,
            "position": self.position,
        }


class FrameLoaderView(View):
    """Utility for animating panel state based on the given timeline_name.

    Examples::

        def on_load(self, ctx):
            panel.state.plot = {
                "type": "scatter",
                "x": [1, 2, 3],
                "y": [1, 2, 3],
            }

        def render(self, ctx):
            panel.obj(
                "frame_data",
                view=types.FrameLoaderView(
                    on_load_range=self.on_load_range,
                    target="plot.selectedpoints",
                ),
            )
            panel.plot("plot")

        def load_range(self, ctx, range_to_load):
            r = ctx.params.get("range")

            chunk = {}
            for i in range(r[0], r[1]):
                rendered_frame = [i]
                chunk[f"frame_data.frames[{i}]"] = rendered_frame

            ctx.panel.set_data(chunk)
            current_field = ctx.panel.state.selected_field or "default_field"
            ctx.panel.set_state("frame_data.signature", current_field + str(r))

    Args:
        timeline_name (None): the name of the timeline to load if provided, otherwise the default timeline
        on_load_range (None): the operator to execute when the frame is loading
        target: the path to the property to animate
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class TimelineView(View):
    """Represents a timeline for playing animations.

    Args:
        timeline_name (None): the name of the timeline
        total_frames (None): the total number of frames in the timeline
        loop (False): whether to loop the timeline
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class TimerView(View):
    """Supports a timer for executing operators/events after a specified duration or interval.

    Args:
        timeout (None): the duration in milliseconds to wait before executing the operator
        interval (None): the interval in milliseconds to wait before executing the operator
        on_timeout (None): the operator to execute when the timeout is reached
        on_interval (None): the operator to execute at the interval
        params (None): the params passed to the on_interval or on_timeout operator
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Container(BaseType):
    """Represents a base container for a container types."""

    def __init__(self, **kwargs):
        self._kwargs = kwargs

    def kwargs_to_json(self):
        view_kwargs = {**self._kwargs}
        return _convert_callables_to_operator_uris(view_kwargs)

    def to_json(self):
        return {**super().to_json(), **self.kwargs_to_json()}


class PaperContainer(Container):
    """Represents an elevated block for a view.

    Args:
        elevation (1): the elevation of the container. Can be a value between 0 and 24
        rounded (True): whether to display the paper container with rounded corners
    """

    def __init__(self, elevation=1, rounded=True, **kwargs):
        super().__init__(**kwargs)
        self.elevation = elevation
        self.rounded = rounded

    def to_json(self):
        return {
            **super().to_json(),
            "elevation": self.elevation,
            "rounded": self.rounded,
        }


class OutlinedContainer(Container):
    """Represents an elevated block for a view.

    Args:
        rounded (True): whether to display the outlined container with rounded corners
    """

    def __init__(self, rounded=True, **kwargs):
        super().__init__(**kwargs)
        self.rounded = rounded

    def to_json(self):
        return {
            **super().to_json(),
            "rounded": self.rounded,
        }
