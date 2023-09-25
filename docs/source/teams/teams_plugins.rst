.. _teams-plugins:

FiftyOne Teams Plugins
======================

.. default-role:: code

FiftyOne Teams provides native support for installing and running
:ref:`FiftyOne plugins <fiftyone-plugins>`, which offers powerful opportunities
to extend and customize the functionality of your Teams deployment to suit your
needs.

.. note::

    What can you do with plugins? Check out
    :ref:`delegated operations <teams-delegated-operations>` to see some quick
    examples, then check out the
    `FiftyOne plugins <https://github.com/voxel51/fiftyone-plugins>`_
    repository for a growing collection of prebuilt plugins that you can add to
    your Teams deployment!

.. _teams-plugins-page:

Plugins page
____________

Admins can use the plugins page to upload, manage, and configure permissions
for plugins that are made available to users of your Teams deployment.

Admins can access the plugins page under Settings > Plugins. It displays a
list of all installed plugins and their operators, as well as the enablement
and permissions of each.

.. image:: /images/teams/plugins_page.png
   :alt: teams-plugins-page
   :align: center

.. _teams-plugins-install:

Installing a plugin
___________________

Admins can install plugins via the Teams UI or Management SDK.

.. note::

    A plugin is a directory (or ZIP of it) that contains a top-level
    ``fiftyone.yml`` file.

Teams UI
--------

To install a plugin, click the "Install plugin" button on the plugins page.

.. image:: /images/teams/plugins_install_btn.png
   :alt: teams-plugins-page-install-button
   :align: center

Then upload or drag and drop the plugin contents as a ZIP file and click
install.

.. image:: /images/teams/plugins_install.png
   :alt: teams-plugins-page-install-page
   :align: center

You should then see a success message and the newly installed plugin listed on
the plugins page.

.. image:: /images/teams/plugins_install_success.png
   :alt: teams-plugins-page-install-success-page
   :align: center

SDK
---

Admins can also use the
:meth:`upload_plugin() <fiftyone.management.plugin.upload_plugin>` method from
the Management SDK:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    # You can pass the directory or an already zipped version of it
    fom.upload_plugin("/path/to/plugin_dir")

.. _teams-plugins-upgrade:

Upgrading a plugin
__________________

Admins can upgrade plugins at any time through the Teams UI or Management SDK.

Teams UI
--------

To upgrade a plugin, click the plugin's dropdown and select "Upgrade plugin".

.. image:: /images/teams/plugins_upgrade_btn.png
   :alt: teams-plugins-page-upgrade-btn
   :align: center

Then upload or drag and drop the upgraded plugin as a ZIP file and click
upgrade.

.. image:: /images/teams/plugins_upgrade_page.png
   :alt: teams-plugins-page-upgrade-page
   :align: center

.. note::

    If the `name` attribute within the uploaded plugin's `fiftyone.yml` file
    doesn't match the existing plugin, a new plugin will be created. Simply
    delete the old one.

You should then see a success message and the updated information about the
plugin on the plugins page.

.. image:: /images/teams/plugins_upgrade_success_page.png
   :alt: teams-plugins-page-upgrade-success-page
   :align: center

SDK
---

Admins can also use the
:meth:`upload_plugin() <fiftyone.management.plugin.upload_plugin>` method from
the Management SDK with the `overwrite=True` option:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    # You can pass the directory or an already zipped version of it
    fom.upload_plugin("/path/to/plugin_dir", overwrite=True)

.. _teams-plugins-uninstall:

Uninstalling a plugin
_____________________

Admins can uninstall plugins at any time through the Teams UI or Management
SDK.

.. note::

    Did you know? You can
    :ref:`enable/disable plugins <teams-plugins-enable-disable>` rather than
    permanently uninstalling them.

Teams UI
--------

To uninstall a plugin, click the plugin's dropdown and select
"Uninstall plugin".

.. image:: /images/teams/plugins_uninstall_btn.png
   :alt: teams-plugins-page-uninstall-btn
   :align: center

SDK
---

Admins can also use the
:meth:`delete_plugin() <fiftyone.management.plugin.delete_plugin>` method from
the Management SDK:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    fom.delete_plugin(plugin_name)

.. _teams-plugins-enable-disable:

Enabling/disabling plugins
__________________________

Teams UI
---------

When plugins are first installed into Teams, they are enabled by default, along
with any operators they contain.

Admins can enable/disable a plugin and all of its operators by toggling the
enabled/disabled switch.

.. image:: /images/teams/plugins_disable.png
   :alt: teams-plugins-page-disable
   :align: center

Admins can also disable/enable specific operators within an (enabled) plugin
by clicking on the plugin's operators link.

.. image:: /images/teams/plugins_operators_btn.png
   :alt: teams-plugins-page-operators-btn
   :align: center

and then toggling the enabled/disabled switch for each operator as necessary.

.. image:: /images/teams/plugins_operators_disable.png
   :alt: teams-plugins-page-operators-disable
   :align: center

SDK
---

Admins can also use the
:meth:`set_plugin_enabled() <fiftyone.management.plugin.set_plugin_enabled>`
and
:meth:`set_plugin_operator_enabled() <fiftyone.management.plugin.set_plugin_operator_enabled>`
methods from the management SDK:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    # Disable a plugin
    fom.set_plugin_enabled(plugin_name, False)

    # Disable a particular operator
    fom.set_plugin_operator_enabled(plugin_name, operator_name, False)

.. _teams-plugins-permissions:

Plugin permissions
__________________

Admins can optionally configure access to plugins and individual operators
within them via any combination of the permissions described below:

.. table::

    +-------------------------------+----------------------------------------------------------------------------+
    | Permission                    | Description                                                                |
    +===============================+============================================================================+
    | Minimum Role                  | The minimum role a user must have to execute the operation.                |
    +-------------------------------+----------------------------------------------------------------------------+
    | Minimum Dataset Permission    | The minimum dataset permission a user must have to perform the operation   |
    |                               | on a particular dataset.                                                   |
    +-------------------------------+----------------------------------------------------------------------------+

Teams UI
--------

To configure the permissions for an operator, first click on the plugin's
operators link.

.. image:: /images/teams/plugins_operators_btn.png
   :alt: teams-plugins-page-operators-btn
   :align: center

Then change the dropdown for the operator to reflect the desired permission
level.

.. image:: /images/teams/plugins_operators_perms.png
   :alt: teams-plugins-page-operators-perms
   :align: left
   :width: 49%

.. image:: /images/teams/plugins_operators_perms2.png
   :alt: teams-plugins-page-operators-perms2
   :align: right
   :width: 49%

SDK
---

Admins can also use the
:meth:`set_plugin_operator_permissions() <fiftyone.management.plugin.set_plugin_operator_permissions>`
method from the Management SDK:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    # Set minimum role permission only
    fom.set_plugin_operator_enabled(
        plugin_name,
        operator_name,
        minimum_role=fom.MEMBER,
    )

    # Set minimum dataset permission only
    fom.set_plugin_operator_enabled(
        plugin_name,
        operator_name,
        minimum_dataset_permission=fom.EDIT,
    )

    # Set both minimum role and minimum dataset permissions
    fom.set_plugin_operator_enabled(
        plugin_name,
        operator_name,
        minimum_role=fom.EDIT,
        minimum_dataset_permission=fom.EDIT,
    )

Default permissions
-------------------

When new plugins are installed, any operators they contain are initialized with
the default permissions for your deployment.

By default, the initial permissions are:

.. table::

    +-------------------------------+---------------+
    | Permission                    | Default       |
    +===============================+===============+
    | Minimum Role                  | Member        |
    +-------------------------------+---------------+
    | Minimum Dataset Permission    | Edit          |
    +-------------------------------+---------------+

Teams UI
^^^^^^^^

Default operator permissions can be configured by navigating to the page at
Settings > Security and looking under the Plugins header. Click the dropdown
for the permission you want to change and select the new value.

.. image:: /images/teams/plugins_org_settings.png
   :alt: teams-plugins-page-org-settings
   :align: center

SDK
^^^

Admins can also use the
:meth:`set_organization_settings() <fiftyone.management.organization.set_organization_settings>`
method from the Management SDK:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    fom.set_organization_settings(
        default_operator_minimum_role=fom.MEMBER,
        default_operator_minimum_dataset_permission=fom.EDIT,
    )

.. _teams-delegated-operations:

Delegated operations
____________________

:ref:`Delegated Operations <delegated-operations>` are a powerful feature of
FiftyOne's plugin framework that allows users to schedule tasks from within the
App that are executed on a connected workflow orchestrator like Apache Airflow.

With FiftyOne Teams, your team can
:ref:`upload and permission <teams-plugins-page>` custom operations that your
users can execute from the Teams App, all of which run against a central
orchestrator :ref:`configured by <teams-delegated-orchestrator>` your admins.

Why is this awesome? Your AI stack needs a flexible data-centric component that
enables you to organize and compute on your data. With Delegated Operations,
FiftyOne Teams becomes both a dataset management/visualization tool and a
workflow automation tool that defines how your data-centric workflows like
ingestion, curation, and evaluation are performed. In short, think of FiftyOne
Teams as the single source of truth on which you co-develop your data and
models together.

What can Delegated Operations do for you? Get started by installing any of
these plugins available in the
`FiftyOne Plugins <https://github.com/voxel51/fiftyone-plugins>`_ repository:

.. table::
    :widths: 35 65

    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/annotation <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/annotation/README.md>`_ | ✏️ Utilities for integrating FiftyOne with annotation tools                                                               |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/brain <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/brain/README.md>`_           |  🧠 Utilities for working with the FiftyOne Brain                                                                         |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/evaluation <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/evaluation/README.md>`_ |  ✅ Utilities for evaluating models with FiftyOne                                                                         |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/io <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/io/README.md>`_                 | 📁 A collection of import/export utilities                                                                                |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/indexes <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/indexes/README.md>`_       | 📈 Utilities working with FiftyOne database indexes                                                                       |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/utils <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/utils/README.md>`_           | ⚒️ Call your favorite SDK utilities from the App                                                                          |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/voxelgpt <https://github.com/voxel51/voxelgpt>`_                                                  | 🤖 An AI assistant that can query visual datasets, search the FiftyOne docs, and answer general computer vision questions |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | `@voxel51/zoo <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/zoo/README.md>`_               | 🌎 Download datasets and run inference with models from the FiftyOne Zoo, all without leaving the App                     |
    +-------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------+

For example, wish you could import data from within the App? With the
`@voxel51/io <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/io/README.md>`_,
plugin you can!

.. image:: /images/plugins/operators/examples/import.gif

Want to send data for annotation from within the App? Sure thing, just install the
`@voxel51/annotation <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/annotation/README.md>`_
plugin:

.. image:: /images/plugins/operators/examples/annotation.gif

Have model predictions on your dataset that you want to evaluate? The
`@voxel51/evaluation <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/evaluation/README.md>`_
plugin makes it easy:

.. image:: /images/plugins/operators/examples/evaluation.gif

Need to compute embedding for your dataset so you can visualize them in the
:ref:`Embeddings panel <app-embeddings-panel>`? Kick off the task with the
`@voxel51/brain <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/brain/README.md>`_
plugin and proceed with other work while the execution happens in the background:

.. image:: /images/plugins/operators/examples/embeddings.gif

When you choose delegated execution in the App, these tasks are automatically
scheduled for execution on your
:ref:`connected orchestrator <teams-delegated-orchestrator>` and you can
continue with other work. Meanwhile, all datasets have a
:ref:`Runs tab <teams-managing-delegated-operations>` in the App where you can
browse a history of all delegated operations that have been run on the dataset
and their status.

.. _teams-delegated-orchestrator:

Setting up an orchestrator
__________________________

All delegated operations that have been scheduled by users of a FiftyOne Teams
deployment will remain queued until a connected orchestrator picks them up and
executes them.

.. note::

    This section describes how to configure an
    `Apache Airflow <https://airflow.apache.org>`_ orchestrator, but other
    options are availabe, such as `Flyte <https://flyte.org>`_. Delegated
    operations in FiftyOne Teams are designed to be workflow tool-agnostic.

To set up Airflow as an orchestrator to run delegated operations, you will need
to:

-   Provision a VM or instance with enough resources to run the operations you
    want to delegate
-   Install
    `Apache Airflow <https://airflow.apache.org/docs/apache-airflow/stable/installation/index.html>`_
    on the VM
-   Install the appropriate version of the FiftyOne Teams SDK for the Teams
    deployment that you are connecting to
-   Ensure that your :ref:`team's plugins <teams-plugins-page>` are available
    to the Orchestrator, either by installing them on the same machine or by
    making them available via a shared filesystem
-   Ensure that the required environment variables are set (see below)
-   Install the
    `FiftyOne Airflow DAG <https://github.com/voxel51/fiftyone-plugins/tree/main/orchestrators/airflow>`_
-   You're all set. Schedule those operations!

The required environment variables are:

.. code-block:: bash

    # Configure where plugins source lives
    export FIFTYONE_PLUGINS_DIR=...  # eg /mnt/nfs/shared/plugins

    # Configure where media and models will be downloaded
    export FIFTYONE_MEDIA_CACHE_DIR=...
    export FIFTYONE_MEDIA_CACHE_SIZE_BYTES=...
    export FIFTYONE_MODEL_ZOO_DIR=...

    #
    # Copy the values below from your Teams deployment
    #

    # Provide your encryption key so the orchestrator can access secrets
    export FIFTYONE_ENCRYPTION_KEY=...
    export FIFTYONE_INTERNAL_SERVICE=1

    # If your deployment uses API connections
    export FIFTYONE_API_KEY=...
    export FIFTYONE_API_URL=...

    # If your deployment uses direct mongo connections
    export FIFTYONE_DATABASE_NAME=...
    export FIFTYONE_DATABASE_URI=...
    export FIFTYONE_API_KEY=...
    export API_URL=...

.. note::

    Refer to :ref:`this section <teams-media-cache-config>` for more
    information on media caching in FiftyOne Teams.

.. note::

    The Orchestrator will need to have all of the required dependencies
    installed for running your Team's operations. For example, if running the
    `@voxel51/brain/compute_visualization <https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/brain>`_
    operator, the orchestrator will need the `torch` and `torchvision` packages
    installed.

Example: Google Compute Engine
------------------------------

This section configures Airflow on a Google Compute Engine instance.

**Provision VM**

First, provision a VM with the resources required to run the operations you
want to delegate. Take note of the IP of the VM, you'll need it in a later
step.

SSH into the instance, ensure the packages are up to date, and install python:

.. code-block:: bash

    sudo apt-get update
    sudo apt upgrade
    sudo apt install python3-pip

**Install Airflow**

.. code-block:: bash

    pip install apache-airflow[gcp]

ensure a successful install by checking the version:

.. code-block:: bash

    airflow version

Initialize the airflow db and create a user:

.. code-block:: bash

    airflow db init
    airflow users create -r Admin -u <username> -p <password> -e <email> -f <first name> -l <last name>

.. note::

    This username and password will be the account you use to log into the
    airflow interface in a later step.

**Launch Aiflow**

Open 2 more ssh sessions, and start the webserver and scheduler in each.

.. note::

    You could run these commands with the `-D` flag to run them in the
    background, but we recommend running them in the foreground for debugging
    purposes.

.. code-block:: bash

    airflow webserver -p 8080
    airflow scheduler

.. note::

    You could start airflow on the port of your choice, but ensure that the
    firewall rules allow traffic on that port.

**Add the Firewall Rule**

Navigate to the networking/firewall rules section of the google cloud console
and allow traffic on that port for the VM.

Once this is done, you should be able to navigate to the airflow interface at
`http://<vm ip>:8080` (or the port you chose) and log in with the credentials
you created earlier.

**Mount the Plugins Directory**

The orchestrator must have the same plugins available to it as the instance
which queued the operation. This could be accomplished by either installing the
plugins on the orchestrator, or by mounting the plugins directory from the
instance which queued the operation.

To mount the plugins directory, locate the ip of the nfs server then run the
following commands on the orchestrator:

.. code-block:: bash

    sudo mkdir -p /mnt/nfs/shared
    sudo mount -t nfs -o vers=4,rw,intr <ip of the nfs server>:/path/to/plugins /mnt/nfs/shared

You might also want to add the same command to your startup tasks, located in
``etc/fstab``:

.. code-block:: bash

    sudo pico /etc/fstab

paste the following and save:

.. code-block:: bash

    $NFS_SERVER_ID:/path/to/fiftyone-plugins /mnt/nfs/shared/ nfs vers=4,rw,intr 0 0

the path to the plugins should now be available at `/mnt/nfs/shared/plugins`.
To test this, run the following command:

.. code-block:: bash

    ls /mnt/nfs/shared/plugins

This path will be added to the environment variables as
``FIFTYONE_PLUGINS_DIR`` in a following step.

**Install FiftyOne**

Ensure the keyring is installed:

.. code-block:: bash

    pip install keyrings.google-artifactregistry-auth

and then install FiftyOne:

.. code-block:: bash

    INDEX_URL="https://us-central1-python.pkg.dev/computer-vision-team/dev-python/simple/"
    pip --no-cache-dir install --extra-index-url $INDEX_URL fiftyone

**Configure environment variables**

Now we need to configure the necessary environment variables.

.. code-block:: bash

    pico ~/.profile

Add the following lines to the bottom of the file, replacing the values with
the appropriate values for your deployment.

.. code-block:: bash

    # Configure where plugins source lives
    export FIFTYONE_PLUGINS_DIR=...  # eg /mnt/nfs/shared/plugins

    # Configure where media and models will be downloaded
    export FIFTYONE_MEDIA_CACHE_DIR=...
    export FIFTYONE_MEDIA_CACHE_SIZE_BYTES=...
    export FIFTYONE_MODEL_ZOO_DIR=...

    #
    # Copy the values below from your Teams deployment
    #

    # Provide your encryption key so the orchestrator can access secrets
    export FIFTYONE_ENCRYPTION_KEY=...
    export FIFTYONE_INTERNAL_SERVICE=1

    # If your deployment uses API connections
    export FIFTYONE_API_KEY=...
    export FIFTYONE_API_URL=...

    # If your deployment uses direct mongo connections
    export FIFTYONE_DATABASE_NAME=...
    export FIFTYONE_DATABASE_URI=...
    export FIFTYONE_API_KEY=...
    export API_URL=...

**Add the Airflow DAG**

Check the default DAGs path by running the following command:

.. code-block:: bash

    airflow config list | grep dags_folder

.. note::

    The default DAG folder path is `/home/<user>/airflow/dags`.

Navigate to the DAG folder and add the
`FiftyOne Airflow DAG <https://github.com/voxel51/fiftyone-plugins/tree/main/orchestrators/airflow>`_.

Open the Airflow interface and ensure that the DAG is visible. Any issues
should be immediately visible as errors. Locate the dag and toggle it on, then
refresh to make sure it's running. If no operations have been queued, it will
still run a check and all runs should be green.

.. image:: /images/teams/airflow.png
   :alt: airflow-dag
   :align: center

.. note::

    The Orchestrator will need to have all of the required dependencies
    installed for running your Team's operations. For example, if running the
    `@voxel51/brain/compute_visualization <https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/brain>`_
    operator, the orchestrator will need the `torch` and `torchvision` packages
    installed.

.. _teams-managing-delegated-operations:

Managing delegated operations
_____________________________

Every Teams dataset has a Runs page that allows users to monitor and explore
delegated operator runs scheduled against that dataset.

.. note::

    The Runs page only tracks operations that are *delegated* to your Team's
    orchestrator, not operations that are executed immediately in the App.

Runs page
---------

The Runs page is accessible to all users with Can view access to the dataset.

You can access the Runs page by clicking on the "Runs" tab from the
:ref:`Samples tab <teams-using-datasets>`.

Once you are on the Runs page, you will see a table with the list of all
operators scheduled by any user of your organization on the dataset. You can
sort, search and filter runs listed to refine the list as you like:

.. image:: /images/plugins/operators/runs/runs_page.png

Sorting
^^^^^^^

By default, the runs table is sorted by recency, but you can use the dropdown
menu in the upper left of table to sort by other fields like update time or the
name of the operator:

.. image:: /images/plugins/operators/runs/sort.png

Filtering
^^^^^^^^^

You can also filter the runs table to see a subset of runs:

**Showing only your runs**

Use the "My runs" radio button to see only the runs that you scheduled:

.. image:: /images/plugins/operators/runs/my_runs.png

**By status**

You can further refine the list of runs using the status dropdown to select one
or more status you would like to filter by:

.. image:: /images/plugins/operators/runs/filter_by_status.png

Searching
^^^^^^^^^

You can also use the search functionality to filter the list of runs by
keyword. As you type your query in the search box, the list of runs will be
updated to show only the runs matching your query:

.. note::

    Search is case-sensitive and you can currently only search by operator
    name. For example, searches will not match against operator label
    **Demo: Export to GCP** in the image below.

.. image:: /images/plugins/operators/runs/search_by_name.png

Re-running
^^^^^^^^^^

From the Runs page, you can trigger a re-run of any listed run by clicking the
three-dots to open actions menu and then clicking "Re-run":

.. image:: /images/plugins/operators/runs/re_run.png

Pinning
^^^^^^^

Pinned runs are displayed to the right of runs table. By default, five pinned
runs will be displayed. However, if there are more than five pinned runs, you
will see a button to expand the list.

To pin a run, hover over a run in runs table and click the pin icon that
appears beside the operator label:

.. image:: /images/plugins/operators/runs/pinning.png

.. note::

    Pinned runs are stored at the dataset-level and will be visible to all
    users with access to the dataset.

Run page
--------

The Run page allows you to see information about a specific run such as inputs,
outputs, and errors.

You can visit the Run page for a run by clicking on a run in the runs table,
the Pinned runs, or Recent runs widgets.

Input
^^^^^

The Input tab on the Run page lets you see the input parameters that were
provided when the run was scheduled:

.. image:: /images/plugins/operators/runs/input.png

**Raw input**

By default, a rendered version (similar to what is displayed when invoking an
operator) of input parameters is displayed. However, you can switch to raw view
by clicking the "Show raw" toggle button:

.. image:: /images/plugins/operators/runs/raw_input.png

Output
^^^^^^

The Output tab on the Run page lets you see the preview of the result of a
completed run:

.. note::

    Output tab is only available for completed run.

.. image:: /images/plugins/operators/runs/output.png

Errors
^^^^^^

The Errors tab on the Run page will appear if the run failed and lets you see
the errors that occurred:

.. image:: /images/plugins/operators/runs/errors.png

View
^^^^

The View tab on the Run page lets you see the dataset view on which the run was
scheduled:

.. image:: /images/plugins/operators/runs/view.png
