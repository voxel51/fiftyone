.. _fiftyone-plugins:

FiftyOne Plugins
================

.. default-role:: code

FiftyOne provides a powerful plugin framework that allows for extending and customizing the functionality of the tool to suit your specific needs.

.. note::

    Check out the
    `fiftyone-plugins <https://github.com/voxel51/fiftyone-plugins>`_
    repository for a growing collection of prebuilt plugins that you can easily
    :ref:`download <plugins-download>` and use locally!

At its core, a plugin consists of Operators and Components.

Operators are user-facing operations that allow you to interact with the data in your dataset. They can range from simple actions like checking a checkbox to more complex workflows such as requesting annotation of samples from a configurable backend. Operators can even be composed of other operators or be used to add functionality to custom Panels and Visualizers.

Components, on the other hand, are responsible for rendering and event handling. They provide the necessary functionality to display and interact with your plugin in the FiftyOne App. Components also implement form inputs and output rendering for Operators, making it possible to customize the way an operator is rendered in the FiftyOne App.

Together, Operators and Components form the building blocks of a plugin, enabling you to tailor FiftyOne to your specific use case and workflow. Whether you're working with images, videos, or other data types, a plugin can help you streamline your machine learning workflows and achieve better results.

What you can and cannot do with plugins?
----------------------------------------

Plugins in FiftyOne are a powerful way to extend and customize the functionality of the tool to suit your specific needs. With plugins, you can add new functionality to the FiftyOne App, render custom panels, and add custom buttons to menus. You can even add custom options to built-in options with Operators and execute custom Python code.

However, there are also certain limitations to keep in mind when working with plugins. For example, plugins cannot add functionality to the SDK or trigger app functionality directly from a Python session or notebook. You also cannot customize built-in menus or options, or override the sidebar, viewbar, or samples grid.

Despite these limitations, plugins still offer a wide range of possibilities for customizing your FiftyOne experience. Whether you're looking to add your own panel, customize how samples are visualized or streamline your workflows.

Plugin types
------------

FiftyOne supports two types of plugins: JS Plugins and Python Plugins.

JS Plugins are built using the @fiftyone TypeScript packages, npm packages, and your own TypeScript. They consist of Operators, Panels, Visualizers, and Components. Panels are a blank canvas that JS Plugins can use to render content, while Visualizers allow JS Plugins to override the built-in sample visualizer.

On the other hand, Python Plugins are built using the FiftyOne Python SDK, pip packages, and your own Python. Python plugins can only define Operators.

Component types
---------------

Plugins may register components to add or customize functionality within the FiftyOne App. Each component is registered with an activation function. The component will only be considered for rendering when the activation function returns true.

 - :class:`Panel` - JS plugins can register a panel component, that is available from the “new panel” action menu
 - :class:`Visualizer` - JS plugins can register a component that will override the built in visualizer (when active)
 - :class:`Component` - JS plugins can register generic components that can be used to render operator input and output

Plugin settings
---------------

Python and JS plugins can read their settings at the dataset scope or app scope, allowing users to configure plugins in ways that match their workflows. This allows for settings that may correspond to data such as the default camera position in the Looker3D plugin.

.. note::

    Settings are readable by users in the browser. Use environment variables and Python Operators for sensitive/secret values.

.. _fiftyone-operators:

Operators
---------

Operators are a powerful feature in FiftyOne that allow plugin developers to define custom operations that can be executed by users of the FiftyOne App. They can be defined in either Python or JS, and are typically triggered by the user clicking a button or using the Operator Browser. Operators can execute other operators and custom code with custom dependencies.

The Operator Browser allows users to search through all available operations without having to find them in a menu or remember the corresponding keyboard shortcuts. You can open the Operator Browser using the backtick key (`````) or by clicking on the Operator Browser icon in the Samples Grid.

Instead of building a user interface from scratch, Operators are built using Operator Types, which define the input and output properties of the operator. At runtime, these types are used to facilitate the execution of the operation by collecting information from the user, validating the user input, and executing the operation. The execution step is the only required step; all other steps are optional and can be customized as needed.

Operators can be composed for coordination between Python and the FiftyOne App, such as triggering a reload of samples/view to update the app with the changes made by the operator. Operators can also be executed from code and triggered by other operators.

Operator inputs and outputs
~~~~~~~~~~~~~~~~~~~~~~~~~~~

An operator consists of a Definition and a method that executes the operation. The Definition object defines the input and output properties of the operator using Operator Types. At runtime the Definition object is used to facilitate the execution of the operation by a user in the following basic steps:

1. Render a prompt to collect information from the user needed to execute the operation
2. As the user inputs information, and based on the user input aka “params”

   a. Resolve the definition of the input, allowing the form to change based on the user input
   b. Validate the user input
3. Execute the operation

   a. Return a “result”
4. Resolve the output definition based on the params and result of the operation
5. Render the output

Besides step 3, the execution step, all of the above steps will depend on the details of the operator implementation and are optional.

Operator types
~~~~~~~~~~~~~~

:mod:`Python API Reference <fiftyone.operators.types>`

:js:mod:`Typescript API Reference <fiftyone.operators>`

The operator definition is constructed using the types defined below. A typical example would be as follows, which defines the input for an operator that accepts a choice rendered as a radio button group:

.. code-block:: python

    inputs = types.Object()
    choices = types.RadioGroup(label="Choose a Color")
    choices.add("red", label="Red")
    choices.add("blue", label="Blue")
    inputs.enum("color", choices.values(), view=choices)

Operator composition
~~~~~~~~~~~~~~~~~~~~

Operators in FiftyOne are used to execute operations on datasets and samples, and can return meaningful results. Operators can be used for a variety of use cases, including querying datasets, mutating samples, and triggering external orchestrations.

In some cases, coordination between operators is necessary. For example, when a Python operator requires some code to be executed in the app after its own execution. In such cases, an operator can trigger another operator to be executed using the ctx.trigger() method of the ExecutionContext. This is commonly used to reload samples/views and update the app with the changes made by the operator.

Operator exceptions
~~~~~~~~~~~~~~~~~~~

When an operator’s execute() method throws an error it will be returned to the browser and displayed as a result.

This behavior should only be used for uncaught errors.

Operator input validation
~~~~~~~~~~~~~~~~~~~~~~~~~

In order to ensure proper values are provided to an operator, the operator definition will be used to validate the input.

This validation is performed in the browser and can be used to ensure that the user has provided valid input before executing the operator.

Operators that set `config.dynamic` to `True` can also use the `resolve_input()` method to determine whehter any given property is `invlaid`.

Here is an example of how to use the `resolve_input()` method to validate input:

.. code-block:: python

    def resolve_input(self, ctx):
        cur_message = ctx.params.get("message", None)
        inputs = types.Object()
        message_property = inputs.str("message", label="Message", required=True)
        if cur_message == "bad":
            message_property.invalid = True
            message_property.error_message = "custom error message!"
        return types.Property(inputs)

Executing operators from code
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Regardless of operator type, all operators can be executed from code. For example, a python operator can be executed from JS. To execute an operator you must provide an object that matches the properties the operator defines. When an operator is executed via UI, that object and the execution of that operator is handled by the plugin system.

 - JS to JS
 - JS to Py
 - JS to Py to JS
 - NOT JS to Py to Py
 - NOT Py to Py
 - NOT Py to JS

Placements
~~~~~~~~~~

Operator placement lets you add a button in various places of the FiftyOne app
to invoke your operator from outside of Operator Browser. Below is a list of
places you can add your operator placement to in the FiftyOne app:

   - SAMPLES_GRID_ACTIONS
  
     .. image:: /images/plugins/operators/placements/samples_grid_actions.png
        :alt: SAMPLES_GRID_ACTIONS placement preview
        :align: center

   - SAMPLES_GRID_SECONDARY_ACTIONS
  
     .. image:: /images/plugins/operators/placements/samples_grid_secondary_actions.png
        :alt: SAMPLES_GRID_SECONDARY_ACTIONS placement preview
        :align: center

   - SAMPLES_VIEWER_ACTIONS
  
     .. image:: /images/plugins/operators/placements/samples_viewer_actions.png
        :alt: SAMPLES_VIEWER_ACTIONS placement preview
        :align: center

   - EMBEDDINGS_ACTIONS
  
     .. image:: /images/plugins/operators/placements/embeddings_actions.png
        :alt: EMBEDDINGS_ACTIONS placement preview
        :align: center

   - HISTOGRAM_ACTIONS
  
     .. image:: /images/plugins/operators/placements/histograms_actions.png
        :alt: HISTOGRAM_ACTIONS placement preview
        :align: center

   - MAP_ACTIONS
  
     .. image:: /images/plugins/operators/placements/map_actions.png
        :alt: MAP_ACTIONS placement preview
        :align: center

To add a placement for an operator to one of these places in the app, your
operator class should implement `resolve_placement` method as shown in example
below:

.. tabs::
    .. code-tab:: python

        import fiftyone.operators as foo
        import fiftyone.operators.types as types

        class OpenHistogramsPanel(foo.Operator):
            @property
            def config(self):
                return foo.OperatorConfig(
                    name="example_open_histograms_panel",
                    label="Examples: open Histograms panel"
                )

            def resolve_placement(self, ctx):
                return types.Placement(
                    # Display placement in the actions row of samples grid
                    types.Places.SAMPLES_GRID_SECONDARY_ACTIONS,
                    # Display a button as the placement
                    types.Button(
                        # label for placement button visible on hover
                        label="Open Histograms Panel",
                        # icon for placement button. If not provided, button with label
                        # will be displayed
                        icon="/assets/histograms.svg",
                        # skip operator prompt when we do not require an input from the user
                        prompt=False
                    )
                )

            def execute(self, ctx):
                # Use the built-in operator "open_panel" to launch Histograms
                #  panel in horizontally split mode
                return ctx.trigger(
                    "open_panel",
                    params=dict(name="Histograms", isActive=True, layout="horizontal"),
                )
                
        def register(p):
            p.register(OpenHistogramsPanel)

    .. code-tab:: javascript

        import {
            Operator,
            OperatorConfig,
            registerOperator,
            useOperatorExecutor,
            types,
        } from "@fiftyone/operators";

        const PLUGIN_NAME = "@my-org/my-plugin";

        class OpenEmbeddingsPanel extends Operator {
            get config() {
                return new OperatorConfig({
                    name: "example_open_embeddings_panel",
                    label: "Example: open Embeddings panel",
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
                        label: "Open Embeddings Panel",
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

Plugin runtime
--------------

How are plugins executed?
~~~~~~~~~~~~~~~~~~~~~~~~~

In JS, plugins are loaded from the FIFTYONE_PLUGINS_DIR into the browser. The fiftyone app server finds these plugins by looking for package.json files that include fiftyone as a property. This fiftyone property describes where the plugin executable (dist) is.

For Python plugins there are two ways to execute a plugin.

Python local execution
~~~~~~~~~~~~~~~~~~~~~~

When running the fiftyone app server locally, the plugin server is executed as a subprocess. This subprocess is a python process that runs the plugin server. The plugin server is responsible for loading plugins and executing them. The plugin server is only accessible via ipc. Its interface (similar to JSON rpc) allows for functions to be called over inter process communication. This allows for user python code to be isolated from core code. It also allows for the operating system to manage the separate process as it exists in the same process tree as the root fiftyone, ipython, or even Jupyter process.

As part of running the fiftyone app server (either locally or in the teams environment) a sub process is executed called the plugin server. This server is only accessible via ipc. Its interface (similar to JSON rpc) allows for functions to be called over inter process communication. This allows for user python code to be isolated from core code. It also allows for the operating system to manage the separate process as it exists in the same process tree as the root fiftyone, ipython, or even Jupyter process.

Executing Brain methods and other long running functions
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Python operators typically use local execution for simple operations such as queries, tagging, mutating samples, annotation runs, short imports or exports. However for most interesting operations (computing similarity or mistakenness, computing visualizations), long running task orchestration is required. For this we recommend Apache Airflow, although similar tools can be used instead.

A typical long running operation would look like this:

1. Operators are registered in the local execution environment
2. Browser fetches description of all registered operators
3. Browser requests execution of a long running operator
4. Local execution environment executes the operator
5. Operator makes API request to airflow or another data orchestration platform to schedule a long running task
   a. Operator returns a unique identifier, that is used to reference this long running task
6. Browser requests updates on status via an operator that in turn calls the airflow status API
    a. Browser correlates the previous execution using unique identifier it stored earlier
    b. Browser displays status of all relevant tasks

.. _plugins-directory:

Your plugins directory
----------------------

All plugins must be stored in your FiftyOne plugins directory in order for
FiftyOne to find them.

By default, plugins are downloaded to `~/fiftyone/__plugins__`, but you can
customize this directory by setting the `FIFTYONE_PLUGINS_DIR` environment
variable:

.. code-block:: shell

    export FIFTYONE_PLUGINS_DIR=/path/to/your/plugins

You can also permanently configure this directory by adding it to your
:ref:`FiftyOne config <configuring-fiftyone>`.

.. code-block:: json

    {
        "plugins_dir": "/path/to/your/plugins"
    }

You can locate your current plugins directory by running the following command:

.. code-block:: shell

    fiftyone config plugins_dir
    # ~/fiftyone/__plugins__

.. note::

    Your plugins directory must be readable by the FiftyOne server.

.. _plugins-download:

Downloading plugins
-------------------

To download and use an existing plugin, all you need is a URL to
the plugin packaged as a ZIP archive or a link to a GitHub repository
containing the source code.

You can then download plugins using any of the methods described below:

.. tabs::

  .. group-tab:: CLI

    .. code-block:: shell

        # Download plugin(s) from a GitHub repository
        fiftyone plugins download https://github.com/<user>/<repo>[/tree/branch]

        # Download plugin(s) by specifying the GitHub repository details
        fiftyone plugins download <user>/<repo>[/<ref>]

        # Download specific plugins from a GitHub repository
        fiftyone plugins download \\
            https://github.com/<user>/<repo>[/tree/branch] \\
            --plugin-names <name1> <name2> <name3>

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone.plugins as fop

        # Download plugin(s) from a GitHub repository
        fop.download_plugin("https://github.com/<user>/<repo>[/tree/branch]")

        # Download plugin(b) by specifying the GitHub repository details
        fop.download_plugin("<user>/<repo>[/<ref>]")

        # Download specific plugins from a GitHub repository
        fop.download_plugin(url_or_gh_repo, plugin_names=["<name1>", "<name2>"])

.. note::

    A GitHub repository may contain multiple plugins. By default, all plugins
    are installed, but you can select specific ones if desired as shown above.

.. note::

    You can download plugins from private GitHub repositories that you have
    access to by providing your GitHub personal access token via the
    ``GITHUB_TOKEN`` environment variable.

.. _plugins-managing:

Managing plugins
----------------

You can use the :ref:`fiftyone plugins <cli-fiftyone-plugins>` and
:ref:`fiftyone operators <cli-fiftyone-operators>` CLI methods to perform a
variety of plugin-related actions, including:

-   Listing the plugins and operators that you've downloaded
-   Printing information about plugins and operators that you've downloaded
-   Downloading plugins
-   Initializing new plugins for local development
-   Installing or ensuring plugin requirements
-   Enabling and disabling plugins
-   Deleting plugins

Configuring plugins
-------------------

You can store system-wide plugin configurations under the plugins key of your
App config or dataset. This allows for configuring plugins at the application
wide level or per dataset.

See the :ref:`configuring plugins <configuring-plugins>` page for more
information on changing a plugin's configuration.

.. note::

    You can see an example of dataset level plugin configuration on the
    :ref:`Map Panel docs <app-map-panel>`.

Developing plugins
------------------

In order to develop and test your plugin you will need the following:

- a dev install of FiftyOne Python Package
- a dev install of FiftyOne App
- For JS Plugins: a vite config that links modules to your ``fiftyone/app`` directory.

.. note::

   For JS plugin vite configs we recommend forking the `voxel51/fiftyone-plugins <https://github.com/voxel51/fiftyone-plugins>`_ 
   repository and following the conventions there to build your plugin.

Anatomy of a plugin
-------------------

FiftyOne recognizes plugins by searching for `fiftyone.yaml` files within your
`FIFTYONE_PLUGINS_DIR`. Below is an example of a typical plugin directory:

.. code-block:: text

    /path/to/your/plugins/dir/
        my-js-plugin/
            fiftyone.yaml
            package.json
            dist/
                index.umd.js
        my-py-plugin/
            fiftyone.yaml
            __init__.py
            requirements.txt

.. note::

    If the source code for a plugin already exists on the local filesystem, you
    can make it into a plugin using
    :func:`create_plugin() <fiftyone.plugins.core.create_plugin>` or the
    `fiftyone plugins create` CLI command. This will copy the source
    code to the plugins directory and create a `fiftyone.yaml` file for you if
    one does not already exist.

    Alternatively, you can manually copy the plugin
    directory into your plugins directory so that it matches the structure
    above.

    If your FiftyOne App server is already running, you should restart the
    server and refresh any connected browser clients to see new plugins.

fiftyone.yaml
~~~~~~~~~~~~~

The `fiftyone.yaml` file is used to define the plugin's metadata and operators
and is required in order for FiftyOne to load your plugin. The following fields
are available for defining the plugin:

- `name` (required): The name of the plugin. Usually in the form of `@org/plugin-name`.
- `author`: The author or organization responsible for the plugin.
- `version`: The version of the plugin. It should be a valid semantic version.
- `license`: The license under which the plugin is distributed.
- `description`: A brief description of the plugin.
- `fiftyone`: A dictionary containing information about the compatibility of the plugin with FiftyOne.
- `fiftyone.version`: A semver version range specifying the required FiftyOne version for the plugin to work properly.
- `operators`: A list of operator names provided by the plugin.

Optional files
~~~~~~~~~~~~~~

The plugin directory may contain the following optional files:

- `package.json`: A JSON file containing additional information about the plugin, including the JS bundle file path.
- `__init__.py`: A Python entry file for the plugin.
- `dist/index.umd.js`: A JS bundle file for the plugin.
- `requirements.txt`: A list of Python package requirements to run the plugin

Publishing plugins
------------------

Publishing a plugin in FiftyOne allows you to share your custom functionality and operators with the community. This document outlines the steps required to publish a plugin by either committing the plugin files to a GitHub repository or uploading a zip file.

Committing plugins to GitHub
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

To publish a plugin by committing the plugin files to a GitHub repository, follow these steps:

1. Create a GitHub repository: Create a new repository on GitHub to host your plugin. Make sure to choose an appropriate name and provide a brief description of your plugin.

2. Clone the repository: Clone the GitHub repository to your local machine using Git.

3. Organize the plugin files: Ensure that all the necessary files for your plugin, including the plugin definition YAML file and any optional files like `package.json` or `__init__.py`, are present in the appropriate directory structure.

4. Commit and push: Commit the plugin files to the local repository and push the changes to the GitHub repository.

Publishing plugins as ZIP files
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If you prefer not to use GitHub, you can publish your plugin by uploading a zip file to a location that allows downloads. Follow these steps:

1. Package the plugin files: Create a zip file containing all the necessary plugin files, including the plugin definition YAML file and any optional files.

2. Choose a hosting platform: Select a file hosting platform or service that allows file downloads. Examples include Dropbox, Google Drive, or a personal website.

3. Upload the zip file: Upload the zip file containing the plugin files to the chosen hosting platform. Make sure to provide a clear and descriptive name for the zip file.

4. Share the download link: Once the zip file is uploaded, generate a publicly accessible download link. You can share this link with others who want to install your plugin.

How to write plugins
--------------------

Creating your first plugin
~~~~~~~~~~~~~~~~~~~~~~~~~~

Before you define any piece of a plugin, such as an operator or panel, you must first create a `fiftyone.yml` file in the root of your plugin directory.

.. code-block:: yaml

    fiftyone:
        # using semver, describe the compatible range of fiftyone versions
        version: '~0.21.0'
    name: "@my-org/my-plugin"
    # JS plugins must include a script path to their bundle
    js_bundle: "dist/index.umd.js"
    description: "My plugin description"
    # in order to load python operators they must be defined in the list below
    operators:
        - my_operator

For Python plugins, you must include a `__init__.py` file. Below is a simple example.

.. code-block:: python

    # __init__.py
    import fiftyone.operators as foo
    import fiftyone.operators.types as types

    class Count(foo.Operator):
        @property
        def config(self):
            return foo.OperatorConfig(name="count", label="Count")

        def execute(self, ctx):
            return {"count": len(ctx.view)}
        
        def resolve_output(self, ctx):
            outputs = types.Object()
            outputs.int("count")
            return types.Property(outputs)

    def register(p):
        p.register(Count)


For both JS and Python plugins, you can use the `Hello World <https://github.com/voxel51/fiftyone-plugins/tree/main/packages/hello-world>`_ as a starting point.

Below are introductory examples to the FiftyOne plugin API.

Building Operators
------------------

Example Python Operator
~~~~~~~~~~~~~~~~~~~~~~~~

This example shows how to define a simple operator that accepts a string input.

Typically an operator would use the input to perform some operation on the dataset or samples. In this case, we simply return the input string as the output.

With this `OperatorConfig` we cannot dynamically specify the input. We'll cover that in another example below.

.. code-block:: python

    class SimpleInputExample(foo.Operator):
        @property
        def config(self):
            return foo.OperatorConfig(
                name="example_simple_input",
                label="Examples: Simple Input",
            )
        
        def resolve_input(self, ctx):
            inputs = types.Object()
            inputs.str("message", label="Message", required=True)
            header = "Simple Input Example"
            return types.Property(inputs, view=types.View(label=header))

        def execute(self, ctx):
            return {"message": ctx.params["message"]}
        
        def resolve_output(self, ctx):
            outputs = types.Object()
            outputs.str("message", label="Message")
            header = "Simple Input Example: Success!"
            return types.Property(outputs, view=types.View(label=header))

    def register(p):
        # NOTE: make sure to include your operator name
        # in your fiftyone.yaml's operators list
        p.register(SimpleInputExample)

Hello world Operator - JS
~~~~~~~~~~~~~~~~~~~~~~~~~

Similarly to the example above, this JS example shows how to define a simple operator that accepts a string input.

.. note::
    
    The JS and Python API for implementing operators is very similar.
    
Unlike Python operators, JS operators can use React hooks and the `@fiftyone/*` packages by defining a `useHook()` method.
Any values return in this method will be available to the operator's `execute()` method via `ctx.hooks`.

Also shown in the example below is the `unlisted` config option. In both JS and Python operators, this allows for operators to be ommitted from the Operator Browser.

.. code-block:: typescript

    import {Operator, OperatorConfig, types, registerOperator} from "@fiftyone/operators";
    const PLUGIN_NAME = "@my-org/my-plugin";

    class SetSelectedSamples extends Operator {
        get config(): OperatorConfig {
            return new OperatorConfig({
                name: "set_selected_samples",
                label: "Set selected samples",
                unlisted: true
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

Using the execution context
~~~~~~~~~~~~~~~~~~~~~~~~~~~

The execution context is passed to the operator's `execute()` method. It contains the following properties:

- `params` - the operator's input values 
- `dataset` - the current :class:`fiftyone.core.dataset.Dataset` instance
- `view` - the current :class:`fiftyone.core.view.DatasetView` instance
- `dataset_name` - the name of the current dataset
- `hooks` - JS Only - the return value of the operator's `useHooks()` method

Panels, Visualizers, and Custom Components
------------------------------------------

Below are examples of how add your own customer user interface and components to the FiftyOne App.

Hello world Panel - JS
~~~~~~~~~~~~~~~~~~~~~~

A simple hello world JS plugin, that renders "hello world" in a panel, would look
like this:

.. code-block:: jsx

    import { registerComponent, PluginComponentTypes } from "@fiftyone/plugins";

    function HelloWorld() {
        return <h1>Hello World</h1>;
    }

    registerComponent({
        name: "HelloWorld",
        label: "HelloWorld",
        component: HelloWorld,
        type: PluginComponentTypes.Panel,
        activator: () => true
    });

Adding a custom FiftyOne Visualizer
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: jsx

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

Adding a custom Plot
~~~~~~~~~~~~~~~~~~~~

.. code-block:: jsx

    import * as fop from "@fiftyone/plugins";
    import * as fos from "@fiftyone/state";
    import * as foa from "@fiftyone/aggregations";
    import AwesomeMap from "react-mapping-library";

    function CustomPlot() {
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
        component: CustomPlot,
        // tell FiftyOne you want to provide a custom Panel
        type: PluginComponentTypes.Panel,
        // used for the plot selector button
        label: "Map",
        // only show the Map plot when the dataset has Geo data
        activator: ({ dataset }) => dataset.sampleFields.location,
    });

.. note::

    The `PluginComponentType.Plot` type is deprecated. Use
    `PluginComponentType.Panel` instead.

Custom operator view using Component plugin
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. **Creating and registering a custom component with plugin component**

.. code-block:: jsx

    import * as fop from "@fiftyone/plugins";
    import { useState } from "react"

    function CustomOperatorView(props) {
        // These props are provided to the component used as the view for an
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
        // Unique name you can use later to refer to the component plugin
        name: "CustomOperatorView",
        // component to delegate to
        component: CustomOperatorView,
        // tell FiftyOne you want to provide a custom component
        type: PluginComponentTypes.Component,
        // activate this plugin unconditionally
        activator: () => true,
    });

2. **Using the plugin component as the view for an operator field**

.. code-block:: python

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

There are a few ways to manage the state of your plugin. By default you should defer to existing state management in the FiftyOne App.
For example, if you want to allow users to select samples, you can use the `@fiftyone/state` package.

.. Reacting to state changes
.. ~~~~~~~~~~~~~~~~~~~~~~~~~

.. .. code-block:: jsx

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
to achieve your desired ux. For example, in a 3D visualizer, you might want to
use Thee.js and its object model, events, and state management. Or just use
your own React hooks to maintain your plugin components internal state.

If you want to allow users to interact with other aspects of FiftyOne through
your plugin, you can use the `@fiftyone/state` package:

.. code-block:: jsx

    // note: similar to react hooks, these must be used in the context
    // of a React component

    // select a dataset
    const selectLabel = fos.useOnSelectLabel();

    // in a callback
    selectLabel({ id: "labelId", field: "fieldName" });

The example above shows how you can coordinate or surface existing features of FiftyOne through
your plugin via the `@fiftyone/state` package. This package provides hooks to access and modify
the state of the FiftyOne App.

Recoil, atoms, and selectors
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can also use a combination of your own and fiftyone's recoil `atoms` and `selectors`.

Here's an example the combines both approaches in a hook that you could call from anywhere where hooks are supported (almost all plugin component types).

.. code-block:: jsx

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

Some plugins use libraries or tools that require credentials such as API keys
or tokens. Below is an example for how to provide and read these credentials.

The same mechanism can be used to expose configuration to plugin users, such as
color choices, and default values.

You can store a setting in either the App config or an individual dataset.
Here's an example of both.

.. code-block:: js

    // app_config.json
    {
      "plugins": {
        "my-plugin": {
          "mysetting": "foo"
        }
      }
    }

Now lets take that setting and change it for the `quickstart` dataset.

.. code-block:: py

    import fiftyone as fo
    dataset = fo.load_dataset("quickstart")

    # Modify the dataset's App config
    dataset.app_config.plugins["my-plugin"] = {
      "mysetting": "bar"
    }

    dataset.save()

Then in your plugin implementation, you can read settings with the
`useSettings` hook:

.. code-block:: js

    const { mysetting } = fop.useSettings("my-plugin");

Querying FiftyOne
-----------------

The typical use case for a plugin is to provide a unique way of visualizing
FiftyOne data. However some plugins may need to also fetch data in a unique way
to efficiently visualize it.

For example, a `PluginComponentType.Plot` plugin rendering a map of geo points
may need to fetch data relative to where the user is currently viewing. In
MongoDB, such a query would look like this:

.. code-block:: js

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

.. toctree::
   :maxdepth: 1
   :hidden:

   Overview <self>
   Typescript API <ts-api>
