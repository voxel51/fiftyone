.. _pgvector-integration:

Pgvector Vector Search Integration
=======================================

.. default-role:: code

`Pgvector <https://github.com/pgvector/pgvector>`_ is a vector search extension
to PostgreSQL, one of the most popular open source databases, and we've made it easy to
use Pgvector on your computer vision data directly from FiftyOne!

Follow these :ref:`simple instructions <pgvector-setup>` to get started
using Pgvector + FiftyOne.

FiftyOne provides an API to create Pgvector indexes, upload vectors, and
run similarity queries, both :ref:`programmatically <pgvector-query>` in
Python and via point-and-click in the App.

.. note::

    Did you know? You can
    :ref:`search by natural language <brain-similarity-text>` using
    Pgvector similarity indexes!

.. image:: /images/brain/brain-image-similarity.gif
   :alt: image-similarity
   :align: center

.. _pgvector-basic-recipe:

Basic recipe
____________

The basic workflow to use Pgvector to create a similarity index on your
FiftyOne datasets and use this to query your data is as follows:

1)  Connect to or start a PostgreSQL server with the pgvector extension

2)  Load a :ref:`dataset <loading-datasets>` into FiftyOne

3)  Compute embedding vectors for samples or patches in your dataset, or select
    a model to use to generate embeddings

4)  Use the :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
    method to generate a Pgvector similarity index for the samples or
    object patches in a dataset by setting the parameter
    `backend="pgvector"` and specifying a `brain_key` of your choice

5)  Use this Pgvector similarity index to query your data with
    :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`

6) If desired, delete the index

|br|
The example below demonstrates this workflow.

.. note::

    You must have access to
    `a PostgreSQL instance with pgvector extension <https://github.com/pgvector/pgvector?tab=readme-ov-file#additional-installation-methods>`_
    and install the
    `psycopg2 Python module <https://pypi.org/project/psycopg2/>`_
    to run this example:

    .. code-block:: shell

        pip install psycopg2

    You can store credentials for your Postgres instance 
    as described in :ref:`this section <pgvector-setup>`
    to avoid entering them manually each time you interact with your
    Pgvector index.

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
        brain_key="pgvector_index",
        backend="pgvector",
    )

Once the similarity index has been generated, we can query our data in FiftyOne
by specifying the `brain_key`:

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

    # Delete the pgvector index
    pgvector_index.cleanup()

    # Delete run record from FiftyOne
    dataset.delete_brain_run("pgvector_index")

.. note::

    Skip to :ref:`this section <pgvector-examples>` for a variety of
    common pgvector query patterns.

.. _pgvector-setup:

Setup
_____

The easiest way to get started with pgvector is to
`install locally via Docker <https://github.com/pgvector/pgvector?tab=readme-ov-file#docker>`_.

Installing the psycopg2 client
-----------------------------------

In order to use the pgvector backend, you must also install the
`psycopg2 Python module <https://pypi.org/project/psycopg2/>`_:

.. code-block:: shell

    pip install psycopg2

Using the pgvector backend
-------------------------------

By default, calling
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` or
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
will use an sklearn backend.

To use the pgvector backend, simply set the optional `backend` parameter of
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to
`"pgvector"`:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_similarity(..., backend="pgvector", ...)

Alternatively, you can permanently configure FiftyOne to use the pgvector
backend by setting the following environment variable:

.. code-block:: shell

    export FIFTYONE_BRAIN_DEFAULT_SIMILARITY_BACKEND=pgvector

or by setting the `default_similarity_backend` parameter of your
:ref:`brain config <brain-config>` located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "default_similarity_backend": "pgvector"
    }

Authentication
--------------

If you are using a custom pgvector server, you can provide your
credentials in a
`variety of ways <https://www.psycopg.org/docs/module.html#module-psycopg2>`_.

**Environment variables (recommended)**

The recommended way to configure your pgvector credentials is to store
them in the environment variables shown below, which are automatically accessed
by FiftyOne whenever a connection to pgvector is made.

.. code-block:: shell

    export FIFTYONE_BRAIN_SIMILARITY_PGVECTOR_CONNECTION_STRING=postgresql://postgres:mysecretpassword@localhost:5432/postgres

This is only one example of variables that can be used to authenticate a
pgvector client. Find more information
`here. <https://www.psycopg.org/docs/module.html#module-psycopg2>`_

**FiftyOne Brain config**

You can also store your credentials in your :ref:`brain config <brain-config>`
located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "similarity_backends": {
            "pgvector": {
                "connection_string": "postgresql://postgres:mysecretpassword@localhost:5432/postgres"
            }
        }
    }

Note that this file will not exist until you create it.

**Keyword arguments**

You can manually provide credentials as keyword arguments each time you call
methods like :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
that require connections to pgvector:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    pgvector_index = fob.compute_similarity(
        ...
        backend="pgvector",
        brain_key="pgvector_index",
        connection_string="postgresql://postgres:mysecretpassword@localhost:5432/postgres",
    )

Note that, when using this strategy, you must manually provide the credentials
when loading an index later via
:meth:`load_brain_results() <fiftyone.core.collections.SampleCollection.load_brain_results>`:

.. code:: python
    :linenos:

    pgvector_index = dataset.load_brain_results(
        "pgvector_index",
        connection_string="postgresql://postgres:mysecretpassword@localhost:5432/postgres",
    )

.. _pgvector-config-parameters:

pgvector config parameters
-------------------------------

The pgvector backend supports a variety of query parameters that can be
used to customize your similarity queries. These parameters include:

-   **index_name** (*None*): the name of the pgvector vector search index
    to use or create. If not specified, a new unique name is generated automatically
-   **table_name** (*None*): the name of the postgres table to use or create 
    for storing vectors. If not specified, a new unique name is generated automatically
-   **metric** (*"cosine"*): the distance/similarity metric to use when
    creating a new index. The supported values are
    ``("cosine", "dotproduct", "euclidean", "l1", "jaccard", "hamming")``
-   **work_mem** (*"64MB"*): the base maximum amount of memory to be used by a query operation
    (such as a sort or hash table) before writing to temporary disk files
-   **hnsw_m** (*16*): The max number of connections per layer in the HNSW index
-   **hnsw_ef_construction** (*64*): the size of the dynamic candidate list for constructing 
    the graph for the HNSW index

For detailed information on these parameters, see the
`pgvector index options documentation <https://github.com/pgvector/pgvector/?tab=readme-ov-file#index-options>`_.

You can specify these parameters via any of the strategies described in the
previous section. Here's an example of a :ref:`brain config <brain-config>`
that includes all of the available parameters:

.. code-block:: json

    {
        "similarity_backends": {
            "pgvector": {
                "index_name": "your-index",
                "table_name": "your-table",
                "metric": "cosine",
                "work_mem": "64MB",
                "hnsw_m": 16,
                "hnsw_ef_construction": 64
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
        table_name="your-table",
        metric="cosine",
        work_mem="64MB",
        hnsw_m=16,
        hnsw_ef_construction=64,
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
    will not delete any associated pgvector index, which you can do as
    follows:

    .. code:: python

        # Delete the pgvector index
        pgvector_index = dataset.load_brain_results(brain_key)
        pgvector_index.cleanup()

.. _pgvector-examples:

Examples
________

This section demonstrates how to perform some common vector search workflows on
a FiftyOne dataset using the pgvector backend.

.. note::

    All of the examples below assume you have configured your pgvector
    server as described in :ref:`this section <pgvector-setup>`.

.. _pgvector-new-similarity-index:

Create a similarity index
-------------------------

In order to create a new pgvector similarity index, you need to specify
either the `embeddings` or `model` argument to
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
        backend="pgvector",
        brain_key=brain_key,
    )

    # Option 2: Compute embeddings on the fly from model instance
    fob.compute_similarity(
        dataset,
        model=model,
        backend="pgvector",
        brain_key=brain_key,
    )

    # Option 3: Pass precomputed embeddings as a numpy array
    embeddings = dataset.compute_embeddings(model)
    fob.compute_similarity(
        dataset,
        embeddings=embeddings,
        backend="pgvector",
        brain_key=brain_key,
    )

    # Option 4: Pass precomputed embeddings by field name
    dataset.compute_embeddings(model, embeddings_field="embeddings")
    fob.compute_similarity(
        dataset,
        embeddings="embeddings",
        backend="pgvector",
        brain_key=brain_key,
    )

.. _pgvector-patch-similarity-index:

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
        backend="pgvector",
        brain_key="pgvector_patches",
    )

.. _pgvector-connect-to-existing-index:

Connect to an existing index
----------------------------

If you have already created a pgvector index storing the embedding vectors
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
        index_name="your-index",            # the existing pgvector index
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
to add and remove embeddings from an existing pgvector index.

These methods can come in handy if you modify your FiftyOne dataset and need
to update the pgvector index to reflect these changes:

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
to retrieve embeddings from a pgvector index by ID:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    pgvector_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
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

Querying a pgvector index
------------------------------

You can query a pgvector index by appending a
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

    Performing a similarity search on a |DatasetView| will **only** return
    results from the view; if the view contains samples that were not included
    in the index, they will never be included in the result.

    This means that you can index an entire |Dataset| once and then perform
    searches on subsets of the dataset by
    :ref:`constructing views <using-views>` that contain the images of
    interest.

.. _pgvector-advanced-usage:

Advanced usage
--------------

As :ref:`previously mentioned <pgvector-config-parameters>`, you can
customize your pgvector indexes by providing optional parameters to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`.

Here's an example of creating a similarity index backed by a customized
pgvector index. Just for fun, we'll specify a custom index name, use dot
product similarity, and populate the index for only a subset of our dataset:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Create a custom pgvector index
    pgvector_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        embeddings=False,  # we'll add embeddings below
        metric="dotproduct",
        brain_key="pgvector_index",
        backend="pgvector",
        index_name="custom-quickstart-index",
    )

    # Add embeddings for a subset of the dataset
    view = dataset.take(10)
    embeddings, sample_ids, _ = pgvector_index.compute_embeddings(view)
    pgvector_index.add_to_index(embeddings, sample_ids)
