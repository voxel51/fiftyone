"""
Sphinx custom directives.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from docutils.parsers.rst import Directive, directives
from docutils.statemachine import StringList
from docutils import nodes


class CustomGuidesCardDirective(Directive):
    """A custom guides card for use on getting started pages that contain guided learning experiences.

    The guides card provides a title, description, level, time estimate, and a link to the guide.

    Example usage::

        .. customguidescard::
            :title: Medical Imaging Guide
            :description: Explore medical imaging workflows with DICOM, CT scans, and volumetric data.
            :level: Beginner
            :time: 15-25 min
            :link: getting_started_guides/medical_imaging/index.html
    """

    option_spec = {
        "title": directives.unchanged,
        "description": directives.unchanged,
        "level": directives.unchanged,
        "time": directives.unchanged,
        "link": directives.unchanged,
    }

    def run(self):
        title = self.options.get("title", "")
        description = self.options.get("description", "")
        level = self.options.get("level", "")
        time = self.options.get("time", "")
        link = self.options.get("link", "")

        html = _CUSTOM_GUIDES_CARD_TEMPLATE.format(
            title=title,
            description=description,
            level=level,
            time=time,
            link=link,
        )

        return [nodes.raw("", html, format="html")]


_CUSTOM_GUIDES_CARD_TEMPLATE = """
    <div class="col-md-4 getting-started-card mb-4">
        <div class="card h-100 guides-card">
            <div class="card-body d-flex flex-column">
                <h5 class="card-title">{title}</h5>
                <p class="card-text">{description}</p>
                <div class="d-flex align-items-center" style="margin-bottom: 15px;">
                    <span class="badge">{level}</span>
                    <span class="badge bg-secondary">{time}</span>
                </div>
                <a href="{link}" class="btn btn-outline-primary btn-sm mt-auto">Start Guide</a>
            </div>
        </div>
    </div>
"""


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
        image = self.options.get("image", "")
        tags = self.options.get("tags", "")

        if image:
            card_rst = _CUSTOM_CARD_TEMPLATE.format(
                header=header,
                description=description,
                link=link,
                image='<img src="%s">' % image,
                tags=tags,
            )
        else:
            # No image
            template = _CUSTOM_CARD_TEMPLATE.replace(
                '<div class="tutorials-image">{image}</div>', ""
            )

            card_rst = template.format(
                header=header,
                description=description,
                link=link,
                tags=tags,
            )

        card_list = StringList(card_rst.split("\n"))
        card = nodes.paragraph()
        self.state.nested_parse(card_list, self.content_offset, card)
        return [card]


_CUSTOM_CARD_TEMPLATE = """
.. raw:: html

    <div class="col-md-6 tutorials-card-container" data-tags={tags}>

    <div class="card tutorials-card" link={link}>

    <div class="card-body">

    <div class="tutorials-image">{image}</div>
    
    <div class="tutorials-card-content">

    <div class="card-title-container">
        <strong>{header}</strong>
    </div>

    <p class="card-summary">{description}</p>

    <p class="tags">{tags}</p>
    
    </div>

    </div>

    </div>

    </div>
"""


class CustomCalloutItemDirective(Directive):
    """A custom callout for use on table of contents-style pages that link into
    other pages.

    The callout contains a header, a body, a clickable button that links to
    the provided link, and an optional image.

    Example usage::

        .. customcalloutitem::
            :header: Custom header
            :description: Custom body
            :button_text: Custom button
            :button_link: other/page.html
            :image: ../_static/images/custom-image.jpg
    """

    option_spec = {
        "header": directives.unchanged,
        "description": directives.unchanged,
        "button_text": directives.unchanged,
        "button_link": directives.unchanged,
        "image": directives.unchanged,
    }

    def run(self):
        header = self.options.get("header", "")
        description = self.options.get("description", "")
        button_text = self.options.get("button_text", "")
        button_link = self.options.get("button_link", "")
        image = self.options.get("image", "")

        classes = "with-right-arrow" if button_link else ""
        attributes = (
            ""
            if button_link
            else 'onclick="return false;" style="pointer-events:none;cursor:default;"'
        )

        if image:
            callout_rst = _CUSTOM_CALLOUT_TEMPLATE.format(
                header=header,
                description=description,
                button_text=button_text,
                button_link=button_link,
                classes=classes,
                attributes=attributes,
                image='<div style="margin-top: 16px;"><img src="%s"></div>'
                % image,
            )

        else:
            # No image
            template = _CUSTOM_CALLOUT_TEMPLATE.replace(
                "<div>{image}</div>", ""
            )

            callout_rst = template.format(
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
            <a href="{button_link}" class="sd-btn sd-btn-primary book-a-demo" rel="noopener noreferrer" data-cta-dynamic="true"{attributes}>
                <div class="arrow">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="size-3">
                    <path stroke="currentColor" stroke-width="1.5"
                            d="M1.458 11.995h20.125M11.52 22.063 21.584 12 11.521 1.937"
                            vector-effect="non-scaling-stroke"></path>
                    </svg>  
                </div>
                <div class="text">{button_text}</div>
            </a>
            <div>{image}</div>
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


class CustomImageLinkDirective(Directive):
    """A custom image within a link nested in a div. Styling can be done via
    a parent container.


    Example usage::
        .. customimagelink::
            :image_link: other/page.html
            :image_src: images/image.png
            :image_src: My image
    """

    option_spec = {
        "image_link": directives.unchanged,
        "image_src": directives.unchanged,
        "image_title": directives.unchanged,
    }

    def run(self):
        image_link = self.options.get("image_link", "")
        image_src = self.options.get("image_src", "")
        image_title = self.options.get("image_title", "")

        callout_rst = _CUSTOM_IMAGE_LINK_TEMPLATE.format(
            image_link=image_link,
            image_src=image_src,
            image_title=image_title,
        )

        image_list = StringList(callout_rst.split("\n"))
        image = nodes.paragraph()
        self.state.nested_parse(image_list, self.content_offset, image)
        return [image]


_CUSTOM_IMAGE_LINK_TEMPLATE = """
.. raw:: html

    <div>
        <a href="{image_link}" title="{image_title}">
          <img src="{image_src}" alt="{image_title}"/>
        </a>
    </div>
"""


class CustomAnimatedCTADirective(Directive):
    """A custom animated CTA button with dynamic hover animation.

    The button uses the global dynamic CTA system to automatically adjust
    hover animations based on button size and text length.

    Example usage::

        .. customanimatedcta::
            :button_text: Get Started
            :button_link: getting_started/index.html
            :align: right

    Options:
        - button_text: Text to display on the button
        - button_link: URL to link to
        - align: Optional alignment (left, center, right)
    """

    option_spec = {
        "button_text": directives.unchanged,
        "button_link": directives.unchanged,
        "align": directives.unchanged,
    }

    def run(self):
        button_text = self.options.get("button_text", "")
        button_link = self.options.get("button_link", "")
        align = self.options.get("align", "left")

        attributes = (
            ""
            if button_link
            else 'onclick="return false;" style="pointer-events:none;cursor:default;"'
        )

        if align == "right":
            align_style = "display:flex; justify-content:flex-end;"
        elif align == "center":
            align_style = "display:flex; justify-content:center;"
        else:
            align_style = "display:inline-block;"

        cta_rst = _CUSTOM_ANIMATED_CTA_TEMPLATE.format(
            button_text=button_text,
            button_link=button_link,
            attributes=attributes,
            align_style=align_style,
        )

        button_list = StringList(cta_rst.split("\n"))
        button = nodes.paragraph()
        self.state.nested_parse(button_list, self.content_offset, button)
        return [button]


_CUSTOM_ANIMATED_CTA_TEMPLATE = """
.. raw:: html

    <div style="margin:0; {align_style}">
        <a href="{button_link}" class="sd-btn sd-btn-primary book-a-demo" rel="noopener noreferrer" data-cta-dynamic="true"{attributes}>
            <div class="arrow">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="size-3">
                <path stroke="currentColor" stroke-width="1.5"
                        d="M1.458 11.995h20.125M11.52 22.063 21.584 12 11.521 1.937"
                        vector-effect="non-scaling-stroke"></path>
                </svg>  
            </div>
            <div class="text">{button_text}</div>
        </a>
    </div>
"""
