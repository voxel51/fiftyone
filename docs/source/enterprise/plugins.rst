.. _enterprise-plugins:

FiftyOne Enterprise Plugins
===========================

.. default-role:: code

FiftyOne Enterprise provides native support for installing and running
:ref:`FiftyOne plugins <fiftyone-plugins>`, which offers powerful opportunities
to extend and customize the functionality of your Enterprise deployment to suit your
needs.

.. note::

    What can you do with plugins? Check out
    :ref:`delegated operations <enterprise-delegated-operations>` to see some quick
    examples, then check out the
    `FiftyOne plugins <https://github.com/voxel51/fiftyone-plugins>`_
    repository for a growing collection of prebuilt plugins that you can add to
    your Enterprise deployment!

.. _enterprise-plugins-page:

Plugins page
____________

Admins can use the plugins page to upload, manage, and configure permissions
for plugins that are made available to users of your Enterprise deployment.

Admins can access the plugins page under Settings > Plugins. It displays a
list of all installed plugins and their operators, as well as the enablement
and permissions of each.

.. image:: /images/enterprise/plugins_page.png
   :alt: enterprise-plugins-page
   :align: center

.. _enterprise-plugins-install:

Installing a plugin
___________________

Admins can install plugins via the Enterprise UI or Management SDK.

.. note::

    A plugin is a directory (or ZIP of it) that contains a top-level
    ``fiftyone.yml`` file.

Enterprise UI
-------------

To install a plugin, click the "Install plugin" button on the plugins page.

.. image:: /images/enterprise/plugins_install_btn.png
   :alt: enterprise-plugins-page-install-button
   :align: center

Then upload or drag and drop the plugin contents as a ZIP file and click
install.

.. image:: /images/enterprise/plugins_install.png
   :alt: enterprise-plugins-page-install-page
   :align: center

You should then see a success message and the newly installed plugin listed on
the plugins page.

.. image:: /images/enterprise/plugins_install_success.png
   :alt: enterprise-plugins-page-install-success-page
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

.. _enterprise-plugins-upgrade:

Upgrading a plugin
__________________

Admins can upgrade plugins at any time through the Enterprise UI or Management SDK.

Enterprise UI
-------------

To upgrade a plugin, click the plugin's dropdown and select "Upgrade plugin".

.. image:: /images/enterprise/plugins_upgrade_btn.png
   :alt: enterprise-plugins-page-upgrade-btn
   :align: center

Then upload or drag and drop the upgraded plugin as a ZIP file and click
upgrade.

.. image:: /images/enterprise/plugins_upgrade_page.png
   :alt: enterprise-plugins-page-upgrade-page
   :align: center

.. note::

    If the `name` attribute within the uploaded plugin's `fiftyone.yml` file
    doesn't match the existing plugin, a new plugin will be created. Simply
    delete the old one.

You should then see a success message and the updated information about the
plugin on the plugins page.

.. image:: /images/enterprise/plugins_upgrade_success_page.png
   :alt: enterprise-plugins-page-upgrade-success-page
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

.. _enterprise-plugins-uninstall:

Uninstalling a plugin
_____________________

Admins can uninstall plugins at any time through the Enterprise UI or Management
SDK.

.. note::

    Did you know? You can
    :ref:`enable/disable plugins <enterprise-plugins-enable-disable>` rather than
    permanently uninstalling them.

Enterprise UI
-------------

To uninstall a plugin, click the plugin's dropdown and select
"Uninstall plugin".

.. image:: /images/enterprise/plugins_uninstall_btn.png
   :alt: enterprise-plugins-page-uninstall-btn
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

.. _enterprise-plugins-enable-disable:

Enabling/disabling plugins
__________________________

Enterprise UI
-------------

When plugins are first installed into Enterprise, they are enabled by default, along
with any operators they contain.

Admins can enable/disable a plugin and all of its operators by toggling the
enabled/disabled switch.

.. image:: /images/enterprise/plugins_disable.png
   :alt: enterprise-plugins-page-disable
   :align: center

Admins can also disable/enable specific operators within an (enabled) plugin
by clicking on the plugin's operators link.

.. image:: /images/enterprise/plugins_operators_btn.png
   :alt: enterprise-plugins-page-operators-btn
   :align: center

and then toggling the enabled/disabled switch for each operator as necessary.

.. image:: /images/enterprise/plugins_operators_disable.png
   :alt: enterprise-plugins-page-operators-disable
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

.. _enterprise-plugins-permissions:

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

Enterprise UI
-------------

To configure the permissions for an operator, first click on the plugin's
operators link.

.. image:: /images/enterprise/plugins_operators_btn.png
   :alt: enterprise-plugins-page-operators-btn
   :align: center

Then change the dropdown for the operator to reflect the desired permission
level.

.. image:: /images/enterprise/plugins_operators_perms.png
   :alt: enterprise-plugins-page-operators-perms
   :align: left
   :width: 49%

.. image:: /images/enterprise/plugins_operators_perms2.png
   :alt: enterprise-plugins-page-operators-perms2
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

Enterprise UI
^^^^^^^^^^^^^

Default operator permissions can be configured by navigating to the page at
Settings > Security and looking under the Plugins header. Click the dropdown
for the permission you want to change and select the new value.

.. image:: /images/enterprise/plugins_org_settings.png
   :alt: enterprise-plugins-page-org-settings
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

.. _enterprise-delegated-operations:

Delegated operations
____________________

:ref:`Delegated operations <delegated-operations>` are a powerful feature of
FiftyOne's plugin framework that allows users to schedule tasks from within the
App that are executed in the background on a connected compute cluster.

With FiftyOne Enterprise, your team can
:ref:`upload and permission <enterprise-plugins-page>` custom operations that your
users can execute from the Enterprise App, all of which run against a central
orchestrator :ref:`configured by <enterprise-delegated-orchestrator>` your admins.

Why is this awesome? Your AI stack needs a flexible data-centric component that
enables you to organize and compute on your data. With delegated operations,
FiftyOne Enterprise becomes both a dataset management/visualization tool and a
workflow automation tool that defines how your data-centric workflows like
ingestion, curation, and evaluation are performed. In short, think of FiftyOne
Enterprise as the single source of truth on which you co-develop your data and
models together.

What can delegated operations do for you? Get started by installing any of
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
:ref:`connected orchestrator <enterprise-delegated-orchestrator>` and you can
continue with other work. Meanwhile, all datasets have a
:ref:`Runs tab <enterprise-managing-delegated-operations>` in the App where you can
browse a history of all delegated operations that have been run on the dataset
and their status.

.. _enterprise-delegated-orchestrator:

Configuring your orchestrator(s)
________________________________

FiftyOne Enterprise offers a builtin orchestrator that is configured as part of
your team's deployment with a default level of compute capacity.

It is also possible to connect your FiftyOne Enterprise deployment to an externally
managed workflow orchestration tool (`Airflow <https://airflow.apache.org>`_,
`Flyte <https://flyte.org>`_,
`Spark <https://www.databricks.com/product/spark>`_, etc).

.. note::

    Contact your Voxel51 support team to scale your deployment's compute
    capacity or if you'd like to use an external orchestrator.

.. _enterprise-managing-delegated-operations:

Managing delegated operations
_____________________________

Every dataset in FiftyOne Enterprise has a Runs page that allows users with access
to monitor and explore delegated operations scheduled against that dataset.

All scheduled operations are maintained in a queue and will be automatically
executed as resources are available on the targeted orchestrator.

.. note::

    The Runs page only tracks operations that are scheduled for delegated
    execution, not operations that are executed immediately in the App.

.. _enterprise-runs-page:

Runs page
---------

All users with at least **Can View** access to a dataset can visit the Runs
page by clicking on the "Runs" tab.

On the Runs page, you will see a table with a list of delgated operations.
Admins can choose whether to view operations for all datasets or only the
current dataset, while non-admins can only view operations associated with the
current dataset.

The table provides options to sort, search, and filter runs shown to refine the
list as you like:

.. image:: /images/plugins/operators/runs/runs_general.png

.. _enterprise-runs-statuses:

Statuses
^^^^^^^^

Delegated operations can have one of 5 potential statuses:

-   **Scheduled**: the run has been scheduled for execution and is awaiting
    execution quota. All delegated operations begin life in this state
-   **Queued**: the run has been allocated execution quota and it will start
    running as soon as orchestrator resources become available
-   **Running**: the run is currently being executed
-   **Completed**: the run has completed successfully
-   **Failed**: the run failed to complete

.. note::

    FiftyOne Enterprise offers a builtin orchestrator that is configured as
    part of your team's deployment with a default level of execution quota.

    Contact your Voxel51 support team to discuss running more jobs in parallel,
    or if you'd like to use an external orchestrator.

.. image:: /images/plugins/operators/runs/runs_statuses.png

You can hover over the status badge of a run in Scheduled or Queued state to
see additional information about its execution, including its position in the
Scheduled queue:

.. image:: /images/plugins/operators/runs/runs_hover_scheduled.png

.. image:: /images/plugins/operators/runs/runs_hover_queued.png

.. _enterprise-runs-sorting:

Sorting
^^^^^^^

By default, the runs table is sorted by recency, with the most recently
scheduled run at the top. You can use the dropdown menu in the upper right
of the table to sort by other criteria, including last updated, oldest, or
operator name:

.. image:: /images/plugins/operators/runs/runs_sorting.png

.. _enterprise-runs-filtering:

Filtering
^^^^^^^^^

You can also filter the runs table to see a subset of runs.

Users with sufficient privileges can toggle between “My Runs” and “All Runs” to
see runs you have scheduled versus runs that others in your organization have
scheduled on the current dataset:

.. image:: /images/plugins/operators/runs/runs_my_vs_all.png

All users can further refine the list of runs using the Status dropdown to
select one or more statuses you would like to filter by:

.. image:: /images/plugins/operators/runs/runs_statuses.png

Admins can also toggle to show "All Datasets" or "This Dataset" to control
whether to show all runs for your organization versus only runs for the dataset
you are currently viewing:

.. image:: /images/plugins/operators/runs/runs_this_vs_all.png

.. _enterprise-runs-searching:

Searching
^^^^^^^^^

You can also use the search functionality to filter the list of runs by
keyword. As you type your query in the search box, the list of runs will be
updated to show only the runs matching your query:

.. image:: /images/plugins/operators/runs/runs_search.png

.. note::

    Search is case-sensitive and you can currently only search by operator
    name, not label. For example, the search "bright" does not match against
    the label "compute_brightness" in the image above but instead the operator
    URI "@voxel51/panels/compute_brightness".

.. _enterprise-runs-re-running:

Re-running
^^^^^^^^^^

From the Runs page, you can trigger a re-run of any run by clicking the kebab
menu and selecting "Re-run":

.. image:: /images/plugins/operators/runs/run_re_run.png

.. _enterprise-runs-pinning:

Pinning
^^^^^^^

Pinned runs are displayed to the right of the runs table. By default, five
pinned runs will be displayed, and if there are more than five pinned runs, you
will see a button to expand the list.

To pin a run, hover over its row in the runs table and click the pin icon that
appears beside the operator label:

.. note::

    Pinned runs are stored at the dataset-level and will be visible to all
    users with access to that dataset.

.. image:: /images/plugins/operators/runs/run_pinning.png

.. image:: /images/plugins/operators/runs/runs_pinned_sidebar.png

.. _enterprise-runs-renaming:

Renaming
^^^^^^^^

When delegating an operation multiple times on the same dataset, you may wish
to give the runs custom labels so that you can easily identify each run later.

To edit the label of an operator run, move your mouse cursor over the label of
interest and click the pencil button as indicated by “1” below. This will
present an input field indicated by “2” where you can update the label to the
text of your choice. Once you are ready to apply changes, click the save button
indicated by “3”:

.. image:: /images/plugins/operators/runs/run_rename.png

.. _enterprise-runs-mark-as-failed:

Mark as failed
^^^^^^^^^^^^^^

If a delegated operation run terminates unexpectedly without reporting failure,
you can manually mark it as failed from the Runs page.

To mark a run as failed, click the three dots indicated by "1". Then, in the
menu, click "Mark as failed" as indicated by "2". The run status will be
updated and will now display as failed:

.. image:: /images/plugins/operators/runs/runs_mark_as_failed.png

.. warning::

    If the delegated operation is, in fact, still in progress in your
    orchestrator, marking the run as failed **will not** terminate the
    execution of operation. It will continue executing until completion but the
    operation will be marked as failed regardless of its outcome.

.. _enterprise-runs-monitoring-progress:

Monitoring progress
^^^^^^^^^^^^^^^^^^^

Delegated operations can optionally
:ref:`report their progress <operator-reporting-progress>` during execution.

If progress is available for a run, it will be displayed in the Runs table as
indicated by “2”.

By default, the general status of a run and the progress of running operations
is automatically refreshed. You can disable the auto-refresh of running
operations by toggling the auto-refresh setting indicated by “1”.

.. image:: /images/plugins/operators/runs/runs_running_basic.png

.. image:: /images/plugins/operators/runs/runs_progress_enabled.png

.. _enterprise-run-page:

Run page
--------

The Run page for a specific run allows you to see information about a specific
delegated operation, including its inputs, outputs, logs, and errors.

You can visit the Run page for a run by clicking on the run in the runs table,
the Pinned runs section, or the Recent runs widgets.

.. _enterprise-run-page-input:

Input
^^^^^

The Input tab on the Run page lets you see the input parameters that were
provided when the delegated operation was scheduled:

.. image:: /images/plugins/operators/runs/run_input_general.png

By default, a rendered version of input parameters is displayed, similar to
what is displayed when invoking an operator via a prompt modal. However, you
can switch to raw format by clicking the "Show raw" toggle button:

.. image:: /images/plugins/operators/runs/run_input_raw.png

.. _enterprise-run-page-output:

Output
^^^^^^

The Output tab on the Run page lets you see the rendered output of a delegated
operation that has completed, if there is any:

.. image:: /images/plugins/operators/runs/run_output.png

.. _enterprise-run-page-errors:

Errors
^^^^^^

The Errors tab on the Run page will appear if the run failed, and it will
display the error message and stack trace that occurred:

.. image:: /images/plugins/operators/runs/run_error.png

.. _enterprise-run-page-logs:

Logs
^^^^

The Logs tab on the Run page allows you to view available logs associated with
a delegated operation:

.. image:: /images/plugins/operators/runs/logs_general.png

**Viewing logs**

Once log storage is configured, logs will automatically appear in the Logs tab
of a run once they are available:

.. note::

    Logs are currently only available *after* the run completes.

.. image:: /images/plugins/operators/runs/logs_not_available_pre_completion.png

.. image:: /images/plugins/operators/runs/logs_not_available_general.png

**Logs structure**

Logs are displayed in a tabular format as pictured below, including the
timestamp, severity, and message associated with each log entry:

.. image:: /images/plugins/operators/runs/logs_general_with_columns.png

For logs that exceed 1MB, no content will be shown and instead a
"Download logs" button will appear:

.. image:: /images/plugins/operators/runs/logs_too_large.png

**Downloading logs**

You can directly download the logs for a delegated operation from both the Runs
table and the operation's Run page:

.. image:: /images/plugins/operators/runs/logs_download_runs_list_kebab.png

.. image:: /images/plugins/operators/runs/logs_download_preview_pane.png

**Logs setup**

Viewing run logs for delegated operations requires some one-time
deployment-level configuration.

A deployment admin on your team will need to explicitly define log generation
behavior for your orchestrator(s). We provide simple setup instructions for the
two deployment configurations we support for the
:ref:`builtin orchestrator <enterprise-delegated-orchestrator>`:

-   `Helm instructions <https://github.com/voxel51/fiftyone-teams-app-deploy/blob/main/helm/docs/configuring-delegated-operators.md>`_
-   `Docker instructions <https://github.com/voxel51/fiftyone-teams-app-deploy/blob/main/docker/docs/configuring-delegated-operators.md>`_

.. image:: /images/plugins/operators/runs/logs_configure_not_setup.png

.. note::

    If you are using a third-party orchestrator like Airflow, simply configure
    your orchestrator to store logs to a persistent location and then report
    this path for each run via the `log_path` argument.

.. _enterprise-run-page-view:

View
^^^^

The View tab on the Run page lets you see the specific view (which could be the
full dataset) on which the operation was performed:

.. image:: /images/plugins/operators/runs/run_view.png
