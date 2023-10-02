.. _teams-plugins:

FiftyOne Teams Plugins
======================

.. default-role:: code

Admins can upload, manage, and configure permissions for plugins when users
log into your central Teams UI.

.. note::

    See :ref:`fiftyone-plugins` for more information about creating
    and downloading existing plugins.

Plugin Page
___________

Admins can access the plugin page can be found under Settings > Plugins.
It displays a listing of all installed plugins and their operators, as well as
status and permissions of each.

.. image:: /images/teams/plugins_page.png
   :alt: teams-plugins-page
   :align: center

.. _teams-plugins-install:

Installing a Plugin
___________________

Admins can install plugins via the Teams UI or Python SDK.

Teams UI
--------

To install a plugin, first click the "Install plugin" button on the plugins
page.

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

Alternatively, you can use the
:meth:`upload_plugin() <fiftyone.management.plugin.upload_plugin>` method from
the Management SDK:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    fom.upload_plugin("/path/to/plugin_dir")

.. _teams-plugins-upgrade:

Upgrading a Plugin
__________________

Admins can upgrade plugins through the Teams UI or Python SDK.

Teams UI
--------

To upgrade a plugin, click the plugin's dropdown and select "Upgrade plugin".

.. image:: /images/teams/plugins_upgrade_btn.png
   :alt: teams-plugins-page-upgrade-btn
   :align: center

Then upload or drag and drop the plugin contents as a ZIP file and click
upgrade.

.. image:: /images/teams/plugins_upgrade_page.png
   :alt: teams-plugins-page-upgrade-page
   :align: center

.. note::

    If the `name` attribute within the uploaded plugin's `fiftyone.yaml` config
    doesn't match the existing plugin, a new plugin will be created. Simply
    delete the old one.

You should then see a success message and the updated information about the
plugin on the plugins page.

.. image:: /images/teams/plugins_upgrade_success_page.png
   :alt: teams-plugins-page-upgrade-success-page
   :align: center

SDK
---

Alternatively, you can use the
:meth:`upload_plugin() <fiftyone.management.plugin.upload_plugin>` method from
the Management SDK with the `overwrite=True` option:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    fom.upload_plugin("/path/to/plugin_dir", overwrite=True)

.. _teams-plugins-uninstall:

Uninstalling a Plugin
_____________________

Admins can uninstall plugins through the Teams UI or Management SDK.

.. note::

    Did you know? You can
    :ref:`enable/disable plugins <teams-plugins-enable-disable>` rather than
    permanently uninstalling them.

.. warning::

    Uninstalling a plugin is permanent! However, you can always
    :ref:`install <teams-plugins-install-ui>` the plugin again later.

Teams UI
--------

To uninstall a plugin, click the plugin's dropdown and select
"Uninstall plugin".

.. image:: /images/teams/plugins_uninstall_btn.png
   :alt: teams-plugins-page-uninstall-btn
   :align: center

SDK
---

Alternatively, you can use the
:meth:`delete_plugin() <fiftyone.management.plugin.delete_plugin>` method from
the Management SDK:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    fom.delete_plugin(plugin_name)

.. _teams-plugins-enable-disable:

Enabling/Disabling
__________________

Teams UI
---------

When plugins are first installed into Teams, they are enabled by default, along
with any contained operators. To disable a plugin and all of its operators,
toggle the enabled / disabled switch.

.. image:: /images/teams/plugins_disable.png
   :alt: teams-plugins-page-disable
   :align: center

To disable or re-enable a particular operator within a plugin, first click on
the plugin's operators section to open the operator settings window. All
operators will be listed.

.. image:: /images/teams/plugins_operators_btn.png
   :alt: teams-plugins-page-operators-btn
   :align: center

Then toggle the enabled / disabled switch for the operator you wish to change.

.. image:: /images/teams/plugins_operators_disable.png
   :alt: teams-plugins-page-operators-disable
   :align: center

SDK
---

Alternatively, you can use the
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

Permissions
___________

Admins can optionally configure access to plugins and individual operators
within them via any combination of the permissions described below:

.. table::

    +-------------------------------+----------------------------------------------------------------------------+
    | Permission                    | Description                                                                |
    +===============================+============================================================================+
    | Minimum Role                  | The minimum role a user must have to perform the operation.                |
    +-------------------------------+----------------------------------------------------------------------------+
    | Minimum Dataset Permission    | The minimum dataset permission a user must have to perform the operation   |
    |                               | in the context of a particular dataset.                                    |
    +-------------------------------+----------------------------------------------------------------------------+

Teams UI
--------

To configure the permissions for an operator, first click on the plugin's
operators section.

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

You can also use the
:meth:`set_plugin_operator_permissions() <fiftyone.management.plugin.set_plugin_operator_permissions>`
method from the Management SDK:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    # Set minimum role permission only
    fom.set_plugin_operator_enabled(
        plugin_name,
        operator_name,
        minimum_role=fom.MEMBER
    )

    # Set minimum dataset permission only
    fom.set_plugin_operator_enabled(
        plugin_name,
        operator_name,
        minimum_dataset_permission=fom.EDIT
    )

    # Set both minimum role and minimum dataset permissions
    fom.set_plugin_operator_enabled(
        plugin_name,
        operator_name,
        minimum_role=fom.EDIT,
        minimum_dataset_permission=fom.EDIT
    )

Default Operator Permissions
----------------------------

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

Alternatively, you can use the
:meth:`set_organization_settings() <fiftyone.management.organization.set_organization_settings>`
method from the Management SDK:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    fom.set_organization_settings(
        default_operator_minimum_role=fom.MEMBER,
        default_operator_minimum_dataset_permission=fom.EDIT,
    )

.. _teams-plugins-managing-operators-runs:


Setting up an Orchestrator to run Delegated Operations
______________________________________________________

Once an operation has been queued for remote (delegated) execution, it will remain queued until an Orchestrator picks
it up and runs the execute method.

We recommend using Apache Airflow as the Orchestrator, but other options are available, such as Flyte.

To set up Airflow as an Orchestrator to run delegated operations, you will need to:

- Provision a VM or instance with enough resources to run the operations you want to delegate

- Install `Apache Airflow <https://airflow.apache.org/docs/apache-airflow/stable/installation/index.html>`_ on the VM

- Install the same version of FiftyOne as the instance of FiftyOne which queued the operation

- Ensure the required Environment Variables are set

- Install the `FiftyOne Airflow DAG <https://github.com/voxel51/fiftyone-plugins/blob/main/dags/airflow/check_delegated_operations.py>`_ on the Orchestrator.

- Schedule a Operation!

.. note:: Configure FiftyOne on the Orchestrator to use the same `FIFTYONE_DATABASE_URI` as the instance of FiftyOne which queued the operation

.. note:: Ensure that the plugins are available to the Orchestrator, either by installing them on the same machine or by making them available via a shared filesystem



Setting up a FiftyOne Orchestrator on Google Compute Engine
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Provision a VM with the resources required to run the operations you want to delegate. Take note of the IP of the VM,
you'll need it in a later step.

See the :ref:`Media Cache Config<teams-media-cache-config>` section for more information on the resources required.

SSH into the instance, ensure the packages are up to date, and install python

.. code-block:: bash

    sudo apt-get update
    sudo apt upgrade
    sudo apt install python3-pip

**Install Airflow**

.. code-block:: bash

    pip install apache-airflow[gcp]

ensure a successful install by checking the version

.. code-block:: bash

    airflow version

Initialize the airflow db and create a user

.. code-block:: bash

    airflow db init
    airflow users create -r Admin -u <username> -p <password> -e <email> -f <first name> -l <last name>

.. note:: This username and password will be the account you use to log into the airflow interface in a later step.

Start Aiflow

Open 2 more ssh sessions, and start the webserver and scheduler in each.

.. note:: You could run these commands with the `-D` flag to run them in the background, but we recommend running them in the foreground for debugging purposes.

.. code-block:: bash

    airflow webserver -p 8080
    airflow scheduler

.. note:: you could start airflow on the port of your choice, but ensure that the firewall rules allow traffic on that port.

**Add the Firewall Rule**

Navigate to the networking / firewall rules section of the google cloud console and allow traffic on that port for the
VM.

Once this is done, you should be able to navigate to the airflow interface at `http://<vm ip>:8080` (or the port you
chose) and log in with the credentials you created earlier.

**Mount the Plugins Directory**

The orchestrator must have the same plugins available to it as the instance which queued the operation. This could be
accomplished by either installing the plugins on the orchestrator, or by mounting the plugins directory from the
instance which queued the operation.

To mount the plugins directory, locate the ip of the nfs server then run the following commands on the orchestrator:

.. code-block:: bash

    sudo mkdir -p /mnt/nfs/shared
    sudo mount -t nfs -o vers=4,rw,intr <ip of the nfs server>:/path/to/plugins /mnt/nfs/shared

You might also want to add the same command to your startup tasks, located in `etc/fstab`

.. code-block:: bash

    sudo pico /etc/fstab

paste the following and save

.. code-block:: bash

        <ip of the nfs server>:/path/to/fiftyone-plugins /mnt/nfs/shared/ nfs vers=4,rw,intr 0 0

the path to the plugins should now be available at `/mnt/nfs/shared/plugins`. to test this, run the following command:

.. code-block:: bash

    ls /mnt/nfs/shared/plugins


This path will be added to the environment variables as `FIFTYONE_PLUGINS_DIR` in a following step.


**Install FiftyOne**

Ensure the keyring is installed

.. code-block:: bash

    pip install keyrings.google-artifactregistry-auth


Install FiftyOne

.. code-block:: bash

    INDEX_URL="https://us-central1-python.pkg.dev/computer-vision-team/dev-python/simple/"
    pip --no-cache-dir install --extra-index-url "${INDEX_URL}" fiftyone


Add the FiftyOne Env Vars

.. code-block:: bash

    pico ~/.profile

Add the following lines to the bottom of the file, replacing the values with the appropriate values for your deployment.

.. code-block:: bash

    export FIFTYONE_DATABASE_NAME=<database name>
    export FIFTYONE_DATABASE_URI=<mongo db uri>
    export FIFTYONE_PLUGINS_DIR=<mounted plugins dir> # /mnt/nfs/shared/plugins
    export FIFTYONE_ENCRYPTION_KEY=<encryption key>
    export FIFTYONE_INTERNAL_SERVICE=1
    export FIFTYONE_API_KEY=<api key>
    export API_URL=<api url>

.. note:: Configure FiftyOne on the Orchestrator to use the same `FIFTYONE_DATABASE_URI` as the instance of FiftyOne which queued the operation

.. note:: These values will mostly be the same as the as the instance of FiftyOne which queued the operation


**Add the Airflow DAG**

check the default dags path by running the following command:

.. code-block:: bash

    airflow config list | grep dags_folder

.. note:: The default dag folder path is `/home/<user>/airflow/dags`

navigate to the dag folder and add the default airflow dag from the fiftyone-plugins repo, located at:
`FiftyOne Airflow DAG <https://github.com/voxel51/fiftyone-plugins/blob/main/orchestrators/airflow/run_delegated_operations.py>`_

Open the airflow interface and ensure that the "Check Delegated Operations" DAG is visible. Any issues should be
immediately visible as errors. Locate the dag and toggle it on, then refresh to make sure it's running. If no operations
have been queued, it will still run a check and all runs should be green.

.. image:: /images/teams/airflow.png
   :alt: airflow-dag
   :align: center

..note:: The Orchestrator will need to have all of the required dependencies installed for running the plugins.
For example, if running the compute visualizations plugin, the orchestrator will need the `torch` and `torchvision`
packages installed.

**Running Delegated Parallel Operations**

Considerations should be taken when running parallel delegated operations, as concurrency issues may arise. For example,
if two operations are running on the same dataset, the results may be unpredictable.

Or, if the same operator is running in multiple operations, and that operator needs to download a model or other
artifacts to a specific location, collisions could arise.

With this said, it is possible to run operations in parallel on your orchestrator, but you should ensure that,
at the very least, the operations are not writing to the same dataset.

An example Airflow DAG which runs operations in parallel, and ensures only a single dataset is written to at a time,
exists here:
`FiftyOne Airflow Parallel Operations DAG <https://github.com/voxel51/fiftyone-plugins/blob/main/orchestrators/airflow/run_parallel_delegated_operations.py>`_

The out of the box airflow installation will use a `SequentialExecutor` by default. Information about the Sequential
Executor can be found here: `Sequential Executor <https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/executor/sequential.html>`_
This executor will run only one task insance at a time.

To run operations in parallel, you will need to configure Airflow to use a different executor. The `CeleryExecutor` is
a recommended executor for running production operations in parallel. Information about the Celery Executor can be found here:
`Celery Executor <https://airflow.apache.org/docs/apache-airflow/stable/executor/celery.html>`_



Managing Delegated Operator Runs
________________________________


The FiftyOne Teams runs page allows you to monitor and explore operator runs
scheduled by any member of your organization.


.. Scheduling an operator run
.. --------------------------

.. When invoking an delegated operator, you will see the `Schedule` (instead
.. of the `Execute`) button to indicate that operator will run in delegated mode

.. .. image:: /images/plugins/operators/runs/prompt.png


Runs page
---------

The "Runs" page is accessible to all users with :ref:`Can view <teams-can-view>`
access to the dataset.

You can access the "Runs" page by clicking the `Runs` from
:ref:`Samples tab <teams-using-datasets>`.

Once you are on the "Runs" page, you will see a table with the list of all
operators scheduled by any member of your organization. You can sort, search
and filter runs listed to refine the list as you like.

The image below provides a peek of the "Runs" page. The list will display the
label and name of an operator, status, timestamp of current status, and the name
of a user that scheduled a run. On the right side of the "Runs" page, you will
see pinned and recently updated runs in your organization. 

.. note::

    This page is not auto-refreshed. You must manually reload the page to see
    updates.


.. image:: /images/plugins/operators/runs/runs_page.png

Sorting
^^^^^^^

By default, the runs table is sorted by newest to oldest. You can use the
drop-down menu in the upper left of table to sort the list of runs by updated
time of a run and the name of an operator.

.. image:: /images/plugins/operators/runs/sort.png

Filtering
^^^^^^^^^

You can filter runs table to see a subset of runs

**Showing only your runs**

You can use the "My runs" radio button to see only the runs that you scheduled.

.. image:: /images/plugins/operators/runs/my_runs.png

**By status**

Additionally, you can further refine the list of runs using the status
drop-down which allows you to select one or more status you would like to filter
by.

.. image:: /images/plugins/operators/runs/filter_by_status.png

Searching
^^^^^^^^^

In addition, you can also use the search functionality to filter the list of
runs by a keyword. As you type your query in the search box, the list of runs
will be updated to show only the runs matching your query

.. note::

    The search is case-sensitive and you can only search by the operator name
    associated with a run. Searching by operator label is not supported (i.e.,
    **Demo: Export to GCP** in example image below).

.. image:: /images/plugins/operators/runs/search_by_name.png

Retrying
^^^^^^^^

From the "Runs" page, you can trigger retry any of the listed runs. To retry a
run, click the three-dots to open actions menu for a run, then click `Re-run`

.. image:: /images/plugins/operators/runs/re_run.png


Pinning
^^^^^^^

Pinned runs are displayed to the right of runs table. By default, five pinned
runs will be displayed. However, if there are more than five pinned runs, you
will see a button to see the hidden pinned runs.

To pin a run, hover over a run in runs table and click the pin icon which will
appear beside the operator label of a run.

.. image:: /images/plugins/operators/runs/pinning.png

.. note::

    Pinned runs are identical for all users in your organization.

Run page
--------

The "Run" page allows you to see input, output, view, and error of each run.

You can visit the "Run" page for a run by clicking on a run in the runs table
or in the list of runs under "Pinned runs" and "Recent runs".

Input
^^^^^

The "Input" tab on the "Run" page lets you see the input parameters that were
provided when the run was scheduled.

.. image:: /images/plugins/operators/runs/input.png

**Raw input**

By default, a preview (similar to what is displayed when invoking an operator)
of input parameters is displayed. However, you can switch to raw by clicking the
`Show raw` toggle button.

.. image:: /images/plugins/operators/runs/raw_input.png

Output
^^^^^^

The "Output" tab on the "Run" page lets you see the preview of the result of a
completed run.

.. note::
    Output tab is only available for completed run

.. image:: /images/plugins/operators/runs/output.png

Errors
^^^^^^

The "Errors" tab on the "Run" page lets you see the errors occurred of a failed
run.

.. note::
    Errors tab is only available for failed run

.. image:: /images/plugins/operators/runs/errors.png


View
^^^^
The "View" tab on the "Run" page lets you see the view parameters that were
included in operator context when the run was scheduled.

.. image:: /images/plugins/operators/runs/view.png
