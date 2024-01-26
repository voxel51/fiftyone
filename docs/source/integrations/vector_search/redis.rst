.. _redis-integration:

Redis Vector Search Integration
===============================

.. default-role:: code

`Redis <https://redis.com>`_ is the leading open source in-memory data store,
and we've made it easy to use Redis'
`vector search capabilities <https://redis.com/solutions/use-cases/vector-database>`_
on your computer vision data directly from FiftyOne!

Follow these :ref:`simple instructions <redis-setup>` to configure a Redis
server and get started using Redis + FiftyOne.

FiftyOne provides an API to create Redis vector search indexes, upload vectors,
and run similarity queries, both :ref:`programmatically <redis-query>` in
Python and via point-and-click in the App.

.. note::

    Did you know? You can
    :ref:`search by natural language <brain-similarity-text>` using Redis
    similarity indexes!

.. image:: /images/brain/brain-image-similarity.gif
   :alt: image-similarity
   :align: center

.. _redis-basic-recipe:

Basic recipe
____________

The basic workflow to use Redis to create a similarity index on your FiftyOne
datasets and use this to query your data is as follows:

1)  Start a Redis service locally

2)  Load a :ref:`dataset <loading-datasets>` into FiftyOne

3)  Compute embedding vectors for samples or patches in your dataset, or select
    a model to use to generate embeddings

4)  Use the :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
    method to generate a Redis similarity index for the samples or object
    patches in a dataset by setting the parameter `backend="redis"` and
    specifying a `brain_key` of your choice

5)  Use this Redis similarity index to query your data with
    :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`

6) If desired, delete the index

|br|
The example below demonstrates this workflow.

.. note::

    You must `launch a Redis server <https://redis.io/docs/install/install-stack>`_
    and install the `Redis Python client <https://github.com/redis/redis-py>`_
    to run this example:

    .. code-block:: shell

        brew tap redis-stack/redis-stack
        brew install redis-stack
        redis-stack-server

        pip install redis

    Note that, if you are using a custom Redis server, you can store your
    credentials as described in :ref:`this section <redis-setup>` to avoid
    entering them manually each time you interact with your Redis index.

First let's load a dataset into FiftyOne and compute embeddings for the samples:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    # Step 1: Load your data into FiftyOne
    dataset = foz.load_zoo_dataset("quickstart")

    # Steps 2 and 3: Compute embeddings and create a similarity index
    redis_index = fob.compute_similarity(
        dataset, 
        brain_key="redis_index",
        backend="redis",
    )

Once the similarity index has been generated, we can query our data in FiftyOne
by specifying the `brain_key`:

.. code-block:: python
    :linenos:

    # Step 4: Query your data
    query = dataset.first().id  # query by sample ID
    view = dataset.sort_by_similarity(
        query, 
        brain_key="redis_index",
        k=10,  # limit to 10 most similar samples
    )

    # Step 5 (optional): Cleanup

    # Delete the Redis vector search index
    redis_index.cleanup()

    # Delete run record from FiftyOne
    dataset.delete_brain_run("redis_index")

.. note::

    Skip to :ref:`this section <redis-examples>` for a variety of common
    Redis query patterns.

.. _redis-setup:

Setup
_____

The easiest way to get started with Redis is to
`install Redis Stack <https://redis.io/docs/install/install-stack>`_:

.. code-block:: shell

    brew tap redis-stack/redis-stack
    brew install redis-stack
    redis-stack-server

Installing the Redis client
---------------------------

In order to use the Redis backend, you must also install the
`Redis Python client <https://github.com/redis/redis-py>`_:

.. code-block:: shell

    pip install redis

Using the Redis backend
-----------------------

By default, calling
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` or 
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
will use an sklearn backend.

To use the Redis backend, simply set the optional `backend` parameter of
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to `"redis"`:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_similarity(..., backend="redis", ...)

Alternatively, you can permanently configure FiftyOne to use the Redis backend
by setting the following environment variable:

.. code-block:: shell

    export FIFTYONE_BRAIN_DEFAULT_SIMILARITY_BACKEND=redis

or by setting the `default_similarity_backend` parameter of your
:ref:`brain config <brain-config>` located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "default_similarity_backend": "redis"
    }

Authentication
--------------

If you are using a custom Redis server, you can provide your credentials in a
variety of ways.

**Environment variables (recommended)**

The recommended way to configure your Redis credentials is to store them in
the environment variables shown below, which are automatically accessed by
FiftyOne whenever a connection to Redis is made.

.. code-block:: shell

    export FIFTYONE_BRAIN_SIMILARITY_REDIS_HOST=localhost
    export FIFTYONE_BRAIN_SIMILARITY_REDIS_PORT=6379
    export FIFTYONE_BRAIN_SIMILARITY_REDIS_DB=0
    export FIFTYONE_BRAIN_SIMILARITY_REDIS_USERNAME=username
    export FIFTYONE_BRAIN_SIMILARITY_REDIS_PASSWORD=password

**FiftyOne Brain config**

You can also store your credentials in your :ref:`brain config <brain-config>`
located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "similarity_backends": {
            "redis": {
                "host": "localhost",
                "port": 6379,
                "db": 0,
                "username": "username",
                "password": "password"
            }
        }
    }

Note that this file will not exist until you create it.

**Keyword arguments**

You can manually provide credentials as keyword arguments each time you call
methods like :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
that require connections to Redis:

.. code:: python
    :linenos:

    import fiftyone.brain as fob 
    
    redis_index = fob.compute_similarity(
        ...
        backend="redis",
        brain_key="redis_index",
        host="localhost",
        port=6379,
        db=0,
        username="username",
        password="password",
    )

Note that, when using this strategy, you must manually provide the credentials
when loading an index later via
:meth:`load_brain_results() <fiftyone.core.collections.SampleCollection.load_brain_results>`:

.. code:: python
    :linenos:

    redis_index = dataset.load_brain_results(
        "redis_index",
        host="localhost",
        port=6379,
        db=0,
        username="username",
        password="password",
    )

.. _redis-config-parameters:

Redis config parameters
-----------------------

The Redis backend supports a variety of query parameters that can be used to
customize your similarity queries. These parameters include:

-   **index_name** (*None*): the name of the Redis vector search index to use
    or create. If not specified, a new unique name is generated automatically
-   **metric** (*"cosine"*): the distance/similarity metric to use when
    creating a new index. The supported values are
    ``("cosine", "dotproduct", "euclidean")``
-   **algorithm** (*"FLAT"*): the search algorithm to use. The supported values
    are ``("FLAT", "HNSW")``

For detailed information on these parameters, see the
`Redis documentation <https://redis.io/docs/get-started/vector-database>`_.

You can specify these parameters via any of the strategies described in the
previous section. Here's an example of a :ref:`brain config <brain-config>`
that includes all of the available parameters:

.. code-block:: json

    {
        "similarity_backends": {
            "redis": {
                "index_name": "your-index",
                "metric": "cosine",
                "algorithm": "FLAT"
            }
        }
    }

However, typically these parameters are directly passed to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to configure
a specific new index:

.. code:: python
    :linenos:

    redis_index = fob.compute_similarity(
        ...
        backend="redis",
        brain_key="redis_index",
        index_name="your-index",
        metric="cosine",
        algorithm="FLAT",
    )

.. _redis-managing-brain-runs:

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
    will not delete any associated Redis index, which you can do as
    follows:

    .. code:: python

        # Delete the Redis vector search index
        redis_index = dataset.load_brain_results(brain_key)
        redis_index.cleanup()

.. _redis-examples:

Examples
________

This section demonstrates how to perform some common vector search workflows on 
a FiftyOne dataset using the Redis backend.

.. note::

    All of the examples below assume you have configured your Redis server
    as described in :ref:`this section <redis-setup>`.

.. _redis-new-similarity-index:

Create a similarity index
-------------------------

In order to create a new Redis similarity index, you need to specify either
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
    brain_key = "redis_index"

    # Option 1: Compute embeddings on the fly from model name
    fob.compute_similarity(
        dataset,
        model=model_name,
        backend="redis",
        brain_key=brain_key,
    )

    # Option 2: Compute embeddings on the fly from model instance
    fob.compute_similarity(
        dataset,
        model=model,
        backend="redis",
        brain_key=brain_key,
    )

    # Option 3: Pass precomputed embeddings as a numpy array
    embeddings = dataset.compute_embeddings(model)
    fob.compute_similarity(
        dataset,
        embeddings=embeddings,
        backend="redis",
        brain_key=brain_key,
    )

    # Option 4: Pass precomputed embeddings by field name
    dataset.compute_embeddings(model, embeddings_field="embeddings")
    fob.compute_similarity(
        dataset,
        embeddings="embeddings",
        backend="redis",
        brain_key=brain_key,
    )

.. note::

    You can customize the Redis index by passing any
    :ref:`supported parameters <redis-config-parameters>` as extra kwargs.

.. _redis-patch-similarity-index:

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
        backend="redis",
        brain_key="redis_patches",
    )

.. note::

    You can customize the Redis index by passing any
    :ref:`supported parameters <redis-config-parameters>` as extra kwargs.

.. _redis-connect-to-existing-index:

Connect to an existing index
----------------------------

If you have already created a Redis index storing the embedding vectors
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
        index_name="your-index",            # the existing Redis index
        brain_key="redis_index",
        backend="redis",
    )

.. _redis-add-remove-embeddings:

Add/remove embeddings from an index
-----------------------------------

You can use
:meth:`add_to_index() <fiftyone.brain.similarity.SimilarityIndex.add_to_index>`
and
:meth:`remove_from_index() <fiftyone.brain.similarity.SimilarityIndex.remove_from_index>`
to add and remove embeddings from an existing Redis index.

These methods can come in handy if you modify your FiftyOne dataset and need
to update the Redis index to reflect these changes:

.. code:: python
    :linenos:

    import numpy as np

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    redis_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        brain_key="redis_index",
        backend="redis",
    )
    print(redis_index.total_index_size)  # 200

    view = dataset.take(10)
    ids = view.values("id")

    # Delete 10 samples from a dataset
    dataset.delete_samples(view)

    # Delete the corresponding vectors from the index
    redis_index.remove_from_index(sample_ids=ids)

    # Add 20 samples to a dataset
    samples = [fo.Sample(filepath="tmp%d.jpg" % i) for i in range(20)]
    sample_ids = dataset.add_samples(samples)

    # Add corresponding embeddings to the index
    embeddings = np.random.rand(20, 512)
    redis_index.add_to_index(embeddings, sample_ids)

    print(redis_index.total_index_size)  # 210

.. _redis-get-embeddings:

Retrieve embeddings from an index
---------------------------------

You can use
:meth:`get_embeddings() <fiftyone.brain.similarity.SimilarityIndex.get_embeddings>`
to retrieve embeddings from a Redis index by ID:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    redis_index = fob.compute_similarity(
        dataset, 
        model="clip-vit-base32-torch",
        brain_key="redis_index",
        backend="redis",
    )

    # Retrieve embeddings for the entire dataset
    ids = dataset.values("id")
    embeddings, sample_ids, _ = redis_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (200, 512)
    print(sample_ids.shape)  # (200,)

    # Retrieve embeddings for a view
    ids = dataset.take(10).values("id")
    embeddings, sample_ids, _ = redis_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (10, 512)
    print(sample_ids.shape)  # (10,)

.. _redis-query:

Querying a Redis index
----------------------

You can query a Redis index by appending a
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
        brain_key="redis_index",
        backend="redis",
    )

    # Query by vector
    query = np.random.rand(512)  # matches the dimension of CLIP embeddings
    view = dataset.sort_by_similarity(query, k=10, brain_key="redis_index")

    # Query by sample ID
    query = dataset.first().id
    view = dataset.sort_by_similarity(query, k=10, brain_key="redis_index")

    # Query by a list of IDs
    query = [dataset.first().id, dataset.last().id]
    view = dataset.sort_by_similarity(query, k=10, brain_key="redis_index")

    # Query by text prompt
    query = "a photo of a dog"
    view = dataset.sort_by_similarity(query, k=10, brain_key="redis_index")

.. note::

    Performing a similarity search on a |DatasetView| will **only** return
    results from the view; if the view contains samples that were not included
    in the index, they will never be included in the result.

    This means that you can index an entire |Dataset| once and then perform
    searches on subsets of the dataset by
    :ref:`constructing views <using-views>` that contain the images of
    interest.

.. _redis-access-client:

Accessing the Redis client
--------------------------

You can use the `client` property of a Redis index to directly access the
underlying Redis client instance and use its methods as desired:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    redis_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        brain_key="redis_index",
        backend="redis",
    )

    redis_client = redis_index.client
    index_name = redis_index.config.index_name
    print(redis_client)
    print(redis_client.ft(index_name).info())

.. _redis-advanced-usage:

Advanced usage
--------------

As :ref:`previously mentioned <redis-config-parameters>`, you can customize
your Redis index by providing optional parameters to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`.

In particular, the `algorithm` parameter may impact the quality of your query
results, as well as the time and memory required to perform approximate nearest
neighbor searches.

Here's an example of creating a similarity index backed by a customized Redis
index. Just for fun, we'll specify a custom index name, use dot product
similarity, and populate the index for only a subset of our dataset:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Create a custom Redis index
    redis_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        embeddings=False,  # we'll add embeddings below
        brain_key="redis_index",
        backend="redis",
        index_name="custom-quickstart-index",
        metric="dotproduct",
        algorithm="HNSW",
    )

    # Add embeddings for a subset of the dataset
    view = dataset.take(10)
    embeddings, sample_ids, _ = redis_index.compute_embeddings(view)
    redis_index.add_to_index(embeddings, sample_ids)

    redis_client = redis_index.client
    index_name = redis_index.config.index_name
    print(redis_client.ft(index_name).info())
