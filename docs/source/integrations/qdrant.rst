.. _qdrant-integration:

Qdrant Integration
====================

.. default-role:: code

`Qdrant <https://qdrant.tech/>`_ is one of the most popular vector search engine
tools available, and we've made it easy to use Qdrant's vector search 
capabilities on your computer vision data directly from FiftyOne!

FiftyOne provides :ref:`simple setup instructions <qdrant-setup>` that you can
use to specify the necessary server endpoint to use.

FiftyOne provides an API to create collections, upload data, and run search 
queries using Qdrant, all programmatically in Python. Currently, these methods
are explicitly supported for sample-level and patch-level embeddings for image
datasets. 

.. note::

    If you have a video dataset, you can convert videos to frames and then use
    the FiftyOne Qdrant integration to perform search on the frames.

.. _qdrant-basic-recipe:

Basic recipe
____________

The basic workflow to use Qdrant to create a similarity index on your FiftyOne
datasets and use this to query your data is as follows:

1) Run a Qdrant service inside a Docker container on your machine

2) Load a :ref:`dataset <loading-datasets>` into FiftyOne

3) Compute embedding vectors for samples or patches in your dataset, or select a
    model to use to generate embeddings

4) Use the
   :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
   method on your dataset or view to generate a similarity index for the samples
   or object patches using Qdrant by setting the parameter `backend="qdrant"`, 
   and setting a Brain key if desired

5) Use this Qdrant similarity index to query your data with the 
   :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
   , specifying the corresponding Brain key if there are multiple similarity
   indexes on your dataset

6) If desired, delete the Qdrant collection

|br|
The example below demonstrates this workflow.

.. note::

    You must install Qdrant `qdrant.tech <https://qdrant.tech/>`_ in
    order to run this example.

    Note that you can store your server URL and vector search configs as 
    described in :ref:`this section <qdrant-setup>` to avoid entering them 
    manually each time you interact with Qdrant.

    You'll also need to install the
    `Qdrant Python client <https://github.com/qdrant/qdrant_client>`_:

    .. code-block:: shell

        pip install qdrant-client

First, we run the service inside a Docker container on our machine:

.. code-block:: bash

    # Step 1: Run Qdrant service

    docker run -p 6333:6333 qdrant/qdrant

Then, we load a dataset into FiftyOne and compute embeddings for the samples:

.. code-block:: python
    :linenos:

    # Step 2: Load your data into FiftyOne
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "quickstart", dataset_name="qdrant-vector-search-example"
    )
    dataset.persistent = True

    # Steps 3 and 4: Compute embeddings and similarity index for your data
    qdrant_index = fob.compute_similarity(
        dataset, 
        brain_key = "qdrant",
        backend="qdrant",
    )

Once the similarity index has been generated, we can query our data in
FiftyOne by specifying the Brain key:

.. code-block:: python
    :linenos:

    dataset = fo.load_dataset("qdrant-vector-search-example")
    brain_key = "qdrant"

   # Step 5: Query your data
    query = dataset.first().id # query by sample ID
    view = dataset.sort_by_similarity(
        query, 
        brain_key = brain_key
        k = 10 # limit to 10 most similar samples
    )

    # Step 6: Cleanup

    # Delete collection from Qdrant
    qdrant_index = dataset.load_brain_results(brain_key)
    qdrant_client = qdrant_index.connect_to_api()
    results.cleanup() 

    # Delete run record from FiftyOne
    dataset.delete_brain_run(brain_key)

.. note::

    See :ref:`this section <qdrant-examples>` to see a variety of common
    Qdrant query patterns.

.. _qdrant-setup:

Setup
_____

FiftyOne currently supports
`local Docker deployments of Qdrant 
<https://qdrant.tech/documentation/install/>`_ .

The easiest way to get started is to pull the pre-built Docker image: 

.. code-block:: shell

    docker pull qdrant/qdrant
    docker run -p 6333:6333 qdrant/qdrant

Installing the Qdrant client
------------------------------

In order to use the Qdrant backend, you must install the
`Qdrant Python client 
<https://qdrant.tech/documentation/install/#python-client>`_:

.. code-block:: shell

    pip install qdrant-client

Using the Qdrant backend
--------------------------

By default, calling
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` or 
:meth:`sort_by_similarity() <fiftyone.core.collection.sort_by_similarity>` will
use an Sklearn backend.

To use the Qdrant backend, simply set the optional `backend` parameter of
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to
`"qdrant"`:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_similarity(
        view,
        backend="qdrant",
        ...
    )

Alternatively, you can permanently configure FiftyOne to use the Qdrant
backend by setting the `FIFTYONE_DEFAULT_SIMILARITY_BACKEND` environment
variable:

.. code-block:: shell

    export FIFTYONE_DEFAULT_SIMILARITY_BACKEND=qdrant

or by setting the `default_similarity_backend` parameter of your
:ref:`Fiftyone Brain config <fiftyone-brain-config>` located at
`~/.fiftyone/brain_config.json`:

.. code-block:: text

    {
        "default_similarity_backend": "qdrant"
    }

Authentication
--------------

In order to connect to a Qdrant server, you must provide your server url, which 
can be done in a variety of ways.

**Environment variables (recommended)**

The recommended way to configure your Qdrant server URL is to store it in the 
`FIFTYONE_QDRANT_URL` environment variable. This is automatically accessed by 
FiftyOne whenever a connection to Qdrant is made.

.. code-block:: shell

    export FIFTYONE_QDRANT_URL=localhost:6333


**FiftyOne Brain config**

You can also store your credentials in your
:ref:`Brain config <brain-config>` located at
`~/.fiftyone/brain_config.json`:

.. code-block:: text

    {
        "similarity_backends": {
            "qdrant": {
                "url": "http://localhost:6333",
            }
        }
    }

Note that this file will not exist until you create it.

**Keyword arguments**

You can manually provide this as a keyword argument each time you call methods 
like :meth:`compute_similarity() <fiftyone.brain.compute_similarity>` that 
require connections to Qdrant:

.. code:: python
    :linenos:

    import fiftyone.brain as fob 
    
    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset,
        backend="qdrant",
        brain_key="qdrant",
        model="resnet-50-imagenet-torch"
        url="http://localhost:6333",
        ...
    )


.. _qdrant-query-parameters:

Qdrant query parameters
-----------------------

The Qdrant backend supports a variety of query parameters that can be used to
customize your similarity queries. These parameters broadly fall into four 
categories:

1. Basic vector database parameters
2. Hierarchical navigable small world (HNSW) parameters
3. Write-ahead-log (WAL) parameters
4. Performance/optimizers parameters

For detailed information on these parameters, see the 
`Qdrant documentation <https://qdrant.tech/documentation/configuration/>`_.

You can specify these parameters in a variety of ways:

In  your FiftyOne Brain config located at `~/.fiftyone/brain_config.json`. Here
is an example of a config that specifies all of the available parameters:

.. code-block:: text

    {
        "similarity_backends": {
            "qdrant": {
                "url": "http://localhost:6333",
                "shard_number": null,
                "replication_factor": null,
                "write_consistency_factor": null,
                "hnsw_config": {
                    "m": 16,
                    "ef_construct": 100,
                    "full_scan_threshold": 10000,
                    "max_indexing_threads": null,
                    "on_disk": null,
                    "payload_m": null
                },
                "wal_config": {
                    "wal_capacity_mb": 32,
                    "wal_segments_ahead": 0
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
                }
            }
        }
    }

.. _qdrant-managing-brain-runs:

Managing brain runs
________________________

FiftyOne provides a variety of methods that you can use to manage brain runs.

For example, you can call
:meth:`list_brain_runs() <fiftyone.core.collections.SampleCollection.list_brain_runs>`
to see the available brain keys on a dataset:

.. code:: python
    :linenos:

    dataset.list_brain_runs()

Or, you can use
:meth:`get_brain_info() <fiftyone.core.collections.SampleCollection.get_brain_info>`
to retrieve information about the configuration of a brain run:

.. code:: python
    :linenos:

    info = dataset.get_brain_info(brain_key)
    print(info)

Use :meth:`load_brain_results() <fiftyone.core.collections.SampleCollection.load_brain_results>`
to load the :class:`SimilarityResults <fiftyone.brain.similarity.SimilarityResults>`
instance for a brain run.



You can use
:meth:`rename_brain_run() <fiftyone.core.collections.SampleCollection.rename_brain_run>`
to rename the brain key associated with an existing similarity results run:

.. code:: python
    :linenos:

    dataset.rename_brain_run(sim_key, new_sim_key)

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
    only deletes the **record** of the brain run from your FiftyOne
    dataset; it will not delete any Qdrant collection associated with your 
    dataset.

.. _qdrant-examples:

Examples
________

This section demonstrates how to perform some common vector search workflows on 
a FiftyOne dataset using the Qdrant backend.

.. note::

    All of the examples below assume you have configured your Qdrant server
    as described in :ref:`this section <qdrant-setup>`.

.. _qdrant-new-similarity-index:

Create new similarity index
-----------------------------

In order to create a new 
:ref:`QdrantSimilarityIndex <fiftyone.brain.internal.core.qdrant.QdrantSimilarityIndex>`
, you need to specify either the `embeddings` or `model` argument to 
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")
    model_name = "resnet-50-imagenet-torch"
    model = foz.load_zoo_model(model_name)

    brain_key = "qdrant"

    ## Option 1: Compute embeddings on the fly from model name
    fob.compute_similarity(
        dataset,
        brain_key,
        model = model_name,
        backend="qdrant",
    )

    ## Option 2: Compute embeddings on the fly from model instance
    fob.compute_similarity(
        dataset,
        brain_key,
        model=model
        backend="qdrant",
    )

    ## Option 3: Pass in pre-computed embeddings as a NumPy array
    embeddings = fob.compute_embeddings(
        dataset,
        model = model,
    )

    fob.compute_similarity(
        dataset,
        brain_key,
        embeddings=embeddings,
        backend="qdrant",
    )

    ## Option 4: Pass in pre-computed embeddings by field name
    fob.compute_embeddings(
        dataset,
        model = model,
        embeddings_field="embeddings",
    )

    fob.compute_similarity(
        dataset,
        brain_key,
        embeddings_field="embeddings",
        backend="qdrant",
    )

    print(dataset.get_brain_info(brain_key))

.. _qdrant-connect-to-existing-index:

Connect to existing index
--------------------------

If you have already created a Qdrant collection for your dataset, you can 
connect to it using the 
:ref:`QdrantSimilarityIndex <fiftyone.brain.internal.core.qdrant.QdrantSimilarityIndex>` 
class by passing `embeddings=False` to 
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset, 
        embeddings=False,
        model="resnet-50-imagenet-torch",
        brain_key = "qdrant", 
        backend="qdrant",
    )

This will create a new 
:ref:`QdrantSimilarityIndex <fiftyone.brain.internal.core.qdrant.QdrantSimilarityIndex>`
associated with the existing Qdrant collection, with needing to recompute the
embeddings on your data.

.. _qdrant-patch-similarity-index:

Create a patch embeddings similarity index
-------------------------------------------

You can also create a similarity index for object patches within your dataset 
by specifying a `patches_field` argument to 
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset, 
        patches_field="detections",
        model = "resnet-50-imagenet-torch"
        brain_key = "qdrant_patches", 
        backend="qdrant",
    )

    print(dataset.get_brain_info(brain_key))

.. _qdrant-connect-to-client:

Connect to Qdrant client
------------------------

You can connect to the Qdrant client instance using the 
:ref:`fiftyone.brain.internal.core.qdrant.QdrantSimilarityIndex.client` 
attribute. You can then access all of the Qdrant client's methods:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    res = fob.compute_similarity(
        dataset, 
        model = "resnet-50-imagenet-torch"
        brain_key = "qdrant", 
        backend="qdrant",
        collection_name="fiftyone-quickstart",
    )

    qdrant_client = res.client
    print(qdrant_client)
    print(qdrant_client.get_collections())
    print(qdrant_client.get_collection(collection_name = "fiftyone-quickstart"))

.. _qdrant-get-embeddings:

Retrieve embeddings from Qdrant index
--------------------------------------

You can retrieve the embeddings from a Qdrant index using the 
:meth:`get_embeddings() fiftyone.brain.internal.core.qdrant.QdrantSimilarityIndex.get_embeddings`
method. This can be applied to an entire dataset, or a view into a dataset:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    qdrant_index = fob.compute_similarity(
        dataset, 
        model = "resnet-50-imagenet-torch"
        brain_key = "qdrant", 
        backend="qdrant",
        collection_name="fiftyone-quickstart",
    )

    dataset_embeddings = qdrant_index.get_embeddings(dataset)

    ## create a view into the dataset
    view = dataset.take(10)
    ## get embeddings for the view
    view_embeddings = qdrant_index.get_embeddings(view)


.. _qdrant-query-embeddings:

Query embeddings with Qdrant index
-------------------------------------------

You can query a SimilarityResult instance using the 
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>` 
method. This can be applied to an entire dataset, or a
view into a dataset. The query can be any of the following:

1. A single numerical vector of the same length as the embeddings
2. An ID (sample or patch)
3. A list of IDs (sample or patches)
4. A text prompt

A query can only be a text prompt if the model used to compute the embeddings 
supports text prompts. Here are examples of all of these, using the CLIP model, 
which supports text prompts:

.. code:: python
    :linenos:

    import numpy as np

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset, 
        model = "clip-vit-base32-torch"
        brain_key = "qdrant", 
        backend="qdrant",
        collection_name="fiftyone-quickstart",
    )

    ## query by numerical vector
    query = np.random.rand(512) ## 512 is the length of the CLIP embeddings

    ## query by single ID
    query = dataset.first().id

    ## query by list of IDs
    query = [dataset.first().id, dataset.last().id]

    ## query by text prompt
    query = "a photo of a dog"

    view = dataset.sort_by_similarity(query, brain_key="qdrant", k = 10)
    print(view)

.. _qdrant-edit-collection:

Editing a Qdrant collection
----------------------------

You can edit a Qdrant collection by adding or removing samples and patches from
the collection. This can be done using the 
:meth:`add_to_index() fiftyone.brain.internal.core.qdrant.QdrantSimilarityIndex.add_to_index`
and 
:meth:`remove_from_index() fiftyone.brain.internal.core.qdrant.QdrantSimilarityIndex.remove_from_index`
methods. These methods can come in handy if you want to add or remove samples or
object patches from your dataset, and then update the Qdrant index to reflect
these changes.

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    qdrant_index = fob.compute_similarity(
        dataset, 
        model = "clip-vit-base32-torch"
        brain_key = "qdrant", 
        backend="qdrant",
        collection_name="fiftyone-quickstart",
    )

    samples_to_delete = dataset.take(10)
    dataset.delete_samples(samples_to_delete)
    qdrant_index.remove_from_index(samples_to_delete)
    
    samples_to_add = dataset.take(20)
    dataset.add_samples(samples_to_add)
    qdrant_index.add_to_index(samples_to_add)
    

You can also get the total number of vectors in the index using the 
:ref:`fiftyone.brain.internal.core.qdrant.QdrantSimilarityIndex.total_index_size` 
attribute. Continuing the above code:

.. code:: python
    :linenos:

    print(qdrant_index.total_index_size)
    ## will return 210, since we removed 10 samples and then added 20 samples 


.. _qdrant-advanced-usage:

Advanced usage
--------------------------

As mentioned above, you can also specify configuration parameters for the Qdrant 
client, including `hnsw_config`, `wal_config`, and `optimizers_config` 
parameters. These parameters may impact the quality of your query results, as 
well as the time and memory required to perform approximate nearest neighbor
searches. Additionally, you can specify the replication factor and shard number
for the vector database. 

Here's an example of creating a similarity index with custom configuration for 
the Qdrant backend. Just for fun, we will also specify a custom collection name,
pass in a dot product similarity metric, and only generate the similarity index
for a view into our data.

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(100)
    collection_name = "custom-collection-name"

    res = fob.compute_similarity(
        view, 
        model = "clip-vit-base32-torch"
        brain_key = "qdrant", 
        backend="qdrant",
        collection_name=collection_name,
        hnsw_config = {
            "ef_construct": 100,
        },
        replication_factor = 2,
        shards_number = 2,
        metric = "dotproduct",
    )

    qdrant_client = res.client
    print(qdrant_client.get_collection(collection_name = collection_name))
