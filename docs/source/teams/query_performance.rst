.. _query-performance:

Query Performance (NEW)
=======================

Query Performance is a feature built into the :ref:`FiftyOne Teams App <teams-app>`
which allows users to use FiftyOne to improve the performance of the sidebar and background
queries through the use of indexes and summary fields.

.. _query-performance-how-it-works:

Turning on Query Performance
____________________________

.. image:: /images/teams/qp_home.png
    :alt: query-performance-home-tab
    :align: center

Query Performance is enabled by default in the FiftyOne Teams App. You can toggle
Query Performance by clicking on the "Query Performance" switch in the menu bar.

.. image:: /images/teams/qp_toggle.png
    :alt: query-performance-toggle
    :align: center

Within the Query Performance panel, you can see the status of Query Performance mode and turn
the mode on/off by clicking on the gear icon.

.. image:: /images/teams/qp_config.png
    :alt: query-performance-config
    :align: center

There is also a helpful tooltip when the user hovers over the gold lightning bolt icon
in the side bar. The tooltip will show a button to open Query Performance panel; if user
clicks on the `Got it` button the tooltip will be permanently dismissed.

.. image:: /images/teams/qp_tooltip.png
    :alt: query-performance-tooltip
    :align: center

Admin Configuration:

- ``FIFTYONE_APP_DEFAULT_QUERY_PERFORMANCE``: Set to ``false`` to change the default setting for all users
- ``FIFTYONE_APP_ENABLE_QUERY_PERFORMANCE``: Set to ``false`` to completely disable the feature for all users

Query Performance Toast
-----------------------

When you open the FiftyOne Teams App with Query Performance enabled, you will see a toast
notification whenever a sidebar query is run that could benefit from Query Performance. For
example you can click on a label filter on the sidebar, and if the filter takes longer than
a few seconds to load, the toast will be opened.

.. image:: /images/teams/qp_toast.png
    :alt: query-performance-toast
    :align: center

The toast notification will show you two options: "Create Index" and "Dismiss".
Clicking "Create Index" will open the Query Performance panel where you can create an index.

Clicking "Dismiss" will close the toast notification for all datasets for the current session.
Users can also close the toast notification by clicking outside the toast notification. The
toast notification will also close automatically after a few seconds.

Query Performance Panel
_______________________

The Query Performance panel can be accessed through:

- The panel menu
- The "Create Index" button

Each dataset includes default indexes created at initialization. The panel displays a table showing:

- All indexes (default and custom)
- Index sizes
- Available actions:
  - ``Drop Index``
  - ``Drop Summary Field``
  - ``Refresh Summary Field`` (only for summary fields)

Custom indexes can be created via the panel, SDK client, or MongoDB client.
.. image:: /images/teams/qp_tableview.png
    :alt: query-performance-tableview
    :align: center

Create Index
------------

The Query Performance panel shows the query that could benefit from an index. You can create an
index by clicking the `Create Index` button. The index will be created in the background and you
will see the progress of the index creation in the Query Performance panel. You can create multiple
indexes at the same time. For each index, users can also have the option to add Unique constraint.

.. image:: /images/teams/qp_create_index.png
    :alt: query-performance-create-index
    :align: center

.. warning::
For large, complex datasets, index creation can have an impact on the performance of the database.
It is recommended to consult and communicate with your database administrator and teammates
before attempting such an operation.

After the indexes are created, the fields with index will be highlighted in the sidebar with a lightning
bolt icon. Expanding the side bar filter for indexed fields will be noticeably faster.

Create Summary Field
--------------------

The Query Performance panel also allows users to create a summary field. Summary fields are sample-level fields that
are computed and stored in the database. For example, users can create a summary field for objects detected in every
frame. This allows users to filter quickly across the dataset to find samples with the desired objects.

.. image:: /images/teams/qp_create_summary_field.png
    :alt: query-performance-create-summary-field
    :align: center

The summary field is also enhanced with relevant indexes to improve its performance. Users can choose to remove the
summary field by clicking the `Drop Index/Field` action in the table. Users can also choose to remove the individual
indexes associated with the summary field.

Performance Considerations
--------------------------

.. warning::

   For large datasets, the following operations may take significant time to complete:
   
   - Creating summary fields
   - Updating summary fields
   - Deleting summary fields
   
   Additionally:
   
   - Deleting an index or summary field will remove its performance benefits
   - These operations cannot be cancelled once started
   - Plan these operations during low-usage periods

Update Summary Field
--------------------

Summary fields can be updated via the ``Refresh Summary Field`` action to reflect recent dataset changes.

Delete Index and Field
----------------------

Use ``Drop Index`` or ``Drop Summary Field`` actions to remove indexes or summary fields from the dataset.
