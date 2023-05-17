.. _teams-plugins:

FiftyOne Teams Plugins
======================

.. default-role:: code

.. note::
    See :ref:`FiftyOne Plugins documentation <fiftyone-plugins>` for
    more on how to use and create your own plugins and operators!

Using Fiftyone Teams, administrators can upload a zip file containing their
JS or Python plugins. After a plugin is created within Fiftyone Teams, an
administrator can enable or disable the plugin. They can also define
permissions required to execute python operators.

.. note::
    Only Admin users will be able to see the plugin page or execute any
    plugin management operations.

Plugin Page
___________

The plugin page can be found under Settings > Plugins.
It displays a listing of all installed plugins and their operators, as well as status
and permissions of each.

.. image:: /images/teams/plugins_page.png
   :alt: teams-plugins-page
   :align: center

Installing a Plugin
___________________

Admins can install a plugin through the Teams UI or Management SDK.

.. _teams-plugins-install-ui:

Teams UI
---------
To install a plugin, first click the "Install plugin" button
on the plugins page.

.. image:: /images/teams/plugins_install_btn.png
   :alt: teams-plugins-page-install-button
   :align: center

Then upload or drag and drop the plugin contents as a ZIP file and click install.

.. image:: /images/teams/plugins_install.png
   :alt: teams-plugins-page-install-page
   :align: center

You should then see a success message and the newly installed plugin listed on the plugins page.

.. image:: /images/teams/plugins_install_success.png
   :alt: teams-plugins-page-install-success-page
   :align: center

CLI
----

``!!!!! TBD !!!!!!!``

Troubleshooting
----------------

``!!!!! TBD !!!!!!!``

Upgrading a Plugin
___________________

Admins can upgrade a plugin through the Teams UI or Management SDK.

Teams UI
---------

To upgrade a plugin, click the plugin's dropdown and select "Upgrade plugin".

.. image:: /images/teams/plugins_upgrade_btn.png
   :alt: teams-plugins-page-upgrade-btn
   :align: center

Then upload or drag and drop the plugin contents as a ZIP file and click upgrade.
This is a similar process as :ref:`installing a plugin <teams-plugins-install-ui>`

.. image:: /images/teams/plugins_upgrade_page.png
   :alt: teams-plugins-page-upgrade-page
   :align: center

.. note::
    If the `name` attribute within the uploaded plugin's `fiftyone.yaml` config
    doesn't match the existing plugin, a new plugin will be created. Simply delete
    the old one.

You should then see a success message and the updated information about the
plugin on the plugins page.

.. image:: /images/teams/plugins_upgrade_success_page.png
   :alt: teams-plugins-page-upgrade-success-page
   :align: center

CLI
----
``!!!!! TBD !!!!!!!``

Uninstalling a Plugin
______________________

Admins can uninstall a plugin through the Teams UI or Management SDK.

.. note::
    If you want to disable a plugin instead of uninstalling, see
    :ref:`Enabling / Disabling <teams-plugins-enable-disable>`.

.. warning::
    Uninstalling a plugin is permanent! However, you can always
    :ref:`install <teams-plugins-install-ui>`
    the plugin again with the source directory / ZIP file.

Teams UI
---------

To uninstall a plugin, click the plugin's dropdown and select "Uninstall plugin".

.. image:: /images/teams/plugins_uninstall_btn.png
   :alt: teams-plugins-page-uninstall-btn
   :align: center

CLI
----
``!!!!! TBD !!!!!!!``

.. _teams-plugins-enable-disable:

Enabling / Disabling
____________________

Teams UI
---------

When plugins are first installed into Teams, they are enabled by default, along
with any contained operators. To disable a plugin and all of its operators,
toggle the enabled / disabled switch.

.. image:: /images/teams/plugins_disable.png
   :alt: teams-plugins-page-disable
   :align: center

To disable or re-enable a particular operator within a plugin, first click on the
plugin's operators section to open the operator settings window. All operators
will be listed.

.. image:: /images/teams/plugins_operators_btn.png
   :alt: teams-plugins-page-operators-btn
   :align: center

Then toggle the enabled / disabled switch for the operator you wish to change.

.. image:: /images/teams/plugins_operators_disable.png
   :alt: teams-plugins-page-operators-disable
   :align: center

CLI
----
``!!!!! TBD !!!!!!!``


Permissions
___________

Enabled plugin operators can be run by FiftyOne Teams users if they have the
permissions to do so. There are two configurable components to the operator
permission model, which can be updated separately for each operator.

Minimum Role
    The minimum role a user must have to perform the operation.

Minimum Dataset Permission
    The minimum dataset permission a user must have to perform the operation
    in the context of a particular dataset.

.. note::
    Only operators can have usage permissions attached to them; plugins themselves
    are open to all users if enabled.

Teams UI
---------
To change the setting of minimum role or minimum dataset permission for an operator,
first click on the plugin's operators section to open the operators window.

.. image:: /images/teams/plugins_operators_btn.png
   :alt: teams-plugins-page-operators-btn
   :align: center

Then change the dropdown for the operator to reflect the desired permission level.

.. image:: /images/teams/plugins_operators_perms.png
   :alt: teams-plugins-page-operators-perms
   :align: left
   :width: 49%

.. image:: /images/teams/plugins_operators_perms2.png
   :alt: teams-plugins-page-operators-perms2
   :align: right
   :width: 49%

CLI
----
``!!!!! TBD !!!!!!!``

Default Operator Permissions
-----------------------------
When a new plugin is installed, any operators it contains will be initialized
with values for minimum role and minimum dataset permissions. By default,
these values are set to:

+-------------------------------+--------+
| Minimum Role                  | Member |
+-------------------------------+--------+
| Minimum Dataset Permission    | Edit   |
+-------------------------------+--------+

These settings can be changed for any newly installed plugins by changing the
organization-wide setting.

First you navigate to the page at Settings > Security and look under the Plugins
header. Then click the dropdown for the permission you want to change and select
the new value.

.. image:: /images/teams/plugins_org_settings.png
   :alt: teams-plugins-page-org-settings
   :align: center
