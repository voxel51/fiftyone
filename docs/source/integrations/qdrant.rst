.. _qdrant-integration:

Qdrant Integration
==================

.. default-role:: code

`Qdrant <https://qdrant.tech>`_ is one of the most popular vector search
engines available, and we've made it easy to use Qdrant's vector search
capabilities on your computer vision data directly from FiftyOne!

Follow these :ref:`simple instructions <qdrant-setup>` to configure your Qdrant
server and get started using Qdrant + FiftyOne.

FiftyOne provides an API to create Qdrant collections, upload vectors, and run
similarity queries, both :ref:`programmatically <qdrant-query>` in Python and
via point-and-click in the App.

.. note::

    Did you know? You can
    :ref:`search by natural language <brain-similarity-text>` using Qdrant
    similarity indexes!

.. image:: /images/brain/brain-image-similarity.gif
   :alt: image-similarity
   :align: center

.. _qdrant-basic-recipe:

Basic recipe
____________

The basic workflow to use Qdrant to create a similarity index on your FiftyOne
datasets and use this to query your data is as follows:

1)  Start a Qdrant service locally

2)  Load a :ref:`dataset <loading-datasets>` into FiftyOne

3)  Compute embedding vectors for samples or patches in your dataset, or select
    a model to use to generate embeddings

4)  Use the :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
    method to generate a Qdrant similarity index for the samples or object
    patches in a dataset by setting the parameter `backend="qdrant"` and
    specifying a `brain_key` of your choice

5)  Use this Qdrant similarity index to query your data with
    :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`

6) If desired, delete the index

|br|
The example below demonstrates this workflow.

.. note::

    You must `launch a Qdrant server <https://qdrant.tech>`_ and install the
    `Qdrant Python client <https://github.com/qdrant/qdrant_client>`_ to run
    this example:

    .. code-block:: shell

        docker pull qdrant/qdrant
        docker run -p 6333:6333 qdrant/qdrant

        pip install qdrant-client

    Note that, if you are using a custom Qdrant server, you can store your
    credentials as described in :ref:`this section <qdrant-setup>` to avoid
    entering them manually each time you interact with your Qdrant index.

First let's load a dataset into FiftyOne and compute embeddings for the samples:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    # Step 1: Load your data into FiftyOne
    dataset = foz.load_zoo_dataset("quickstart")

    # Steps 2 and 3: Compute embeddings and create a similarity index
    qdrant_index = fob.compute_similarity(
        dataset, 
        brain_key="qdrant_index",
        backend="qdrant",
    )

Once the similarity index has been generated, we can query our data in FiftyOne
by specifying the `brain_key`:

.. code-block:: python
    :linenos:

    # Step 4: Query your data
    query = dataset.first().id  # query by sample ID
    view = dataset.sort_by_similarity(
        query, 
        brain_key="qdrant_index",
        k=10,  # limit to 10 most similar samples
    )

    # Step 5 (optional): Cleanup

    # Delete the Qdrant collection
    qdrant_index.cleanup()

    # Delete run record from FiftyOne
    dataset.delete_brain_run("qdrant_index")

.. note::

    Skip to :ref:`this section <qdrant-examples>` for a variety of common
    Qdrant query patterns.

.. _qdrant-setup:

Setup
_____

The easiest way to get started with Qdrant is to
`install locally via Docker <https://qdrant.tech/documentation/install/>`_:

.. code-block:: shell

    docker pull qdrant/qdrant
    docker run -p 6333:6333 qdrant/qdrant

Installing the Qdrant client
----------------------------

In order to use the Qdrant backend, you must also install the
`Qdrant Python client <https://qdrant.tech/documentation/install/#python-client>`_:

.. code-block:: shell

    pip install qdrant-client

Using the Qdrant backend
------------------------

By default, calling
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` or 
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
will use an sklearn backend.

To use the Qdrant backend, simply set the optional `backend` parameter of
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to `"qdrant"`:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_similarity(..., backend="qdrant", ...)

Alternatively, you can permanently configure FiftyOne to use the Qdrant backend
by setting the following environment variable:

.. code-block:: shell

    export FIFTYONE_BRAIN_DEFAULT_SIMILARITY_BACKEND=qdrant

or by setting the `default_similarity_backend` parameter of your
:ref:`brain config <brain-config>` located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "default_similarity_backend": "qdrant"
    }

Authentication
--------------

If you are using a custom Qdrant server, you can provide your credentials in a
variety of ways.

**Environment variables (recommended)**

The recommended way to configure your Qdrant credentials is to store them in
the environment variables shown below, which are automatically accessed by
FiftyOne whenever a connection to Qdrant is made.

.. code-block:: shell

    export FIFTYONE_BRAIN_SIMILARITY_QDRANT_URL=localhost:6333
    export FIFTYONE_BRAIN_SIMILARITY_QDRANT_API_KEY=XXXXXXXX
    export FIFTYONE_BRAIN_SIMILARITY_QDRANT_GRPC_PORT=6334
    export FIFTYONE_BRAIN_SIMILARITY_QDRANT_PREFER_GRPC=false

The `API_KEY`, `GRPC_PORT`, and `PREFER_GRPC` environment variables are optional.

**FiftyOne Brain config**

You can also store your credentials in your :ref:`brain config <brain-config>`
located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "similarity_backends": {
            "qdrant": {
                "url": "http://localhost:6333",
                "api_key": "XXXXXXXX",
                "grpc_port": 6334,
                "prefer_grpc": false
            }
        }
    }

Note that this file will not exist until you create it.

**Keyword arguments**

You can manually provide credentials as keyword arguments each time you call
methods like :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
that require connections to Qdrant:

.. code:: python
    :linenos:

    import fiftyone.brain as fob 
    
    qdrant_index = fob.compute_similarity(
        ...
        backend="qdrant",
        brain_key="qdrant_index",
        url="http://localhost:6333",
        api_key="XXXXXXXX",
        grpc_port=6334,
        prefer_grpc=False
    )

Note that, when using this strategy, you must manually provide the credentials
when loading an index later via
:meth:`load_brain_results() <fiftyone.core.collections.SampleCollection.load_brain_results>`:

.. code:: python
    :linenos:

    qdrant_index = dataset.load_brain_results(
        "qdrant_index",
        url="http://localhost:6333",
        api_key="XXXXXXXX",
        grpc_port=6334,
        prefer_grpc=False
    )

.. _qdrant-config-parameters:

Qdrant config parameters
------------------------

The Qdrant backend supports a variety of query parameters that can be used to
customize your similarity queries. These parameters broadly fall into four 
categories:

1.  Basic vector database parameters
2.  Hierarchical navigable small world (HNSW) parameters
3.  Write-ahead-log (WAL) parameters
4.  Performance/optimizers parameters

|br|
For detailed information on these parameters, see the 
`Qdrant documentation <https://qdrant.tech/documentation/configuration>`_.

You can specify these parameters via any of the strategies described in the
previous section. Here's an example of a :ref:`brain config <brain-config>`
that includes all of the available parameters:

.. code-block:: json

    {
        "similarity_backends": {
            "qdrant": {
                "metric": "cosine",
                "replication_factor": null,
                "shard_number": null,
                "write_consistency_factor": null,
                "hnsw_config": {
                    "m": 16,
                    "ef_construct": 100,
                    "full_scan_threshold": 10000,
                    "max_indexing_threads": null,
                    "on_disk": null,
                    "payload_m": null
                },
                "optimizers_config": {
                    "deleted_threshold": 0.2,
                    "vacuum_min_vector_number": 1000,
                    "default_segment_number": 0,
                    "max_segment_size": null,
                    "memmap_threshold": null,
                    "indexing_threshold": 20000,
                    "flush_interval_sec": 5,
                    "max_optimization_threads": 1
                },
                "wal_config": {
                    "wal_capacity_mb": 32,
                    "wal_segments_ahead": 0
                }
            }
        }
    }

However, typically these parameters are directly passed to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to configure
a specific new index:

.. code:: python
    :linenos:

    qdrant_index = fob.compute_similarity(
        ...
        backend="qdrant",
        brain_key="qdrant_index",
        collection_name="your-collection-name",
        metric="cosine",
        replication_factor=1,
    )

.. _qdrant-managing-brain-runs:

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
    will not delete any associated Qdrant collection, which you can do as
    follows:

    .. code:: python

        # Delete the Qdrant collection
        qdrant_index = dataset.load_brain_results(brain_key)
        qdrant_index.cleanup()

.. _qdrant-examples:

Examples
________

This section demonstrates how to perform some common vector search workflows on 
a FiftyOne dataset using the Qdrant backend.

.. note::

    All of the examples below assume you have configured your Qdrant server
    as described in :ref:`this section <qdrant-setup>`.

.. _qdrant-new-similarity-index:

Create a similarity index
-------------------------

In order to create a new Qdrant similarity index, you need to specify either
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
    brain_key = "qdrant_index"

    # Option 1: Compute embeddings on the fly from model name
    fob.compute_similarity(
        dataset,
        model=model_name,
        backend="qdrant",
        brain_key=brain_key,
    )

    # Option 2: Compute embeddings on the fly from model instance
    fob.compute_similarity(
        dataset,
        model=model,
        backend="qdrant",
        brain_key=brain_key,
    )

    # Option 3: Pass precomputed embeddings as a numpy array
    embeddings = dataset.compute_embeddings(model)
    fob.compute_similarity(
        dataset,
        embeddings=embeddings,
        backend="qdrant",
        brain_key=brain_key,
    )

    # Option 4: Pass precomputed embeddings by field name
    dataset.compute_embeddings(model, embeddings_field="embeddings")
    fob.compute_similarity(
        dataset,
        embeddings="embeddings",
        backend="qdrant",
        brain_key=brain_key,
    )

.. note::

    You can customize the Qdrant collection by passing any
    :ref:`supported parameters <qdrant-config-parameters>` as extra kwargs.

.. _qdrant-patch-similarity-index:

Create a patch similarity index
-------------------------------

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
        backend="qdrant",
        brain_key="qdrant_patches",
    )

.. note::

    You can customize the Qdrant collection by passing any
    :ref:`supported parameters <qdrant-config-parameters>` as extra kwargs.

.. _qdrant-connect-to-existing-index:

Connect to an existing index
----------------------------

If you have already created a Qdrant collection storing the embedding vectors
for the samples or patches in your dataset, you can connect to it by passing
the `collection_name` to
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
        collection_name="your-collection",  # the existing Qdrant collection
        brain_key="qdrant_index",
        backend="qdrant",
    )

.. _qdrant-add-remove-embeddings:

Add/remove embeddings from an index
-----------------------------------

You can use
:meth:`add_to_index() <fiftyone.brain.similarity.SimilarityIndex.add_to_index>`
and
:meth:`remove_from_index() <fiftyone.brain.similarity.SimilarityIndex.remove_from_index>`
to add and remove embeddings from an existing Qdrant index.

These methods can come in handy if you modify your FiftyOne dataset and need
to update the Qdrant index to reflect these changes:

.. code:: python
    :linenos:

    import numpy as np

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    qdrant_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        brain_key="qdrant_index",
        backend="qdrant",
    )
    print(qdrant_index.total_index_size)  # 200

    view = dataset.take(10)
    ids = view.values("id")

    # Delete 10 samples from a dataset
    dataset.delete_samples(view)

    # Delete the corresponding vectors from the index
    qdrant_index.remove_from_index(sample_ids=ids)

    # Add 20 samples to a dataset
    samples = [fo.Sample(filepath="tmp%d.jpg" % i) for i in range(20)]
    sample_ids = dataset.add_samples(samples)

    # Add corresponding embeddings to the index
    embeddings = np.random.rand(20, 512)
    qdrant_index.add_to_index(embeddings, sample_ids)

    print(qdrant_index.total_index_size)  # 210

.. _qdrant-get-embeddings:

Retrieve embeddings from an index
---------------------------------

You can use
:meth:`get_embeddings() <fiftyone.brain.similarity.SimilarityIndex.get_embeddings>`
to retrieve embeddings from a Qdrant index by ID:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    qdrant_index = fob.compute_similarity(
        dataset, 
        model="clip-vit-base32-torch",
        brain_key="qdrant_index",
        backend="qdrant",
    )

    # Retrieve embeddings for the entire dataset
    ids = dataset.values("id")
    embeddings, sample_ids, _ = qdrant_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (200, 512)
    print(sample_ids.shape)  # (200,)

    # Retrieve embeddings for a view
    ids = dataset.take(10).values("id")
    embeddings, sample_ids, _ = qdrant_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (10, 512)
    print(sample_ids.shape)  # (10,)

.. _qdrant-query:

Querying a Qdrant index
-----------------------

You can query a Qdrant index by appending a
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
        brain_key="qdrant_index",
        backend="qdrant",
    )

    # Query by vector
    query = np.random.rand(512)  # matches the dimension of CLIP embeddings
    view = dataset.sort_by_similarity(query, k=10, brain_key="qdrant_index")

    # Query by sample ID
    query = dataset.first().id
    view = dataset.sort_by_similarity(query, k=10, brain_key="qdrant_index")

    # Query by a list of IDs
    query = [dataset.first().id, dataset.last().id]
    view = dataset.sort_by_similarity(query, k=10, brain_key="qdrant_index")

    # Query by text prompt
    query = "a photo of a dog"
    view = dataset.sort_by_similarity(query, k=10, brain_key="qdrant_index")

.. note::

    Performing a similarity search on a |DatasetView| will **only** return
    results from the view; if the view contains samples that were not included
    in the index, they will never be included in the result.

    This means that you can index an entire |Dataset| once and then perform
    searches on subsets of the dataset by
    :ref:`constructing views <using-views>` that contain the images of
    interest.

.. _qdrant-access-client:

Accessing the Qdrant client
---------------------------

You can use the `client` property of a Qdrant index to directly access the
underlying Qdrant client instance and use its methods as desired:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    qdrant_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        brain_key="qdrant_index",
        backend="qdrant",
    )

    qdrant_client = qdrant_index.client
    print(qdrant_client)
    print(qdrant_client.get_collections())

.. _qdrant-advanced-usage:

Advanced usage
--------------

As :ref:`previously mentioned <qdrant-config-parameters>`, you can customize
your Qdrant collections by providing optional parameters to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`.

In particular, the `hnsw_config`, `wal_config`, and `optimizers_config`
parameters may impact the quality of your query results, as well as the time
and memory required to perform approximate nearest neighbor searches.
Additionally, you can specify parameters like `replication_factor` and
`shard_number` to further tune performance.

Here's an example of creating a similarity index backed by a customized Qdrant
collection. Just for fun, we'll specify a custom collection name, use dot
product similarity, and populate the index for only a subset of our dataset:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Create a custom Qdrant index
    qdrant_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        embeddings=False,  # we'll add embeddings below
        metric="dotproduct",
        brain_key="qdrant_index",
        backend="qdrant",
        collection_name="custom-quickstart-index",
        replication_factor=2,
        shard_number=2,
    )

    # Add embeddings for a subset of the dataset
    view = dataset.take(10)
    embeddings, sample_ids, _ = qdrant_index.compute_embeddings(view)
    qdrant_index.add_to_index(embeddings, sample_ids)

    qdrant_client = qdrant_index.client
    print(qdrant_client.get_collections())
