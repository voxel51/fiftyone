.. _query-performance:

Query Performance
=================

.. default-role:: code

Query Performance is a builtin feature of the
:ref:`FiftyOne Enterprise App <enterprise-app>` that leverages database indexes
to optimize your queries on large-scale datasets.

Optimizing Query Performance
____________________________

The App's sidebar is optimized to leverage database indexes whenever possible.

Fields that are indexed are indicated by lightning bolt icons next to their
field/attribute names:

.. image:: /images/app/app-query-performance.gif
    :alt: app-query-performance
    :align: center

The above GIF shows Query Performance in action on the train split of the
:ref:`BDD100K dataset <dataset-zoo-bdd100k>` with an index on the
`detections.detections.label` field.

.. note::

    When filtering by multiple fields, queries will be more efficient when your
    **first** filter is on an indexed field.

If you perform a filter that could benefit from an index and the query takes
longer than a few seconds, you'll see a toast notification that nudges you to
take the appropriate action to optimize the query:

.. image:: /images/enterprise/qp_toast.png
    :alt: query-performance-toast
    :align: center

Clicking "Create Index" will open the
:ref:`Query Performance panel <query-performance-panel>` with a preconfigured
recommendation of an :ref:`index <query-performance-index>` or
:ref:`summary field <query-performance-summary>` to create.

.. note::

    Clicking "Dismiss" will prevent this notification from appearing for the
    remainder of your current App session.

.. _query-performance-panel:

Query Performance panel
_______________________

You can open the Query Performance panel manually either by clicking the "+"
icon next to the Samples tab or by clicking the yellow lightning bolt in the
top-right of the sidbar:

.. image:: /images/enterprise/qp_tooltip.png
    :alt: query-performance-tooltip
    :align: center

The first time you open the Query Performance panel, you'll see a welcome page:

.. image:: /images/enterprise/qp_home.png
    :alt: query-performance-home-tab
    :align: center

After you've created at least one custom index or summary field for a dataset,
you'll instead see a list of the indexes and summary fields that exist on the
dataset:

.. image:: /images/enterprise/qp_tableview.png
    :alt: query-performance-tableview
    :align: center

.. _query-performance-index:

Creating indexes
----------------

You can create a new index at any time by clicking the `Create Index` button
in the top-right of the panel:

.. image:: /images/enterprise/qp_create_index.png
    :alt: query-performance-create-index
    :align: center

When you click "Execute", the index will be initiated and you'll see
"In progress" in the panel's summary table.

After the index creation has finished, the field that you indexed will have a
lightning bolt icon in the sidebar, and you should notice that expanding the
field's filter widget and performing queries on it will be noticably faster.

.. warning::

    For large datasets, index creation can have a significant impact on the
    performance of the database while the index is under construction.

    We recommend indexing *only* the specific fields that you wish to perform
    initial filters on, and we recommend consulting with your deployment admin
    before creating multiple indexes simultaneously.

You can also create and manage custom indexes
:ref:`via the SDK <app-optimizing-query-performance>`.

.. _query-performance-summary:

Creating summary fields
-----------------------

The Query Performance panel also allows you to create
:ref:`summary fields <summary-fields>`, which are sample-level fields that
allow you to efficiently perform queries on large datasets where directly
querying the underlying field is prohibitively slow due to the number of
objects/frames in the field.

For example, summary fields can help you query video datasets to find samples
that contain specific classes of interest, eg `person`, in at least one frame.

You can create a new summary field at any time by clicking the `Create Index`
button in the top-right of the panel and selecting the "Summary field" type in
the model:

.. image:: /images/enterprise/qp_create_summary_field.png
    :alt: query-performance-create-summary-field
    :align: center

.. warning::

    For large datasets, creating summary fields can take a few minutes.

You can also create and manage summary fields
:ref:`via the SDK <summary-fields>`.

.. _query-performance-update:

Updating summary fields
-----------------------

Since a :ref:`summary field <summary-fields>` is derived from the contents of
another field, it must be updated whenever there have been modifications to its
source field.

Click the update icon in the actions column of any summary field to open a
modal that will provide guidance on whether to update the summary field to
reflect recent dataset changes.

.. _query-performance-delete:

Deleting indexes/summaries
--------------------------

You can delete a custom index or summary field by clicking its trash can icon
in the actions column of the panel.

.. _query-performance-disable:

Disabling Query Performance
___________________________

Query Performance is enabled by default for all datasets. This is generally the
recommended setting for all large datasets to ensure that queries are
performant.

However, in certain circumstances you may prefer to disable Query Performance,
which enables the App's sidebar to show additional information such as
label/value counts that are useful but more expensive to compute.

You can enable/disable Query Performance for a particular dataset for its
lifetime (in your current browser) via the gear icon in the Samples panel's
actions row:

.. image:: /images/app/app-query-performance-disabled.gif
    :alt: app-query-performance-disabled
    :align: center

You can also enable/disable Query Performance via the status button in the
upper right corner of the Query Performance panel:

.. image:: /images/enterprise/qp_config.png
    :alt: query-performance-config
    :align: center

Deployment admins can also configure the global behavior of Query Performance
via the following environment variables:

.. code-block:: shell

    # Disable Query Performance by default for all new datasets
    FIFTYONE_APP_DEFAULT_QUERY_PERFORMANCE=false

.. code-block:: shell

    # Completely disable Query Performance for all users
    FIFTYONE_APP_ENABLE_QUERY_PERFORMANCE=false
