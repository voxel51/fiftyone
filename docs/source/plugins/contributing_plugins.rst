.. _contributing-plugins:

Contributing Plugins
====================

.. default-role:: code

This page describes how to share your FiftyOne plugins with the community.

.. note::

    For complete plugin development documentation, see
    :ref:`Developing Plugins <developing-plugins>`.

.. _plugins-why-share:

Why share your plugin?
______________________

By sharing your plugin, you:

-   Help others solve similar problems
-   Get feedback and contributions from the community
-   Showcase your work in the official plugin ecosystem
-   Build your reputation as a FiftyOne contributor

.. _plugins-share-github:

Sharing via GitHub
__________________

The simplest way to share a plugin is to publish it on GitHub:

1.  Create a public GitHub repository for your plugin
2.  Include a clear `README.md` with:

    -   What the plugin does
    -   Installation instructions
    -   Usage examples with code snippets
    -   Screenshots or GIFs showing the plugin in action

Users can then install your plugin directly:

.. code-block:: shell

    fiftyone plugins download https://github.com/your-username/your-plugin

.. _plugins-ecosystem-submission:

Submitting to the Plugin Ecosystem
__________________________________

Get your plugin featured in the official :ref:`Plugins Ecosystem <plugins-ecosystem>`.

.. raw:: html

    <video autoplay loop muted playsinline style="width: 100%; border-radius: 8px; margin: 1rem 0;">
        <source src="https://cdn.voxel51.com/plugins/plugin_universe.webm" type="video/webm">
    </video>

How the Plugin Ecosystem works
------------------------------

The :ref:`Plugins Ecosystem <plugins-ecosystem>` page renders the README
directly from your plugin's GitHub repository. This means that whatever you
write in your plugin's README will be displayed in the documentation.

Make sure your README is well-crafted with clear descriptions, usage examples,
and screenshots—this is exactly what users will see when browsing the
plugin ecosystem.

Submission process
------------------

Follow these steps to submit your plugin:

1.  **Fork the repository**: Fork
    `voxel51/fiftyone-plugins <https://github.com/voxel51/fiftyone-plugins>`_
    on GitHub

2.  **Add your plugin to the community table**: Edit the README and add a new
    row with your plugin's name, description, and repository link

3.  **Submit a pull request**: Create a PR with:

    -   A clear title (e.g., "Add my-awesome-plugin to community plugins")
    -   Brief description of what your plugin does
    -   Category/tags for discoverability

4.  **Review process**: The FiftyOne team will review your PR. If everything
    looks good, your PR will be merged and your plugin will appear in the
    :ref:`Plugins Ecosystem <plugins-ecosystem>`

.. _plugins-quality-checklist:

Quality checklist
_________________

Before sharing your plugin, verify that it meets these requirements:

.. table::
    :widths: 5 95

    +---------+--------------------------------------------------------------+
    | ✓       | Has a clear, descriptive name                                |
    +---------+--------------------------------------------------------------+
    | ✓       | Includes a comprehensive README with installation and usage  |
    +---------+--------------------------------------------------------------+
    | ✓       | Handles errors gracefully with helpful messages              |
    +---------+--------------------------------------------------------------+
    | ✓       | Works with the latest FiftyOne version                       |
    +---------+--------------------------------------------------------------+
    | ✓       | Does not hardcode secrets or sensitive data                  |
    +---------+--------------------------------------------------------------+
    | ✓       | Has been tested on sample datasets                           |
    +---------+--------------------------------------------------------------+

.. _plugins-ready-to-share:

Ready to share your plugin?
___________________________

Once your plugin meets the quality checklist, submit it to the Plugin Ecosystem
and join the growing community of FiftyOne plugin developers!

.. customanimatedcta::
    :button_text: Submit your plugin
    :button_link: https://github.com/voxel51/fiftyone-plugins

.. _plugins-getting-help:

Getting help
____________

Need assistance with your plugin contribution?

-   **Discord**: Ask questions on
    `community.voxel51.com <https://community.voxel51.com/>`_
-   **Plugin examples**: Browse the :ref:`Plugins Ecosystem <plugins-ecosystem>`
    for inspiration
-   **Development guide**: See :ref:`Developing Plugins <developing-plugins>`
    for complete documentation
