.. _contributing:

Contributing to FiftyOne
========================

.. default-role:: code

FiftyOne is **open source** and built by contributors like you. Whether you're
fixing a typo, adding a feature, or building a plugin, **every contribution**
makes FiftyOne better for everyone.

.. note::

    Check out the `FiftyOne GitHub repository <https://github.com/voxel51/fiftyone>`_
    to get started, or join our `Discord community <https://community.voxel51.com/>`_
    to connect with other contributors.

.. _contributing-ways:

Ways to contribute
__________________

There are many ways to contribute to FiftyOne, from writing code to improving
documentation. Choose the path that best matches your skills and interests:

.. raw:: html

    <div class="tutorials-callout-container">
        <div class="row">

.. customcalloutitem::
    :header: Report bugs & request features
    :description: Found a bug or have an idea for a new feature? Open a GitHub issue to let us know. Quality bug reports and well-thought-out feature requests are incredibly valuable.
    :button_text: Open an Issue
    :button_link: https://github.com/voxel51/fiftyone/issues/new/choose

.. customcalloutitem::
    :header: Contribute code
    :description: Fix bugs, implement new features, or improve existing functionality. Our codebase is Python-based with a TypeScript frontend, and we welcome contributions of all sizes.
    :button_text: Contributing Guide
    :button_link: https://github.com/voxel51/fiftyone/blob/develop/CONTRIBUTING.md

.. customcalloutitem::
    :header: Improve documentation
    :description: Help make FiftyOne easier to use by improving our docs. Fix typos, add examples, write tutorials, or translate content. Great docs make great software.
    :button_text: Docs README
    :button_link: https://github.com/voxel51/fiftyone/blob/develop/docs/README.md

.. customcalloutitem::
    :header: Build plugins
    :description: Extend FiftyOne's capabilities by creating plugins. Share your integrations, custom panels, and workflows with the community.
    :button_text: Plugin Guide
    :button_link: ../plugins/contributing_plugins.html

.. customcalloutitem::
    :header: Contribute to the App
    :description: Help improve the FiftyOne App, our React/TypeScript frontend. Enhance the user interface, add new visualizations, or improve performance.
    :button_text: App Contributing Guide
    :button_link: https://github.com/voxel51/fiftyone/blob/develop/app/CONTRIBUTING.md

.. customcalloutitem::
    :header: Help the community
    :description: Answer questions on Discord, help triage issues, review pull requests, or share your FiftyOne workflows and tutorials with others.
    :button_text: Join Discord
    :button_link: https://community.voxel51.com/

.. raw:: html

        </div>
    </div>

.. _contributing-getting-started:

Getting started
_______________

Ready to make your first contribution? Follow these steps to set up your
development environment:

.. tabs::

  .. group-tab:: Code

    Contribute to the FiftyOne Python library.

    **Step 1: Fork and clone**

    .. code-block:: shell

        # Fork https://github.com/voxel51/fiftyone on GitHub, then:
        git clone https://github.com/YOUR_USERNAME/fiftyone.git
        cd fiftyone

    **Step 2: Install in development mode**

    .. code-block:: shell

        bash install.bash -d

    This installs FiftyOne in editable mode with pre-commit hooks.

    **Step 3: Create a branch and make changes**

    .. code-block:: shell

        git checkout -b feature/my-feature develop
        # Make your changes
        pytest tests/unittests/  # Run tests

    **Step 4: Submit a pull request**

    .. code-block:: shell

        git push origin feature/my-feature
        # Open a PR targeting the develop branch

    For complete guidelines, see the
    `Contributing Guide <https://github.com/voxel51/fiftyone/blob/develop/CONTRIBUTING.md>`_
    and `Style Guide <https://github.com/voxel51/fiftyone/blob/develop/STYLE_GUIDE.md>`_.

  .. group-tab:: Documentation

    Improve the FiftyOne documentation.

    **Step 1: Set up your environment**

    .. code-block:: shell

        git clone https://github.com/YOUR_USERNAME/fiftyone.git
        cd fiftyone
        bash install.bash
        pip install -r docs/requirements/docs.txt

    .. note::

        Use a separate virtual environment for docs. Do **not** use the
        same environment as development mode (`-d` flag).

    **Step 2: Set PYTHONPATH**

    .. code-block:: shell

        export PYTHONPATH=$PYTHONPATH:/path/to/fiftyone

    Add this to your shell profile to make it permanent.

    **Step 3: Build the docs**

    .. code-block:: shell

        bash docs/generate_docs.bash

    Notable flags: `-c` (clean build), `-f` (fast build), `-s` (static only)

    **Step 4: Make changes and submit PR**

    Edit files in `docs/source/`, rebuild to preview, then submit a PR.

    For complete guidelines, see the
    `Docs README <https://github.com/voxel51/fiftyone/blob/develop/docs/README.md>`_.

  .. group-tab:: App

    Contribute to the FiftyOne App (React/TypeScript).

    **Step 1: Set up Node.js**

    .. code-block:: shell

        nvm install v17.9.0
        nvm use v17.9.0
        npm install -g yarn

    **Step 2: Install dependencies**

    .. code-block:: shell

        git clone https://github.com/YOUR_USERNAME/fiftyone.git
        cd fiftyone/app
        yarn install

    **Step 3: Start development server**

    .. code-block:: shell

        yarn dev

    **Step 4: Run tests**

    .. code-block:: shell

        yarn test

    For complete guidelines, see the
    `App Contributing Guide <https://github.com/voxel51/fiftyone/blob/develop/app/CONTRIBUTING.md>`_.

  .. group-tab:: Plugins

    Build and share FiftyOne plugins.

    **Step 1: Create a new plugin**

    .. code-block:: shell

        fiftyone plugins create my-plugin

    This creates a new plugin in your plugins directory
    (`~/fiftyone/__plugins__` by default).

    **Step 2: Develop your plugin**

    Edit `fiftyone.yml` (manifest) and `__init__.py` (operators) in your
    plugin directory.

    **Step 3: Test your plugin**

    Launch the FiftyOne App and test your plugin's operators and panels.

    **Step 4: Share with the community**

    Publish to GitHub and submit to the
    `Plugins Ecosystem <https://github.com/voxel51/fiftyone-plugins>`_.

    For complete guidelines, see the
    :ref:`Plugin Development Guide <developing-plugins>` and
    :ref:`Contributing Plugins <contributing-plugins>`.

.. _contributing-good-first-issues:

Good first issues
_________________

Looking for something to work on? These issues are great for newcomers:

-   `good first issue <https://github.com/voxel51/fiftyone/labels/good%20first%20issue>`_ -
    Perfect for first-time contributors
-   `help wanted <https://github.com/voxel51/fiftyone/labels/help%20wanted>`_ -
    We'd love your help on these
-   `documentation <https://github.com/voxel51/fiftyone/labels/documentation>`_ -
    Help make FiftyOne easier to use

.. _contributing-contributors:

Our amazing contributors
________________________

FiftyOne would not be possible without the contributions of our amazing
community. **Thank you** to every developer who has submitted a pull request,
reported a bug, or helped improve the project. Your contributions make FiftyOne
better for everyone—and now you can be part of this growing community of
developers!

.. image:: https://contrib.rocks/image?repo=voxel51/fiftyone
   :alt: FiftyOne Contributors
   :align: center
   :target: https://github.com/voxel51/fiftyone/graphs/contributors

.. _contributing-need-help:

Need help?
__________

Don't hesitate to ask for help! The FiftyOne community is friendly and
welcoming:

-   **Discord**: Join our `Discord community <https://community.voxel51.com/>`_
    for real-time chat with maintainers and other contributors
-   **GitHub Discussions**: Ask questions on
    `GitHub Discussions <https://github.com/voxel51/fiftyone/discussions>`_
-   **Email**: Reach out to us at support@voxel51.com