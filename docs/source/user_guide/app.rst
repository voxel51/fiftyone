.. _fiftyone-app:

Using the FiftyOne App
======================

.. default-role:: code

The FiftyOne App is a powerful graphical user interface that enables you to
visualize, browse, and interact directly with your
:ref:`datasets <using-datasets>`.

.. image:: /images/app/app-filters.gif
   :alt: app-filters
   :align: center

App environments
________________

The FiftyOne App can be used in any environment that you're working in, from
a local IPython shell, to a remote machine or cloud instance, to a Jupyter or
Colab notebook. Check out the :ref:`environments guide <environments>` for best
practices when working in each environment.

Sessions
________

The basic FiftyOne workflow is to open a Python shell and load a |Dataset|.
From there you can launch the FiftyOne App and interact with it
programmatically via a *session*.

.. _creating-an-app-session:

Creating a session
------------------

You can launch an instance of the App by calling
:func:`launch_app() <fiftyone.core.session.launch_app>`. This method returns a
|Session| instance, which you can subsequently use to interact programmatically
with the App!

.. code-block:: python
    :linenos:

    import fiftyone as fo

    session = fo.launch_app()

App sessions are highly flexible. For example, you can launch
:ref:`launch multiple App instances <faq-multiple-apps>` and connect multiple
App instances to the  :ref:`same dataset <faq-multiple-sessions-same-dataset>`.

By default, when you're working in a non-notebook context, the App will be
opened in a new tab of your web browser. However, there is also a
:ref:`desktop App <installing-fiftyone-desktop>` that you can install if you
would like to run the App as a desktop application.

.. note::

    :func:`fo.launch_app() <fiftyone.core.session.launch_app>` will launch the
    App asynchronously and return control to your Python process. The App will
    then remain connected until the process exits.

    If you are using the App in a script, you should use
    :meth:`session.wait() <fiftyone.core.session.Session.wait>` to block
    execution until you close it manually:

    .. code-block:: python

        # Launch the App
        session = fo.launch_app(...)

        # (Perform any additional operations here)

        # Blocks execution until the App is closed
        session.wait()

.. image:: /images/app/app-empty.gif
   :alt: app-empty
   :align: center

Updating a session's dataset
----------------------------

Sessions can be updated to show a new |Dataset| by updating the
:meth:`Session.dataset <fiftyone.core.session.Session.dataset>` property of the
session object:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("cifar10")

    # View the dataset in the App
    session.dataset = dataset

.. image:: /images/app/app-scroll.gif
   :alt: app-scroll
   :align: center

Updating a session's view
-------------------------

You can also show a specific :ref:`view <using-views>` into the current dataset
in the App by setting the
:meth:`Session.view <fiftyone.core.session.Session.view>` property of the
session.

For example, the command below loads a |DatasetView| in the App that shows the
first 10 samples in the dataset sorted by their `uniqueness` field:

.. code-block:: python
    :linenos:

    session.view = dataset.sort_by("uniqueness").limit(10)

.. image:: /images/app/app-views1.gif
   :alt: app-views1
   :align: center

.. _remote-session:

Remote sessions
_______________

If your data is stored on a remote machine, you can forward a session from
the remote machine to your local machine and seemlessly browse your remote
dataset from you web browser.

Check out the :ref:`environments page <environments>` for more information on
possible configurations of local/remote/cloud data and App access.

Remote machine
--------------

On the remote machine, you can load a |Dataset| and launch a remote session
using either the Python library or the CLI.

.. tabs::

  .. group-tab:: Python

    Load a |Dataset| and call
    :meth:`launch_app() <fiftyone.core.session.launch_app>` with the
    ``remote=True`` argument.

    .. code-block:: python
        :linenos:

        # On remote machine

        import fiftyone as fo

        dataset = fo.load_dataset("<dataset-name>")

        session = fo.launch_app(dataset, remote=True)  # optional: port=XXXX

    You can use the optional ``port`` parameter to choose the port of your
    remote machine on which to serve the App. The default is ``5151``, which
    can also be customized via the ``default_app_port`` parameter of your
    :ref:`FiftyOne config <configuring-fiftyone>`.

    Note that you can manipulate the `session` object on the remote machine as
    usual to programmatically interact with the App instance that you'll
    connect to locally next.

  .. group-tab:: CLI

    Run the :ref:`fiftyone app launch <cli-fiftyone-app-launch>` command in a
    terminal:

    .. code-block:: shell

        # On remote machine

        fiftyone app launch <dataset-name> --remote  # optional: --port XXXX

    You can use the optional ``--port`` flag to choose the port of your
    remote machine on which to serve the App. The default is ``5151``, which
    can also be customized via the ``default_app_port`` parameter of your
    :ref:`FiftyOne config <configuring-fiftyone>`.

.. _remote-app-local-machine:

Local machine
-------------

On the local machine, you can access an App instance connected to the remote
session by either manually configuring port forwarding or via the FiftyOne CLI:

.. tabs::

  .. group-tab:: Manual

    Open a new terminal window on your local machine and execute the following
    command to setup port forwarding to connect to your remote session:

    .. code-block:: shell

        # On local machine
        ssh -N -L 5151:127.0.0.1:XXXX [<username>@]<hostname>

    Leave this process running and open http://localhost:5151 in your browser
    to access the App.

    In the above, `[<username>@]<hostname>` specifies the remote machine to
    connect to, `XXXX` refers to the port that you chose when you launched the
    session on your remote machine (the default is 5151), and `5151` specifies
    the local port to use to connect to the App (and can be customized).

  .. group-tab:: FiftyOne

    If you have FiftyOne installed on your local machine, you can
    :ref:`use the CLI <cli-fiftyone-app-connect>` to automatically configure
    port forwarding and open the App in your browser as follows:

    .. code-block:: shell

        # On local machine
        fiftyone app connect --destination [<username>@]<hostname>

    If you choose a custom port `XXXX` on the remote machine, add a
    ``--port XXXX`` flag to the above command.

    If you would like to use a custom local port to serve the App, add a
    ``--local-port YYYY`` flag to the above command.

.. note::

    Remote sessions are highly flexible. For example, you can connect to
    :ref:`multiple remote sessions <faq-connect-to-multiple-remote-sessions>`
    and run multiple remote sessions
    :ref:`from one machine <faq-serve-multiple-remote-sessions>`.

.. _app-fields-sidebar:

Fields
______

Any labels, tags, and scalar fields can be overlaid on the samples in the App
by toggling the corresponding display options on the lefthand side of the App.

.. image:: /images/app/app-fields.gif
    :alt: app-fields
    :align: center

.. _app-filtering:

Filtering sample fields
_______________________

The App provides UI elements in both grid view and expanded sample view that
you can use to filter your dataset. To view the available filter options for a
field, click the caret icon to the right of the field's name.

Whenever you modify a filter element, the App will automatically update to show
only those samples and/or labels that match the filter.

.. note::

    Did you know? When you have applied filter(s) in the App, a bookmark icon
    appears in the top-left corner of the sample grid. Click this button to
    convert your filters to an equivalent set of stage(s) in the
    :ref:`view bar <app-create-view>`!

.. image:: /images/app/app-filters.gif
   :alt: app-filters
   :align: center

.. _app-create-view:

Using the view bar
__________________

The view bar makes all of the powerful searching, sorting, and filtering
operations :ref:`provided by dataset views <using-views>` available directly in
the App.

.. note::

    Any changes to the current view that you make in the view bar are
    automatically reflected in the |DatasetView| exposed by the
    :meth:`Session.view <fiftyone.core.session.Session.view>` property of the
    App's session object.

.. image:: /images/app/app-views2.gif
    :alt: app-views2
    :align: center

.. _app-sample-view:

Viewing a sample
________________

Click a sample to open an expanded view of the sample. This modal also
contains information about the fields of the |Sample| and allows you to access
the raw JSON description of the sample.

.. image:: /images/app/app-expanded.gif
    :alt: app-expanded
    :align: center

.. _app-image-visualizer:

Using the image visualizer
__________________________

The image visualizer allows you to interactively visualize images along with
their associated labels. When you hover over an image in the visualizer, a
head-up display (HUD) appears with a control bar providing various options.

For example, you can zoom in/out and pan around an image by scrolling and
click-dragging with your mouse or trackpad. You can also zoom tightly into the
currently visible (or selected) labels by clicking on the `Crop` icon in the
controls HUD or using the `z` keyboard shortcut. Press `ESC` to reset your
view.

When multiple labels are overlayed on top of each other, the up and down
arrows offer a convenient way to rotate the z-order of the labels that your
cursor is hovering over, so every label and it's tooltip can be viewed.

The settings icon in the controls HUD contains a variety of options for
customizing the rendering of your labels, including whether to show object
labels, confidences, or the tooltip. The default settings for these parameters
can be configured via the :ref:`App config <app-config>`.

Keyboard shortcuts are availble for almost every action. Click the `?` icon
in the controls HUD or use the `?` keyboard shortcut to display the list of
available actions and their associated hotkeys.

.. image:: /images/app/app-image-visualizer.gif
    :alt: image-visualizer
    :align: center

.. note::

    When working in :ref:`Jupyter/Colab notebooks <notebooks>`, you can hold
    down the `SHIFT` key when zoom-scrolling or using the arrow keys to
    navigate between samples/labels to restrict your inputs to the App and thus
    prevent them from also affecting your browser window.

.. _app-video-visualizer:

Using the video visualizer
__________________________

The video visualizer offers all of the same functionality as the image
visualizer, as well as some convenient actions and shortcuts for navigating
through a video and its labels.

There are a variety of additional video-specific keyboard shortcuts. For
example, you can press the spacebar to play/pause the video, and you can press
`0`, `1`, ..., `9` to seek to the 0%, 10%, ..., 90% timestamp in the video.
When the video is paused, you can use `<` and `>` to navigate frame-by-frame
through the video.

Click the `?` icon in the controls HUD or use the `?` keyboard shortcut to
display the list of available actions and their associated hotkeys.

All of the same options in the image settings are available in the video
settings menu in the controls HUD, as well as additional options like whether
to show frame numbers rather than timestamp in the HUD. The default settings
for all such parameters can be configured via the
:ref:`App config <app-config>`.

Playback rate and volume are also available in the video controls HUD.
Clicking on one of the icons resets the setting to the default. And when
hovering, a slider appears to adjust the setting manually.

.. note::

    Did you know? The video visualizer streams frame data on-demand, which
    means that playback begins as soon as possible and even heavyweight label
    types like segmentations are supported!

.. image:: /images/app/app-video-visualizer.gif
    :alt: video-visualizer
    :align: center

.. note::

    When working in :ref:`Jupyter/Colab notebooks <notebooks>`, you can hold
    down the `SHIFT` key when zoom-scrolling or using the arrow keys to
    navigate between samples/labels to restrict your inputs to the App and thus
    prevent them from also affecting your browser window.

.. _app-stats-tabs:

Statistics tabs
_______________

The `Sample tags`, `Label tags`, `Labels`, and `Scalars` tabs in the App let
you visualize different statistics about your dataset.

.. note::

    The statistics in these tabs automatically update to reflect the current
    :ref:`view <using-views>` that you have loaded in the App, or the entire
    :ref:`dataset <using-datasets>` if no view is loaded.

The `Sample tags` and `Label tags` tabs show the distribution of any
:ref:`tags <app-tagging>` that you've added to your dataset.

The `Labels` tab shows the class distributions for each
:ref:`labels field <using-labels>` that you've added to your dataset. For
example, you may have histograms of ground truth labels and one more sets of
model predictions.

The `Scalars` tab shows distributions for numeric (integer or float) or
categorical (e.g., string) :ref:`primitive fields <adding-sample-fields>` that
you've added to your dataset. For example, if you computed
:ref:`uniqueness <brain-image-uniqueness>` on your dataset, a histogram of
uniqueness values will be displayed under the `Scalars` tab.

.. image:: /images/app/app-stats.gif
    :alt: app-stats
    :align: center

.. _app-select-samples:

Selecting samples
_________________

As previously explained, the |Session| object created when you launch the App
lets you interact with the App from your Python process.

One common workflow is to select samples visually in the App and then access
the data for the selected samples in Python. To perform this workflow, first
select some samples in the App:

.. image:: /images/app/app-selection.gif
    :alt: app-selection
    :align: center

|br|
The selected samples checkmark in the options row in the upper-left corner of
the sample grid records the number of samples that you have currently selected.
You can also take actions such as updating the view to only show (or exclude)
the currently selected samples.

Tagging also automatically applies to selected samples or their labels when any
samples are selected. See :ref:`tagging <app-tagging>` for more details.

You can also access the
:meth:`Session.selected <fiftyone.core.session.Session.selected>` property of
your session to retrieve the IDs of the currently selected samples in the App:

.. code-block:: python

    # Print the IDs of the currently selected samples
    print(session.selected)

    # Create a view containing only the selected samples
    selected_view = dataset.select(session.selected)

.. code-block:: text

    ['5ef0eef405059ebb0ddfa6cc',
     '5ef0eef405059ebb0ddfa7c4',
     '5ef0eef405059ebb0ddfa86e',
     '5ef0eef405059ebb0ddfa93c']

.. _app-select-labels:

Selecting labels
_________________

You can also use the App to select individual labels within samples. You can
use this functionality to visually show/hide labels of interest in the App; or
you can access the data for the selected labels from Python, for example by
creating a |DatasetView| that includes/excludes the selected labels.

To perform this workflow, open the expanded sample view by clicking on a sample
in the App. Then click on individual labels to select them:

.. image:: /images/app/app-label-selection.gif
    :alt: app-label-selection
    :align: center

|br|
Selected labels will appear with dotted lines around them. The example above
shows selecting an object detection, but classifications, polygons, polylines,
segmentations, and keypoints can be selected as well.

When you have selected labels in the App, you can use the selected labels
options in the upper-right (the orange checkmark button) to hide these labels
from view or exclude all other labels.

You can also access the
:meth:`Session.selected_labels <fiftyone.core.session.Session.selected_labels>`
property of your session to retrieve information about the currently selected
labels in the App:

.. code-block:: python

    # Print information about the currently selected samples in the App
    fo.pprint(session.selected_labels)

    # Create a view containing only the selected labels
    selected_view = dataset.select_labels(session.selected_labels)

    # Create a view containing everything except the selected labels
    excluded_view = dataset.exclude_labels(session.selected_labels)

.. code-block:: text

    [
        {
            'object_id': '5f99d2eb36208058abbfc02a',
            'sample_id': '5f99d2eb36208058abbfc030',
            'field': 'ground_truth',
        },
        {
            'object_id': '5f99d2eb36208058abbfc02b',
            'sample_id': '5f99d2eb36208058abbfc030',
            'field': 'ground_truth',
        },
        ...
    ]

.. _app-tagging:

Tags and tagging
________________

Tagging is a first-class citizen in FiftyOne, as both |Sample| and |Label|
instances have a ``tags`` attribute that you can use to store arbitrary string
tags for your data.

The FiftyOne API provides methods like
:meth:`tag_samples() <fiftyone.core.collections.SampleCollection.tag_samples>`
and
:meth:`tag_labels() <fiftyone.core.collections.SampleCollection.tag_labels>`
that you can use to programmatically manage the tags on your dataset. However,
the App also provides a convenient UI for interactively adding, removing, and
filtering by |Sample| and |Label| tags.

You can tag or untag batches of samples/labels in the App by clicking on the
tag icon above the sample grid.

For example, take the following steps to tag all labels in the ``predictions``
field of a dataset:

-   Make sure that ``predictions`` is the only |Label| field checked in the
    filters sidebar
-   Click the tag icon in the top-left corner of the grid
-   Select `Labels`, type in the tag, and then click `Apply`

You can also use the tag menu to remove existing tags.

.. note::

    Any tagging operations that you perform using the tagging UI above the
    sample grid will be applied to your **current view**, respecting any
    filters or show/hide checkboxes you have applied in the filters sidebar,
    unless you have selected individual samples, in which case the operation
    will only apply to the **selected samples**.

.. image:: /images/app/app-tagging-samples.gif
    :alt: app-tagging-samples
    :align: center

|br|
The App also supports tagging data in individual samples when you have opened
the expanded sample view by clicking on a sample. The tag icon is located in
the top-right corner of the modal.

.. note::

    Any tagging operations that you perform using the tagging UI in expanded
    sample mode will be applied to the **current sample**, respecting any
    filters or show/hide checkboxes you have applied, unless you have selected
    individual labels, in which case the operation will only apply to the
    **selected labels**. The latter may span multiple samples.

.. image:: /images/app/app-tagging-expanded.gif
    :alt: app-tagging-expanded
    :align: center

|br|
If your dataset has sample or label tags, you can use the ``SAMPLE TAGS`` and
``LABEL TAGS`` sections of the filters sidebar to filter by your tags.

When you click the eye icon next to a sample tag, your view will update to only
include samples with the tag(s) you have selected. When you click the eye icon
next to a label tag, your view will update to only include labels with tag(s)
you have selected, and any samples with no matches will be automatically
excluded.

.. note::

    Did you know? When you have applied filter(s) in the App, a save icon
    appears in the top-left corner of the sample grid. Clicking this button
    will convert your filters to an equivalent set of stage(s) in the
    :ref:`view bar <app-create-view>`!

.. _app-object-patches:

Viewing object patches
______________________

Whenever you load a dataset in the App that contains label list fields in
|Detections| or |Polylines| format, you can use the patches menu to create a
view into your data that contains one sample per object patch in a specified
label field of your dataset.

To switch to patches view, simply click the patches icon above the sample grid
in the App, toggle to the ``Labels`` submenu, and then choose the field whose
object patches you want to view. After you make a selection, a new |ToPatches|
view stage will be appended to the view bar and your view will be updated to
show the patches.

By default, patches are cropped so only the label patch is visible, but you can
zoom in/out and pan as desired in the
:ref:`image visualizer <app-image-visualizer>`. If you would like to see the
entire image for each patch by default, click on the settings icon and uncheck
the `Crop to patch` setting. The setting is available in both the grid and
expanded sample view.

.. note::

    Switching to patches view will create patches for **only** the contents of
    your current view, so you can use the view bar and the filters sidebar to
    select only the content of interest prior to extracting patches.

.. image:: /images/app/app-object-patches.gif
    :alt: object-patches
    :align: center

|br|
You can interact with object patches views in the App just like you would with
any other view, including:

-   You can filter and transform objects patches views using the filter
    sidebar or the view bar
-   Any modifications to patch label tags that you make via the
    :ref:`tagging menu <app-tagging>` will be reflected on the source dataset

One notable exception is that tagging or untagging patches themselves (as
opposed to their labels) will not affect the sample tags of the underlying
|Sample|.

.. note::

    Did you know? You can construct object patches views programmatically
    via :ref:`dataset views <object-patches-views>`!

.. _app-evaluation-patches:

Viewing evaluation patches
__________________________

Whenever you load a dataset in the App that contains object detections on which
you have :ref:`run evaluation <evaluating-detections>`, you can use the patches
menu to create a view into your data that contains one sample for each true
positive, false positive, and false negative example.

To switch to evaluation patches view, simply click the patches icon above the
sample grid in the App, toggle to the ``Evaluations`` submenu, and then choose
the ``eval_key`` under which you saved the evaluation results that you want
view. After you make a selection, a new |ToEvaluationPatches| view stage will
be appended to the view bar and your view will be updated to show the
evaluation patches!

By default, evaluation patches are cropped so only the label(s) that make up
the patch are visible, but you can zoom in/out and pan as desired in the
:ref:`image visualizer <app-image-visualizer>`. If you would like to see the
entire image for each patch by default, click on the settings icon and uncheck
the `Crop to patch` setting. The setting is available in both the grid and
expanded sample view.

.. note::

    Refer to the :ref:`evaluation guide <evaluating-detections>` guide for more
    information about running evaluations and using evaluation patches views
    to analyze object detection models.

.. image:: /images/app/app-evaluation-patches.gif
    :alt: evaluation-patches
    :align: center

|br|
You can interact with evaluation patches views in the App just like you would
with any other view, including:

-   You can filter and transform evaluation patches views using the filter
    sidebar or the view bar
-   Any modifications to the tags of the ground truth or predicted labels that
    you make via the :ref:`tagging menu <app-tagging>` will be reflected on the
    source dataset

One notable exception is that tagging or untagging patches themselves (as
opposed to their labels) will not affect the sample tags of the underlying
|Sample|.

.. note::

    Switching to evaluation patches view will generate patches for **only**
    the contents of the current view, which may differ from the view on which
    the ``eval_key`` evaluation was performed. This may exclude some labels
    that were evaluated and/or include labels that were not evaluated.

    If you would like to see patches for the exact view on which an
    evaluation was performed, first call
    :meth:`load_evaluation_view() <fiftyone.core.collections.SampleCollection.load_evaluation_view>`
    to load the view and then convert to patches.

.. _app-video-clips:

Viewing video clips
___________________

Whenever you load a video dataset in the App that contains
|VideoClassification| labels or frame-level label lists such as |Detections|,
you can use the patches menu to create a view into your data that contains one
sample per clip defined by a specified label field of your dataset.

To switch to clips view, simply click the patches icon above the sample grid
in the App, toggle to the ``Labels`` submenu, and then choose the field whose
clips you want to view. After you make a selection, a new |ToClips| view stage
will be appended to the view bar and your view will be updated to show the
clips.

Creating a clips view for a |VideoClassification| or |VideoClassifications|
field will create one sample per video classification defined by its
`[first, last]` frame support, while creating a clips view for a frame-level
label list field such as |Detections| will contain one sample per contiguous
range of frames that contains at least one label in the specified field. See
:ref:`this section <clip-views>` for more information about defining clip
views.

When you hover over a clip in the grid view, the clip and its labels will play
on loop. Similarly, when you open a clip in the
:ref:`video visualizer <app-video-visualizer>`, you will see only the clip when
you play the video. If you would like to see other segments of the video from
which a clip was extracted, simply drag the video scrubber outside the range of
the clip.

.. note::

    Switching to clips view will create clips for **only** the contents of
    your current view, so you can use the view bar and the filters sidebar to
    select only the content of interest prior to extracting clips.

.. image:: /images/app/app-clip-views.gif
    :alt: clip-views
    :align: center

|br|
You can interact with clip views in the App just like you would with any other
view, including:

-   You can filter and transform clip views using the filter sidebar or the
    view bar
-   Any modifications to label tags that you make via the
    :ref:`tagging menu <app-tagging>` will be reflected on the source dataset

One notable exception is that tagging or untagging clips themselves (as opposed
to their labels) will not affect the sample tags of the underlying |Sample|.

.. note::

    Did you know? You can construct clip views programmatically via
    :ref:`dataset views <clip-views>`!

.. _app-similarity:

Sorting by visual similarity
____________________________

Whenever you select samples, patches, or labels in the App in a |Dataset| that
has been indexed by :ref:`visual similarity <brain-similarity>`, you can use
the similarity menu in the App to sort or filter your current view based on
visual similarity to the chosen image or object.

.. note::

    Refer to the :ref:`Brain guide <brain-similarity>` for more information
    about indexing datasets by image/object similarity for use with this
    feature.

.. _app-image-similarity:

Image similarity
----------------

Whenever one or more images are selected in the App, the similarity menu icon
appears above the grid. If you have indexed the dataset by
:ref:`image similarity <brain-image-similarity>`, then you will see the
``brain_key`` (or multiple keys to choose from) for the applicable indexes in
this menu.

Choose the ``brain_key`` of interest and click apply, and a new
|SortBySimilarity| view stage will be appended to the view bar and your view
will be updated to show the results of the query.

In the menu, you can optionally specify a maximum number of matches to return
(``k``) and whether to sort in order of least similarity rather than most
similarity (``reverse``).

.. image:: /images/brain/brain-image-similarity.gif
    :alt: image-similarity
    :align: center

.. note::

    For large datasets, you may notice longer load times the first time you use
    a similarity index in a session. Subsequent similarity searches will use
    cached results and will be faster!

.. _app-object-similarity:

Object similarity
-----------------

Whenever one or more labels or patches are selected in the App, the similarity
menu icon appears above the sample grid. If you have indexed the dataset by
:ref:`object similarity <brain-object-similarity>`, then you will see the
``brain_key`` (or multiple keys to choose from) for the applicable indexes in
this menu.

The typical workflow for object similarity is to first switch to
:ref:`object patches view <app-object-patches>` for the label field of
interest. In this view, the similarity menu icon will appear whenever you have
selected one or more patches from the grid, and the resulting view will sort
the patches according to the similarity of their objects with respect to the
objects in the query patches.

Choose the ``brain_key`` of interest and click apply, and a new
|SortBySimilarity| view stage will be appended to the view bar and your view
will be updated to show the results of the query.

In the menu, you can optionally specify a maximum number of matches to return
(``k``) and whether to sort in order of least similarity rather than most
similarity (``reverse``).

.. image:: /images/brain/brain-object-similarity.gif
    :alt: object-similarity
    :align: center

|br|
You can also sort by visual similarity to an object from the expanded sample
view in the App by selecting an object and then using the similarity menu that
appears in the upper-right corner of the modal:

.. image:: /images/brain/brain-object-similarity-modal.gif
    :alt: object-similarity-modal
    :align: center

.. note::

    For large datasets, you may notice longer load times the first time you use
    a similarity index in a session. Subsequent similarity searches will use
    cached results and will be faster!

.. _app-config:

Configuring the App
___________________

The behavior of the App can be configured in various ways. The code sample
below shows the basic pattern for customizing the App on a one-off basis:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Create a custom App config
    app_config = fo.AppConfig()
    app_config.show_confidence = False
    app_config.show_label = True

    session = fo.launch_app(dataset, config=app_config)

You can also reconfigure a live |Session| by editing its
:meth:`session.config <fiftyone.core.session.Session.config>` property and
calling :meth:`session.refresh() <fiftyone.core.session.Session.refresh>` to
apply the changes:

.. code-block:: python
    :linenos:

    # Customize the config of a live Session
    session.config.show_confidence = True
    session.config.show_label = True

    # Refresh the session to apply the changes
    session.refresh()

See :ref:`this page <configuring-fiftyone-app>` for more information about
configuring the App.
