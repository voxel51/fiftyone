.. pgvector-integration:

PostgreSQL Vector Search Integration
=================================

.. default-role:: code

`PostgreSQL <https://www.postgresql.org>`_ is the world's most advanced open source database, and we've made it easy to use PostgreSQL's `vector search capabilities using PGVector <https://github.com/pgvector/pgvector>`_ on your computer vision data directly from FiftyOne!

Follow these :ref:`simple instructions <postgresql-setup>` to configure a PostgreSQL cluster and get started using PostgreSQL with PGVector + FiftyOne.

FiftyOne provides an API to create PGVector indexes, upload vectors, and run similarity queries, both
:ref:`programmatically <pgvector-query>` in Python and via point-and-click in the App.

.. note::

    Did you know? You can
    :ref:`search by natural language <brain-similarity-text>` using PGVector similarity indexes!

.. image:: /images/brain/brain-image-similarity.gif
   :alt: image-similarity
   :align: center

.. _pgvector-basic-recipe:

Basic recipe
____________

The basic workflow to use PGVector to create a similarity index on your FiftyOne datasets and use this to query your data is as follows:

1)  Initialize and start a PostgreSQL instance, then configure PGVector

2)  Load a :ref:`dataset <loading-datasets>` into FiftyOne

3)  Compute embedding vectors for samples or patches in your dataset, or select a model to use to generate embeddings

4)  Use the :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
    method to generate a PGVector similarity index for the samples or object patches in a dataset by setting the parameter `backend="pgvector"` and specifying a `brain_key` of your choice

5)  Use this PGVector similarity index to query your data with
    :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`

6) If desired, delete the index

|br|
The example below demonstrates this workflow.

.. note::

    You must :ref:`configure <postgresql-setup>` a PostgreSQL 
    cluster with PGVector and provide the :ref:`connection string <configuring-postgresql-connection>` to run this 
    example:

    .. code-block:: shell

        export FIFTYONE_DATABASE_NAME=fiftyone
        export FIFTYONE_DATABASE_URI='postgresql://[userspec@][hostspec][/dbname][?paramspec]'

    where userspec is:

    .. code-block:: shell
        
        user[:password]

    and hostspec is:

    .. code-block:: shell
        
        [host][:port][,...]

    and paramspec is:

    .. code-block:: shell

        name=value[&...]

First let's load a dataset into FiftyOne and compute embeddings for the samples:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    # Step 1: Load your data into FiftyOne
    dataset = foz.load_zoo_dataset("quickstart")

    # Steps 2 and 3: Compute embeddings and create a similarity index
    pgvector_index = fob.compute_similarity(
        dataset, 
        embeddings="embeddings",  # the field in which to store the embeddings
        brain_key="pgvector_index",
        backend="pgvector",
    )

Once the similarity index has been generated, we can query our data in FiftyOne by specifying the `brain_key`:

.. code-block:: python
    :linenos:

    # Step 4: Query your data
    query = dataset.first().id  # query by sample ID
    view = dataset.sort_by_similarity(
        query, 
        brain_key="pgvector_index",
        k=10,  # limit to 10 most similar samples
    )

    # Step 5 (optional): Cleanup

    # Delete the PGVector index
    pgvector_index.cleanup()

    # Delete run record from FiftyOne
    dataset.delete_brain_run("pgvector_index")

.. note::

    Skip to :ref:`this section <pgvector-examples>` for a variety of common PGVector query patterns.

.. _postgresql-setup:

Setup
_____

In order to get started, you must set up both a PostgreSQL instance and PGVector alongside it.

There are many different ways to deploy PostgreSQL no matter whether you're considering on-prem, containers, or self hosted vs. managed deployments across any cloud provider or operating system. Find the generalized `PostgreSQL installation instructions on the official PostgreSQL.org site, here <https://www.postgresql.org/download/>`_.

Follow the instructions in the `PGVector documentation <https://github.com/pgvector/pgvector>`_ to set up PGVector for your operating system & environment.

Configuring your connection string
----------------------------------

You can connect FiftyOne to your PostgreSQL + PGVector cluster by simply providing its
:ref:`connection string <configuring-postgresql-connection>`:

.. code-block:: shell

    export FIFTYONE_DATABASE_NAME=fiftyone
    export FIFTYONE_DATABASE_URI='postgresql://[userspec@][hostspec][/dbname][?paramspec]'

where userspec is:

.. code-block:: shell
    
    user[:password]

and hostspec is:

.. code-block:: shell
    
    [host][:port][,...]

and paramspec is:

.. code-block:: shell

    name=value[&...]

Using the PGVector backend
-------------------------

By default, calling
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` or 
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
will use an sklearn backend.

To use the PGVector backend, simply set the optional `backend` parameter of
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to
`"pgvector"`:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_similarity(..., backend="pgvector", ...)

Alternatively, you can permanently configure FiftyOne to use the PGVector backend by setting the following environment variable:

.. code-block:: shell

    export FIFTYONE_BRAIN_DEFAULT_SIMILARITY_BACKEND=pgvector

or by setting the `default_similarity_backend` parameter of your
:ref:`brain config <brain-config>` located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "default_similarity_backend": "pgvector"
    }

.. _pgvector-config-parameters:

PGVector config parameters
-------------------------

The PGVector backend supports a variety of query parameters that can be used to customize your similarity queries. 

For detailed information on these parameters, see the
`PGVector documentation <https://github.com/pgvector/pgvector>`_.

You can specify these parameters via any of the strategies described in the
previous section. Here's an example of a :ref:`brain config <brain-config>`:


            connection_string=os.getenv("PGVECTOR_CONNECTION_STRING"),
            metric="cosine",  # You can change this to "dotproduct" or "euclidean" for testing.
            work_mem="64MB",  # Example dynamic memory tuning for performance.
            index_name="custom_hnsw_index",  # User-specified index name
            embedding_column="custom_embedding_column",  # User-specified embedding column

 config = PgVectorSimilarityConfig(



.. code-block:: json

    {
        "similarity_backends": {
            "pgvector": {
                "connection_string": "postgresql://userfoo:admin@localhost:5432/pgvector_db", # An example PostgreSQL connection string URI
                "metric": "cosine", # Can be changed to "dotproduct" or "euclidean" for testing
                "work_mem": "64MB", # Example dynamic memory tuning for performance
                "index_name": "custom_hnsw_index", # User-specified index name
                "embedding_column": "custom_embedding_column", # User-specified embedding column
                "ssl_cert": None,
                "ssl_key": None,
                "ssl_root_cert": None
            }
        }
    }

However, typically these parameters are directly passed to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to configure
a specific new index:

.. code:: python
    :linenos:

    pgvector_index = fob.compute_similarity(
        ...
        backend="pgvector",
        brain_key="pgvector_index",
        index_name="your-index",
        metric="cosine",
    )

.. _pgvector-managing-brain-runs:

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
    will not delete any associated PGVector index, which you can
    do as follows:

    .. code:: python

        # Delete the PGVector index
        pgvector_index = dataset.load_brain_results(brain_key)
        pgvector_index.cleanup()

.. _pgvector-examples:

Examples
________

This section demonstrates how to perform some common vector search workflows on a FiftyOne dataset using the PostgreSQL + PGVector backend.

.. note::

    All of the examples below assume you have configured and started your PostgreSQL
    cluster as described in :ref:`this section <postgresql-setup>`.

.. _pgvector-new-similarity-index:

Create a similarity index
-------------------------

In order to create a new PGVector similarity index, you need to specify either the `embeddings` or `model` argument to
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
    brain_key = "pgvector_index"

    # Option 1: Compute embeddings on the fly from model name
    fob.compute_similarity(
        dataset,
        model=model_name,
        embedding_column="embedding_column",  # the column in which to store the embeddings
        backend="pgvector",
        brain_key=brain_key,
    )

    # Option 2: Compute embeddings on the fly from model instance
    fob.compute_similarity(
        dataset,
        model=model,
        embedding_column="embedding_column",  # the column in which to store the embeddings
        backend="pgvector",
        brain_key=brain_key,
    )

    # Option 3: Pass precomputed embeddings as a numpy array
    embeddings = dataset.compute_embeddings(model)
    fob.compute_similarity(
        dataset,
        embedding_column="embeddings",  # the column in which to store the embeddings
        backend="pgvector",
        brain_key=brain_key,
    )

    # Option 4: Pass precomputed embeddings by field name
    embeddings = dataset.compute_embeddings(model)
    dataset.set_values("embeddings", embeddings.tolist())
    fob.compute_similarity(
        dataset,
        embedding_column="embeddings",  # the field that contains the embeddings
        backend="pgvector",
        brain_key=brain_key,
    )

.. note::

    You can customize the PGVector index by passing any
    :ref:`supported parameters <pgvector-config-parameters>` as extra kwargs.

.. _pgvector-patch-similarity-index:

Create a patch similarity index
-------------------------------

You can also create a similarity index for
:ref:`object patches <brain-object-similarity>` within your dataset by including the `patches_field` argument to
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
        embedding_column="embeddings",  # the column in which to store the embeddings
        backend="pgvector",
        brain_key="pgvector_patches",
    )

.. note::

    You can customize the PGVector index by passing any
    :ref:`supported parameters <pgvector-config-parameters>` as extra kwargs.

.. _pgvector-connect-to-existing-index:

Connect to an existing index
----------------------------

If you have already created a PGVector index storing the embedding vectors
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
        index_name="your-index",            # the existing PGVector index
        brain_key="pgvector_index",
        backend="pgvector",
    )

.. _pgvector-add-remove-embeddings:

Add/remove embeddings from an index
-----------------------------------

You can use
:meth:`add_to_index() <fiftyone.brain.similarity.SimilarityIndex.add_to_index>`
and
:meth:`remove_from_index() <fiftyone.brain.similarity.SimilarityIndex.remove_from_index>`
to add and remove embeddings from an existing PGVector index.

These methods can come in handy if you modify your FiftyOne dataset and need
to update the PGVector index to reflect these changes:

.. code:: python
    :linenos:

    import numpy as np

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    pgvector_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        embedding_column="embeddings",  # the field in which to store the embeddings
        brain_key="pgvector_index",
        backend="pgvector",
    )
    print(pgvector_index.total_index_size)  # 200

    view = dataset.take(10)
    ids = view.values("id")

    # Delete 10 samples from a dataset
    dataset.delete_samples(view)

    # Delete the corresponding vectors from the index
    pgvector_index.remove_from_index(sample_ids=ids)

    # Add 20 samples to a dataset
    samples = [fo.Sample(filepath="tmp%d.jpg" % i) for i in range(20)]
    sample_ids = dataset.add_samples(samples)

    # Add corresponding embeddings to the index
    embeddings = np.random.rand(20, 512)
    pgvector_index.add_to_index(embeddings, sample_ids)

    print(pgvector_index.total_index_size)  # 210

.. _pgvector-get-embeddings:

Retrieve embeddings from an index
---------------------------------

You can use
:meth:`get_embeddings() <fiftyone.brain.similarity.SimilarityIndex.get_embeddings>`
to retrieve embeddings from a PGVector index by ID:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    pgvector_index = fob.compute_similarity(
        dataset, 
        model="clip-vit-base32-torch",
        embedding_column="embeddings",  # the field in which to store the embeddings
        brain_key="pgvector_index",
        backend="pgvector",
    )

    # Retrieve embeddings for the entire dataset
    ids = dataset.values("id")
    embeddings, sample_ids, _ = pgvector_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (200, 512)
    print(sample_ids.shape)  # (200,)

    # Retrieve embeddings for a view
    ids = dataset.take(10).values("id")
    embeddings, sample_ids, _ = pgvector_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (10, 512)
    print(sample_ids.shape)  # (10,)

.. _pgvector-query:

Querying a PGVector index
------------------------

You can query a PGVector index by appending a
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

    pgvector_index = fob.compute_similarity(
        dataset, 
        model="clip-vit-base32-torch",
        embedding_column="embeddings",  # the field in which to store the embeddings
        brain_key="pgvector_index",
        backend="pgvector",
    )

    # Query by vector
    query = np.random.rand(512)  # matches the dimension of CLIP embeddings
    view = dataset.sort_by_similarity(query, k=10, brain_key="pgvector_index")

    # Query by sample ID
    query = dataset.first().id
    view = dataset.sort_by_similarity(query, k=10, brain_key="pgvector_index")

    # Query by a list of IDs
    query = [dataset.first().id, dataset.last().id]
    view = dataset.sort_by_similarity(query, k=10, brain_key="pgvector_index")

    # Query by text prompt
    query = "a photo of a dog"
    view = dataset.sort_by_similarity(query, k=10, brain_key="pgvector_index")

.. note::

    Performing a similarity search on a |DatasetView| will **only** return results from the view; if the view contains samples that were not included in the index, they will never be included in the result.

    This means that you can index an entire |Dataset| once and then perform searches on subsets of the dataset by
    :ref:`constructing views <using-views>` that contain the images of interest.

.. _pgvector-advanced-usage:

Advanced usage
--------------

As :ref:`previously mentioned <pgvector-config-parameters>`, you can customize
your PGVector index by providing optional parameters to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`.

The `metric` parameter may impact the quality of your query results, as well as the time and memory required to perform approximate nearest neighbor searches. Additionally, you can specify a parameter like `work_mem` to further tune performance.

Here's an example of creating a similarity index backed by a customized PGVector index. Just for fun, we'll specify a custom index name, use dot product similarity, and populate the index for only a subset of our dataset:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Create a custom PGVector index
    pgvector_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        embeddings_column="embeddings",  # the column in which to store the embeddings
        brain_key="pgvector_index",
        backend="pgvector",
        index_name="custom-quickstart-index",
        metric="cosine",
    )

    # Add embeddings for a subset of the dataset
    view = dataset[:20]
    embeddings, sample_ids, _ = pgvector_index.compute_embeddings(view)
    pgvector_index.add_to_index(embeddings, sample_ids)

    print(pgvector_index.total_index_size)  # 20
    print(pgvector_index.config.index_name)  # custom-quickstart-index
    print(pgvector_index.config.metric)  # cosine
