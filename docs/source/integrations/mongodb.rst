.. _mongodb-integration:

MongoDB Vector Search Integration
=================================

.. default-role:: code

`MongoDB <https://www.mongodb.com>`_ is the leading open source database for
unstructured data, and we've made it easy to use MongoDB Atlas'
`vector search capabilities <https://www.mongodb.com/products/platform/atlas-vector-search>`_
on your computer vision data directly from FiftyOne!

Follow these :ref:`simple instructions <mongodb-setup>` to configure a MongoDB
Atlas cluster and get started using MongoDB Atlas + FiftyOne.

FiftyOne provides an API to create MongoDB Atlas vector search indexes, upload
vectors, and run similarity queries, both
:ref:`programmatically <mongodb-query>` in Python and via point-and-click in
the App.

.. note::

    Did you know? You can
    :ref:`search by natural language <brain-similarity-text>` using MongoDB
    similarity indexes!

.. image:: /images/brain/brain-image-similarity.gif
   :alt: image-similarity
   :align: center

.. _mongodb-basic-recipe:

Basic recipe
____________

The basic workflow to use MongoDB Atlas to create a similarity index on your
FiftyOne datasets and use this to query your data is as follows:

1)  Configure a MongoDB Atlas cluster

2)  Load a :ref:`dataset <loading-datasets>` into FiftyOne

3)  Compute embedding vectors for samples or patches in your dataset, or select
    a model to use to generate embeddings

4)  Use the :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
    method to generate a MongoDB similarity index for the samples or object
    patches in a dataset by setting the parameter `backend="mongodb"` and
    specifying a `brain_key` of your choice

5)  Use this MongoDB similarity index to query your data with
    :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`

6) If desired, delete the index

|br|
The example below demonstrates this workflow.

.. note::

    You must :ref:`configure <mongodb-setup>` a MongoDB Atlas 7.0 or later
    cluster and provide its
    :ref:`connection string <configuring-mongodb-connection>` to run this
    example:

    .. code-block:: shell

        export FIFTYONE_DATABASE_NAME=fiftyone
        export FIFTYONE_DATABASE_URI='mongodb+srv://$USERNAME:$PASSWORD@fiftyone.XXXXXX.mongodb.net/?retryWrites=true&w=majority'

First let's load a dataset into FiftyOne and compute embeddings for the samples:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    # Step 1: Load your data into FiftyOne
    dataset = foz.load_zoo_dataset("quickstart")

    # Steps 2 and 3: Compute embeddings and create a similarity index
    mongodb_index = fob.compute_similarity(
        dataset, 
        embeddings="embeddings",  # the field in which to store the embeddings
        brain_key="mongodb_index",
        backend="mongodb",
    )

Once the similarity index has been generated, we can query our data in FiftyOne
by specifying the `brain_key`:

.. code-block:: python
    :linenos:

    # Wait for the index to be ready for querying...
    assert mongodb_index.ready

    # Step 4: Query your data
    query = dataset.first().id  # query by sample ID
    view = dataset.sort_by_similarity(
        query, 
        brain_key="mongodb_index",
        k=10,  # limit to 10 most similar samples
    )

    # Step 5 (optional): Cleanup

    # Delete the MongoDB vector search index
    mongodb_index.cleanup()

    # Delete run record from FiftyOne
    dataset.delete_brain_run("mongodb_index")

.. note::

    Skip to :ref:`this section <mongodb-examples>` for a variety of common
    MongoDB query patterns.

.. _mongodb-setup:

Setup
_____

In order to use MongoDB vector search, you must connect your FiftyOne
installation to MongoDB Atlas, which you can do by navigating to
`https://cloud.mongodb.com <https://cloud.mongodb.com>`_, creating an account,
and following the instructions there to configure your cluster.

.. note::

    You must be running MongoDB Atlas 7.0 or later in order to programmatically
    create vector search indexes
    (`source <https://www.mongodb.com/docs/manual/release-notes/7.0/#atlas-search-index-management>`_).

    As of this writing, Atlas' shared tier (M0, M2, M5) is running MongoDB 6. In order 
    to use MongoDB 7, you must upgrade to an M10 cluster, which starts at $0.08/hour.

Configuring your connection string
----------------------------------

You can connect FiftyOne to your MongoDB Atlas cluster by simply providing its
:ref:`connection string <configuring-mongodb-connection>`:

.. code-block:: shell

    export FIFTYONE_DATABASE_NAME=fiftyone
    export FIFTYONE_DATABASE_URI='mongodb+srv://$USERNAME:$PASSWORD@fiftyone.XXXXXX.mongodb.net/?retryWrites=true&w=majority'

Using the MongoDB backend
-------------------------

By default, calling
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` or 
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
will use an sklearn backend.

To use the MongoDB backend, simply set the optional `backend` parameter of
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to
`"mongodb"`:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_similarity(..., backend="mongodb", ...)

Alternatively, you can permanently configure FiftyOne to use the MonogDB
backend by setting the following environment variable:

.. code-block:: shell

    export FIFTYONE_BRAIN_DEFAULT_SIMILARITY_BACKEND=mongodb

or by setting the `default_similarity_backend` parameter of your
:ref:`brain config <brain-config>` located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "default_similarity_backend": "mongodb"
    }

.. _mongodb-config-parameters:

MongoDB config parameters
-------------------------

The MongoDB backend supports a variety of query parameters that can be used to
customize your similarity queries. These parameters include:

-   **index_name** (*None*): the name of the MongoDB vector search index to use
    or create. If not specified, a new unique name is generated automatically
-   **metric** (*"cosine"*): the distance/similarity metric to use when
    creating a new index. The supported values are
    ``("cosine", "dotproduct", "euclidean")``

For detailed information on these parameters, see the
`MongoDB documentation <https://www.mongodb.com/docs/atlas/atlas-search/field-types/knn-vector>`_.

You can specify these parameters via any of the strategies described in the
previous section. Here's an example of a :ref:`brain config <brain-config>`
that includes all of the available parameters:

.. code-block:: json

    {
        "similarity_backends": {
            "mongodb": {
                "index_name": "your-index",
                "metric": "cosine"
            }
        }
    }

However, typically these parameters are directly passed to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to configure
a specific new index:

.. code:: python
    :linenos:

    mongodb_index = fob.compute_similarity(
        ...
        backend="mongodb",
        brain_key="mongodb_index",
        index_name="your-index",
        metric="cosine",
    )

.. _mongodb-managing-brain-runs:

Managing brain runs
___________________

FiftyOne provides a variety of methods that you can use to manage brain runs.

For example, you can call
:meth:`list_brain_runs() <fiftyone.core.collections.SampleCollection.list_brain_runs>`
to see the available brain keys on a dataset:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    # List all brain runs
    dataset.list_brain_runs()

    # Only list similarity runs
    dataset.list_brain_runs(type=fob.Similarity)

    # Only list specific similarity runs
    dataset.list_brain_runs(
        type=fob.Similarity,
        patches_field="ground_truth",
        supports_prompts=True,
    )

Or, you can use
:meth:`get_brain_info() <fiftyone.core.collections.SampleCollection.get_brain_info>`
to retrieve information about the configuration of a brain run:

.. code:: python
    :linenos:

    info = dataset.get_brain_info(brain_key)
    print(info)

Use :meth:`load_brain_results() <fiftyone.core.collections.SampleCollection.load_brain_results>`
to load the |SimilarityIndex| instance for a brain run.

You can use
:meth:`rename_brain_run() <fiftyone.core.collections.SampleCollection.rename_brain_run>`
to rename the brain key associated with an existing similarity results run:

.. code:: python
    :linenos:

    dataset.rename_brain_run(brain_key, new_brain_key)

Finally, you can use
:meth:`delete_brain_run() <fiftyone.core.collections.SampleCollection.delete_brain_run>`
to delete the record of a similarity index computation from your FiftyOne 
dataset:

.. code:: python
    :linenos:

    dataset.delete_brain_run(brain_key)

.. note::

    Calling
    :meth:`delete_brain_run() <fiftyone.core.collections.SampleCollection.delete_brain_run>`
    only deletes the **record** of the brain run from your FiftyOne dataset; it
    will not delete any associated MongoDB vector search index, which you can
    do as follows:

    .. code:: python

        # Delete the MongoDB vector search index
        mongodb_index = dataset.load_brain_results(brain_key)
        mongodb_index.cleanup()

.. _mongodb-examples:

Examples
________

This section demonstrates how to perform some common vector search workflows on 
a FiftyOne dataset using the MongoDB backend.

.. note::

    All of the examples below assume you have configured your MongoDB Atlas
    cluster as described in :ref:`this section <mongodb-setup>`.

.. _mongodb-new-similarity-index:

Create a similarity index
-------------------------

In order to create a new MongoDB similarity index, you need to specify either
the `embeddings` or `model` argument to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`. Here's a few
possibilities:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")
    model_name = "clip-vit-base32-torch"
    model = foz.load_zoo_model(model_name)
    brain_key = "mongodb_index"

    # Option 1: Compute embeddings on the fly from model name
    fob.compute_similarity(
        dataset,
        model=model_name,
        embeddings="embeddings",  # the field in which to store the embeddings
        backend="mongodb",
        brain_key=brain_key,
    )

    # Option 2: Compute embeddings on the fly from model instance
    fob.compute_similarity(
        dataset,
        model=model,
        embeddings="embeddings",  # the field in which to store the embeddings
        backend="mongodb",
        brain_key=brain_key,
    )

    # Option 3: Pass precomputed embeddings as a numpy array
    embeddings = dataset.compute_embeddings(model)
    fob.compute_similarity(
        dataset,
        embeddings=embeddings,
        embeddings_field="embeddings",  # the field in which to store the embeddings
        backend="mongodb",
        brain_key=brain_key,
    )

    # Option 4: Pass precomputed embeddings by field name
    # Note that MongoDB vector indexes require list fields
    embeddings = dataset.compute_embeddings(model)
    dataset.set_values("embeddings", embeddings.tolist())
    fob.compute_similarity(
        dataset,
        embeddings="embeddings",  # the field that contains the embeddings
        backend="mongodb",
        brain_key=brain_key,
    )

.. note::

    You can customize the MongoDB index by passing any
    :ref:`supported parameters <mongodb-config-parameters>` as extra kwargs.

.. _mongodb-patch-similarity-index:

Create a patch similarity index
-------------------------------

.. warning::

    The MongoDB backend does not yet support indexing object patches, so the
    code below will not yet run. Check back soon!

You can also create a similarity index for
:ref:`object patches <brain-object-similarity>` within your dataset by
including the `patches_field` argument to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset, 
        patches_field="ground_truth",
        model="clip-vit-base32-torch",
        embeddings="embeddings",  # the attribute in which to store the embeddings
        backend="mongodb",
        brain_key="mongodb_patches",
    )

.. note::

    You can customize the MongoDB index by passing any
    :ref:`supported parameters <mongodb-config-parameters>` as extra kwargs.

.. _mongodb-connect-to-existing-index:

Connect to an existing index
----------------------------

If you have already created a MongoDB index storing the embedding vectors
for the samples or patches in your dataset, you can connect to it by passing
the `index_name` to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",      # zoo model used (if applicable)
        embeddings=False,                   # don't compute embeddings
        index_name="your-index",            # the existing MongoDB index
        brain_key="mongodb_index",
        backend="mongodb",
    )

.. _mongodb-add-remove-embeddings:

Add/remove embeddings from an index
-----------------------------------

You can use
:meth:`add_to_index() <fiftyone.brain.similarity.SimilarityIndex.add_to_index>`
and
:meth:`remove_from_index() <fiftyone.brain.similarity.SimilarityIndex.remove_from_index>`
to add and remove embeddings from an existing Mongodb index.

These methods can come in handy if you modify your FiftyOne dataset and need
to update the Mongodb index to reflect these changes:

.. code:: python
    :linenos:

    import numpy as np

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    mongodb_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        embeddings="embeddings",  # the field in which to store the embeddings
        brain_key="mongodb_index",
        backend="mongodb",
    )
    print(mongodb_index.total_index_size)  # 200

    view = dataset.take(10)
    ids = view.values("id")

    # Delete 10 samples from a dataset
    dataset.delete_samples(view)

    # Delete the corresponding vectors from the index
    mongodb_index.remove_from_index(sample_ids=ids)

    # Add 20 samples to a dataset
    samples = [fo.Sample(filepath="tmp%d.jpg" % i) for i in range(20)]
    sample_ids = dataset.add_samples(samples)

    # Add corresponding embeddings to the index
    embeddings = np.random.rand(20, 512)
    mongodb_index.add_to_index(embeddings, sample_ids)

    print(mongodb_index.total_index_size)  # 210

.. _mongodb-get-embeddings:

Retrieve embeddings from an index
---------------------------------

You can use
:meth:`get_embeddings() <fiftyone.brain.similarity.SimilarityIndex.get_embeddings>`
to retrieve embeddings from a Mongodb index by ID:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    mongodb_index = fob.compute_similarity(
        dataset, 
        model="clip-vit-base32-torch",
        embeddings="embeddings",  # the field in which to store the embeddings
        brain_key="mongodb_index",
        backend="mongodb",
    )

    # Retrieve embeddings for the entire dataset
    ids = dataset.values("id")
    embeddings, sample_ids, _ = mongodb_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (200, 512)
    print(sample_ids.shape)  # (200,)

    # Retrieve embeddings for a view
    ids = dataset.take(10).values("id")
    embeddings, sample_ids, _ = mongodb_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (10, 512)
    print(sample_ids.shape)  # (10,)

.. _mongodb-query:

Querying a MongoDB index
------------------------

You can query a MongoDB index by appending a
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>` 
stage to any dataset or view. The query can be any of the following:

*   An ID (sample or patch)
*   A query vector of same dimension as the index
*   A list of IDs (samples or patches)
*   A text prompt (if :ref:`supported by the model <brain-similarity-text>`)

.. code:: python
    :linenos:

    import numpy as np

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    mongodb_index = fob.compute_similarity(
        dataset, 
        model="clip-vit-base32-torch",
        embeddings="embeddings",  # the field in which to store the embeddings
        brain_key="mongodb_index",
        backend="mongodb",
    )

    # Wait for the index to be ready for querying...
    assert mongodb_index.ready

    # Query by vector
    query = np.random.rand(512)  # matches the dimension of CLIP embeddings
    view = dataset.sort_by_similarity(query, k=10, brain_key="mongodb_index")

    # Query by sample ID
    query = dataset.first().id
    view = dataset.sort_by_similarity(query, k=10, brain_key="mongodb_index")

    # Query by a list of IDs
    query = [dataset.first().id, dataset.last().id]
    view = dataset.sort_by_similarity(query, k=10, brain_key="mongodb_index")

    # Query by text prompt
    query = "a photo of a dog"
    view = dataset.sort_by_similarity(query, k=10, brain_key="mongodb_index")

.. note::

    Performing a similarity search on a |DatasetView| will **only** return
    results from the view; if the view contains samples that were not included
    in the index, they will never be included in the result.

    This means that you can index an entire |Dataset| once and then perform
    searches on subsets of the dataset by
    :ref:`constructing views <using-views>` that contain the images of
    interest.

.. note::

    Currently, when performing a similiarity search on a view with the MongoDB backend,
    the full index is queried and the resulting samples are restricted to the desired view. 
    This may result in fewer samples than requested being returned by the search.

.. _mongodb-index-ready:

Checking if an index is ready
-----------------------------

You can use the `ready` property of a MongoDB index to check whether a newly
created vector search index is ready for querying:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    mongodb_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        embeddings="embeddings",  # the field in which to store the embeddings
        brain_key="mongodb_index",
        backend="mongodb",
    )

    # Wait for the index to be ready for querying...
    assert mongodb_index.ready


.. _mongodb-advanced-usage:

Advanced usage
--------------

As :ref:`previously mentioned <mongodb-config-parameters>`, you can customize
your MongoDB index by providing optional parameters to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`.

Here's an example of creating a similarity index backed by a customized MongoDB
index. Just for fun, we'll specify a custom index name, use dot product
similarity, and populate the index for only a subset of our dataset:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Create a custom MongoDB index
    mongodb_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        embeddings_field="embeddings",  # the field in which to store the embeddings
        embeddings=False,               # add embeddings later
        brain_key="mongodb_index",
        backend="mongodb",
        index_name="custom-quickstart-index",
        metric="dotproduct",
    )

    # Add embeddings for a subset of the dataset
    view = dataset[:20]
    embeddings, sample_ids, _ = mongodb_index.compute_embeddings(view)
    mongodb_index.add_to_index(embeddings, sample_ids)

    print(mongodb_index.total_index_size)  # 20
    print(mongodb_index.config.index_name)  # custom-quickstart-index
    print(mongodb_index.config.metric)  # dotproduct
