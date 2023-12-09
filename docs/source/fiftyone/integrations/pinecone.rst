.. _pinecone-integration:

Pinecone Integration
====================

.. default-role:: code

`Pinecone <https://www.pinecone.io>`_ is one of the most popular vector search
engines available, and we've made it easy to use Pinecone's vector search
capabilities on your computer vision data directly from FiftyOne!

Follow these :ref:`simple instructions <pinecone-setup>` to configure your
credentials and get started using Pinecone + FiftyOne.

FiftyOne provides an API to create Pinecone indexes, upload vectors, and run
similarity queries, both :ref:`programmatically <pinecone-query>` in Python and
via point-and-click in the App.

.. note::

    Did you know? You can
    :ref:`search by natural language <brain-similarity-text>` using Pinecone
    similarity indexes!

.. image:: /images/brain/brain-object-similarity.gif
   :alt: object-similarity
   :align: center

.. _pinecone-basic-recipe:

Basic recipe
____________

The basic workflow to use Pinecone to create a similarity index on your
FiftyOne datasets and use this to query your data is as follows:

1)  Load a :ref:`dataset <loading-datasets>` into FiftyOne

2)  Compute embedding vectors for samples or patches in your dataset, or select
    a model to use to generate embeddings

3)  Use the :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
    methodto generate a Pinecone similarity index for the samples or object
    patches in a dataset by setting the parameter `backend="pinecone"` and
    specifying a `brain_key` of your choice

4)  Use this Pinecone similarity index to query your data with
    :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`

5)  If desired, delete the index

|br|
The example below demonstrates this workflow.

.. note::

    You must create a `Pinecone account <https://www.pinecone.io/>`_, download
    a `Pinecone API key <https://app.pinecone.io/organizations>`_, and install
    the
    `Pinecone Python client <https://github.com/pinecone-io/pinecone-python-client>`_
    to run this example:

    .. code-block:: shell

        pip install -U pinecone-client

    Note that you can store your Pinecone credentials as described in
    :ref:`this section <pinecone-setup>` to avoid entering them manually each
    time you interact with your Pinecone index.

First let's load a dataset into FiftyOne and compute embeddings for the
samples:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    # Step 1: Load your data into FiftyOne
    dataset = foz.load_zoo_dataset("quickstart")

    # Steps 2 and 3: Compute embeddings and create a similarity index
    pinecone_index = fob.compute_similarity(
        dataset, 
        brain_key="pinecone_index",
        backend="pinecone",
    )

Once the similarity index has been generated, we can query our data in FiftyOne
by specifying the `brain_key`:

.. code-block:: python
    :linenos:

    # Step 4: Query your data
    query = dataset.first().id  # query by sample ID
    view = dataset.sort_by_similarity(
        query, 
        brain_key=brain_key,
        k=10,  # limit to 10 most similar samples
    )

    # Step 5 (optional): Cleanup

    # Delete the Pinecone index
    pinecone_index = dataset.load_brain_results(brain_key)
    pinecone_index.cleanup()

    # Delete run record from FiftyOne
    dataset.delete_brain_run("pinecone_index")

.. note::

    Skip to :ref:`this section <pinecone-examples>` to see a variety of common
    Pinecone query patterns.

.. _pinecone-setup:

Setup
_____

The easiest way to get started with Pinecone is to
`create a free Pinecone account <https://www.pinecone.io>`_ and copy your
Pinecone API key.

Installing the Pinecone client
------------------------------

In order to use the Pinecone backend, you must install the
`Pinecone Python client <https://github.com/pinecone-io/pinecone-python-client>`_:

.. code-block:: shell

    pip install pinecone-client

Using the Pinecone backend
--------------------------

By default, calling
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` or 
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
will use an sklearn backend.

To use the Pinecone backend, simply set the optional `backend` parameter of
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to
`"pinecone"`:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_similarity(..., backend="pinecone", ...)

Alternatively, you can permanently configure FiftyOne to use the Pinecone
backend by setting the following environment variable:

.. code-block:: shell

    export FIFTYONE_BRAIN_DEFAULT_SIMILARITY_BACKEND=pinecone

or by setting the `default_similarity_backend` parameter of your
:ref:`brain config <brain-config>` located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "default_similarity_backend": "pinecone"
    }

Authentication
--------------

In order to connect to a Pinecone server, you must provide your credentials,
which can be done in a variety of ways.

**Environment variables (recommended)**

The recommended way to configure your Pinecone credentials is to store them
in the environment variables shown below, which are automatically accessed by
FiftyOne whenever a connection to Pinecone is made:

.. code-block:: shell

    export FIFTYONE_BRAIN_SIMILARITY_PINECONE_API_KEY=XXXXXX
    export FIFTYONE_BRAIN_SIMILARITY_PINECONE_ENVIRONMENT="us-west1-gcp"

**FiftyOne Brain config**

You can also store your credentials in your :ref:`brain config <brain-config>`
located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "similarity_backends": {
            "pinecone": {
                "api_key": "XXXXXXXXXXXX",
                "environment": "us-west1-gcp"
            }
        }
    }

Note that this file will not exist until you create it.

**Keyword arguments**

You can manually provide your Pinecone credentials as keyword arguments each
time you call methods like
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` that require
connections to Pinecone:

.. code:: python
    :linenos:

    import fiftyone.brain as fob 
    
    pinecone_index = fob.compute_similarity(
        ...
        backend="pinecone",
        brain_key="pinecone_index",
        api_key="XXXXXX",
        environment="us-west1-gcp",
    )

Note that, when using this strategy, you must manually provide the credentials
when loading an index later via
:meth:`load_brain_results() <fiftyone.core.collections.SampleCollection.load_brain_results>`:

.. code:: python
    :linenos:

    pinecone_index = dataset.load_brain_results(
        "pinecone_index",
        api_key="XXXXXX",
        environment="us-west1-gcp",
    )

.. _pinecone-config-parameters:

Pinecone config parameters
--------------------------

The Pinecone backend supports a variety of query parameters that can be used to
customize your similarity queries. These parameters include:

-   **index_name** (*None*): the name of the Pinecone index to use or create.
    If not specified, a new unique name is generated automatically
-   **index_type** (*None*): the index type to use when creating a new index
-   **namespace** (*None*): a namespace under which to store vectors added to
    the index
-   **metric** (*"cosine"*): the distance/similarity metric to use for the
    index. Supported values are ``("cosine", "dotproduct", "euclidean")``
-   **replicas** (*None*): an optional number of replicas to use when creating
    a new index
-   **shards** (*None*): an optional number of shards to use when creating a
    new index
-   **pods** (*None*): an optional number of pods to use when creating a new
    index
-   **pod_type** (*None*): an optional pod type to use when creating a new
    index

For detailed information on these parameters, see the 
`Pinecone documentation <https://docs.pinecone.io/docs/indexes>`_.

You can specify these parameters via any of the strategies described in the
previous section. Here's an example of a :ref:`brain config <brain-config>`
that includes all of the available parameters:

.. code-block:: json

    {
        "similarity_backends": {
            "pinecone": {
                "index_name": "your-index",
                "index_type": null,
                "namespace": null,
                "metric": "cosine",
                "replicas": 1,
                "shards": 1,
                "pods": 1,
                "pod_type": "p1"
            }
        }
    }

However, typically these parameters are directly passed to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to configure
a specific new index:

.. code:: python
    :linenos:

    pinecone_index = fob.compute_similarity(
        ...
        backend="pinecone",
        brain_key="pinecone_index",
        index_name="your-index",
        metric="cosine",
        pod_type="s1",
        pods=2,
    )

.. _pinecone-managing-brain-runs:

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
    will not delete any associated Pinecone index, which you can do as follows:

    .. code:: python

        # Delete the Pinecone index
        pinecone_index = dataset.load_brain_results(brain_key)
        pinecone_index.cleanup()

.. _pinecone-examples:

Examples
________

This section demonstrates how to perform some common vector search workflows on 
a FiftyOne dataset using the Pinecone backend.

.. note::

    All of the examples below assume you have configured your Pinecone API key
    and environment as described in :ref:`this section <pinecone-setup>`.

.. _pinecone-new-similarity-index:

Create a similarity index
-------------------------

In order to create a new Pinecone similarity index, you need to specify either
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
    brain_key = "pinecone_index"

    # Option 1: Compute embeddings on the fly from model name
    fob.compute_similarity(
        dataset,
        model=model_name,
        backend="pinecone",
        brain_key=brain_key,
    )

    # Option 2: Compute embeddings on the fly from model instance
    fob.compute_similarity(
        dataset,
        model=model,
        backend="pinecone",
        brain_key=brain_key,
    )

    # Option 3: Pass precomputed embeddings as a numpy array
    embeddings = dataset.compute_embeddings(model)
    fob.compute_similarity(
        dataset,
        embeddings=embeddings,
        backend="pinecone",
        brain_key=brain_key,
    )

    # Option 4: Pass precomputed embeddings by field name
    dataset.compute_embeddings(model, embeddings_field="embeddings")
    fob.compute_similarity(
        dataset,
        embeddings="embeddings",
        backend="pinecone",
        brain_key=brain_key,
    )

.. note::

    You can customize the Pinecone index by passing any
    :ref:`supported parameters <pinecone-config-parameters>` as extra kwargs.

.. _pinecone-patch-similarity-index:

Create a patch similarity index
-------------------------------

You can also create a similarity index for
:ref:`object patches <brain-object-similarity>` within your dataset by
specifying a `patches_field` argument to
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
        backend="pinecone",
        brain_key="pinecone_patches",
    )

.. note::

    You can customize the Pinecone index by passing any
    :ref:`supported parameters <pinecone-config-parameters>` as extra kwargs.

.. _pinecone-connect-to-existing-index:

Connect to an existing index
----------------------------

If you have already created a Pinecone index storing the embedding vectors for
the samples or patches in your dataset, you can connect to it by passing the
`index_name` to
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
        index_name="your-index",            # the existing Pinecone index
        brain_key="pinecone_index",
        backend="pinecone",
    )

.. _pinecone-add-remove-embeddings:

Add/remove embeddings from an index
-----------------------------------

You can use
:meth:`add_to_index() <fiftyone.brain.similarity.SimilarityIndex.add_to_index>`
and
:meth:`remove_from_index() <fiftyone.brain.similarity.SimilarityIndex.remove_from_index>`
to add and remove embeddings from an existing Pinecone index.

These methods can come in handy if you modify your FiftyOne dataset and need
to update the Pinecone index to reflect these changes:

.. code:: python
    :linenos:

    import numpy as np

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    pinecone_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        brain_key="pinecone_index",
        backend="pinecone",
    )
    print(pinecone_index.total_index_size)  # 200

    view = dataset.take(10)
    ids = view.values("id")

    # Delete 10 samples from a dataset
    dataset.delete_samples(view)

    # Delete the corresponding vectors from the index
    pinecone_index.remove_from_index(sample_ids=ids)

    # Add 20 samples to a dataset
    samples = [fo.Sample(filepath="tmp%d.jpg" % i) for i in range(20)]
    sample_ids = dataset.add_samples(samples)

    # Add corresponding embeddings to the index
    embeddings = np.random.rand(20, 512)
    pinecone_index.add_to_index(embeddings, sample_ids)

    print(pinecone_index.total_index_size)  # 210

.. _pinecone-get-embeddings:

Retrieve embeddings from an index
---------------------------------

You can use
:meth:`get_embeddings() <fiftyone.brain.similarity.SimilarityIndex.get_embeddings>`
to retrieve embeddings from a Pinecone index by ID:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    pinecone_index = fob.compute_similarity(
        dataset, 
        model="clip-vit-base32-torch",
        brain_key="pinecone_index",
        backend="pinecone",
    )

    # Retrieve embeddings for the entire dataset
    ids = dataset.values("id")
    embeddings, sample_ids, _ = pinecone_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (200, 512)
    print(sample_ids.shape)  # (200,)

    # Retrieve embeddings for a view
    ids = dataset.take(10).values("id")
    embeddings, sample_ids, _ = pinecone_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (10, 512)
    print(sample_ids.shape)  # (10,)

.. _pinecone-query:

Querying a Pinecone index
-------------------------

You can query a Pinecone index by appending a
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

    fob.compute_similarity(
        dataset, 
        model="clip-vit-base32-torch",
        brain_key="pinecone_index",
        backend="pinecone",
    )

    # Query by vector
    query = np.random.rand(512)  # matches the dimension of CLIP embeddings
    view = dataset.sort_by_similarity(query, k=10, brain_key="pinecone_index")

    # Query by sample ID
    query = dataset.first().id
    view = dataset.sort_by_similarity(query, k=10, brain_key="pinecone_index")

    # Query by a list of IDs
    query = [dataset.first().id, dataset.last().id]
    view = dataset.sort_by_similarity(query, k=10, brain_key="pinecone_index")

    # Query by text prompt
    query = "a photo of a dog"
    view = dataset.sort_by_similarity(query, k=10, brain_key="pinecone_index")

.. note::

    Performing a similarity search on a |DatasetView| will **only** return
    results from the view; if the view contains samples that were not included
    in the index, they will never be included in the result.

    This means that you can index an entire |Dataset| once and then perform
    searches on subsets of the dataset by
    :ref:`constructing views <using-views>` that contain the images of
    interest.

.. _pinecone-access-client:

Accessing the Pinecone client
-----------------------------

You can use the `index` property of a Pinecone index to directly access the
underlying Pinecone client instance and use its methods as desired:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    pinecone_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        brain_key="pinecone_index",
        backend="pinecone",
    )

    print(pinecone_index.index)

    # The Pinecone SDK is already initialized for you as well
    import pinecone
    print(pinecone.list_indexes())

.. _pinecone-advanced-usage:

Advanced usage
--------------

As :ref:`previously mentioned <pinecone-config-parameters>`, you can customize
your Pinecone indexes by providing optional parameters to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`.

Here's an example of creating a similarity index backed by a customized
Pinecone index. Just for fun, we'll specify a custom index name, use dot
product similarity, and populate the index for only a subset of our dataset:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Create a custom Pinecone index
    pinecone_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        embeddings=False,  # we'll add embeddings below
        metric="dotproduct",
        brain_key="pinecone_index",
        backend="pinecone",
        index_name="custom-pinecone-index",
        pod_type="s1",
        pods=2,
        shards=2,
    )

    # Add embeddings for a subset of the dataset
    view = dataset.take(10)
    embeddings, sample_ids, _ = pinecone_index.compute_embeddings(view)
    pinecone_index.add_to_index(embeddings, sample_ids)

    print(pinecone_index.index)

    # The Pinecone SDK is already initialized for you as well
    import pinecone
    print(pinecone.list_indexes())
