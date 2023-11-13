.. _developing-plugins:

Developing Plugins
==================

.. default-role:: code

This page describes how to write your own FiftyOne plugins.

.. note::

    Check out the
    `FiftyOne plugins <https://github.com/voxel51/fiftyone-plugins>`_
    repository for a growing collection of plugins that you can use as examples
    when developing your own.

.. _plugins-design-overview:

Design overview
_______________

Plugins are composed of one or more Panels, Operators, and/or Components.

Together these building blocks enable you to build full-featured interactive
data applications that tailor FiftyOne to your specific use case and workflow.
Whether you're working with images, videos, or other data types, a plugin can
help you streamline your machine learning workflows and co-develop your data
and models.

.. image:: /images/plugins/plugin-design.png
    :align: center

.. _plugins-design-types:

Plugin types
------------

FiftyOne plugins can be written in JS or Python, or a combination of both.

JS Plugins are built using the `@fiftyone` TypeScript packages, npm packages,
and your own TypeScript. They can consist of Panels, Operators, and Components.

Python Plugins are built using the `fiftyone` package, pip packages, and your
own Python. They can currently only define Operators.

.. _plugins-design-panels:

Panels
------

Panels are miniature full-featured data applications that you can open in
:ref:`App Spaces <app-spaces>` and interactively manipulate to explore your
dataset and update/respond to updates from other spaces that are currently open
in the App.

FiftyOne natively includes the following Panels:

-   :ref:`Samples panel <app-samples-panel>`: the media grid that loads by
    default when you launch the App
-   :ref:`Histograms panel <app-histograms-panel>`: a dashboard of histograms
    for the fields of your dataset
-   :ref:`Embeddings panel <app-embeddings-panel>`: a canvas for working with
    :ref:`embeddings visualizations <brain-embeddings-visualization>`
-   :ref:`Map panel <app-map-panel>`: visualizes the geolocation data of
    datasets that have a |GeoLocation| field

.. image:: /images/app/app-map-panel.gif
    :align: center

.. note::

    Jump to :ref:`this section <developing-js-plugins>` for more information
    about developing panels.

.. _plugins-design-operators:

Operators
---------

Operators are user-facing operations that allow you to interact with the data
in your dataset. They can range from simple actions like checking a checkbox to
more complex workflows such as requesting annotation of samples from a
configurable backend. Operators can even be composed of other operators or be
used to add functionality to custom panels.

FiftyOne comes with a number of builtin
:mod:`Python <fiftyone.operators.builtin>` and
`TypeScript <https://github.com/voxel51/fiftyone/blob/develop/app/packages/operators/src/built-in-operators.ts>`_
operators for common tasks that are intended for either user-facing or
internal plugin use.

.. image:: /images/plugins/operator-browser.gif
    :align: center

.. note::

    Jump to :ref:`this section <developing-operators>` for more information
    about developing operators.

.. _plugins-design-components:

Components
----------

Components are responsible for rendering and event handling in plugins. They
provide the necessary functionality to display and interact with your plugin in
the FiftyOne App. Components also implement form inputs and output rendering
for Operators, making it possible to customize the way an operator is rendered
in the FiftyOne App.

For example, FiftyOne comes with a wide variety of
:mod:`builtin types <fiftyone.operators.types>` that you can leverage to build
complex input and and output forms for your operators.

.. image:: /images/plugins/file-explorer.gif
    :align: center

.. note::

    Jump to :ref:`this section <developing-js-plugins>` for more information
    about developing components.

.. _developing-plugins-setup:

Development setup
_________________

In order to develop Python plugins, you can use either a release or source
install of FiftyOne:

.. code-block:: shell

    pip install fiftyone

In order to develop JS plugins, you will need a
`source install <https://github.com/voxel51/fiftyone#installing-from-source>`_
of FiftyOne and a vite config that links modules to your `fiftyone/app`
directory.

.. note::

   For vite configs we recommend forking the
   `FiftyOne Plugins <https://github.com/voxel51/fiftyone-plugins>`_ repository
   and following the conventions there to build your plugin.

.. _plugin-anatomy:

Anatomy of a plugin
___________________

FiftyOne recognizes plugins by searching for `fiftyone.yml` or `fiftyone.yaml`
files within your :ref:`plugins directory <plugins-directory>`.

Below is an example of a plugin directory with a typical Python plugin and JS
plugin:

.. code-block:: text

    /path/to/your/plugins/dir/
        my-js-plugin/
            fiftyone.yml
            package.json
            dist/
                index.umd.js
        my-py-plugin/
            fiftyone.yml
            __init__.py
            requirements.txt

.. note::

    If the source code for a plugin already exists on disk, you can make it
    into a plugin using
    :func:`create_plugin() <fiftyone.plugins.core.create_plugin>` or the
    :ref:`fiftyone plugins create <cli-fiftyone-plugins-create>` CLI command.

    This will copy the source code to the plugins directory and create a
    `fiftyone.yml` file for you if one does not already exist. Alternatively,
    you can manually copy the code into your plugins directory.

    If your FiftyOne App is already running, you may need to restart the server
    and refresh your browser to see new plugins.

.. _plugin-fiftyone-yml:

fiftyone.yml
------------

All plugins must contain a `fiftyone.yml` or `fiftyone.yaml` file, which is
used to define the plugin's metadata, declare any operators that it exposes,
and declare any :ref:`secrets <plugins-secrets>` that it may require. The
following fields are available:

-   `name` **(required)**: the name of the plugin
-   `author`: the author of the plugin
-   `version`: the version of the plugin
-   `url`: the page (eg GitHub repository) where the plugin's code lives
-   `license`: the license under which the plugin is distributed
-   `description`: a brief description of the plugin
-   `fiftyone.version`: a semver version specifier (or `*`) describing the
    required FiftyOne version for the plugin to work properly
-   `operators`: a list of operator names registered by the plugin
-   `secrets`: a list of secret keys that may be used by the plugin

Check out the
`@voxel51/annotation <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/annotation/fiftyone.yml>`_
plugin's `fiftyone.yml` to see a practical example.

.. note::

    Although it is not strictly required, we highly recommend using the
    `@user-or-org-name/plugin-name` naming convention when writing plugins.

Python plugins
--------------

Python plugins should define the following files:

-   `__init__.py` **(required)**: entrypoint that defines the Python operators
    that the plugin defines
-   `requirements.txt`: specifies the Python package requirements to run the
    plugin

JS plugins
----------

JS plugins should define the following files:

-   `package.json`: a JSON file containing additional information about the
    plugin, including the JS bundle file path
-   `dist/index.umd.js`: a JS bundle file for the plugin

.. _publishing-plugins:

Publishing plugins
__________________

You can publish your FiftyOne plugins either privately or publicly by simply
uploading the source directory or a ZIP of it to GitHub or another file hosting
service.

.. note::

    Want to share your plugin with the FiftyOne community? Make a pull request
    into the `FiftyOne Plugins <https://github.com/voxel51/fiftyone-plugins>`_
    repository to add it to the
    `Community Plugins list <https://github.com/voxel51/fiftyone-plugins#community-plugins>`_!

Any users with access to the plugin's hosted location can easily
:ref:`download it <plugins-download>` via the
:ref:`fiftyone plugins download <cli-fiftyone-plugins-download>` CLI command:

.. code-block:: shell

    # Download plugin(s) from a GitHub repository
    fiftyone plugins download https://github.com/<user>/<repo>[/tree/branch]

    # Download plugin(s) by specifying the GitHub repository details
    fiftyone plugins download <user>/<repo>[/<ref>]

    # Download specific plugins from a GitHub repository
    fiftyone plugins download \\
        https://github.com/<user>/<repo>[/tree/branch] \\
        --plugin-names <name1> <name2> <name3>

.. note::

    GitHub repositories may contain multiple plugins. By default, all plugins
    that are found within the first three directory levels are installed, but
    you can select specific ones if desired as shown above.

.. _plugins-quick-examples:

Quick examples
______________

This section contains a few quick examples of plugins and operators before we
dive into the full details of the plugin system.

.. note::

    The best way to learn how to write plugins is to use and inspect existing
    ones. Check out the
    `FiftyOne plugins <https://github.com/voxel51/fiftyone-plugins>`_
    repository for a growing collection of plugins that you can use as examples
    when developing your own.

.. _example-plugin:

Example plugin
--------------

The
`Hello World plugin <https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/hello-world>`_
defines both a JS Panel and a Python operator:

.. tabs::

  .. group-tab:: fiftyone.yml

    .. code-block:: yaml
        :linenos:

        name: "@voxel51/hello-world"
        description: An example of JS and Python components in a single plugin
        version: 1.0.0
        fiftyone:
          version: "*"
        url: https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/hello-world/README.md
        license: Apache 2.0
        operators:
          - count_samples
          - show_alert

  .. group-tab:: __init__.py

    .. code-block:: python
        :linenos:

        import fiftyone.operators as foo
        import fiftyone.operators.types as types

        class CountSamples(foo.Operator):
            @property
            def config(self):
                return foo.OperatorConfig(
                    name="count_samples",
                    label="Count samples",
                    dynamic=True,
                )

            def resolve_input(self, ctx):
                inputs = types.Object()

                if ctx.view != ctx.dataset.view():
                    choices = types.RadioGroup()
                    choices.add_choice(
                        "DATASET",
                        label="Dataset",
                        description="Count the number of samples in the dataset",
                    )

                    choices.add_choice(
                        "VIEW",
                        label="Current view",
                        description="Count the number of samples in the current view",
                    )

                    inputs.enum(
                        "target",
                        choices.values(),
                        required=True,
                        default="VIEW",
                        view=choices,
                    )

                return types.Property(inputs, view=types.View(label="Count samples"))

            def execute(self, ctx):
                target = ctx.params.get("target", "DATASET")
                sample_collection = ctx.view if target == "VIEW" else ctx.dataset
                return {"count": sample_collection.count()}

            def resolve_output(self, ctx):
                target = ctx.params.get("target", "DATASET")
                outputs = types.Object()
                outputs.int(
                    "count",
                    label=f"Number of samples in the current {target.lower()}",
                )
                return types.Property(outputs)

        def register(p):
            p.register(CountSamples)

  .. group-tab:: HelloWorld.tsx

    .. code-block:: jsx
        :linenos:

        import * as fos from "@fiftyone/state";
        import { useRecoilValue } from "recoil";
        import { useCallback } from "react";
        import { Button } from "@fiftyone/components";
        import {
          types,
          useOperatorExecutor,
          Operator,
          OperatorConfig,
          registerOperator,
          executeOperator,
        } from "@fiftyone/operators";

        export function HelloWorld() {
          const executor = useOperatorExecutor("@voxel51/hello-world/count_samples");
          const onClickAlert = useCallback(() =>
            executeOperator("@voxel51/hello-world/show_alert")
          );
          const dataset = useRecoilValue(fos.dataset);

          if (executor.isLoading) return <h3>Loading...</h3>;
          if (executor.result) return <h3>Dataset size: {executor.result.count}</h3>;

          return (
            <>
              <h1>Hello, world!</h1>
              <h2>
                You are viewing the <strong>{dataset.name}</strong> dataset
              </h2>
              <Button onClick={() => executor.execute()}>Count samples</Button>
              <Button onClick={onClickAlert}>Show alert</Button>
            </>
          );
        }

        class AlertOperator extends Operator {
          get config() {
            return new OperatorConfig({
              name: "show_alert",
              label: "Show alert",
              unlisted: true,
            });
          }
          async execute() {
            alert(`Hello from plugin ${this.pluginName}`);
          }
        }

        registerOperator(AlertOperator, "@voxel51/hello-world");

  .. group-tab:: HelloWorldPlugin.tsx

    .. code-block:: jsx
        :linenos:

        import { registerComponent, PluginComponentType } from "@fiftyone/plugins";
        import { HelloWorld } from "./HelloWorld";

        registerComponent({
          name: "HelloWorld",
          label: "Hello world",
          component: HelloWorld,
          type: PluginComponentType.Panel,
          activator: myActivator,
        });

        function myActivator({ dataset }) {
          // Example of activating the plugin in a particular context
          // return dataset.name === 'quickstart'

          return true;
        }

Here's the plugin in action! The `Hello world` panel is available under the `+`
icon next to the Samples tab and the `count_samples` operator is available in
the operator browser:

.. image:: /images/plugins/hello-world.gif

.. _example-python-operator:

Example Python operator
-----------------------

Here's a simple :ref:`Python operator <developing-operators>` that accepts a
string input and then displays it to the user in the operator's output modal.

.. code-block:: python
    :linenos:

    class SimpleInputExample(foo.Operator):
        @property
        def config(self):
            return foo.OperatorConfig(
                name="simple_input_example",
                label="Simple input example",
            )

        def resolve_input(self, ctx):
            inputs = types.Object()
            inputs.str("message", label="Message", required=True)
            header = "Simple input example"
            return types.Property(inputs, view=types.View(label=header))

        def execute(self, ctx):
            return {"message": ctx.params["message"]}

        def resolve_output(self, ctx):
            outputs = types.Object()
            outputs.str("message", label="Message")
            header = "Simple input example: Success!"
            return types.Property(outputs, view=types.View(label=header))

    def register(p):
        p.register(SimpleInputExample)

In practice, operators would use the inputs to perform some operation on the
current dataset.

.. note::

    Remember that you must also include `simple_input` (the operator's name) in
    the plugin's `fiftyone.yml`.

.. _example-js-operator:

Example JS operator
-------------------

Here's how to define a :ref:`JS operator <developing-js-plugins>` that sets the
currently selected samples in the App based on a list of sample IDs provided
via a `samples` parameter.

.. code-block:: typescript
    :linenos:

    import {Operator, OperatorConfig, types, registerOperator} from "@fiftyone/operators";
    const PLUGIN_NAME = "@my/plugin";

    class SetSelectedSamples extends Operator {
        get config(): OperatorConfig {
            return new OperatorConfig({
                name: "set_selected_samples",
                label: "Set selected samples",
                unlisted: true,
            });
        }
        useHooks(): {} {
            return {
                setSelected: fos.useSetSelected(),
            };
        }
        async execute({ hooks, params }: ExecutionContext) {
            hooks.setSelected(params.samples);
        }
    }

    registerOperator(SetSelectedSamples, PLUGIN_NAME);

Unlike Python operators, JS operators can use React hooks and the `@fiftyone/*`
packages by defining a `useHook()` method. Any values return in this method
will be available to the operator's `execute()` method via `ctx.hooks`.

.. note::

    Marking the operator as `unlisted` omits it from the
    :ref:`operator browser <using-operators>`, which is useful when the
    operator is intended only for internal use by other plugin components.

.. _developing-operators:

Developing operators
____________________

Operators allow you to define custom operations that accept parameters via
input properties, execute some actions based on them, and optionally return
outputs. They can be :ref:`executed <using-operators>` by users in the App or
triggered internally by other operators.

Operators can be defined in either Python or JS, and FiftyOne comes with a
number of builtin :mod:`Python <fiftyone.operators.builtin>` and
`JS <https://github.com/voxel51/fiftyone/blob/develop/app/packages/operators/src/built-in-operators.ts>`_
operators for common tasks.

The :mod:`fiftyone.operators.types` module and
:js:mod:`@fiftyone/operators <@fiftyone/operators>` package define a rich
builtin type system that operator developers can use to define the input and
output properties of their operators without the need to build custom user
interfaces from scratch. These types handle all aspects of input collection,
validation, and component rendering for you.

Operators can be composed for coordination between Python and the FiftyOne App,
such as triggering a reload of samples/view to update the app with the changes
made by the operator. Operators can also be scheduled to run by an orchestrator
or triggered by other operators.

.. _operator-interface:

Operator interface
------------------

The code block below describes the Python interface for defining operators.
We'll dive into each component of the interface in more detail in the
subsequent sections.

.. note::

    The JS interface for defining operators is analogous. See this
    :ref:`example JS operator <example-js-operator>` for details.

.. code-block:: python
    :linenos:

    import fiftyone.operators as foo
    import fiftyone.operators.types as types

    class ExampleOperator(foo.Operator):
        @property
        def config(self):
            return foo.OperatorConfig(
                # The operator's URI: f"{plugin_name}/{name}"
                name="example_operator",  # required

                # The display name of the operator
                label="Example operator",  # required

                # A description for the operator
                description="An example description"

                # Whether to re-execute resolve_input() after each user input
                dynamic=True/False,  # default False

                # Whether the operator's execute() method returns a generator
                # that should be iterated over until exhausted
                execute_as_generator=True/False,  # default False

                # Whether to hide this operator from the App's operator browser
                # Set this to True if the operator is only for internal use
                unlisted=True/False,  # default False

                # Whether the operator should be executed every time a new App
                # session starts (eg dataset is changed)
                on_startup=True/False,  # default False

                # Custom icons to use
                icon="/assets/icon.svg",
                light_icon="/assets/icon-light.svg",  # light theme only
                dark_icon="/assets/icon-dark.svg",  # dark theme only
            )

        def resolve_placement(self, ctx):
            """You can optionally implement this method to configure a button
            or icon in the App that triggers this operator.

            By default the operator only appears in the operator brower
            (unless it is unlisted).

            Returns:
                a `types.Placement`
            """
            return types.Placement(
                # Make operator appear in the actions row above the sample grid
                types.Places.SAMPLES_GRID_SECONDARY_ACTIONS,

                # Use a button as the operator's placement
                types.Button(
                    # A label for placement button visible on hover
                    label="Open Histograms Panel",

                    # An icon for the button
                    # The default is a button with the `label` displayed
                    icon="/assets/icon.svg",

                    # If False, don't show the operator's input prompt when we
                    # do not require user input
                    prompt=True/False  # False
                )
            )

        def resolve_input(self, ctx):
            """Implement this method if your operator can render a form to
            collect user inputs.

            Returns:
                a `types.Property` defining the form's components
            """
            inputs = types.Object()

            # Use the builtin `types` and the current `ctx.params` to define
            # the necessary user input data
            inputs.str("key", ...)

            # When `dynamic=True`, you'll often use the current `ctx` to
            # conditionally render different components
            if ctx.params["key"] == "value" and len(ctx.view) < 100:
                # do something
            else:
                # do something else

            return types.Property(inputs, view=types.View(label="Example operator"))

        def resolve_delegation(self, ctx):
            """Implement this method if you want to programmatically determine
            whether to delegate execution of this operation based on `ctx`.

            Returns:
                True/False
            """
            return len(ctx.view) > 1000  # delegated for larger views

        def execute(self, ctx):
            """Executes the actual operation based on the hydrated `ctx`.
            All operators must implement this method.

            This method can optionally be implemented as `async`.

            Returns:
                an optional dict of results values
            """
            # Use ctx.params, ctx.dataset, ctx.view, etc to perform the
            # necessary computation
            value = ctx.params["key"]
            view = ctx.view
            n = len(view)

            # Use ctx.trigger() to call other operators as necessary
            ctx.trigger("operator_name", params={"key": value})

            # If `execute_as_generator=True`, this method may yield multiple
            # messages
            for i, sample in enumerate(current_view, 1):
                # do some computation
                yield ctx.trigger("set_progress", {"progress": i / n})
            yield ctx.trigger("reload_dataset")

            return {"value": value, ...}

        def resolve_output(self, ctx):
            """Implement this method if your operator renders an output form
            to the user.

            Returns:
                a Property defining the components of the output form
            """
            outputs = types.Object()

            # Use the builtin `types` and the current `ctx.params` and
            # `ctx.results` as necessary to define the necessary output form
            outputs.define_property("value", ...)

            return types.Property(outputs, view=types.View(label="Example operator"))

    def register(p):
        """Always implement this method and register() each operator that your
        plugin defines.
        """
        p.register(ExampleOperator)

.. note::

    Remember that you must also include `example_operator` (the operator's name)
    in the plugin's :ref:`fiftyone.yml <plugin-fiftyone-yml>`.

.. _operator-config:

Operator config
---------------

Every operator must define a
:meth:`config <fiftyone.operators.operator.Operator.config>` property that
defines its name, display name, and other optional metadata about its
execution:

.. code-block:: python
    :linenos:

    @property
    def config(self):
        return foo.OperatorConfig(
            # The operator's URI: f"{plugin_name}/{name}"
            name="example_operator",  # required

            # The display name of the operator
            label="Example operator",  # required

            # A description for the operator
            description="An example description"

            # Whether to re-execute resolve_input() after each user input
            dynamic=True/False,  # default False

            # Whether the operator's execute() method returns a generator
            # that should be iterated over until exhausted
            execute_as_generator=True/False,  # default False

            # Whether to hide this operator from the App's operator browser
            # Set this to True if the operator is only for internal use
            unlisted=True/False,  # default False

            # Whether the operator should be executed every time a new App
            # session starts (eg dataset is changed)
            on_startup=True/False,  # default False

            # Custom icons to use
            icon="/assets/icon.svg",
            light_icon="/assets/icon-light.svg",  # light theme only
            dark_icon="/assets/icon-dark.svg",  # dark theme only
        )

.. _operator-execution-context:

Execution context
-----------------

An :class:`ExecutionContext <fiftyone.operators.executor.ExecutionContext>` is
passed to each of the operator's methods at runtime. This `ctx` contains static
information about the current state of the App (dataset, view, selection, etc)
as well as dynamic information about the current parameters and results.

An :class:`ExecutionContext <fiftyone.operators.executor.ExecutionContext>`
contains the following properties:

-   `ctx.params`: a dict containing the operator's current input parameter
    values
-   `ctx.dataset_name`:  the name of the current dataset
-   `ctx.dataset` - the current |Dataset| instance
-   `ctx.view` - the current |DatasetView| instance
-   `ctx.selected` - the list of currently selected samples in the App, if any
-   `ctx.selected_labels` - the list of currently selected labels in the App,
    if any
-   `ctx.secrets` - a dict of :ref:`secrets <operator-secrets>` for the plugin,
    if any
-   `ctx.results` - a dict containing the outputs of the
    :meth:`execute() <fiftyone.operators.operator.Operator.execute>` method, if
    it has been called
-   `ctx.hooks` **(JS only)** - the return value of the operator's `useHooks()`
    method

.. _operator-inputs:

Operator inputs
---------------

Operators can optionally implement
:meth:`resolve_input() <fiftyone.operators.operator.Operator.resolve_input>`
to define user input forms that are presented to the user as a modal in the App
when the operator is invoked.

The basic objective of
:meth:`resolve_input() <fiftyone.operators.operator.Operator.resolve_input>`
is to populate the `ctx.params` dict with user-provided parameter values, which
are retrieved from the various subproperties of the
:class:`Property <fiftyone.operators.types.Property>` returned by the method
(`inputs` in the examples below).

The :mod:`fiftyone.operators.types` module defines a rich builtin type system
that you can use to define the necessary input properties. These types handle
all aspects of input collection, validation, and component rendering for you!

For example, here's a simple example of collecting a single string input from
the user:

.. code-block:: python
    :linenos:

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str("message", label="Message", required=True)
        return types.Property(inputs, view=types.View(label="Static example"))

    def execute(self, ctx):
        the_message = ctx.params["message"]

If the :ref:`operator's config <operator-config>` declares `dynamic=True`, then
:meth:`resolve_input() <fiftyone.operators.operator.Operator.resolve_input>`
will be called after each user input, which allows you to construct dynamic
forms whose components may contextually change based on the already provided
values and any other aspects of the
:ref:`execution context <operator-execution-context>`:

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob

    def resolve_input(self, ctx):
        inputs = types.Object()
        brain_keys = ctx.dataset.list_brain_runs()

        if not brain_keys:
            warning = types.Warning(label="This dataset has no brain runs")
            prop = inputs.view("warning", warning)
            prop.invalid = True  # so form's `Execute` button is disabled
            return

        choices = types.DropdownView()
        for brain_key in brain_keys:
            choices.add_choice(brain_key, label=brain_key)

        inputs.str(
            "brain_key",
            required=True,
            label="Brain key",
            description="Choose a brain key to use",
            view=choices,
        )

        brain_key = ctx.params.get("brain_key", None)
        if brain_key is None:
            return  # single `brain_key`

        info = ctx.dataset.get_brain_info(brain_key)

        if isinstance(info.config, fob.SimilarityConfig):
            # We found a similarity config; render some inputs specific to that
            inputs.bool(
                "upgrade",
                label"Compute visualization",
                description="Generate an embeddings visualization for this index?",
                view=types.CheckboxView(),
            )

        return types.Property(inputs, view=types.View(label="Dynamic example"))

Remember that properties automatically handle validation for you. So if you
configure a property as `required=True` but the user has not provided a value,
the property will automatically be marked as `invalid=True`. The operator's
`Execute` button will be enabled if and only if all input properties are valid
(recurisvely searching nested objects).

.. note::

    As the example above shows, you can manually set a property to invalid by
    setting its `invalid` property.

.. note::

    Avoid expensive computations in
    :meth:`resolve_input() <fiftyone.operators.operator.Operator.resolve_input>`
    or else the form may take too long to render, especially for dynamic inputs
    where the method is called after every user input.

.. _operator-delegated-execution:

Delegated execution
-------------------

By default, operations are :ref:`executed <operator-execution>` immediately
after their inputs are provided in the App or they are triggered
programmatically.

However, many interesting operations like model inference, embeddings
computation, evaluation, and exports are computationally intensive and/or not
suitable for immediate exeuction.

In such cases, :ref:`delegated operations <delegated-operations>` come to the
rescue by allowing operators to schedule tasks that are executed on a connected
workflow orchestrator like :ref:`Apache Airflow <delegated-operations-airflow>`
or run just :ref:`run locally <delegated-operations-local>` in a separate
process.

Operators can delegate any or all of its operations by implementing
:meth:`resolve_delegation() <fiftyone.operators.operator.Operator.resolve_delegation>`
as shown below:

.. code-block:: python
    :linenos:

    def resolve_delegation(self, ctx):
        return len(ctx.view) > 1000  # delegate for larger views

As demonstrated above, you can use the
:ref:`execution context <operator-execution-context>` to conditionally decide
whether a given operation should be delegated. For example, you could simply
ask the user:

.. code-block:: python
    :linenos:

    def resolve_input(self, ctx):
        delegate = ctx.params.get("delegate", False)

        if delegate:
            description = "Uncheck this box to execute the operation immediately"
        else:
            description = "Check this box to delegate execution of this task"

        inputs.bool(
            "delegate",
            default=False,
            required=True,
            label="Delegate execution?",
            description=description,
            view=types.CheckboxView(),
        )

        if delegate:
            inputs.view(
                "notice",
                types.Notice(
                    label=(
                        "You've chosen delegated execution. Note that you must "
                        "have a delegated operation service running in order for "
                        "this task to be processed. See "
                        "https://docs.voxel51.com/plugins/index.html#operators "
                        "for more information"
                    )
                ),
            )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

.. note::

    Even though delegated operations are run in a separate process or physical
    location, they are provided with the same `ctx` that was hydrated by the
    operator's :ref:`input form <operator-inputs>`.

    Refer to :ref:`this section <delegated-operations>` for more information
    about how delegated operations are executed.

.. _operator-execution:

Operator execution
------------------

All operators must implement
:meth:`execute() <fiftyone.operators.operator.Operator.execute>`, which is
where their main actions are performed.

The :meth:`execute() <fiftyone.operators.operator.Operator.execute>` method
takes an :ref:`execution context <operator-execution-context>` as input whose
`ctx.params` dict has been hydrated with parameters provided either by the
user by filling out the operator's :ref:`input form <operator-inputs>` or
directly provided by the operation that triggered it. The method can optionally
return a dict of results values that will be made available via `ctx.results`
when the operator's :ref:`output form <operator-outputs>` is rendered.

Synchronous execution
~~~~~~~~~~~~~~~~~~~~~

Your execution method is free to make use of the full power of the FiftyOne SDK
and any external dependencies that it needs.

For example, you might perform inference on a model:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    def execute(self, ctx):
        name = ctx.params["name"]
        label_field = ctx.params["label_field"]
        confidence_thresh = ctx.params.get("confidence_thresh", None)

        model = foz.load_zoo_model(name)
        ctx.view.apply_model(
            model, label_field=label_field, confidence_thresh=confidence_thresh
        )

        num_predictions = ctx.view.count(f"{label_field}.detections")
        return {"num_predictions": num_predictions}

.. note::

    When an operator’s
    :meth:`execute() <fiftyone.operators.operator.Operator.execute>` method
    throws an error it will be displayed to the user in the browser.

Asynchronous execution
~~~~~~~~~~~~~~~~~~~~~~

The :meth:`execute() <fiftyone.operators.operator.Operator.execute>` method
can also be `async`:

.. code-block:: python
    :linenos:

    import aiohttp

    async def execute(self, ctx):
        # do something async
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                r = await resp.json()

Operator composition
~~~~~~~~~~~~~~~~~~~~

Many operators are designed to be composed with other operators to build up
more complex behaviors. This can be achieved by simply calling
:meth:`ctx.trigger() <fiftyone.operators.executor.ExecutionContext.trigger>`
from within the operator's
:meth:`execute() <fiftyone.operators.operator.Operator.execute>` method to
invoke another operator with the appropriate parameters, if any.

For example, many operations involve updating the current state of the App.
FiftyOne contains a number of
`builtin operators <https://github.com/voxel51/fiftyone/blob/develop/app/packages/operators/src/built-in-operators.ts>`_
that you can trigger from within
:meth:`execute() <fiftyone.operators.operator.Operator.execute>` to achieve
this with ease!

.. code-block:: python
    :linenos:

    def execute(self, ctx):
        # Dataset
        ctx.trigger("open_dataset", params=dict(name="..."))
        ctx.trigger("reload_dataset")  # refreshes the App

        # View/sidebar
        ctx.trigger("clear_view")
        ctx.trigger("clear_sidebar_filters")
        ctx.trigger("set_view", params=dict(view=view._serialize()))

        # Selected samples
        ctx.trigger("clear_selected_samples")
        ctx.trigger("set_selected_samples", params=dict(samples=[...]))

        # Selected labels
        ctx.trigger("clear_selected_labels")
        ctx.trigger("set_selected_labels", params=dict(labels=[...]))

        # Panels
        ctx.trigger("open_panel", params=dict(name="Embeddings"))
        ctx.trigger("close_panel", params=dict(name="Embeddings"))

Generator execution
~~~~~~~~~~~~~~~~~~~

If your :ref:`operator's config <operator-config>` declares that it is a
generator via `execute_as_generator=True`, then its
:meth:`execute() <fiftyone.operators.operator.Operator.execute>` method should
`yield` calls to
:meth:`ctx.trigger() <fiftyone.operators.executor.ExecutionContext.trigger>`,
which triggers another operator and returns a
:class:`GeneratedMessage <fiftyone.operators.message.GeneratedMessage>`
containing the result of the invocation.

For example, a common generator pattern is to use the
`builtin <https://github.com/voxel51/fiftyone/blob/develop/app/packages/operators/src/built-in-operators.ts>`_
`set_progress` operator to render a progress bar tracking the progress of an
operation:

.. code-block:: python
    :linenos:

    def execute(self, ctx):
        # render a progress bar tracking the execution
        for i in range(n):
            # [process a chunk here]
            yield ctx.trigger(
                "set_progress",
                dict(progress=i / n, label=f"Processed {i}/{n}"),
            )

.. note::

    Check out the
    `VoxelGPT plugin <https://github.com/voxel51/voxelgpt/blob/dfe23093485081fb889dbe18685587f4358a4438/__init__.py#L133>`_
    for a more sophisticated example of using generator execution to stream an
    LLM's response to a Panel.

.. _operator-secrets:

Accessing secrets
-----------------

Some plugins may require sensitive information such as API tokens and login
credentials in order to function. Any secrets that a plugin requires are
in its :ref:`fiftyone.yml <plugin-fiftyone-yml>`.

For example, the
`@voxel51/annotation <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/annotation/fiftyone.yml>`_
plugin declares the following secrets:

.. code-block:: yaml
   :linenos:

   secrets:
     - FIFTYONE_CVAT_URL
     - FIFTYONE_CVAT_USERNAME
     - FIFTYONE_CVAT_PASSWORD
     - FIFTYONE_LABELBOX_URL
     - FIFTYONE_LABELBOX_API_KEY
     - FIFTYONE_LABELSTUDIO_URL
     - FIFTYONE_LABELSTUDIO_API_KEY

As the naming convention implies, any necessary secrets are provided by users
by setting environment variables with the appropriate names. For example, if
you want to use the CVAT backend with the
`@voxel51/annotation <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/annotation/fiftyone.yml>`_
plugin, you would set:

.. code-block:: shell

    FIFTYONE_CVAT_URL=...
    FIFTYONE_CVAT_USERNAME=...
    FIFTYONE_CVAT_PASSWORD=...

At runtime, the plugin's :ref:`execution context <operator-execution-context>`
is automatically hydrated with any available secrets that are declared by the
plugin. Operators access these secrets via the `ctx.secrets` dict:

.. code-block:: python
   :linenos:

   def execute(self, ctx):
      url = ctx.secrets["FIFTYONE_CVAT_URL"]
      username = ctx.secrets["FIFTYONE_CVAT_USERNAME"]
      password = ctx.secrets["FIFTYONE_CVAT_PASSWORD"]

.. _operator-outputs:

Operator outputs
----------------

Operators can optionally implement
:meth:`resolve_output() <fiftyone.operators.operator.Operator.resolve_output>`
to define read-only output forms that are presented to the user as a modal in
the App after the operator's execution completes.

The basic objective of
:meth:`resolve_output() <fiftyone.operators.operator.Operator.resolve_output>`
is to define properties that describe how to render the values in `ctx.results`
for the user. As with input forms, you can use the
:mod:`fiftyone.operators.types` module to define the output properties.

For example, the output form below renders the number of samples (`count`)
computed during the operator's :ref:`execution <operator-execution>`:

.. code-block:: python
    :linenos:

    def execute(self, ctx):
        # computation here...

        return {"count": count}

    def resolve_output(self, ctx):
        outputs = types.Object()
        outputs.int(
            "count",
            label="Count",
            description=f"The number of samples in the current {target}",
        )
        return types.Property(outputs)

.. note::

    All properties in output forms are implicitly rendered as read-only.

.. _operator-placement:

Operator placement
------------------

By default, operators are only accessible from the
:ref:`operator browser <using-operators>`. However, you can optionally expose
the operation by placing a custom button, icon, menu item, etc. in various
places of the App:

-   `types.Places.SAMPLES_GRID_ACTIONS`

    .. image:: /images/plugins/operators/placements/samples_grid_actions.png

-   `types.Places.SAMPLES_GRID_SECONDARY_ACTIONS`

    .. image:: /images/plugins/operators/placements/samples_grid_secondary_actions.png

-   `types.Places.SAMPLES_VIEWER_ACTIONS`

    .. image:: /images/plugins/operators/placements/samples_viewer_actions.png

-   `types.Places.EMBEDDINGS_ACTIONS`

    .. image:: /images/plugins/operators/placements/embeddings_actions.png

-   `types.Places.HISTOGRAM_ACTIONS`

    .. image:: /images/plugins/operators/placements/histograms_actions.png

-   `types.Places.MAP_ACTIONS`

    .. image:: /images/plugins/operators/placements/map_actions.png

|br|
You can add a placement for an operator by implementing the
:meth:`resolve_placement() <fiftyone.operators.operator.Operator.resolve_placement>`
method as demonstrated below:

.. tabs::

    .. code-tab:: python
        :linenos:

        import fiftyone.operators as foo
        import fiftyone.operators.types as types

        class OpenHistogramsPanel(foo.Operator):
            @property
            def config(self):
                return foo.OperatorConfig(
                    name="open_histograms_panel",
                    label="Open histograms panel"
                )

            def resolve_placement(self, ctx):
                return types.Placement(
                    types.Places.SAMPLES_GRID_SECONDARY_ACTIONS,
                    types.Button(
                        label="Open Histograms Panel",
                        icon="/assets/histograms.svg",
                        prompt=False,
                    )
                )

            def execute(self, ctx):
                return ctx.trigger(
                    "open_panel",
                    params=dict(name="Histograms", isActive=True, layout="horizontal"),
                )

        def register(p):
            p.register(OpenHistogramsPanel)

    .. code-tab:: javascript
        :linenos:

        import {
            Operator,
            OperatorConfig,
            registerOperator,
            useOperatorExecutor,
            types,
        } from "@fiftyone/operators";

        const PLUGIN_NAME = "@my/plugin";

        class OpenEmbeddingsPanel extends Operator {
            get config() {
                return new OperatorConfig({
                    name: "open_embeddings_panel",
                    label: "Open embeddings panel",
                });
            }

            useHooks() {
                const openPanelOperator = useOperatorExecutor("open_panel");
                return { openPanelOperator };
            }

            async resolvePlacement() {
                return new types.Placement(
                    types.Places.SAMPLES_GRID_SECONDARY_ACTIONS,
                    new types.Button({
                        label: "Open embeddings panel",
                        icon: "/assets/embeddings.svg",
                    })
                );
            }

            async execute({ hooks }) {
                const { openPanelOperator } = hooks;
                openPanelOperator.execute({
                    name: "Embeddings",
                    isActive: true,
                    layout: "horizontal",
                });
            }
        }

        registerOperator(OpenEmbeddingsPanel, PLUGIN_NAME);

.. _developing-js-plugins:

Developing JS plugins
_____________________

This section describes how to develop JS-specific plugin components.

Component types
---------------

JS plugins may register components to add or customize functionality within the
FiftyOne App. Each component is registered with an activation function. The
component will only be considered for rendering when the activation function
returns `true`:

-   **Panel**: JS plugins can register panel components that can be opened by
    clicking the `+` next to any existing panel's tab
-   **Visualizer**: JS plugins can register a component that will override the
    builtin :ref:`Sample visualizer <app-sample-view>`
-   **Component**: JS plugins can register generic components that can be used
    to render operator input and output

Panels, Visualizers, and Components
-----------------------------------

Here's some examples of using panels, visualizers, and components to add your
own custom user interface and components to the FiftyOne App.

Hello world Panel
~~~~~~~~~~~~~~~~~

A simple plugin that renders "Hello world" in a panel would look like this:

.. code-block:: jsx
    :linenos:

    import { registerComponent, PluginComponentTypes } from "@fiftyone/plugins";

    function HelloWorld() {
        return <h1>Hello world</h1>;
    }

    registerComponent({
        name: "HelloWorld",
        label: "Hello world",
        component: HelloWorld,
        type: PluginComponentTypes.Panel,
        activator: () => true
    });

Adding a custom FiftyOne Visualizer
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: jsx
    :linenos:

    import * as fop from "@fiftyone/plugins";
    import * as fos from "@fiftyone/state";

    function PointCloud({ src }) {
        // TODO: implement your visualizer using React
    }

    // this separate components shows where the FiftyOne plugin
    // dependent code ends and the pure react code begins
    function CustomVisualizer({ sample }) {
        const src = fos.getSampleSrc(sample.filepath);

        // now that we have all the data we need
        // we can delegate to code that doesn't depend
        // on the FiftyOne plugin API
        return <PointCloud src={src} />;
    }

    function myActivator({ dataset }) {
        return dataset.mediaType ??
            dataset.groupMediaTypes.find((g) => g.mediaType === "point_cloud") !==
            undefined
    }

    fop.registerComponent({
        // component to delegate to
        component: CustomVisualizer,

        // tell FiftyOne you want to provide a Visualizer
        type: PluginComponentType.Visualizer,

        // activate this plugin when the mediaType is PointCloud
        activator: myActivator,
    });

Adding a custom Panel
~~~~~~~~~~~~~~~~~~~~~

.. code-block:: jsx
    :linenos:

    import * as fop from "@fiftyone/plugins";
    import * as fos from "@fiftyone/state";
    import * as foa from "@fiftyone/aggregations";
    import AwesomeMap from "react-mapping-library";

    function CustomPanel() {
        const dataset = useRecoilValue(fos.dataset);
        const view = useRecoilValue(fos.view);
        const filters = useRecoilValue(fos.filters);
        const [aggregate, points, loading] = foa.useAggregation({
            dataset,
            filters,
            view,
        });

        React.useEffect(() => {
            aggregate(
                [
                    new foa.aggregations.Values({
                        fieldOrExpr: "id",
                    }),
                    new foa.aggregations.Values({
                        fieldOrExpr: "location.point.coordinates",
                    }),
                ],
                dataset.name
            );
        }, [dataset, filters, view]);

        if (loading) return <h1>Loading</h1>;

        return <MyMap geoPoints={points} />;
    }

    fop.registerComponent({
        // component to delegate to
        component: CustomPanel,

        // tell FiftyOne you want to provide a custom Panel
        type: PluginComponentTypes.Panel,

        // used for the panel selector button
        label: "Map",

        // only show the Map panel when the dataset has Geo data
        activator: ({ dataset }) => dataset.sampleFields.location,
    });

Custom operator view using Component plugin
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Creating and registering a custom view type:

.. code-block:: jsx
    :linenos:

    import * as fop from "@fiftyone/plugins";
    import { useState } from "react"

    function CustomOperatorView(props) {
        // these props are provided to the component used as the view for an
        // operator input/output field
        const { errors, data, id, onChange, path, schema } = props

        // schema may optionally include a view property which contains
        // attributes such label, description, caption for
        // the field. Schema will also provide a type property to indicate the type
        // of value expected for the field (i.e. string, number, object, array, etc.)
        const { default: defaultValue, view, type } = schema

        // Schema may also provide a default value for the field
        const [value, setValue] = useState(defaultValue)

        return (
            <div>
                <label htmlFor={id}>{view.label}</label>
                <input
                    value={value}
                    id={id}
                    type={type}
                    onChange={(e) => {
                        // onChange function passed as a prop can be called with
                        // path and value to set the current value for a field
                        onChange(path, e.target.value)
                    }}
                />
            </div>
        )
    }

    fop.registerComponent({
        // unique name you can use later to refer to the component plugin
        name: "CustomOperatorView",

        // component to delegate to
        component: CustomOperatorView,

        // tell FiftyOne you want to provide a custom component
        type: PluginComponentTypes.Component,

        // activate this plugin unconditionally
        activator: () => true,
    });

Using the custom component as the view for a Python operator field:

.. code-block:: python
    :linenos:

    import fiftyone.operators as foo
    import fiftyone.operators.types as types

    class CustomViewOperator(foo.Operator):
        @property
        def config(self):
            return foo.OperatorConfig(
                name="custom_view_operator",
                label="Custom View Operator",
            )

        def resolve_input(self, ctx):
            inputs = types.Object()
            inputs.str(
                "name",
                label="Name",
                default="FiftyOne",
                # provide the name of a registered component plugin
                view=types.View(component="CustomOperatorView")
            )
            return types.Property(inputs)

        def execute(self, ctx):
            return {}

FiftyOne App state
------------------

There are a few ways to manage the state of your plugin. By default you should
defer to existing state management in the FiftyOne App.

For example, if you want to allow users to select samples, you can use the
`@fiftyone/state` package.

.. Reacting to state changes
.. ~~~~~~~~~~~~~~~~~~~~~~~~~

.. .. code-block:: jsx
..    :linenos:

..     import * as fos from '@fiftyone/state'
..     import * as recoil from 'recoil'

..     // this example demonstrates handling updates to
..     // filters/sidebar, but applies to everything
..     // listed under "state" below
..     function MyPlugin() {
..       const activeFields = recoil.useRecoilValue(fos.activeFields)

..       return <ul>{activeFields.map(f => <li>{f.name}</li>)}
..     }

Interactivity and state
~~~~~~~~~~~~~~~~~~~~~~~

If your plugin only has internal state, you can use existing state management
to achieve your desired UX. For example, in a 3D visualizer, you might want to
use `Three.js <https://threejs.org>`_ and its object model, events, and state
management. Or just use your own React hooks to maintain your plugin components
internal state.

If you want to allow users to interact with other aspects of FiftyOne through
your plugin, you can use the `@fiftyone/state` package:

.. code-block:: jsx
    :linenos:

    // note: similar to react hooks, these must be used in the context
    // of a React component

    // select a dataset
    const selectLabel = fos.useOnSelectLabel();

    // in a callback
    selectLabel({ id: "labelId", field: "fieldName" });

The example above shows how you can coordinate or surface existing features of
FiftyOne through your plugin via the `@fiftyone/state` package. This package
provides hooks to access and modify the state of the FiftyOne App.

Recoil, atoms, and selectors
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can also use a combination of your own and fiftyone's recoil `atoms` and
`selectors`.

Here's an example the combines both approaches in a hook that you could call
from anywhere where hooks are supported (almost all plugin component types).

.. code-block:: jsx
    :linenos:

    import {atom, useRecoilValue, useRecoilState} from 'recoil';

    const myPluginmyPluginFieldsState = atom({
        key: 'myPluginFields',
        default: []
    })

    function useMyHook() {
        const dataset = useRecoilValue(fos.dataset);
        const [fields, setFields] = useRecoilState(myPluginFieldsState);

        return {
            dataset,
            fields,
            addField: (field) => setFields([...fields, field])
        }
    }

Panel state
-----------

Plugins that provide `PluginComponentTypes.Panel` components should use the
`@fiftyone/spaces` package to manage their state. This package provides hooks
to allow plugins to manage the state of individual panel instances.

.. code-block:: jsx
    :linenos:

    import { usePanelStatePartial, usePanelTitle } from "@fiftyone/spaces";
    import { Button } from '@fiftyone/components';

    // in your panel component, you can use the usePanelStatePartial hook
    // to read and write to the panel state
    function MyPanel() {
        const [state, setState] = usePanelStatePartial('choice');
        const setTitle = usePanelTitle();

        React.useEffect(() => {
          setTitle(`My Panel: ${state}`);
        }, [state]);

        return (
          <div>
            <h1>Choice: {state}</h1>
            <Button onClick={() => setState('A')}>A</Button>
            <Button onClick={() => setState('B')}>B</Button>
          </div>
        );
    }

Reading settings in your plugin
-------------------------------

Plugins may support two styles of configuration settings:

-   System-wide plugin settings under the ``plugins`` key of your
    :ref:`App config <configuring-fiftyone-app>`
-   Dataset-specific plugin settings for any subset of the above values on a
    :ref:`dataset's App config <dataset-app-config>`.

Plugin settings are used, for example, to allow the user to configure the
default camera position of FiftyOne's builtin
:ref:`3D visualizer <app-3d-visualizer-config>`.

Here's an example of a system-wide plugin setting:

.. code-block:: js
    :linenos:

    // app_config.json
    {
      "plugins": {
        "my-plugin": {
          "mysetting": "foo"
        }
      }
    }

And here's how to customize that setting for a particular dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.load_dataset("quickstart")
    dataset.app_config.plugins["my-plugin"] = {"mysetting": "bar"}
    dataset.save()

In your plugin implementation, you can read settings with the `useSettings`
hook:

.. code-block:: js
    :linenos:

    const { mysetting } = fop.useSettings("my-plugin");

.. note::

    See the :ref:`this page <configuring-plugins>` page for more information
    about configuring plugins.

Querying FiftyOne
-----------------

A typical use case for a JS plugin is to provide a unique way of visualizing
FiftyOne data. However some plugins may need to also fetch data in a unique way
to efficiently visualize it.

For example, a `PluginComponentType.Panel` plugin rendering a map of geo points
may need to fetch data relative to where the user is currently viewing. In
MongoDB, such a query would look like this:

.. code-block:: js
    :linenos:

    {
      $geoNear: {
        near: { type: "Point", coordinates: [ -73.99279 , 40.719296 ] },
        maxDistance: 2,
        query: { category: "Parks" },
      }
    }

In a FiftyOne plugin this same query can be performed using the
`useAggregation()` method of the plugin SDK:

.. code-block:: jsx
    :linenos:

    import * as fop from "@fiftyone/plugins";
    import * as fos from "@fiftyone/state";
    import * as foa from "@fiftyone/aggregations";
    import * as recoil from "recoil";

    function useGeoDataNear() {
        const dataset = useRecoilValue(fos.dataset);
        const view = useRecoilValue(fos.view);
        const filters = useRecoilValue(fos.filters);
        const [aggregate, points, isLoading] = foa.useAggregation({
            dataset,
            filters,
            view,
        });
        const availableFields = findAvailableFields(dataset.sampleFields);
        const [selectedField, setField] = React.useState(availableFields[0]);

        React.useEffect(() => {
            aggregate([
                new foa.aggregations.Values({
                    fieldOrExpr: "location.point.coordinates",
                }),
            ]);
        }, []);

        return {
            points,
            isLoading,
            setField,
            availableFields,
            selectedField,
        };
    }

    function MapPlugin() {
        const { points, isLoading, setField, availableFields, selectedField } =
            useGeoDataNear();

        return (
            <Map
                points={points}
                onSelectField={(f) => setField(f)}
                selectedField={selectedField}
                locationFields={availableFields}
            />
        );
    }

    fop.registerComponent({
        name: "MapPlugin",
        label: "Map",
        activator: ({ dataset }) => findAvailableFields(dataset.fields).length > 0,
    });

.. _plugin-runtime:

Plugin runtime
______________

JS runtime
----------

In JS, plugins are loaded from your
:ref:`plugins directory <plugins-directory>` into the browser. The FiftyOne App
server finds these plugins by looking for `package.json` files that include
`fiftyone` as a property. This `fiftyone` property describes where the plugin
executable (dist) is.

Python runtime
--------------

Python operators are executed in two ways:

Immediate execution
~~~~~~~~~~~~~~~~~~~

By default, all operations are executed by the plugin server immediately after
they are triggered, either programmatically or by the user in the App.

The plugin server is launched by the FiftyOne App as a subprocess that is
responsible for loading plugins and executing them. The plugin server is only
accessible via ipc. Its interface (similar to JSON rpc) allows for functions to
be called over interprocess communication. This allows for user python code to
be isolated from core code. It also allows for the operating system to manage
the separate process as it exists in the same process tree as the root process
(ipython, Jupyter, etc).

Delegated execution
~~~~~~~~~~~~~~~~~~~

Python operations may also be :ref:`delegated <operator-delegated-execution>`
to an external orchestrator like Apache Airflow or a local process.

When an operation is delegated, the following happens:

1.  The operation's :ref:`execution context <operator-execution-context>` is
    serialized and stored in the database

2.  The :ref:`connected orchestrator <delegated-orchestrator>` picks up the
    task and executes it when resources are available

.. _plugin-advanced-usage:

Advanced usage
______________

Storing custom runs
-------------------

When users execute builtin methods like
:ref:`annotation <fiftyone-annotation>`,
:ref:`evaluation <evaluating-models>`, and
:ref:`brain methods <fiftyone-brain>` on their datasets, certain configuration
and results information is stored on the dataset that can be accessed later;
for example, see :ref:`managing brain runs <brain-managing-runs>`.

FiftyOne also provides the ability to store *custom runs* on datasets, which
can be used by plugin developers to persist arbitrary application-specific
information that can be accessed later by users and/or plugins.

The interface for creating custom runs is simple:

.. code-block:: py
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset("custom-runs-example")
    dataset.persistent = True

    config = dataset.init_run()
    config.foo = "bar"  # add as many key-value pairs as you need

    # Also possible
    # config = fo.RunConfig(foo="bar")

    dataset.register_run("custom", config)

    results = dataset.init_run_results("custom")
    results.spam = "eggs"  # add as many key-value pairs as you need

    # Also possible
    # results = fo.RunResults(dataset, config, "custom", spam="eggs")

    dataset.save_run_results("custom", results)

.. note::

    :class:`RunConfig <fiftyone.core.runs.RunConfig>` and
    :class:`RunResults <fiftyone.core.runs.RunResults>` can store any JSON
    serializable values.

    :class:`RunConfig <fiftyone.core.runs.RunConfig>` documents must be less
    than 16MB, although they are generally far smaller as they are intended to
    store only a handful of simple parameters.

    :class:`RunResults <fiftyone.core.runs.RunResults>` instances are stored in
    `GridFS <https://www.mongodb.com/docs/manual/core/gridfs>`_ and may exceed
    16MB. They are only loaded when specifically accessed by a user.

You can access custom runs at any time as follows:

.. code-block:: py
    :linenos:

    import fiftyone as fo

    dataset = fo.load_dataset("custom-runs-example")

    info = dataset.get_run_info("custom")
    print(info)

    results = dataset.load_run_results("custom")
    print(results)

.. code-block:: text

    {
        "key": "custom",
        "version": "0.22.3",
        "timestamp": "2023-10-26T13:29:20.837595",
        "config": {
            "type": "run",
            "method": null,
            "cls": "fiftyone.core.runs.RunConfig",
            "foo": "bar"
        }
    }

.. code-block:: text

    {
        "cls": "fiftyone.core.runs.RunResults",
        "spam": "eggs"
    }

.. _managing-custom-runs:

Managing custom runs
--------------------

FiftyOne provides a variety of methods that you can use to manage custom runs
stored on datasets.

Call
:meth:`list_runs() <fiftyone.core.collections.SampleCollection.list_runs>`
to see the available custom run keys on a dataset:

.. code:: python
    :linenos:

    dataset.list_runs()

Use
:meth:`get_run_info() <fiftyone.core.collections.SampleCollection.get_run_info>`
to retrieve information about the configuration of a custom run:

.. code:: python
    :linenos:

    info = dataset.get_run_info(run_key)
    print(info)

Use :meth:`init_run() <fiftyone.core.collections.SampleCollection.init_run>`
and
:meth:`register_run() <fiftyone.core.collections.SampleCollection.register_run>`
to create a new custom run on a dataset:

.. code:: python
    :linenos:

    config = dataset.init_run(run_key)
    config.foo = "bar"  # add as many key-value pairs as you need

    dataset.register_run(run_key, config)

Use
:meth:`update_run_config() <fiftyone.core.collections.SampleCollection.update_run_config>`
to update the run config associated with an existing custom run:

.. code:: python
    :linenos:

    dataset.update_run_config(run_key, config)

Use
:meth:`init_run_results() <fiftyone.core.collections.SampleCollection.init_run_results>`
and
:meth:`save_run_results() <fiftyone.core.collections.SampleCollection.save_run_results>`
to store run results for a custom run:

.. code:: python
    :linenos:

    results = dataset.init_run_results(run_key)
    results.spam = "eggs"  # add as many key-value pairs as you need

    dataset.save_run_results(run_key, results)

    # update existing results
    dataset.save_run_results(run_key, results, overwrite=True)

Use
:meth:`load_run_results() <fiftyone.core.collections.SampleCollection.load_run_results>`
to load the results for a custom run:

.. code:: python
    :linenos:

    results = dataset.load_run_results(run_key)

Use
:meth:`rename_run() <fiftyone.core.collections.SampleCollection.rename_run>`
to rename the run key associated with an existing custom run:

.. code:: python
    :linenos:

    dataset.rename_run(run_key, new_run_key)

Use
:meth:`delete_run() <fiftyone.core.collections.SampleCollection.delete_run>`
to delete the record of a custom run from a dataset:

.. code:: python
    :linenos:

    dataset.delete_run(run_key)
