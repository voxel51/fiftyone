.. _teams-plugins:

FiftyOne Teams Plugins
======================

.. default-role:: code

Admins can upload, manage, and configure permissions for plugins when users
log into your central Teams UI.

.. note::

    See :ref:`this page <fiftyone-plugins>` for more information about creating
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

but these defaults can be configured by navigating to the page at
Settings > Security and looking under the Plugins header. Click the dropdown
for the permission you want to change and select the new value.

.. image:: /images/teams/plugins_org_settings.png
   :alt: teams-plugins-page-org-settings
   :align: center

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
