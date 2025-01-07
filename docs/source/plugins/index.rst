.. _fiftyone-plugins:

Plugins Overview
================

.. default-role:: code

FiftyOne provides a powerful plugin framework that allows for extending and
customizing the functionality of the tool to suit your specific needs.

With plugins, you can add new functionality to the FiftyOne App, create
integrations with other tools and APIs, render custom panels, and add custom
actions to menus.

With :ref:`FiftyOne Teams <teams-delegated-operations>`, you can even write
plugins that allow users to execute long-running tasks from within the App that
run on a connected compute cluster.

Get started with plugins by installing some
:ref:`popular plugins <plugins-getting-started>`, then try your hand at
:ref:`writing your own <developing-plugins>`!

.. note::

    Check out the
    `FiftyOne plugins <https://github.com/voxel51/fiftyone-plugins>`_
    repository for a growing collection of plugins that you can easily
    :ref:`download <plugins-download>` and use locally.

.. _plugins-getting-started:

Getting started
_______________

What can plugins do for you? Get started by installing any of
these plugins available in the
`FiftyOne Plugins <https://github.com/voxel51/fiftyone-plugins>`_ repository:

.. table::
    :widths: 35 65

    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/annotation <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/annotation/README.md>`_ | ✏️ Utilities for integrating FiftyOne with annotation tools                                                               |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/brain <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/brain/README.md>`_           | 🧠 Utilities for working with the FiftyOne Brain                                                                          |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/dashboard <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/dashboard/README.md>`_   | 📊 Create your own custom dashboards from within the App                                                                  |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/evaluation <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/evaluation/README.md>`_ | ✅ Utilities for evaluating models with FiftyOne                                                                          |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/io <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/io/README.md>`_                 | 📁 A collection of import/export utilities                                                                                |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/indexes <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/indexes/README.md>`_       | 📈 Utilities for working with FiftyOne database indexes                                                                   |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/runs <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/runs/README.md>`_             | 📈 Utilities for working with custom runs                                                                                 |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/utils <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/utils/README.md>`_           | ⚒️ Call your favorite SDK utilities from the App                                                                          |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/voxelgpt <https://github.com/voxel51/voxelgpt>`_                                                  | 🤖 An AI assistant that can query visual datasets, search the FiftyOne docs, and answer general computer vision questions |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/zoo <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/zoo/README.md>`_               | 🌎 Download datasets and run inference with models from the FiftyOne Zoo, all without leaving the App                     |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+

For example, do you wish you could import data from within the App? With the
`@voxel51/io <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/io/README.md>`_,
plugin, you can!

.. image:: /images/plugins/operators/examples/import.gif

Want to send data for annotation from within the App? Sure thing! Just install the
`@voxel51/annotation <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/annotation/README.md>`_
plugin:

.. image:: /images/plugins/operators/examples/annotation.gif

Have model predictions on your dataset that you want to evaluate? The
`@voxel51/evaluation <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/evaluation/README.md>`_
plugin makes it easy:

.. image:: /images/plugins/operators/examples/evaluation.gif

Need to compute embedding for your dataset? Kick off the task with the
`@voxel51/brain <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/brain/README.md>`_
plugin and proceed with other work while the execution happens in the background:

.. image:: /images/plugins/operators/examples/embeddings.gif

Want to create a custom dashboard that displays statistics of interest about
the current dataset? Just install the
`@voxel51/dashboard <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/dashboard/README.md>`_
plugin and build away:

.. image:: /images/plugins/panels/dashboard-panel.gif

.. note::

    When you choose :ref:`delegated execution <delegated-operations>` in the
    App, these tasks are automatically scheduled for execution on your
    :ref:`connected orchestrator <delegated-orchestrator>` and you can continue
    with other work!

FiftyOne also includes a number of builtin features that are implemented as
plugins. For example, :ref:`Panels <plugins-design-panels>` are miniature
full-featured data applications that you can open in
:ref:`App Spaces <app-spaces>` and interactively manipulate to explore your
dataset and update/respond to updates from other spaces that are currently open
in the App.

Does your dataset have geolocation data? Use the
:ref:`Map panel <app-map-panel>` to view it:

.. image:: /images/app/app-map-panel.gif

Want to :ref:`visualize embeddings <brain-embeddings-visualization>` in the
App? Just open the :ref:`Embeddings panel <app-embeddings-panel>`:

.. image:: /images/brain/brain-object-visualization.gif

.. note::

    Look interesting? Learn how to :ref:`develop your own <developing-plugins>`
    plugins!

.. toctree::
   :maxdepth: 1
   :hidden:

   Overview <self>
   Using plugins <using_plugins>
   Developing plugins <developing_plugins>
   API reference <api/plugins>
   TypeScript API reference <ts-api>
