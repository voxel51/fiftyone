.. _query-performance:

Query Performance (NEW)
=======================

Query Performance is a feature built into the :ref:`FiftyOne Teams App <teams-app>`
which allows users to use FiftyOne to improve the performance of sidebar and background
queries through the use of indexes and summary fields. Query Performance subsumed and
expanded the capabilities of the previous Fiftyone's Lightning Mode (LM).

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

Within the Query Performance panel, you can see the status of Query Performance mode
as well as configuring the on/off mode by clicking the gear button.

.. image:: /images/teams/qp_config.png
    :alt: query-performance-config
    :align: center

There is also a helpful tooltip when the user hovers over the gold lightning bolt icon
in the side bar. The tooltip will show a button to open Query Performance panel; if user
clicks on the `Got it` button the tooltip will be permanently dismissed.

.. image:: /images/teams/qp_tooltip.png
    :alt: query-performance-tooltip
    :align: center

Admins users can change the default setting for all users in the Teams App by setting
`FIFTYONE_APP_DEFAULT_QUERY_PERFORMANCE` to `false`. Admin users can also completely disable
query performance for all users by setting the `FIFTYONE_APP_ENABLE_QUERY_PERFORMANCE` to `false`.

Query Performance Toast
-----------------------

When you open the FiftyOne Teams App with Query Performance enabled, you will see a toast
notification whenever a query is run that could benefit from Query Performance. The query
can be part of the background sampling process or a query that you run manually from the
side bar. Sidebar queries are queries that you run by clicking on the sidebar filters; for
example you can click on a label filter on the sidebar, and if the filter takes too longer
the toast will be opened.

.. image:: /images/teams/qp_toggle.png
    :alt: query-performance-toggle
    :align: center

The toast notification will show you two options: "Create Index" and "Dismiss".
Clicking "Create Index" will open the Query Performance panel where you can create an index.

Clicking "Dismiss" will close the toast notification for all datasets for the current session.
Users can also close the toast notification by clicking outside the toast notification. The
toast notification will also close automatically after a few seconds.

Query Performance Panel
_______________________

The Query Performance panel is accessible in the panel menu. Users can also open the Query Performance
panel by clicking the `Create Index` button. Every dataset has a few default indexes that are created
when the dataset is created. If the Query Performance panel is opened for the first time or for a dataset
with only default indexes, the panel will show the welcome message screen.

If the dataset has non-default indexes, the Query Performance panel will show the table with the list of
indexes, their size and the action options. The action options are `Drop Index/Field` and `Refresh Summary Field`
(only for summary fields).

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

.. warning::
For dataset with a large number of samples, creating, updating and deleting a summary field can take a long time to
complete.

For more information on summary fields, see :ref:`_summary-fields`.

