fiftyone.plugins
================

.. js:module:: fiftyone.plugins

Hooks
-----

.. _fos.@fiftyone/fiftyone.@fiftyone/plugins.useActivePlugins:

useActivePlugins
~~~~~~~~~~~~~~~~

.. js:function:: useActivePlugins(type, ctx)


   :param type:
   :param ctx:
   :type type: PluginComponentType
   :type ctx: any
   :rtype: ``Array<`` :js:class:`fiftyone.plugins.PluginComponentRegistration` ``<`` ``Any`` ``>`` ``>``

A react hook that returns a list of active plugins.

**Returns**

A list of active plugins

.. _fos.@fiftyone/fiftyone.@fiftyone/plugins.usePlugin:

usePlugin
~~~~~~~~~

.. js:function:: usePlugin(type)


   :param type:
   :type type: PluginComponentType
   :rtype: ``Array<`` :js:class:`fiftyone.plugins.PluginComponentRegistration` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/plugins.usePluginSettings:

usePluginSettings
~~~~~~~~~~~~~~~~~

.. js:function:: usePluginSettings(pluginName, defaults)


   :param pluginName:
   :param defaults:
   :type pluginName: string
   :type defaults: Partial < T >
   :rtype: :js:class:`fiftyone.plugins.T`

.. _fos.@fiftyone/fiftyone.@fiftyone/plugins.usePlugins:

usePlugins
~~~~~~~~~~

.. js:function:: usePlugins()

   :rtype: ``Object``

A react hook for loading the plugin system.

Functions
---------

.. _fos.@fiftyone/fiftyone.@fiftyone/plugins.getByType:

getByType
~~~~~~~~~

.. js:function:: getByType(type)


   :param type:
   :type type: PluginComponentType
   :rtype: ``Array<`` ``any`` ``>``

Get a list of plugins match the given `type`.

**Returns**

A list of plugins

.. _fos.@fiftyone/fiftyone.@fiftyone/plugins.loadPlugins:

loadPlugins
~~~~~~~~~~~

.. js:function:: loadPlugins()

   :rtype: ``Promise < void >`` ``<`` ``void`` ``>``

.. _fos.@fiftyone/fiftyone.@fiftyone/plugins.registerComponent:

registerComponent
~~~~~~~~~~~~~~~~~

.. js:function:: registerComponent(registration)


   :param registration:
   :type registration: PluginComponentRegistration < T >
   :rtype: ``void``

Adds a plugin to the registry. This is called by the plugin itself.

.. _fos.@fiftyone/fiftyone.@fiftyone/plugins.unregisterComponent:

unregisterComponent
~~~~~~~~~~~~~~~~~~~

.. js:function:: unregisterComponent(name)


   :param name:
   :type name: string
   :rtype: ``void``

Remove a plugin from the registry.

Types
-----

.. _fos.@fiftyone/fiftyone.@fiftyone/plugins.PluginComponentRegistration:

PluginComponentRegistration
~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. js:class:: PluginComponentRegistration


A plugin registration.

Properties
^^^^^^^^^^

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "activator",":js:class:`fiftyone.plugins.PluginActivator`","A function that returns true if the plugin should be active"
  "component","``FunctionComponent < T >`` ``<`` :js:class:`fiftyone.plugins.T` ``>``","The React component to render"
  "label","``string``","The optional label of the plugin to display to the user"
  "name","``string``","The name of the plugin"
  "type",":js:class:`fiftyone.plugins.PluginComponentType`","The plugin type"

Enums
-----

.. _fos.@fiftyone/fiftyone.@fiftyone/plugins.PluginComponentType:

PluginComponentType
~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Value
  :widths: 1 1
  :align: left

  "Plot"
  "Visualizer"
