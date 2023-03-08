.. _fiftyone-brain:

FiftyOne Brain
==============

.. default-role:: code

The FiftyOne Brain provides powerful machine learning techniques that are
designed to transform how you curate your data from an art into a measurable
science.

.. note::

    The FiftyOne Brain is a separate Python package that is bundled with
    FiftyOne. Although it is closed-source, it is licensed as freeware, and you
    have permission to use it for commercial or non-commercial purposes. See
    `the license <https://github.com/voxel51/fiftyone/blob/develop/package/brain/LICENSE>`_
    for more details.

The FiftyOne Brain methods are useful across the stages of the machine learning
workflow:

* :ref:`Visualizing embeddings <brain-embeddings-visualization>`:
  Tired of combing through individual images/videos
  and staring at aggregate performance metrics trying to figure out how to
  improve the performance of your model? Using FiftyOne to visualize your
  dataset in a *low-dimensional embedding space* can reveal patterns and
  clusters in your data that can help you answer many important questions about
  your data, from identifying the most critical failure modes of your model, to
  isolating examples of critical scenarios, to recommending new samples to add
  to your training dataset, and more!

* :ref:`Similarity <brain-similarity>`: When constructing a dataset or training
  a model, have you ever wanted to find similar examples to an image or object
  of interest? For example, you may have found a failure case of your model and
  now want to search for similar scenarios in your evaluation set to diagnose
  the issue, or you want to mine your data lake to augment your training set to
  fix the issue. Use the FiftyOne Brain to index your data by *similarity* and
  you can easily query and sort your datasets to find similar examples, both
  programmatically and via point-and-click in the App.

* :ref:`Uniqueness <brain-image-uniqueness>`:
  During the training loop for a model, the best results will
  be seen when training on unique data. The FiftyOne Brain provides a
  *uniqueness measure* for images that compare the content of every image in a
  dataset with all other images. Uniqueness operates on raw images and does not
  require any prior annotation on the data. It is hence very useful in the
  early stages of the machine learning workflow when you are likely asking
  "What data should I select to annotate?"

* :ref:`Mistakenness <brain-label-mistakes>`:
  Annotations mistakes create an artificial ceiling on the performance of your
  models. However, finding these mistakes by hand is at least as arduous as the
  original annotation was, especially in cases of larger datasets. The FiftyOne
  Brain provides a quantitative *mistakenness measure* to identify possible
  label mistakes. Mistakenness operates on labeled images and requires the
  logit-output of your model predictions in order to provide maximum efficacy.
  It also works on detection datasets to find missed objects, incorrect
  annotations, and localization issues.

* :ref:`Hardness <brain-sample-hardness>`:
  While a model is training, it will learn to understand attributes of certain
  samples faster than others. The FiftyOne Brain provides a *hardness measure*
  that calculates how easy or difficult it is for your model to understand any
  given sample. Mining hard samples is a tried and true measure of mature
  machine learning processes. Use your current model instance to compute
  predictions on unlabeled samples to determine which are the most valuable to
  have annotated and fed back into the system as training samples, for example.

.. note::

    Check out the :ref:`tutorials page <tutorials>` for detailed examples
    demonstrating the use of each Brain capability.

.. _brain-embeddings-visualization:

Visualizing embeddings
______________________

The FiftyOne Brain provides a powerful
:meth:`compute_visualization() <fiftyone.brain.compute_visualization>` method
that you can use to generate low-dimensional representations of the samples
and/or individual objects in your datasets.

These representations can be visualized via
:ref:`interactive plots <interactive-plots>`, which can be connected to the
:ref:`FiftyOne App <fiftyone-app>` so that when points of interest are selected
in the plot, the corresponding samples/labels are automatically selected in the
App, and vice versa.

.. image:: /images/brain/brain-mnist.png
   :alt: mnist
   :align: center

.. note::

    Interactive plots are currently only supported in Jupyter notebooks. In the
    meantime, you can still use FiftyOne's plotting features in other
    environments, but you must manually call
    :meth:`plot.show() <fiftyone.core.plots.base.Plot.show>` to update the
    state of a plot to match the state of a connected |Session|, and any
    callbacks that would normally be triggered in response to interacting with
    a plot will not be triggered.

    See :ref:`this section <working-in-notebooks>` for more information.

There are two primary components to an embedding visualization: the method used
to generate the embeddings, and the dimensionality reduction method used to
compute a low-dimensional representation of the embeddings.

Embedding methods
-----------------

The `embeddings` and `model` parameters of
:meth:`compute_visualization() <fiftyone.brain.compute_visualization>`
support a variety of ways to generate embeddings for your data:

-   Provide nothing, in which case a default general purpose model is used to
    embed your data
-   Provide a |Model| instance or the name of any model from the
    :ref:`model zoo <model-zoo>` that supports embeddings
-   Compute your own embeddings and provide them in array form
-   Provide the name of a |VectorField| or |ArrayField| of your dataset in
    which your embeddings are stored

Dimensionality reduction methods
--------------------------------

The `method` parameter of
:meth:`compute_visualization() <fiftyone.brain.compute_visualization>` allows
you to specify the dimensionality reduction method to use. The supported
methods are:

-   `"umap"` (default): Uniform Manifold Approximation and Projection
    (`UMAP <https://github.com/lmcinnes/umap>`_)
-   `"t-sne"`: t-distributed Stochastic Neighbor Embedding (`t-SNE <https://lvdmaaten.github.io/tsne>`_)
-   `"pca"`: Principal Component Analysis (`PCA <https://scikit-learn.org/stable/modules/generated/sklearn.decomposition.PCA.html>`_)

.. note::

    When you use the default `UMAP <https://github.com/lmcinnes/umap>`_ method
    for the first time, you will be prompted to install the
    `umap-learn <https://github.com/lmcinnes/umap>`_ package.

Applications
------------

How can embedding-based visualization of your data be used in practice? These
visualizations often uncover hidden structure in you data that has important
semantic meaning depending on the data you use to color/size the points.

Here are a few of the many possible applications:

-   Identifying anomolous and/or visually similar examples
-   Uncovering patterns in incorrect/spurious predictions
-   Finding examples of target scenarios in your data lake
-   Mining hard examples for your evaluation pipeline
-   Recommending samples from your data lake for classes that need additional
    training data
-   Unsupervised pre-annotation of training data

The best part about embedding visualizations is that you will likely discover
more applications specific to your use case when you try it out on your data!

.. note::

    Check out the
    :doc:`image embeddings tutorial </tutorials/image_embeddings>` to see
    example uses of the Brain's embeddings-powered visualization methods to
    uncover hidden structure in datasets.

Image embeddings example
------------------------

The following example gives a taste of the powers of visual embeddings in
FiftyOne using the :ref:`BDD100K dataset <dataset-zoo-bdd100k>` from the
dataset zoo, embeddings generated by a
:ref:`mobilenet model <model-zoo-mobilenet-v2-imagenet-torch>` from the model
zoo, and the default `UMAP <https://github.com/lmcinnes/umap>`_ dimensionality
reduction method.

In this setup, the scatterpoints correspond to images in the validation split
colored by the `time of day` labels provided by the BDD100K dataset. The plot
is :ref:`attached to an App instance <attaching-plots>`, so when points are
lasso-ed in the plot, the corresponding samples are automatically selected in
the session's :meth:`view <fiftyone.core.session.Session.view>`.

Each block in the example code below denotes a separate cell in a
:ref:`Jupyter notebook <working-in-notebooks>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    # The BDD dataset must be manually downloaded. See the zoo docs for details
    source_dir = "/path/to/dir-with-bdd100k-files"

    # Load dataset
    dataset = foz.load_zoo_dataset(
        "bdd100k", split="validation", source_dir=source_dir,
    )

    # Compute embeddings
    # You will likely want to run this on a machine with GPU, as this requires
    # running inference on 10,000 images
    model = foz.load_zoo_model("mobilenet-v2-imagenet-torch")
    embeddings = dataset.compute_embeddings(model)

    # Compute visualization
    results = fob.compute_visualization(dataset, embeddings=embeddings, seed=51)

    # Launch App instance
    session = fo.launch_app(dataset)

.. code-block:: python
    :linenos:

    # Generate scatterplot
    plot = results.visualize(
        labels="timeofday.label",
        labels_title="time of day",
        axis_equal=True,
    )
    plot.show(height=512)

    # Connect to session
    session.plots.attach(plot)

.. image:: /images/brain/brain-image-visualization.gif
   :alt: image-visualization
   :align: center

|br|
The GIF shows the variety of insights that are revealed by running this simple
protocol:

-   The first cluster of points selected reveals a set of samples whose field
    of view is corrupted by hardware gradients at the top and bottom of the
    image.
-   The second cluster of points reveals a set of images in rainy conditions
    with water droplets on the windshield.
-   Hiding the primary cluster of `daytime` points and selecting the
    remaining `night` points reveals that the `night` points have incorrect
    labels

Object embeddings example
-------------------------

The following example demonstrates how embeddings can be used to visualize the
ground truth objects in the :ref:`quickstart dataset <dataset-zoo-quickstart>`
using the
:meth:`compute_visualization() <fiftyone.brain.compute_visualization>` method's
default embeddings model and dimensionality method.

In this setup, we generate a visualization for all ground truth objects, but
then we use the convenient
:meth:`use_view() <fiftyone.brain.visualization.VisualizationResults.use_view>`
method to restrict the visualization to only objects in a subset of the
classes. The scatterpoints in the plot correspond to objects, colored by their
`label` and sized proportionately to the object's size. The plot is
:ref:`attached to an App instance <attaching-plots>`, so when points are
lasso-ed in the plot, the corresponding object patches are automatically
selected in the session's :meth:`view <fiftyone.core.session.Session.view>`.

Each block in the example code below denotes a separate cell in a
:ref:`Jupyter notebook <working-in-notebooks>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart")

    # Generate visualization for `ground_truth` objects
    results = fob.compute_visualization(dataset, patches_field="ground_truth")

    # Get the 10 most common classes in the dataset
    counts = dataset.count_values("ground_truth.detections.label")
    classes = sorted(counts, key=counts.get, reverse=True)[:10]

    # Restrict visualization to the 10 most common classes
    view = dataset.filter_labels("ground_truth", F("label").is_in(classes))
    results.use_view(view)

    session = fo.launch_app(dataset)

.. code-block:: python
    :linenos:

    # Generate scatterplot
    bbox_area = F("bounding_box")[2] * F("bounding_box")[3]
    plot = results.visualize(
        labels=F("ground_truth.detections.label"),
        sizes=F("ground_truth.detections[]").apply(bbox_area),
    )
    plot.show(height=800)

    session.plots.attach(plot)

.. image:: /images/brain/brain-object-visualization.gif
   :alt: object-visualization
   :align: center

As you can see, the coloring and sizing of the scatterpoints allows you to
discover natural clusters of objects, such as visually similar carrots,
large groups of people, and small/distant people.

.. _brain-similarity:

Similarity
__________

The FiftyOne Brain provides a
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` method that
you can use to index the images or object patches in a dataset by similarity.

Once you've indexed a dataset by similarity, you can use the
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
view stage to programmatically sort your dataset by similarity to any image(s)
or object patch(es) of your choice in your dataset. In addition, the
:ref:`FiftyOne App <fiftyone-app>` provides a convenient
:ref:`point-and-click interface <app-similarity>` for sorting by similarity
with respect to an index you've computed whenever one or more images or labels
are selected in the App.

The :class:`SimilarityResults <fiftyone.brain.similarity.SimilarityResults>`
object returned by
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` also provides
powerful
:meth:`find_unique() <fiftyone.brain.similarity.SimilarityResults.find_unique>`
and
:meth:`find_duplicates() <fiftyone.brain.similarity.SimilarityResults.find_duplicates>`
methods that you can use to find both maximally unique and near-duplicate
subsets of your datasets or their object patches. See
:ref:`this section <brain-similarity-cifar10>` for example uses.

Embedding methods
-----------------

Like :ref:`embeddings visualization <brain-embeddings-visualization>`,
similarity leverages deep embeddings to generate an index for a dataset.

The `embeddings` and `model` parameters of
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` support a
variety of ways to generate embeddings for your data:

-   Provide nothing, in which case a default general purpose model is used to
    index your data
-   Provide a |Model| instance or the name of any model from the
    :ref:`model zoo <model-zoo>` that supports embeddings
-   Compute your own embeddings and provide them in array form
-   Provide the name of a |VectorField| or |ArrayField| of your dataset in
    which your embeddings are stored

.. _brain-image-similarity:

Image similarity
----------------

This section demonstrates the basic workflow of indexing an image dataset by
similarity and then using the :ref:`FiftyOne App <app-image-similarity>` and
the
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
view stage to query the index.

To index by images, simply pass the |Dataset| or |DatasetView| of interest to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` and provide a
name for the index via the `brain_key` argument.

Next, load the dataset in the App and select some image(s). Whenever there is
an active selection in the App, a similarity menu icon will appear above the
grid, enabling you to sort by similarity to your current selection. The menu
will list the `brain_key` for all applicable similarity indexes so you can
choose which index to use to perform the search. You can also optionally
specify a maximum number of matches to return (`k`) and whether to sort in
order of least similarity (`reverse`):

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    # Load dataset
    dataset = foz.load_zoo_dataset("quickstart")

    # Index images by similarity
    fob.compute_similarity(dataset, brain_key="image_sim")

    # Launch App
    session = fo.launch_app(dataset)

    # In the App... select some image(s) and use the similarity menu to sort!

.. image:: /images/brain/brain-image-similarity.gif
   :alt: image-similarity
   :align: center

|br|
Alternatively, you can use the
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
view stage to programmatically :ref:`construct a view <using-views>` that
contains the sorted results:

.. code-block:: python
    :linenos:

    # Choose a random image from the dataset
    query_id = dataset.take(1).first().id

    # Programmatically construct a view containing the 15 most similar images
    view = dataset.sort_by_similarity(query_id, k=15, brain_key="image_sim")

    # View results in App
    session.view = view

.. note::

    Performing similarity search on a |DatasetView| will **only** return
    results from the view (if the view contains samples that were not included
    in the index, they will never be included in the result).

    This means that you can index an entire |Dataset| once and then perform
    searches on subsets of the dataset by
    :ref:`constructing views <using-views>` that contain the images of
    interest.

.. note::

    For large datasets, you may notice longer load times the first time you use
    a similarity index in a session. Subsequent similarity searches will use
    cached results and will be faster!

.. _brain-object-similarity:

Object similarity
-----------------

This section demonstrates the basic workflow of indexing a dataset of objects
by similarity and then using the :ref:`FiftyOne App <app-object-similarity>`
and the
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
view stage to query the index.

You can index any objects stored on datasets in |Detection|, |Detections|,
|Polyline|, or |Polylines| format. See :ref:`this section <using-labels>` for
more information about adding labels to your datasets.

To index by object patches, simply pass the |Dataset| or |DatasetView| of
interest to :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
along with the name of the patches field and a name for the index via the
`brain_key` argument.

Next, load the dataset in the App and switch to
:ref:`object patches view <app-object-patches>` by clicking the patches icon
above the grid and choosing the label field of interest from the dropdown.
Now, whenever you have selected one or more patches in the App, a similarity
menu icon will appear above the grid, enabling you to sort by similarity to
your current selection. The menu will list the `brain_key` for all applicable
similarity indexes so you can choose which index to use to perform the search.
You can also optionally specify a maximum number of matches to return (`k`) and
whether to sort in order of least similarity (`reverse`):

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    # Load dataset
    dataset = foz.load_zoo_dataset("quickstart")

    # Index ground truth objects by similarity
    fob.compute_similarity(
        dataset, patches_field="ground_truth", brain_key="gt_sim"
    )

    # Launch App
    session = fo.launch_app(dataset)

    # In the App... convert to ground truth patches view, select some patch(es),
    # and use the similarity menu to sort!

.. image:: /images/brain/brain-object-similarity.gif
   :alt: object-similarity
   :align: center

|br|
Alternatively, you can directly use the
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
view stage to programmatically :ref:`construct a view <using-views>` that
contains the sorted results:

.. code-block:: python
    :linenos:

    # Convert to patches view
    patches = dataset.to_patches("ground_truth")

    # Choose a random patch object from the dataset
    query_id = patches.take(1).first().id

    # Programmatically construct a view containing the 15 most similar objects
    view = patches.sort_by_similarity(query_id, k=15, brain_key="gt_sim")

    # View results in App
    session.view = view

.. note::

    Performing similarity search on a |DatasetView| will **only** return
    results from the view (if the view contains objects that were not included
    in the index, they will never be included in the result).

    This means that you can index an entire |Dataset| once and then perform
    searches on subsets of the dataset by
    :ref:`constructing views <using-views>` that contain the objects of
    interest.

.. note::

    For large datasets, you may notice longer load times the first time you use
    a similarity index in a session. Subsequent similarity searches will use
    cached results and will be faster!

Applications
------------

How can simiarlity be used in practice? A common pattern is to mine your
dataset for similar examples to certain images or object patches of interest,
e.g., those that represent failure modes of a model that need to be studied in
more detail or underrepresented classes that need more training examples.

Here are a few of the many possible applications:

-   Identifying failure patterns of a model
-   Finding examples of target scenarios in your data lake
-   Mining hard examples for your evaluation pipeline
-   Recommending samples from your data lake for classes that need additional
    training data
-   Pruning near-duplicate images from your training dataset

.. _brain-similarity-cifar10:

CIFAR-10 example
----------------

The following example demonstrates two common workflows that you can perform
using a similarity index generated via
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` on the
:ref:`CIFAR-10 dataset <dataset-zoo-cifar10>`:

-   Selecting a set of maximally unique images from the dataset
-   Identifying near-duplicate images in the dataset

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("cifar10", split="test")
    print(dataset)

To proceed, we first need some suitable image embeddings for the dataset.
Although the :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
and :meth:`compute_visualization() <fiftyone.brain.compute_visualization>`
methods are equipped with a default general-purpose model to generate
embeddings if none are provided, you'll typically find higher-quality insights
when a domain-specific model is used to generate embeddings.

In this case, we'll use a classifier that has been fine-tuned on CIFAR-10 to
compute some embeddings and then generate image similarity/visualization
indexes for them:

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob
    import fiftyone.brain.internal.models as fbm

    # Compute embeddings via a pre-trained CIFAR-10 classifier
    model = fbm.load_model("simple-resnet-cifar10")
    embeddings = dataset.compute_embeddings(model, batch_size=16)

    # Generate similarity index
    results = fob.compute_similarity(
        dataset, embeddings=embeddings, brain_key="img_sim"
    )

    # Generate a 2D visualization
    viz_results = fob.compute_visualization(
        dataset, embeddings=embeddings, brain_key="img_viz"
    )

Finding maximally unique images
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

With a similarity index generated, we can use the
:meth:`find_unique() <fiftyone.brain.similarity.SimilarityResults.find_unique>`
method of the index to identify a set of images of any desired size that are
maximally unique with respect to each other:

.. code-block:: python
    :linenos:

    # Use the similarity index to identify 500 maximally unique images
    results.find_unique(500)
    print(results.unique_ids[:5])

We can also conveniently visualize the results of this operation via the
:meth:`visualize_unique() <fiftyone.brain.similarity.SimilarityResults.visualize_unique>`
method of the results object, which generates a scatterplot with the unique
images colored separately:

.. code-block:: python
    :linenos:

    # Visualize the unique images in embeddings space
    plot = results.visualize_unique(visualization=viz_results)
    plot.show(height=800, yaxis_scaleanchor="x")

.. image:: /images/brain/brain-cifar10-unique-viz.png
   :alt: cifar10-unique-viz
   :align: center

And of course we can load a view containing the unique images in the App to
explore the results in detail:

.. code-block:: python
    :linenos:

    # Visualize the unique images in the App
    unique_view = dataset.select(results.unique_ids)
    session = fo.launch_app(view=unique_view)

.. image:: /images/brain/brain-cifar10-unique-view.png
   :alt: cifar10-unique-view
   :align: center

Finding near-duplicate images
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

We can also use our similarity index to detect *near-duplicate* images in the
dataset.

For example, let's use the
:meth:`find_duplicates() <fiftyone.brain.similarity.SimilarityResults.find_duplicates>`
method to identify the least similar images in our dataset:

.. code-block:: python
    :linenos:

    # Use the similarity index to identify the 1% of images that are least
    # similar w.r.t. the other images
    results.find_duplicates(fraction=0.01)

    print(results.neighbors_map)

.. note::

    You can also provide a specific embeddings distance threshold to
    :meth:`find_duplicates() <fiftyone.brain.similarity.SimilarityResults.find_duplicates>`,
    in which case the non-duplicate set will be the (approximately) largest set
    such that all pairwise distances between non-duplicate images are
    *greater* than this threshold.

The
:meth:`neighbors_map <fiftyone.brain.similarity.SimilarityResults.neighbors_map>`
property of the results object provides a data structure that summarizes the
findings. The keys of the dictionary are the sample IDs of each nearest
non-duplicate image, and the values are lists of `(id, distance)` tuples
listing the sample IDs of the duplicate images for each in-sample image
together with the embedding distance between the two images:

.. code-block:: text

    {
        '61143408db40df926c571a6b': [
            ('61143409db40df926c573075', 5.667297674385298),
            ('61143408db40df926c572ab6', 6.231051661334058)
        ],
        '6114340cdb40df926c577f2a': [
            ('61143408db40df926c572b54', 6.042934361555487)
        ],
        '61143408db40df926c572aa3': [
            ('6114340bdb40df926c5772e9', 5.88984758067434),
            ('61143408db40df926c572b64', 6.063986454046798),
            ('61143409db40df926c574571', 6.10303338363576),
            ('6114340adb40df926c5749a2', 6.161749290179865)
        ],
        ...
    }

We can conveniently visualize this information in the App via the
:meth:`duplicates_view() <fiftyone.brain.similarity.SimilarityResults.duplicates_view>`
method of the results object, which constructs a view with the duplicate images
arranged directly after their corresponding nearest in-sample image, with
additional sample fields recording the type and nearest in-sample ID/distance
for each image:

.. code-block:: python
    :linenos:

    duplicates_view = results.duplicates_view(
        type_field="dup_type",
        id_field="dup_id",
        dist_field="dup_dist",
    )

    session.view = duplicates_view

.. image:: /images/brain/brain-cifar10-duplicate-view.png
   :alt: cifar10-duplicate-view
   :align: center

.. _brain-image-uniqueness:

Image uniqueness
________________

The FiftyOne Brain allows for the computation of the uniqueness of an image,
in comparison with other images in a dataset; it does so without requiring
any model from you. One good use of uniqueness is in the early stages of the
machine learning workflow when you are deciding what subset of data with which
to bootstrap your models. Unique samples are vital in creating training
batches that help your model learn as efficiently and effectively as possible.

The uniqueness of a |Dataset| can be computed directly without need the
predictions of a pre-trained model via the
:meth:`compute_uniqueness() <fiftyone.brain.compute_uniqueness>` method:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob

    dataset = fo.load_dataset(...)

    fob.compute_uniqueness(dataset)

**Input**: An unlabeled (or labeled) image dataset. There are
:ref:`recipes <recipes>` for building datasets from a wide variety of image
formats, ranging from a simple directory of images to complicated dataset
structures like `COCO <https://cocodataset.org/#home>`_.

.. note::

    Did you know? Instead of using FiftyOne's default model to generate
    embeddings, you can provide your own embeddings or specify a model from the
    :ref:`Model Zoo <model-zoo>` to use to generate embeddings via the optional
    `embeddings` and `model` argument to
    :meth:`compute_uniqueness() <fiftyone.brain.compute_uniqueness>`.

**Output**: A scalar-valued `uniqueness` field is populated on each sample
that ranks the uniqueness of that sample (higher value means more unique).
The uniqueness values for a dataset are normalized to `[0, 1]`, with the most
unique sample in the collection having a uniqueness value of `1`.

You can customize the name of this field by passing the optional
`uniqueness_field` argument to
:meth:`compute_uniqueness() <fiftyone.brain.compute_uniqueness>`.

**What to expect**: Uniqueness uses a tuned algorithm that measures the
distribution of each |Sample| in the |Dataset|. Using this distribution, it
ranks each sample based on its relative *similarity* to other samples. Those
that are close to other samples are not unique whereas those that are far from
most other samples are more unique.

.. note::

    Did you know? You can specify a region of interest within each image to use
    to compute uniqueness by providing the optional `roi_field` argument to
    :meth:`compute_uniqueness() <fiftyone.brain.compute_uniqueness>`, which
    contains |Detections| or |Polylines| that define the ROI for each sample.

.. note::

    Check out the :doc:`uniqueness tutorial </tutorials/uniqueness>` to see
    an example use case of the Brain's uniqueness method to detect
    near-duplicate images in a dataset.

.. image:: /images/brain/brain-uniqueness.gif
   :alt: uniqueness
   :align: center

.. _brain-label-mistakes:

Label mistakes
______________

Label mistakes can be calculated for both classification and detection
datasets.

.. tabs::

    .. tab:: Classification

        Correct annotations are crucial in developing high performing models.
        Using the FiftyOne Brain and the predictions of a pre-trained model,
        you can identify possible labels mistakes in |Classification| fields
        of your dataset via the
        :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`
        method:

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.brain as fob

            dataset = fo.load_dataset(...)

            fob.compute_mistakenness(
                dataset, "predictions", label_field="ground_truth"
            )

        **Input**: Label mistakes operate on samples for which there are both
        human annotations (`"ground_truth"` above) and model predictions
        (`"predictions"` above).

        **Output**: A float `mistakenness` field is populated on each sample
        that ranks the chance that the human annotation is mistaken. You can
        customize the name of this field by passing the optional
        `mistakenness_field` argument to
        :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`.

        **What to expect**: Finding mistakes in human annotations is
        non-trivial (if it could be done perfectly then the approach would
        sufficiently replace your prediction model!) The FiftyOne Brain uses a
        proprietary scoring model that ranks samples for which your prediction
        model is highly confident but wrong (according to the human annotation
        label) as a high chance of being a mistake.

        .. note::

            Check out the
            :doc:`label mistakes tutorial </tutorials/classification_mistakes>`
            to see an example use case of the Brain's mistakenness method on
            a classification dataset.

    .. tab:: Detection

        Correct annotations are crucial in developing high performing models.
        Using the FiftyOne Brain and the predictions of a pre-trained model,
        you can identify possible labels mistakes in |Detections| fields of
        your dataset via the
        :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`
        method:

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.brain as fob

            dataset = fo.load_dataset(...)

            fob.compute_mistakenness(
                dataset, "predictions", label_field="ground_truth"
            )

        **Input**: You can compute label mistakes on samples for which there
        are both human annotations (`"ground_truth"` above) and model
        predictions (`"predictions"` above).

        **Output**: New fields on both the detections in `label_field` and the
        samples will be populated:

        Detection-level fields:

        * `mistakenness` (float): Objects in `label_field` that matched with a
          prediction have their `mistakenness` field populated with a measure
          of the likelihood that the ground truth annotation is a mistake.

        * `mistakenness_loc` (float): Objects in `label_field` that matched
          with a prediction have their `mistakenness_loc` field populated with
          a measure of the mistakenness in the localization (bounding box) of
          the ground truth annotation.

        * `possible_missing` (bool): If there are predicted objects with no
          matches in `label_field` but which are deemed to be likely correct
          annotations, these objects will have their `possible_missing`
          attribute set to True. In addition, if you pass the optional
          `copy_missing=True` flag to
          :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`,
          then these objects will be copied into `label_field`.

        * `possible_spurious` (bool): Objects in `label_field` that were not
          matched with a prediction and deemed to be likely spurious
          annotations will have their `possible_spurious` field set to True.

        Sample-level fields:

        * `mistakenness` (float): The maximum mistakenness of an object in the
          `label_field` of the sample.

        * `possible_missing` (int): The number of objects that were added to
          the `label_field` of the sample and marked as likely missing
          annotations.

        * `possible_spurious` (int): The number of objects in the `label_field`
          of the sample that were deemed to be likely spurious annotations.

        You can customize the names of these fields by passing optional
        arguments to
        :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`.

        **What to expect**: Finding mistakes in human annotations is
        non-trivial (if it could be done perfectly then the approach would
        sufficiently replace your prediction model!) The FiftyOne Brain uses a
        proprietary scoring model that ranks detections for which your
        prediction model is highly confident but wrong (according to the human
        annotation label) as a high chance of being a mistake.

        .. note::

            Check out the
            :doc:`detection mistakes tutorials </tutorials/detection_mistakes>`
            to see an example use case of the Brain's mistakenness method on a
            detection dataset.

.. image:: /images/brain/brain-mistakenness.png
   :alt: mistakenness
   :align: center

.. _brain-sample-hardness:

Sample hardness
_______________

During training, it is useful to identify samples that are more difficult for a
model to learn so that training can be more focused around these hard samples.
These hard samples are also useful as seeds when considering what other new
samples to add to a training dataset.

In order to compute hardness, all you need to do is add your model predictions
and their logits to your FiftyOne |Dataset| and then run the
:meth:`compute_hardness() <fiftyone.brain.compute_hardness>` method:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob

    dataset = fo.load_dataset(...)

    fob.compute_hardness(dataset, "predictions")

**Input**: A |Dataset| or |DatasetView| on which predictions have been
computed and are stored in the `"predictions"` argument. Ground truth
annotations are not required for hardness.

**Output**: A scalar-valued `hardness` field is populated on each sample that
ranks the hardness of the sample. You can customize the name of this field via
the `hardness_field` argument of
:meth:`compute_hardness() <fiftyone.brain.compute_hardness>`.

**What to expect**: Hardness is computed in the context of a prediction model.
The FiftyOne Brain hardness measure defines hard samples as those for which the
prediction model is unsure about what label to assign. This measure
incorporates prediction confidence and logits in a tuned model that has
demonstrated empirical value in many model training exercises.

.. note::

    Check out the
    :doc:`classification evaluation tutorial </tutorials/evaluate_classifications>`
    to see example uses of the Brain's hardness method to uncover annotation
    mistakes in a dataset.

.. image:: /images/brain/brain-hardness.png
   :alt: hardness
   :align: center

.. _brain-managing-runs:

Managing brain runs
___________________

When you run a brain method with a ``brain_key`` argument, the run is recorded
on the dataset and you can retrieve information about it later, rename it,
delete it (along with any modifications to your dataset that were performed by
it), and even retrieve the view that you computed on using the following
methods on your dataset:

-   :meth:`list_brain_runs() <fiftyone.core.collections.SampleCollection.list_brain_runs>`
-   :meth:`get_brain_info() <fiftyone.core.collections.SampleCollection.get_brain_info>`
-   :meth:`load_brain_results() <fiftyone.core.collections.SampleCollection.load_brain_results>`
-   :meth:`load_brain_view() <fiftyone.core.collections.SampleCollection.load_brain_view>`
-   :meth:`rename_brain_run() <fiftyone.core.collections.SampleCollection.rename_brain_run>`
-   :meth:`delete_brain_run() <fiftyone.core.collections.SampleCollection.delete_brain_run>`

.. tabs::

    .. tab:: Visualizations

        The
        :meth:`compute_visualization() <fiftyone.brain.compute_visualization>`
        method accepts an optional `brain_key` parameter that specifies the
        brain key under which to store the results of the visualization.

    .. tab:: Similarity

        The
        :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
        method accepts an optional `brain_key` parameter that specifies the
        brain key under which to store the similarity index.

    .. tab:: Uniqueness

        The brain key of uniqueness runs is the value of the
        `uniqueness_field` passed to
        :meth:`compute_uniqueness() <fiftyone.brain.compute_uniqueness>`.

    .. tab:: Mistakenness

        The brain key of mistakenness runs is the value of the
        `mistakenness_field` passed to
        :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`.

    .. tab:: Hardness

        The brain key of hardness runs is the value of the `hardness_field`
        passed to :meth:`compute_hardness() <fiftyone.brain.compute_hardness>`.

The example below demonstrates the basic interface:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    view = dataset.take(100)

    # Run a brain method that returns results
    results = fob.compute_visualization(view, brain_key="visualization")

    # Run a brain method that populates a new sample field on the dataset
    fob.compute_uniqueness(view)

    # List the brain methods that have been run
    print(dataset.list_brain_runs())
    # ['visualization', 'uniqueness']

    # Print information about a brain run
    print(dataset.get_brain_info("visualization"))

    # Load the results of a previous brain run
    also_results = dataset.load_brain_results("visualization")

    # Load the view on which a brain run was performed
    same_view = dataset.load_brain_view("visualization")

    # Rename a brain run
    dataset.rename_brain_run("visualization", "still_visualization")

    # Delete brain runs
    # This will delete any stored results and fields that were populated
    dataset.delete_brain_run("still_visualization")
    dataset.delete_brain_run("uniqueness")
