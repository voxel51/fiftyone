.. _dataset_versioning:

.. versionadded:: Teams 1.4.0

Dataset Versioning
==================

.. default-role:: code

A key feature of the FiftyOne Teams offering is the ability to version your Fiftyone
Datasets directly from within the Fiftyone ecosystem. This functionality
provides the ability to capture the state of your dataset in time so that
it can be referenced in the future. This can enable workflows revolving around
recalling particular important events in the dataset's lifecycle (model trained,
annotation added, etc.), as well as helping to prevent accidental data loss.

Introduction
____________

Versioning in Fiftyone Teams has been built with an extensible architecture so
that different versioning backends can be swapped in. Different backends may
have different trade-offs in terms of performance, storage, and deployment
needs, so users should be able to choose the best fit for their needs.

In addition, many users may already have a versioning solution external to
Fiftyone Teams, and the goal is to support integration around those use cases
as well.

.. note::

    As of FiftyOne Teams version 1.4.0, dataset versioning only supports an
    :ref:`internal duplication backend <internal-duplication-backend>`.
    Further improvements and implementing additional backend choices are
    :ref:`on the long-term roadmap <future-roadmap>`.

.. warning::

    1. Versioning is not yet a replacement for backups. We strongly encourage
    the use of regular data backups and good storage maintenance processes.
    
    2. Versioning within FiftyOne does not version your actual media
    (images, videos, etc.). 

What's Included?
----------------

The FiftyOne Dataset, including the following, are all stored and versioned:

+------------------------+-----------------------------------------+
| Dataset-level metadata | Schema, tags, other metadata            |
|                        +-----------------------------------------+
|                        | Saved views                             |
|                        +-----------------------------------------+
|                        | Runs and run results                    |
+------------------------+-----------------------------------------+
| Sample-level metadata  | All sample metadata (including tags,    |
|                        | labels, detections, segmentations,      |
|                        | custom fields, etc.)                    |
|                        +-----------------------------------------+
|                        | All video frame metadata                |
|                        +-----------------------------------------+
|                        | Run results stored as a dataset field,  |
|                        | e.g., uniqueness or embeddings.         |
+------------------------+-----------------------------------------+

Dataset Versioning does not track:

+-----------------------------------------------------+
| The media itself (images, videos, point clouds)     |
+-----------------------------------------------------+
| Run results stored in external systems (e.g.,       |
| a :ref:`vector database integration <integrations>` |
| for embeddings)                                     |
+-----------------------------------------------------+
| Segmentations or embeddings on disk                 |
+-----------------------------------------------------+
| Ephemeral views (to_clips, to_frames, to_patches)   |
+-----------------------------------------------------+

Snapshots
_________

With FiftyOne Teams Dataset Versioning, we introduce a concept called a
**Snapshot**. A Snapshot captures the state of a dataset at a particular point
in time as an immutable object. Currently, Snapshots exist in a linear
(non-branching) history model of the dataset. Compare this concept to creating
commits and tags in a single branch of a version control system such as git or
svn; a Snapshot is a commit and tag (including readable name, description,
creator) all in one.

The current working version of the dataset (called the **HEAD**) can be edited
by anyone with appropriate permissions, as normal. Since Snapshots include a
commit-like operation, they can only be created on the dataset HEAD.

Snapshot States
---------------

Snapshots can be in a few different states of existence depending on deployment
choices and user actions.

.. glossary::

    Materialized Snapshot
        A Snapshot whose state and contents are entirely *materialized* in
        the MongoDB database. The Snapshot is "ready to go" and be loaded
        instantly for analysis and visualization.

    Offloaded Snapshot
        A materialized Snapshot that has been offloaded to cold storage to
        free up working space in the MongoDB instance. The Snapshot cannot be
        loaded by users until it is re-materialized into MongoDB. Since it is
        stored in its materialized form already though, an offloaded Snapshot
        can be re-materialized easily, at merely the cost of network transfer
        and MongoDB write latencies.

    Virtual Snapshot
        A Snapshot whose state and contents are stored by the pluggable backend
        versioning implementation in whatever way it chooses. In order to be
        loaded by FiftyOne Teams users, the Snapshot must be *materialized*
        into its workable form in MongoDB. This is done through a combination
        of the overarching versioning infrastructure and the specific
        versioning backend.


For a given Snapshot, the virtual form always exists. It may also be
materialized, offloaded, or both (in the case that an offloaded Snapshot has
been re-materialized but kept in cold storage also)!

.. note::

    With the :ref:`Internal Duplication Backend <internal-duplication-backend>`,
    there is no distinction between materialized and virtual Snapshots since by
    definition the implementation uses materialized Snapshots as its method of
    storage.

Using Snapshots
_______________

In contrast to dataset HEAD, Snapshots are read-only. When viewing in the App,
the UI is similar to interacting with a HEAD dataset, but users will not be
able to make any edits to the objects. Similarly, when using the Fiftyone SDK,
users will not be able to perform any operation that would trigger a
modification to the stored dataset.

An incomplete list of such operations:

+----------------------------------------------------+
| Add/delete/modify samples                          |
+----------------------------------------------------+
| Change dataset metadata (tags, info, etc.)         |
+----------------------------------------------------+
| Compute a run (                                    |
| :ref:`annotation <fiftyone-annotation>`,           |
| :ref:`brain method <fiftyone-brain>`, or           |
| :ref:`evaluation <evaluating-models>`)             |
+----------------------------------------------------+
| :ref:`Save a view <saving-views>` on the dataset   |
+----------------------------------------------------+

All other strictly read-only operations are allowed. An incomplete list of such
operations:

+-------------------------------------------------------------------+
| Get samples/frames                                                |
+-------------------------------------------------------------------+
| Creating :ref:`views <using-views>` into the Snapshot data        |
| (views do not edit the underlying dataset)                        |
+-------------------------------------------------------------------+
| :ref:`Export <exporting-datasets>` the whole Snapshot or a view   |
+-------------------------------------------------------------------+
| :ref:`Clone <cloning-datasets>` Snapshot to a new dataset         |
| (this new dataset will have an editable HEAD but lose the         |
| Snapshot history of the parent dataset)                           |
+-------------------------------------------------------------------+
| Creating a generated dataset view from the Snapshot, such as      |
| :ref:`to_patches() <object-patches-views>` or                     |
| :ref:`group_by() <view-groups>`                                   |
+-------------------------------------------------------------------+

.. _listing-dataset-snapshots:

Listing Snapshots for a Dataset
-------------------------------

.. _listing-snapshots-ui:

Teams UI
~~~~~~~~

To access the Snapshot history and management page, click the 'History' tab on
a dataset's main page.

.. image:: /images/teams/versioning/history-tab-button.png
    :alt: history-tab-button
    :align: center

On this page you can see a listing of the Snapshot history for the dataset.
Each row contains information about a single Snapshot, namely:

+----------------------------------------------+
| Name                                         |
+----------------------------------------------+
| Description                                  |
+----------------------------------------------+
| Creation date                                |
+----------------------------------------------+
| Creator                                      |
+----------------------------------------------+
| Summary of sample changes in this Snapshot   |
| (number added, deleted, updated)             |
+----------------------------------------------+

.. image:: /images/teams/versioning/snapshot-list.png
    :alt: snapshot-list
    :align: center

.. _listing-snapshots-sdk:

SDK
~~~

You can also list Snapshot names for a dataset using the
:meth:`list_snapshots() <fiftyone.management.snapshot.list_snapshots>` method
from the Management SDK:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    dataset_name = "quickstart"
    fom.list_snapshots(dataset_name)

Then you can get more detailed information on a single Snapshot using the
:meth:`get_snapshot_info() <fiftyone.management.snapshot.get_snapshot_info>`
method:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    dataset = "quickstart"
    snapshot_name = "v0.1"

    fom.get_snapshot_info(dataset, snapshot_name)

Loading Snapshots
-----------------

.. _loading-snapshots-ui:

Teams UI
~~~~~~~~

Clicking the "Browse" button in a Snapshot row in the
:ref:`snapshot list <listing-dataset-snapshots>` will allow the user to view
the dataset Snapshot in the UI.

.. image:: /images/teams/versioning/browse-button.png
    :alt: history-browse-button
    :align: center

This will open the Snapshot in the normal dataset samples UI with all your
favorite FiftyOne visualization tools at your fingertips! However, all
dataset-modification features such as tagging have been removed.

We can also link directly to this Snapshot page by copying the URL from the
address bar or from the "Share Dataset" page which opens from the "Share"
button. For the above Snapshot, it would look like this:

``https://<fiftyone-teams-deployment-url>/datasets/roadscene-vehicle-detection/samples?snapshot=new+snapshot``

One other difference from the normal page is the Snapshot banner which gives
information about the Snapshot being viewed, and other quick-click operations.
Clicking the name line drops down a list of the Snapshots where the current one
is highlighted. Clicking on a Snapshot in the dropdown will navigate to the
browse page for that Snapshot.

.. image:: /images/teams/versioning/browse-banner-dropdown.png
    :alt: browse-banner-dropdown
    :align: center

On the right side of the banner, clicking the "Back to the latest version"
button will take you back to the samples page for the dataset HEAD (you can
also do this by clicking the "Samples" tab). There is also a convenient
dropdown from the 3-dot (kebab) menu which gives various
:ref:`management functions <snapshot-management>` for the current Snapshot.

.. image:: /images/teams/versioning/browse-banner-right.png
    :alt: browse-banner-rightside
    :align: center

.. _loading-snapshots-sdk:

SDK
~~~

Snapshots can also be loaded via the FiftyOne SDK ``load_dataset()`` method.
The following snippet will load an existing Snapshot of a dataset. It can then
be interacted with as if it is a normal dataset, except for any operations that
would cause modifications.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset_name = "quickstart"
    existing_snapshot_name = "v1"

    snapshot = fo.load_dataset(dataset_name, snapshot=existing_snapshot_name)
    print(snapshot)

.. _Snapshot-management:

Snapshot Management
___________________

Of course we must be able to create and manage these wonderful snapshots!

.. _creating-snapshot:

Creating a Snapshot
-------------------

Dataset Managers can create Snapshots through the Teams UI or Management SDK.

.. note::

    Snapshots can only be created from the HEAD of the dataset.

.. _creating-snapshot-ui:

Teams UI
~~~~~~~~

At the top of the "History" tab for a dataset is the "Create snapshot" panel.
This panel will inform the user of the number of changes that have happened
between the last Snapshot and the current state of the dataset. Currently this
is a summary of number of samples added, deleted, and updated. These values are
not continuously calculated, so there is a provided "Refresh" button to ensure
that you have the latest values. You can also see how long ago it was last
refreshed in order to decide if the information is current.

.. image:: /images/teams/versioning/create-refresh-button.png
    :alt: create-refresh-button
    :align: center

To create a Snapshot, give it a unique name and an optional description if you
like, then click the "Save new snapshot" button.

.. note::

    Depending on the :ref:`versioning backend <versioning-backends>` used,
    deployment options chosen, and the size of the dataset, this may take some
    time.

.. image:: /images/teams/versioning/create-save-button.png
    :alt: create-save-button
    :align: center

After creation, the new Snapshot will show up in the list!

.. image:: /images/teams/versioning/history-new-snapshot.png
    :alt: history-new-snapshot
    :align: center

.. _creating-snapshot-sdk:

SDK
~~~

Alternatively, you can use the Management SDK.

To get the latest changes summary as in the "Create snapshot" panel, use
:meth:`get_dataset_latest_changes_summary() <fiftyone.management.snapshot.get_dataset_latest_changes_summary>`

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    fom.get_dataset_latest_changes_summary(dataset.name)

To recalculate the latest changes summary as in the "Refresh" button in that
panel, use
:meth:`calculate_dataset_latest_changes_summary() <fiftyone.management.snapshot.calculate_dataset_latest_changes_summary>`

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    old = fom.calculate_dataset_latest_changes_summary(dataset.name)
    assert old == fom.get_dataset_latest_changes_summary(dataset.name)

    dataset.delete_samples(dataset.take(5))

    # Cached summary hasn't been updated
    assert old == fom.get_dataset_latest_changes_summary(dataset.name)

    new = fom.calculate_dataset_latest_changes_summary(dataset.name)
    assert new.updated_at > changes.updated_at

To then create a Snapshot, use the
:meth:`create_snapshot() <fiftyone.management.snapshot.create_snapshot>`
method:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    dataset_name = "quickstart"
    snapshot_name = "v0.1"
    description = "Version 0.1 in which I have made many awesome changes!"
    snapshot = fom.create_snapshot(dataset_name, snapshot_name, description)
    print(snapshot)

Deleting a Snapshot
-------------------

Dataset Managers can delete Snapshots through the Teams UI or Management SDK.

Deleting a dataset deletes all associated Snapshots. However, individual
snapshots can also be deleted.

.. warning::

    Deleting a Snapshot cannot be undone!

.. note::

    If the Snapshot is NOT the most recently created, the sample change summary
    for the following Snapshot will be recalculated based on the previous
    Snapshot. This is to retain accuracy given the modification to the linear
    history chain.

    If the Snapshot IS the most recent , the latest sample changes summary is
    not automatically recalculated. See relevant sections in
    :ref:`Creating a Snapshot <creating-snapshot>` for how to recalculate these
    now-stale values.

.. _deleting-snapshot-ui:

Teams UI
~~~~~~~~

To delete a Snapshot via the app, navigate to the 3-dot (kebab) menu for
the Snapshot. In the menu, click the red "Delete snapshot" button. This will
bring up a confirmation dialog to prevent accidental deletions.

.. image:: /images/teams/versioning/delete-snapshot.png
    :alt: delete-snapshot
    :align: center

.. _deleting-snapshot-sdk:

SDK
~~~

Alternatively, you can use the
:meth:`delete_snapshot() <fiftyone.management.snapshot.delete_snapshot>`
method in the Management SDK:


.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    dataset = "quickstart"
    snapshot_name = "v0.1"

    fom.delete_snapshot(dataset, snapshot_name)


Rollback Dataset to Snapshot
----------------------------

In case unwanted edits have been added to the dataset HEAD, FiftyOne provides
the ability for dataset Managers to roll the dataset back (revert) to the state
of a given Snapshot.

.. warning::

    This is a very destructive operation! Doing this will discard **ALL**
    changes between the selected Snapshot and the current working version of the
    dataset.

    It will also delete any newer Snapshots as well. Any Snapshots
    that existed prior to the Snapshot selected will remain.

.. _reverting-to-snapshot-ui:

Teams UI
~~~~~~~~

To revert a dataset to a Snapshot's state, click the 3-dot (kebab) menu in
the "History" tab for the Snapshot you want to return to. Then, select
"Rollback to this snapshot". This will bring up a confirmation dialog to prevent
accidental deletions.

.. image:: /images/teams/versioning/rollback-snapshot.png
    :alt: rollback-snapshot
    :align: center

.. _reverting-to-snapshot-sdk:

SDK
~~~

Alternatively, you can use the
:meth:`revert_dataset_to_snapshot() <fiftyone.management.snapshot.revert_dataset_to_snapshot>`
method in the Management SDK:

.. code-block:: python
    :linenos:

    import fiftyone.management as fom

    dataset = "quickstart"
    snapshot_name = "v0.1"
    description = "Initial dataset snapshot"
    fom.create_snapshot(dataset, snapshot_name, description)

    # Oops we deleted everything!
    dataset.delete_samples(dataset.values("id"))

    # Phew!
    fom.revert_dataset_to_snapshot(dataset.name, snapshot_name)
    dataset.reload()
    assert len(dataset) > 0

.. _versioning-backends:

Pluggable Versioning Backends
_____________________________

Dataset versioning was built with an extensible architecture to support
different versioning backend implementations being built and swapped in to
better suit the users' needs and technology preferences. In the future, this
section will contain information and discussion about each of these available
backends, including their strengths/limitations and configuration options.

For the initial release in FiftyOne Teams v1.4.0, however, there is only one
backend choice described below. Additional backends may be implemented in the
future, but for now, releasing dataset versioning with the first
iteration was prioritized so that users can begin to see value and provide
feedback as soon as possible.

.. _internal-duplication-backend:

Internal Duplication Backend
----------------------------

This backend is similar to cloning a dataset; Snapshots are stored in the same
MongoDB database as the original dataset.

Creating a Snapshot with this backend is similar to cloning a dataset in terms
of performance and storage needs.

Creating a Snapshot should take roughly the same amount of time as cloning the
dataset, and so is proportional to the size of the dataset being versioned.

At this time, Snapshots are stored in the same database as the original dataset.
In the future, support will be implemented for offloading Snapshots to a separate
data store, such as cloud storage, to reduce the load on the Fiftyone database.

These requirements should be taken into consideration when using Snapshots and
when determining values for the
:ref:`max number of Snapshots allowed <versioning-configuration>`.

.. _duplication-backend-time-space:

Time & Space
~~~~~~~~~~~~

**Time**

The create Snapshot operation takes time proportional to cloning the dataset.
This backend is the most performant when creating a Snapshot then immediately
loading it for use; while other backends would have to store the virtual
Snapshot and then materialize it, this one simply does one big intra-MongoDB
clone.

Additionally, change summary calculation can be slow.

.. note::

    In v1.4.0, calculating number of samples modified in particular can
    cause slowdown with larger datasets. This value is not computed for
    datasets larger than 200 thousand samples.

**Space**

The amount of storage required scales with the number of Snapshots created, not
the volume of changes. Since it is stored in the same database as normal
datasets, creating too many Snapshots without the ability to offload them
could fill up the database.

.. _duplication-backend-strengths:

Strengths
~~~~~~~~~

+---------------------------------------------------------------------------+
| ✅ Simple                                                                 |
+---------------------------------------------------------------------------+
| ✅ Uses existing MongoDB; no extra deployment components                  |
+---------------------------------------------------------------------------+
| ✅ Browsing/loading is fast because the Snapshots are always materialized |
+---------------------------------------------------------------------------+
| ✅ For a create-then-load workflow, it has the lowest overhead cost of    |
| any backend since materialized and virtual forms are one and the same     |
+---------------------------------------------------------------------------+

.. _duplication-backend-limitations:

Limitations
~~~~~~~~~~~

+---------------------------------------------------------------------------+
| ❌ Creating a Snapshot takes time proportional to clone dataset           |
+---------------------------------------------------------------------------+
| ❌ Calculating sample change summaries is less efficient                  |
+---------------------------------------------------------------------------+
| ❌ Storage is highly duplicative                                          |
+---------------------------------------------------------------------------+

.. _duplication-backend-configuration:

Configuration
~~~~~~~~~~~~~

There are no unique configuration options for this backend.

Usage Considerations
____________________

Best Practices
--------------

As this feature matures, we will have better recommendations for best practices.
For now given the limited starting options in the intial iteration, we have the
following advice:

- Use snapshots on smaller datasets if possible.
- Since space is at a premium, limit creation of snapshots to marking milestone
  events which you want to revisit or restore later.
- Delete old snapshots you don't need anymore.
- Set the :ref:`versionings configurations versioning-configuration` to the
  highest your deployment can comfortably support, to better enable user
  workflows with breaking the (MongoDB) bank.

Dataset Versioning + Permissions
--------------------------------

Snapshots inherit the permissions set for their parent dataset, they do not
have the ability to have individual permissions applied to them.

This table shows :ref:`dataset permissions <teams-permissions>` required to
perform different Snapshot operations; all Snapshot management requires
**Can Manage** permissions.

+----------------------------+----------------------------------+
| Snapshot Operation         |    User Permissions on Dataset   |
+============================+==========+==========+============+
|                            | Can View | Can Edit | Can Manage |
+----------------------------+----------+----------+------------+
| Browse Snapshot in app     |    ✅    |    ✅    |     ✅     |
+----------------------------+----------+----------+------------+
| Load Snapshot in SDK       |    ✅    |    ✅    |     ✅     |
+----------------------------+----------+----------+------------+
| Create Snapshot            |          |          |     ✅     |
+----------------------------+----------+----------+------------+
| Delete Snapshot            |          |          |     ✅     |
+----------------------------+----------+----------+------------+
| Revert dataset to Snapshot |          |          |     ✅     |
+----------------------------+----------+----------+------------+

.. _versioning-configuration:

Configuration
-------------

Since Snapshots impact the storage needs of Fiftyone Teams, some guard rails
have been put in place to control the maximum amount of Snapshots that can be
created. If a threshold has been exceeded while a user attempts to create a
new Snapshot, they will receive an error informing them that it may be time to
remove old Snapshots.

The configurations allowed are described in the table below. Adjusting these
defaults should be done in consideration with the needs of the team and the
storage requirements necessary.

+-------------------------------+----------------------------------------+-------------------------------------------------------------------------------------+
| Config name                   | Environment variable                   | Default | Description                                                               |
+===============================+========================================+=========+===========================================================================+
| Maximum total Snapshots       | ``FIFTYONE_SNAPSHOTS_MAX_IN_DB``       | 100     | The max total number of Snapshots allowed at once. -1 for no limit.       |
+-------------------------------+----------------------------------------+---------+---------------------------------------------------------------------------+
| Maximum Snapshots per-dataset | ``FIFTYONE_SNAPSHOTS_MAX_PER_DATASET`` | 20      | The max number of Snapshots allowed per dataset. -1 for no limit.         |
+-------------------------------+----------------------------------------+---------+---------------------------------------------------------------------------+

Temporary Limitations
---------------------

- At this time, Snapshots cannot be used with
  :ref:`Plugin Operators <fiftyone-operators>`.
- Snapshots of datasets larger than 200 thousand samples have number of samples
  added/deleted computed, but number modified is not.

.. _future-roadmap:

The future!
___________

The following are some items that are on the roadmap for future iterations
of the dataset versioning system. Keep an eye out for future FiftyOne Teams
versions for these additional features!

**Near-Term**

- Offloading least-used Snapshots to external data stores to reduce load on the
  FiftyOne database
- Optimize diff computation for larger (over 200k) datasets and remove the
  limit
- Enable Operators to interact with Snapshots

**Longer Term**

- Further optimize existing versioning system
- Support external versioning backends
- Searching Snapshots
- Content-aware Snapshot change summaries

**Exploratory**

- Visualization of Snapshot diffs
- Implement a branch-and-merge model
- Deep integrations with versioning backend tools to version FiftyOne datasets
  alongside your models and media
