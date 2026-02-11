.. _fiftyone-annotation:
In-App Annotation
==================

Overview
--------

This guide will walk you through the basics of FiftyOne's in-App annotation features.

Currently in-App annotation is designed for ad hoc, sample-by-sample metadata editing. The features and controls extend FiftyOne's existing data visualization UI. Once you have samples loaded into a FiftyOne dataset, you can begin defining your Annotation Schema and labeling your data in the App.

----

Basics
------

Supported Media and Label Types
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

To perform in-App annotation, your dataset must contain at least one of the following media and label types:

* `media_type <https://docs.voxel51.com/user_guide/using_datasets.html#media-type>`_

  * ``image``
  * ``3D``

* `Labels <https://docs.voxel51.com/user_guide/basics.html#labels>`_

  * ``Classification``
  * ``Classifications``
  * ``Detections``
  * ``3D Polylines``
  * ``3D Cuboids``

Annotation UI: Sample Visualizer
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

All in-App annotation controls now live in the `expanded view for samples <https://docs.voxel51.com/user_guide/app.html#viewing-a-sample>`_. Open a sample in the expanded view, and find the new "Annotate" tab in the right sidebar.

.. image:: /_static/images/annotation/image1.gif
   :alt: Annotate tab location

Saving and Reverting Changes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

When you make changes to sample metadata with FiftyOne's in-App annotation, your changes automatically save to the database. The auto-save functionality triggers either explicitly after an action (e.g., deleting a label) or after a short period of time (e.g., updating the spatial properties of a bounding box multiple times in succession), depending on the action.

You can tell whether your changes are saved or are in the process of being saved thanks to this indicator:

.. todo:: Screenshot needed

Undo/Redo
^^^^^^^^^

.. image:: /_static/images/annotation/image2.png
   :alt: Undo/Redo buttons

While editing metadata, you can undo and redo actions using the buttons in the upper-right corner of the "Annotate" panel, or via ``Ctrl+``/``Cmd+z`` and ``Ctrl+``/``Cmd+y``. Your changes included in the undo stack are limited to your active annotation session, i.e., while the expanded view remains open.

----

User Guide
----------

.. _schema-import-management:

Schema Import / Management
~~~~~~~~~~~~~~~~~~~~~~~~~~~

To perform in-App annotation, your dataset must first have an "Annotation Schema". For a field, attribute, or value to be available in in-App annotation, it must be present in the Annotation Schema. Currently, you may only have one Annotation Schema per dataset, and your Annotation Schema applies across all samples and views on the dataset.

.. warning::
   Only users with `"Can manage" access <https://docs.voxel51.com/enterprise/roles_and_permissions.html#can-manage>`_ to a dataset may import and manage the Annotation Schema on that dataset.

.. image:: /_static/images/annotation/image3.png
   :alt: Create Annotation Schema button

When accessing the "Annotate" tab in the expanded view on a dataset for the first time, you'll see a button to create the Annotation Schema. By default, **no** `fields in the dataset schema <https://docs.voxel51.com/user_guide/using_datasets.html#fields>`_ are included automatically in the Annotation Schema; you'll need to explicitly add fields, attributes, and values.

Supported Field Types
^^^^^^^^^^^^^^^^^^^^^

FiftyOne's in-App annotation supports two groups of field types: **label-type** fields (e.g., ``Detections`` or ``Classification``) and non-label-type **primitive** fields (e.g., ``StringField``\s or ``IntField``\s). Your Annotation Schema can be a mix of fields within these groups. The parameters available for configuring fields' schemas in your Annotation Schema will depend on the type of field (see: :ref:`annotation-schema-format`).

.. _schema-manager:

Schema Manager
^^^^^^^^^^^^^^

The "Schema Manager" user interface defines the Annotation Schema for the dataset. The main page of the Schema Manager features two sections: "Active fields" and "Hidden fields".

"Active fields" are fields included in your Annotation Schema.

"Hidden fields" are all fields not yet included in your Annotation Schema, but that can be activated for your Annotation Schema. To activate (a) field(s) for your Annotation Schema, check the box next to the field(s) you want, then click "Move…to active fields".

.. _ordering-in-the-annotation-schema:

Ordering in the Annotation Schema
""""""""""""""""""""""""""""""""""

Across the Schema Manager you'll see handles to drag-and-drop ``fields``, ``classes``, ``attributes``, and ``values`` within sections. You can reorder this information to update how values appear in the "Annotate" tab of the sample expanded view.

For example, reordering a primitive field ``foo`` above another primitive field ``bar`` will cause ``foo`` to appear above ``bar`` in the :ref:`list of primitives in the "Annotate" tab <list-of-primitives>`.

Configuring a Field Schema
^^^^^^^^^^^^^^^^^^^^^^^^^^^

Before you can add a field to the Annotation Schema, you must first configure its schema. Click the ✏️ icon on any field in the Schema Manager (including both the "Active fields" and "Hidden fields" sections) to open the "Edit field schema" page and configure that field's schema.

You can compose a field's schema from scratch, or scan all samples across the dataset to import metadata. If you choose to scan the dataset, you may edit the results of that scan before saving the schema.

.. warning::
   Because scanning for metadata looks at samples across your entire dataset, it could take a few seconds or minutes.

The "Edit field schema" page includes two ways for you to configure the field's schema: GUI or JSON. Both interfaces represent the same data model, and any updates you make in one interface should update the data model's representation in the other interface in realtime.

.. _annotation-schema-format:

Annotation Schema Format
""""""""""""""""""""""""

The in-App Annotation Schema format is borrowed from `FiftyOne's existing label_schema format <https://docs.voxel51.com/user_guide/annotation.html#label-schema>`_ (historically supported for requesting annotations from third-party backends).

For label-type fields, ``classes`` are a first-order list of classes available for selection on all instances of your label across samples in your dataset. Label-type fields also have ``attributes``, which are optional semantic properties whose values may also be edited across samples on your dataset.

For both primitive fields and ``attributes``, the following properties apply:

* ``type``: the data type (e.g., ``int``, ``str``).
* ``component``: the UI component through which values are edited on the "Annotate" tab. Available ``component``\s include:

  * ``text``: a free text field. Applicable when ``type`` is ``str``, ``int``, ``float``, or ``list``.
  * ``dropdown``: an autocomplete dropdown menu. Applicable when ``type`` is ``str``, ``int``, ``float``, or ``list``. ``values`` is required.
  * ``radio``: a radio button group. Applicable when ``type`` is ``str``, ``int`` or ``float``. ``values`` is required.
  * ``slider``: a numeric slider and numeric input boxes. Applicable when ``type`` is ``int`` or ``float``. ``range`` is required.
  * ``toggle``: a toggle where one and only one of two possible options must be selected. Applicable when ``type`` is ``bool``.
  * ``datepicker``: a calendar date picker component. Applicable when ``type`` is ``date`` or ``datetime``.
  * ``json``: an editable JSON code block. Applicable when ``type`` is ``list`` or ``dict``.

* ``values``: the list of allowed values available for selection in the ``attribute`` or ``primitive``.
* ``range``: the ``[min, max]`` values available for numeric ``type``\s, used in the ``slider``. When ``range`` is defined, ``values`` must be omitted.
* ``default``: the default value assigned to the attribute on new label instances. Not applicable to primitive fields.

**Reserved attribute names**

When configuring your field's schema, you may not use any of the following reserved key names:

* ``color``
* ``id``
* ``isNew``
* ``path``
* ``selected``
* ``sampleId``
* ``type``

Configuring with GUI
""""""""""""""""""""

Here you'll see different sections depending on whether your field is a label-type, or a non-label primitive field.

For label fields, you'll see sections for adding and editing label ``classes`` and ``attributes``. Click the "+Add class" or "+Add attribute" buttons to create new ``classes`` and ``attributes``, respectively.

For each ``class`` and ``attribute`` in the GUI:

* Click the ✏️ icon to edit its properties.
* Click the 🗑️ icon to delete.
* Drag and drop ``classes`` or ``attributes`` within sections to reorder within the Annotation Schema (see: :ref:`ordering-in-the-annotation-schema`).

For primitives, depending on your field's data type, you'll see optional and/or required properties to configure for your field's schema.

Creating New Fields
^^^^^^^^^^^^^^^^^^^

Click the "New field" button in the Schema Manager to begin creating a new field on your dataset.

On the next screen, you'll need to provide a unique name for your new field. Next, choose whether your new field should be a label-type field, or primitive. In either case, open the "Field type" dropdown menu to choose a data type for your new field.

You'll then see different sections depending on your choices. Once you are satisfied with your new field's configuration, click the "Save" button, and two things happen:

1. Your new field immediately gets written to the database
2. Your new field is added as an "Active field" in the Annotation Schema

To cancel at any time while configuring your new field, click the "Discard" button.

Bypassing Schema Configuration
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

If you do not see a field or its contents in the "Annotate" tab of the sample expanded view, and you don't want to go through the process of configuring a schema for the field and adding it to the Annotation Schema, you can bypass interacting with the Schema Manager altogether and ask the FiftyOne App to take the requisite steps on your behalf.

.. warning::
   Like the above features in :ref:`the "Schema Import / Management" section <schema-import-management>`, this bypass feature is only available to users with `"Can manage" access <https://docs.voxel51.com/enterprise/roles_and_permissions.html#can-manage>`_ on a dataset.

While on the "Explore" tab of the sample expanded view, hover over the field with objects/values you wish to edit via in-App annotation, and you'll see a ✏️ icon. When you click the ✏️ icon, if no valid schema exists yet for that field–and the field does not exist in the Annotation Schema, the following happens:

1. The App scans your dataset to impute a schema for the field
2. The App then adds your field to the Annotation Schema, using the imputed field schema
3. You are then navigated to the "Annotate" tab and placed into either an edit context for your field or a filtered :ref:`list of label instances <list-of-label-instances>`, depending on your field's type

Getting Started with Annotation
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

To access fields in the "Annotate" tab, first check the box next to the field in the "Explore" tab. Only those labels you are visualizing in the "Explore" tab will be available for in-App annotation in the "Annotate" tab.

.. image:: /_static/images/annotation/image4.png
   :alt: Explore tab field selection

While in the "Annotate" tab, the sample expanded view consists of three parts:

1. The "Annotation Canvas"
2. Annotation actions toolbar
3. List of label instances

Annotation Canvas
^^^^^^^^^^^^^^^^^

The Annotation Canvas is where you visualize your sample and interact directly with label instances using mouse and keyboard actions. We refer to the Annotation Canvas below when describing :ref:`3D <creating-3d-polylines>` and :ref:`2D <creating-a-detection-label>` label creations and edits in more detail.

You can edit an existing label instance by clicking on that label instance on the Annotation Canvas.

Annotation Actions Toolbar
^^^^^^^^^^^^^^^^^^^^^^^^^^^

The annotation actions toolbar is where you can create a new label instance or (if you are a user with "Can manage" access on the dataset; see :ref:`above <schema-import-management>`) access the Schema Manager and Annotation Schema.

.. _list-of-label-instances:

List of Label Instances
^^^^^^^^^^^^^^^^^^^^^^^^

Under the "Labels" header, you'll see a flattened list of all label instances included in fields enabled while in the "Explore" tab. You can edit an existing label instance by clicking on that label instance within the "Labels" list.

For label types with spatial properties (e.g., 2D bounding boxes), you'll notice a visual indicator highlighting label instances in both the Annotation Canvas and "Labels" list as you hover over either part of the user interface.

.. _list-of-primitives:

List of Primitives
^^^^^^^^^^^^^^^^^^

Labels are not the only type of metadata available for edits in FiftyOne's in-App annotation functionality. Primitive `fields <https://docs.voxel51.com/user_guide/basics.html#fields>`_ (e.g., ``StringField``\s or ``IntField``\s) on the dataset may also be made available in the Annotation Schema via :ref:`the Schema Manager interface <schema-import-management>`. When primitives exist in the Annotation Schema, you'll see a flattened list of all such fields under the "Primitives" header.

----

How to: 2D Label Annotation
----------------------------

Creating a Classification label
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. image:: /_static/images/annotation/image5.png
   :alt: Creating a classification

Click the "Create new classification" icon in the annotation actions toolbar to display the classification editor in the right sidebar. A field and label are required to save the new classification label. Only fields available in your schema will be displayed as options in the dropdown boxes.

.. _creating-a-detection-label:

Creating a Detection label
~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. image:: /_static/images/annotation/image6.png
   :alt: Create detection icon

Click the "Create new detection" icon in the annotation actions toolbar to enable the crosshair mouse cursor on the Annotation Canvas and display the detection editor in the right sidebar. Position the cursor at one corner of the new detection, then click and hold the mouse button while dragging diagonally to create a bounding box.

.. image:: /_static/images/annotation/image7.gif
   :alt: Drawing a bounding box

Once a bounding box has been created, it can be resized and repositioned as desired by clicking and holding any edge or corner drag handle while moving the mouse cursor. For finer adjustments, first zoom in on the image. To maintain the aspect ratio of the selection, hold down the shift key while dragging.

A field and label are required to save the new detection label. Only fields available in your schema will be displayed as options in the dropdown boxes.

Editing on the Annotation Canvas
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

A detection label's size and shape can be adjusted directly in the annotation canvas by clicking on the detection to select it, then dragging an edge or corner drag handle.

.. image:: /_static/images/annotation/image8.gif
   :alt: Editing detection on canvas

Editing in the Right Sidebar
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Labels can be selected by clicking on its bounding box or on the item in the list in the right sidebar, which will highlight the associated bounding box on the annotation canvas if the label is a detection, then clicking the chosen row. This will open the editing panel in the right sidebar.

.. image:: /_static/images/annotation/image9.gif
   :alt: Right sidebar editor

Spatial Properties
^^^^^^^^^^^^^^^^^^

.. image:: /_static/images/annotation/image10.png
   :alt: Spatial properties editor

Within the editing panel the x/y coordinates, width, and height can be adjusted. Editing the x/y coordinates and/or the width/height will display the changes in the annotation canvas. This allows finite adjustments that could be difficult with a mouse.

Attributes
^^^^^^^^^^

The editing panel also enables editing the label, tags, confidence, and index properties.

----

Working with 3D
---------------

3D Annotation Mode
~~~~~~~~~~~~~~~~~~

Supported 3D Datasets
^^^^^^^^^^^^^^^^^^^^^

3D annotation mode is only supported for ``3d`` `type datasets <https://docs.voxel51.com/user_guide/using_datasets.html#d-datasets>`_ and dataset views, or grouped datasets with ``3d`` slices.

.. note::
   ``point-cloud`` `type datasets <https://docs.voxel51.com/user_guide/using_datasets.html#point-cloud-datasets>`_ are deprecated and do not support annotation. We recommend converting them to ``3d`` type datasets.

For grouped datasets, you can use the slice selector within the Annotate tab to select the image or 3d slice you wish to annotate.

.. image:: /_static/images/annotation/image11.png
   :alt: Slice selector

Camera Projections
^^^^^^^^^^^^^^^^^^

**Pointcloud projections**

.. image:: /_static/images/annotation/image12.png
   :alt: Pointcloud projections

Projection surfaces allow you to flatten a 3D point cloud onto a 2D plane for easier annotation. You can toggle between different projection views using the dropdown menus.

**2D Image Projections**

If your dataset contains `groups <https://docs.voxel51.com/user_guide/groups.html#overview>`_, where at least one group slice contains 2D images, you'll also see those slices available for visualization in the dropdown menu.

.. image:: /_static/images/annotation/image13.png
   :alt: 2D image projections

If you have defined the necessary `camera intrinsic and extrinsic parameters <https://docs.voxel51.com/user_guide/using_datasets.html#camera-intrinsics-and-extrinsics>`_, then you will also be able to project the 3D labels onto the 2D images in real time.

.. image:: /_static/images/annotation/projection.gif
   :alt: 3D image projections


3D Annotation Controls
~~~~~~~~~~~~~~~~~~~~~~

Annotation Plane
^^^^^^^^^^^^^^^^

.. image:: /_static/images/annotation/image14.gif
   :alt: Annotation plane concept

3D annotation mode in FiftyOne provides the concept of an "annotation plane". When a new point is created (for example the vertex of a polyline or cuboid), it gets placed at the location of the mouse pointer. However, the depth of the point would be ambiguous and so this annotation plane is used to define the point depth. By default, the annotation plane is set to be the XY plane.

.. image:: /_static/images/annotation/image15.gif
   :alt: Annotation plane positioning

The annotation plane can be repositioned by clicking the annotation plane icon in the left toolbar. Iteratively moving the annotation plane and placing vertices is an efficient way to annotate complex 3D shapes.

.. image:: /_static/images/annotation/image16.gif
   :alt: Moving annotation plane

Visualizer Controls
^^^^^^^^^^^^^^^^^^^

The 3D annotation toolbar on the left side of the screen contains all options for spatially manipulating 3D cuboids and polylines. The icons represent the following actions:

* Cancel the annotation of the current label, presenting the option to either save or discard changes

.. image:: /_static/images/annotation/cancel.png
   :alt: Cancel annotation button

* Begin annotation of a new cuboid

.. image:: /_static/images/annotation/begin_cuboid.png
   :alt: Begin annotation of a new cuboid

* Begin annotation of a new polyline or segment

.. image:: /_static/images/annotation/begin_polyline.png
   :alt: Begin annotation of a new polyline or segment

* Add a new vertex to the selected polyline

.. image:: /_static/images/annotation/add_vertex.png
   :alt: Add a new vertex to the selected polyline

* Enable a mode where double clicking automatically closes the polyline

.. image:: /_static/images/annotation/enable_mode.png
   :alt: Enable a mode where double clicking automatically closes the polyline

* Enable visualization and manipulation of the annotation plane

.. image:: /_static/images/annotation/enable_visualization.png
   :alt: Enable visualization and manipulation of the annotation plane

The camera position can be manipulated to snap to the X,Y,Z directions or to the annotation plane with the keyboard shortcuts. The number keys 1-4 and CTRL+1-4 correspond to the top/bottom, right/left, front/back, and annotation plane respectively as shown in the video below.

.. image:: /_static/images/annotation/image19.gif
   :alt: Camera controls

How to: 3D Cuboid Annotation
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

To begin creating and editing 3D cuboids, enter polyline annotation mode by clicking on the cuboid icon in the annotate actions toolbar. When in cuboid annotation mode, the 3D cuboid toolbar becomes available on the left side of the Annotation Canvas.

.. image:: /_static/images/annotation/image20.png
   :alt: 3D cuboid toolbar

Creating 3D Cuboids
^^^^^^^^^^^^^^^^^^^

.. image:: /_static/images/annotation/image21.gif
   :alt: Creating a 3D cuboid

After entering cuboid annotation mode, create a new 3D cuboid by clicking on the cuboid icon in the cuboid toolbar on the left side, then click the 3D scene to place the first corner of the cuboid. Click a second time to define the opposite corner of the base (XY plane) of the cuboid. This second click finishes the creation of the cuboid, always defaulting to a height of 1.0 in the lz direction.

Newly created cuboids are oriented based on the current annotation plane. The depth of the first two clicks in the 3D scene is dictated by the location of the annotation plane which is described above (defaulting to the XY plane).

Transforming 3D Cuboids
^^^^^^^^^^^^^^^^^^^^^^^

After selecting a cuboid, the left toolbar provides new actions to transform the cuboid via translation, rotation, and scaling.

**Translation**

.. image:: /_static/images/annotation/image22.gif
   :alt: Translation mode

Click the translation icon in the left toolbar to enable translation mode. In this mode, the cuboid can be translated (moved) along the x, y, or z axes by clicking and dragging the corresponding directional arrow on the cuboid. Additionally, you can move the cuboid within a plane (XY, XZ, or YZ) by clicking and dragging the corresponding colored plane handle. For 3D translation in all directions, click and drag the white cube at the center of the cuboid.

**Rotation**

.. image:: /_static/images/annotation/image23.gif
   :alt: Rotation mode

After selecting a cuboid, click the rotation icon in the left toolbar to enable rotation mode. In this mode, the cuboid can be rotated about the x, y, or z axes by clicking and dragging the corresponding colored circle on the cuboid. You can also rotate about the plane orthogonal to the current camera view using the outermost yellow circle.

**Scaling**

.. image:: /_static/images/annotation/image24.gif
   :alt: Scaling mode

After selecting a cuboid, click the scaling icon in the left toolbar to enable scaling mode. In this mode, the cuboid can be scaled (resized) along the x, y, or z axes by clicking and dragging the corresponding directional arrow on the cuboid. In addition to scaling along an axis, you can scale the cuboid within a plane (XY, XZ, or YZ) by clicking and dragging the corresponding colored plane handle.

Attribute Editing
^^^^^^^^^^^^^^^^^

.. image:: /_static/images/annotation/image25.png
   :alt: Cuboid attributes panel

Cuboid attributes can be edited in the right sidebar when a given cuboid is selected. Custom attributes in this panel are defined by the :ref:`Schema Manager <schema-manager>`.

How to: 3D Polyline Annotation
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. image:: /_static/images/annotation/image26.gif
   :alt: 3D polyline annotation

To begin creating and editing 3D polylines, enter polyline annotation mode by clicking on the polyline icon in the annotate actions toolbar. When in polyline annotation mode, the 3D polyline toolbar becomes available on the left side of the Annotation Canvas.


.. image:: /_static/images/annotation/image27.png
   :alt: Polyline toolbar

.. _creating-3d-polylines:

Creating Polylines
^^^^^^^^^^^^^^^^^^

After entering polyline annotation mode, create a new 3D polyline by clicking on the polyline icon in the polyline toolbar on the left side, then click the 3D scene to create the first vertex of the polyline. After placing the final vertex of your polyline, double click anywhere on the 3D scene to finish creation of the polyline segment.

.. image:: /_static/images/annotation/image28.gif
   :alt: Creating a polyline


Newly created vertices are placed at the location of the mouse pointer. The depth of a newly created vertex in the 3D scene is dictated by the location of the annotation plane which is described below (defaulting to the XY plane).

Polylines vs Segments
^^^^^^^^^^^^^^^^^^^^^

The points of a single `Polyline in FiftyOne <https://docs.voxel51.com/user_guide/using_datasets.html#d-polylines>`_ are represented as a list of lists of vertices:

.. code-block:: python

   # A list of lists of `[x, y, z]` points in scene coordinates describing
   # the vertices of each shape in the polyline
   points3d = [[[-5, -99, -2], [-8, 99, -2]], [[4, -99, -2], [1, 99, -2]]]

This allows for the possibility of multiple disjointed segments within a single polyline as shown in the code example above. This may be useful, for example, if you are annotating a dashed lane marking where each dash is a disjointed segment of the same polyline, allowing all of the segments to share the same attributes.

.. image:: /_static/images/annotation/image29.png
   :alt: Polyline segments

In the right Annotate sidebar, you can see the number of segments and vertices in the current Polyline.

Adding New Segments
^^^^^^^^^^^^^^^^^^^

.. image:: /_static/images/annotation/image30.gif
   :alt: Adding new segments

To add a new segment to an existing polyline, first select the polyline to be edited, then select the new polyline segment button in the left toolbar and finally click to annotate the new segment.

Vertex Manipulation
^^^^^^^^^^^^^^^^^^^

When positioning a vertex in 3D space, the vertex controls become available when you click to select a given vertex (or the polyline centroid). These controls allow you to click either the 3 RGB directional arrows to move the vertex along the given axis, 3 CMY planes to move the vertex in the given plane, and a clickable center to position the vertex in 3D space.

.. image:: /_static/images/annotation/image31.gif
   :alt: Vertex manipulation controls

Adding and Deleting Vertices
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. image:: /_static/images/annotation/image32.gif
   :alt: Adding and deleting vertices


Vertices can also be added to and deleted from existing polylines. To add a new vertex, first select the polyline to which the vertex should be added, then click on the new vertex icon in the left toolbar, and finally select the location on the polyline that the new vertex should be added. The new vertex can now be moved to the desired location.

A selected vertex can be deleted by pressing the trash can icon in the left toolbar (or by pressing the delete key).

.. image:: /_static/images/annotation/image33.png
   :alt: Delete vertex icon

Attribute Editing
^^^^^^^^^^^^^^^^^

.. image:: /_static/images/annotation/image34.png
   :alt: Polyline attributes panel

Polyline attributes can be edited in the right sidebar when a given polyline is selected. Custom attributes in this panel are defined by the :ref:`Schema Manager <schema-manager>`.

In addition to custom attributes, the attribute sidebar for 3D polylines also shows the number of segments and vertices in the selected polyline, as well as the polyline-specific "closed" and "filled" attributes which affect how the polyline is rendered. Setting the "closed" attribute to True will automatically render a line segment from the first vertex of a polyline to the last vertex to close the shape. Setting the "filled" attribute to True will show the region enclosed by the polyline as filled.

.. image:: /_static/images/annotation/image35.png
   :alt: Closed polyline example

.. image:: /_static/images/annotation/image36.png
   :alt: Filled polyline example

.. image:: /_static/images/annotation/image37.png
   :alt: Closed and filled polyline

.. image:: /_static/images/annotation/image38.png
   :alt: Auto-close mode icon

Additionally, you can select the icon to the left to enter a mode that will automatically close the polyline when the annotation canvas is double clicked.

----

How to: Editing Primitives
---------------------------

Editing in the Right Sidebar
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Clicking on a primitive field in the "Annotate" tab will open the editing panel in the right sidebar. Like editing a label's attributes, you can edit the primitive's values per the Annotation Schema.

.. image:: /_static/images/annotation/primitive_editing.png
   :alt: Editing primitives in the right sidebar