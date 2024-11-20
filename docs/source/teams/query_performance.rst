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

Admins can change the default setting for all users in the Teams App by setting
`FIFTYONE_APP_DEFAULT_QUERY_PERFORMANCE` to `false`. Admins can also completely disable
query performance for all users by setting the `FIFTYONE_APP_ENABLE_QUERY_PERFORMANCE` to `false`.

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

The Query Performance panel is accessible in the panel menu. Users can also open the Query Performance
panel by clicking the `Create Index` button. Every dataset has a few default indexes that are created
when the dataset is created. If the dataset has non-default indexes, such as those manually created
through SDK client, Mongo client, or from the panel, the Query Performance panel will show the table
with a list of all indexes, their size and the action options. The action options are `Drop Index`,
"Drop Summary Field", and `Refresh Summary Field`, which are only available for summary fields.

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
For dataset with a large number of samples, creating a summary field can take a long time to complete.

Update Summary Field
--------------------

Summary fields can be updated by clicking the `Refresh Summary Field` action in the table. This will update the summary
field with the latest data in the dataset. This is useful when the dataset has been updated with new data and the summary
field needs to be updated to reflect the changes.

.. warning::
For dataset with a large number of samples, updating a summary field can take a long time to complete.

Delete Index and Field
----------------------

Index and summary fields can be deleted by clicking the `Drop Index` or `Drop Summary Field` action in the table. This
will remove the index or summary field from the dataset.

.. warning::
Deleting an index or summary field will remove the performance improvement associated with the index or summary field.

.. warning::
For dataset with a large number of samples, deleting a summary field can take a long time to complete.
