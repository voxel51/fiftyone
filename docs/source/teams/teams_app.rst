.. _teams-app:

FiftyOne Teams App
===================

.. default-role:: code

Like the open source FiftyOne App, the FiftyOne Teams App allows you to visually inspect, filter, sort, and concatenate view stages on the level of samples in individual datasets. In addition to these features, the FiftyOne Teams App facilitates the organization, versioning, permissioning, and sharing of datasets on a per-dataset basis. This page will walk through some of the added functionality available in the FiftyOne Teams App.

.. _teams-app-homepage:

Navigating the homepage
________________________


In the top bar on this page, on the left side, the grey number directly to the right of “All datasets” indicates the total number of datasets that your team has. If there are more than 20 datasets, you can use the “Previous” and “Next” buttons at the bottom of the page to see a different batch of datasets, sorted or filtered to your specifications. 

No matter what page you are on in the FiftyOne Teams App, clicking on the Voxel51 logo in the upper left will bring you back to ``<team-name>.fiftyone.ai/datasets``.

.. _pinning-datasets:

Pinning and unpinning datasets
-------------------------------

To pin a dataset for easy access, hover your cursor over the row corresponding to the dataset you want to pin. Immediately to the right of the dataset name you should see a “pin” icon. Click on this icon to pin this dataset to the “Your pinned datasets” section on the right hand side. The order in which datasets appear in the pinned datasets section is the order in which they are added, with the most recently pinned dataset appearing on top.

To unpin a dataset, click on the pin icon next to the dataset name under the “Your pinned datasets” header, or the pin next to the dataset name in the main view.

.. _ordering-datasets:

Ordering datasets
------------------

You can use the drop-down menu in the upper left to select the criterion by which to arrange the datasets, including number of samples, date of creation, and alphabetically by name.

.. filtering-datasets:

Filtering datasets
-------------------

You can use the search bar (with the magnifying glass icon) to the right of the sorting dropdown to filter datasets by name, tags, and media type. One important detail is that the filtering and sorting operations are compatible with each other: so long as the search text remains in the search bar, changing the sorting order will continue to show only the datasets matching the query. 

.. _create-edit-delete:

Creating, editing, and deleting datasets
_________________________________________

While with FiftyOne Teams it is still possible to create, edit, and delete datasets programmatically with the Python SDK, with the Teams App, it is now possible to perform these operations without writing a single line of code.

.. _create-dataset:

Create new dataset
-------------------

To create a new dataset, click on the red “+ New dataset…” button in the upper right. A pop-up will then appear, allowing you to set the name of the dataset and enter a description and tags. All of these properties can be edited later. While it is strongly recommended to provide tags and a description, the only requirement for dataset creation is a unique dataset name. 

* **Name**: when you’re entering the text for the dataset name, a URL will appear below the name, denoting the address at which the dataset will be accessible, as well as either a green checkmark or a red “x” denoting whether the entered name is or is not available.
* **Tags**: you can enter as many tags as you want, for the split, media type, context, version, or any other pertinent information. To add a tag, start typing in the text bar. If the tag you want to add is not present in the dropdown, type out the full text of the desired tag and then press the tab key. If the tag you want to add is present in the dropdown list, either
	#. Navigate to it using the down arrow until that entry is highlighted and then press the enter key, or
	#. Use your mouse to select that entry and click to add.


.. _edit-dataset:

Edit dataset
-------------------

To edit a dataset click on the three vertical dots on the right side of the dataset row in the main view and click on the “Edit dataset” pop-up that appears. This is equivalent to clicking on the dataset’s row itself and then toggling from the “Samples” tab to the “Manage” tab in the screen the appears.

* **Edit basic info**: in the “Basic Info” tab, you can change the name, description, and tags for the dataset. Additionally, you can clone the dataset. To clone the dataset, all you need to do is specify a name for the cloned dataset.
* **Manage dataset access**: in the “Manage dataset access” tab, you can configure two different types of access.
	#. Under the “Default access” header, you can specify the default level of access for all members of the team. Unless otherwise specified in the “People with access” section, this is the level of access people on your team will have.
	#. Under the “People with access” header, you can grant a different level of access to individuals. To grant any level of access to someone who is not a member of the team, they will already need to be registered as a “Guest”, and they must first be invited as a Guest from the Team Settings page. See this page for details on managing team settings.


.. _delete-dataset:

Delete dataset
-------------------

To delete a dataset, switch to the “Danger zone” tab and select “Delete entire dataset”. One should proceed with caution as this operation is permanent.







