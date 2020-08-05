"""
Sphinx custom directives.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from docutils.parsers.rst import Directive, directives
from docutils.statemachine import StringList
from docutils import nodes


class CustomCardItemDirective(Directive):
    """A custom card item for use on pages that contain a list of links with
    short descriptions and optional images.

    The card item provides a heading, a description, and an optional image to
    the right. The entire card is clickable and links to the provided link.

    Example usage::

        .. customcarditem::
            :header: Custom card
            :description: This is a custom card. Click to learn more.
            :link: other/page.html
            :image: ../_static/images/custom-image.jpg
            :tags: Custom-Tag
    """

    option_spec = {
        "header": directives.unchanged,
        "description": directives.unchanged,
        "link": directives.unchanged,
        "image": directives.unchanged,
        "tags": directives.unchanged,
    }

    def run(self):
        header = self.options.get("header", "")
        description = self.options.get("description", "")
        link = self.options.get("link", "")
        image = '<img src="%s">' % self.options.get("image", "")
        tags = self.options.get("tags", "")

        card_rst = _CUSTOM_CARD_TEMPLATE.format(
            header=header,
            description=description,
            link=link,
            image=image,
            tags=tags,
        )

        card_list = StringList(card_rst.split("\n"))
        card = nodes.paragraph()
        self.state.nested_parse(card_list, self.content_offset, card)
        return [card]


_CUSTOM_CARD_TEMPLATE = """
.. raw:: html

    <div class="col-md-12 tutorials-card-container" data-tags={tags}>

    <div class="card tutorials-card" link={link}>

    <div class="card-body">

    <div class="card-title-container">
        <h4>{header}</h4>
    </div>

    <p class="card-summary">{description}</p>

    <p class="tags">{tags}</p>

    <div class="tutorials-image">{image}</div>

    </div>

    </div>

    </div>
"""


class CustomCalloutItemDirective(Directive):
    """A custom callout for use on table of contents-style pages that link into
    other pages.

    The callout contains a header, a body, and a clickable button that links to
    the provided link.

    Example usage::

        .. customcalloutitem::
            :header: Custom header
            :description: Custom body
            :button_text: Custom button
            :button_link: other/page.html
    """

    option_spec = {
        "header": directives.unchanged,
        "description": directives.unchanged,
        "button_text": directives.unchanged,
        "button_link": directives.unchanged,
    }

    def run(self):
        header = self.options.get("header", "")
        description = self.options.get("description", "")
        button_text = self.options.get("button_text", "")
        button_link = self.options.get("button_link", "")

        classes = "with-right-arrow" if button_link else ""
        attributes = (
            ""
            if button_link
            else 'onclick="return false;" style="pointer-events:none;cursor:default;"'
        )

        callout_rst = _CUSTOM_CALLOUT_TEMPLATE.format(
            header=header,
            description=description,
            button_text=button_text,
            button_link=button_link,
            classes=classes,
            attributes=attributes,
        )

        button_list = StringList(callout_rst.split("\n"))
        button = nodes.paragraph()
        self.state.nested_parse(button_list, self.content_offset, button)
        return [button]


_CUSTOM_CALLOUT_TEMPLATE = """
.. raw:: html

    <div class="col-md-6">
        <div class="text-container">
            <h3>{header}</h3>
            <p class="body-paragraph">{description}</p>
            <a class="btn {classes} callout-button" href="{button_link}"{attributes}>{button_text}</a>
        </div>
    </div>
"""


class CustomButtonDirective(Directive):
    """A custom button for use on table of contents-style pages that link into
    other pages.

    The button is clickable and links to the provided link.

    Example usage::
        .. custombutton::
            :button_text: Custom button
            :button_link: other/page.html
    """

    option_spec = {
        "button_text": directives.unchanged,
        "button_link": directives.unchanged,
    }

    def run(self):
        button_text = self.options.get("button_text", "")
        button_link = self.options.get("button_link", "")

        classes = "with-right-arrow" if button_link else ""
        attributes = (
            ""
            if button_link
            else 'onclick="return false;" style="pointer-events:none;cursor:default;"'
        )

        callout_rst = _CUSTOM_BUTTON_TEMPLATE.format(
            button_text=button_text,
            button_link=button_link,
            classes=classes,
            attributes=attributes,
        )

        button_list = StringList(callout_rst.split("\n"))
        button = nodes.paragraph()
        self.state.nested_parse(button_list, self.content_offset, button)
        return [button]


_CUSTOM_BUTTON_TEMPLATE = """
.. raw:: html

    <div class="tutorials-callout-container">
        <a class="btn {classes} callout-button" href="{button_link}"{attributes}>{button_text}</a>
    </div>
"""
