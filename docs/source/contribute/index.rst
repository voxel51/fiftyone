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
    :description: Help improve the FiftyOne App, our TypeScript frontend. Enhance the user interface, add new visualizations, or improve performance.
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

  .. group-tab:: SDK

    Follow these steps to contribute to the FiftyOne SDK (Python):

    **Step 1: Fork and clone**

    .. code-block:: shell

        # Fork https://github.com/voxel51/fiftyone on GitHub...

        # Then clone it locally
        git clone https://github.com/YOUR_USERNAME/fiftyone.git
        cd fiftyone

    **Step 2: Install in development mode**

    .. code-block:: shell

        # Install FiftyOne as an editable package with pre-commit hooks
        bash install.sh -d

    **Step 3: Add FiftyOne to your PYTHONPATH**

    .. code-block:: shell

        export PYTHONPATH=$PYTHONPATH:$(pwd)

    Tip: add this to your shell profile to make it permanent.

    **Step 4: Create a branch and make changes**

    .. code-block:: shell

        # Create a branch from develop
        git checkout develop
        git checkout -b feature/my-feature-branch

        # Make changes...

    **Step 5: Run unit tests locally**

    .. code-block:: shell

        # Run tests locally to verify your changes
        pytest tests/unittests

    **Step 6: Submit a pull request**

    .. code-block:: shell

        git push -u origin feature/my-feature-branch

        # Open a PR targeting the develop branch on github.com...

    Refer to the
    `contributing guide <https://github.com/voxel51/fiftyone/blob/develop/CONTRIBUTING.md>`_
    and `style guide <https://github.com/voxel51/fiftyone/blob/develop/STYLE_GUIDE.md>`_
    for complete guidelines.

  .. group-tab:: App

    Follow these steps to contribute to the FiftyOne App (TypeScript):

    **Step 1: Fork and clone**

    .. code-block:: shell

        # Fork https://github.com/voxel51/fiftyone on GitHub...

        # Then clone it locally
        git clone https://github.com/YOUR_USERNAME/fiftyone.git
        cd fiftyone

    **Step 2: Install in development mode**

    .. code-block:: shell

        # Install FiftyOne as an editable package with pre-commit hooks
        bash install.sh -d

    **Step 3: Add FiftyOne to your PYTHONPATH**

    .. code-block:: shell

        export PYTHONPATH=$PYTHONPATH:$(pwd)

    Tip: add this to your shell profile to make it permanent.

    **Step 4: Create a branch and make changes**

    .. code-block:: shell

        # Create a branch from develop
        git checkout develop
        git checkout -b feature/my-feature-branch

        # Make changes...

    **Step 5: Test changes locally**

    Start the App server in development mode:

    .. code-block:: shell

        # Start client server with hot reloading
        cd app
        yarn dev

        # Start backend server manually (so you have access to stack traces)
        python fiftyone/server/main.py

    Then launch the App via Python SDK:

    .. code-block:: python

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")
        session = fo.launch_app(dataset)

    Run App tests locally:

    .. code-block:: shell

        yarn test

    **Step 6: Submit a pull request**

    .. code-block:: shell

        git push -u origin feature/my-feature-branch

        # Open a PR targeting the develop branch on github.com...

    Refer to the
    `App contributing guide <https://github.com/voxel51/fiftyone/blob/develop/app/CONTRIBUTING.md>`_
    for more information.

  .. group-tab:: Docs

    Follow these steps to contribute to the
    `FiftyOne documentation <https://docs.voxel51.com>`_:

    **Step 1: Fork and clone**

    .. code-block:: shell

        # Fork https://github.com/voxel51/fiftyone on GitHub...

        # Then clone it locally
        git clone https://github.com/YOUR_USERNAME/fiftyone.git
        cd fiftyone

    **Step 2: Install with docs dependencies**

    .. code-block:: shell

        # Install FiftyOne as an editable package with pre-commit hooks
        bash install.sh -d

        # Install docs dependencies
        pip install -r requirements/docs.txt

    **Step 3: Add FiftyOne to your PYTHONPATH**

    .. code-block:: shell

        export PYTHONPATH=$PYTHONPATH:$(pwd)

    Tip: add this to your shell profile to make it permanent.

    **Step 4: Create a branch and make changes**

    .. code-block:: shell

        # Create a branch from develop
        git checkout develop
        git checkout -b docs/my-docs-branch

        # Make changes in docs/source folder...

    **Step 5: Build the docs locally**

    .. code-block:: shell

        bash docs/generate_docs.bash

    Notable flags: `-c` (clean build), `-f` (fast build), `-s` (static only).

    **Step 6: Submit a pull request**

    .. code-block:: shell

        git push -u origin docs/my-docs-branch

        # Open a PR targeting the develop branch on github.com...

    Refer to the
    `Docs README <https://github.com/voxel51/fiftyone/blob/develop/docs/README.md>`_
    for more information.

  .. group-tab:: Plugins

    Follow these instructions to build and share
    :ref:`FiftyOne Plugins <plugins-ecosystem>`:

    **Step 1: Initialize a new plugin**

    .. code-block:: shell

        fiftyone plugins create my-plugin

    This creates a new directory for your plugin within your plugins directory
    (default `~/fiftyone/__plugins__`).

    **Step 2: Develop your plugin**

    Edit `fiftyone.yml` (manifest) and `__init__.py` (code) in your
    plugin's directory.

    **Step 3: Test your plugin**

    Launch the FiftyOne App and test your plugin's operators and panels.

    **Step 4: Share with the community**

    Publish your plugin to your own GitHub repository and then
    :ref:`publish it <plugins-ecosystem-submission>` to the
    :ref:`Plugins Ecosystem <plugins-ecosystem>`.

    Refer to the :ref:`developing plugins <developing-plugins>` and
    :ref:`contributing plugins <contributing-plugins>` guides for more
    information.

.. _contributing-good-first-issues:

Good first issues
_________________

Looking for something to work on? These issues are great for newcomers:

-   `Good first issues <https://github.com/voxel51/fiftyone/labels/good%20first%20issue>`_ -
    perfect for first-time contributors
-   `Help wanted <https://github.com/voxel51/fiftyone/labels/help%20wanted>`_ -
    we'd love your help on these
-   `Documentation <https://github.com/voxel51/fiftyone/labels/documentation>`_ -
    help make FiftyOne easier to use

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

-   **Discord**: join our `Discord community <https://community.voxel51.com>`_
    for real-time chat with maintainers and other contributors
-   **GitHub Discussions**: ask questions on
    `GitHub Discussions <https://github.com/voxel51/fiftyone/discussions>`_
-   **Email**: reach out to us at support@voxel51.com
