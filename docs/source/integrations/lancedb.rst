.. _lancedb-integration:

LanceDB Integration
====================

.. default-role:: code

`LanceDB <https://www.lancedb.com>`_ is a serveless vector database with deep 
integration with python data ecosystem and native javascript support. 
It requires no setup and is free to use.


FiftyOne provides an API to create LanceDB tables, and run
similarity queries, both :ref:`programmatically <LanceDB-query>` in Python and Fiftyone session.

.. _lancedb-basic-recipe:

Basic recipe
____________

The basic workflow to use LanceDB to create a similarity index on your FiftyOne
datasets and use this to query your data is as follows:

1)  Load a :ref:`dataset <loading-datasets>` into FiftyOne

2)  Compute embedding vectors for samples or patches in your dataset, or select
    a model to use to generate embeddings

3)  Use the :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
    method to generate a LanceDB Table for the samples or object
    patches embeddings in a dataset by setting the parameter `backend="lancedb"` and
    specifying a `brain_key` of your choice

4)  Use this LanceDB Table to query your data with
    :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`

5) Optionally, delete the LanceDB Tables. This is required as there is no limit on the number of tables/index
you can create.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    # Step 1: Load your data into FiftyOne
    dataset = foz.load_zoo_dataset("quickstart")

    # Steps 2 and 3: Compute embeddings and create a similarity index
    lancedb_index = fob.compute_similarity(
        dataset, 
        model="clip-vit-base32-torch"
        brain_key="lancedb_index",
        backend="lancedb",
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
    # If the model supports text prompts, you can also query by text
    view = dataset.sort_by_similarity(
        "a dog", 
        brain_key=brain_key,
        k=10,  # limit to 10 most similar samples
    )

Setup
_____

LanceDB requires no setup. 
Once installed using `pip install lancedb`, you can use it with any FiftyOne dataset
by setting the `backend` parameter to `lancedb` in :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
or :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`.


Using the LanceDB backend
--------------------------

By default, calling
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` or 
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
will use an sklearn backend.

To use the LanceDB backend, simply set the optional `backend` parameter of
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to
`"lancedb"`:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_similarity(..., backend="lancedb", ...)

Alternatively, you can permanently configure FiftyOne to use the lancedb
backend by setting the `FIFTYONE_BRAIN_DEFAULT_SIMILARITY_BACKEND` environment
variable:

.. code-block:: shell

    export FIFTYONE_BRAIN_DEFAULT_SIMILARITY_BACKEND=lancedb

or by setting the `default_similarity_backend` parameter of your
:ref:`brain config <brain-config>` located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "default_similarity_backend": "lancedb"
    }

LanceDB config parameters
--------------------------

The LanceDB backend supports query parameters that can be used to customize your
similarity queries. These parameters include:

*   **metric**: the distance/similarity metric to use for the queries. If not
    specified, the default value is `"cosine"`. Supported values are
    `("cosine", "l2")`
*   **table_name**: Name of the LanceDB Table to use or create. If not
    specified, a new unique name is generated automatically
*   **uri**: URI of the LanceDB connection.

typically these parameters are directly passed to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to configure
a specific new index:

.. code:: python
    :linenos:

    lancedb_index = fob.compute_similarity(
        ...
        backend="lancedb",
        brain_key="lacebdb_index",
        table_name="your-table-name",
        metric="cosine",
        uri="~/path/to/db"
    )

Getting LanceDB Tables
----------------------------
LanceDB is compatible with python data ecosystem and can be used with pandas, numpy, and arrow.

.. code:: python
    :linenos:
    lancedb_index = fob.compute_similarity(...)
    table = lancedb_index.table

    # Integration with Python data ecosystem

    df = table.to_pandas() # get the table as a pandas dataframe
    pa = table.to_arrow() # get the table as an arrow table


Examples
________

This section demonstrates how to perform some common vector search workflows on 
a FiftyOne dataset using the lancedb backend.

.. _lancedb-new-similarity-index:

Create a similarity index
-------------------------

In order to create a new LanceDB similarity index, you need to specify either
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
    brain_key = "lancedb_index"

    # Option 1: Compute embeddings on the fly from model name
    fob.compute_similarity(
        dataset,
        model=model_name,
        backend="lancedb",
        brain_key=brain_key,
    )

    # Option 2: Compute embeddings on the fly from model instance
    fob.compute_similarity(
        dataset,
        model=model
        backend="lacnedb",
        brain_key=brain_key,
    )

    # Option 3: Pass precomputed embeddings as a numpy array
    embeddings = dataset.compute_embeddings(model)
    fob.compute_similarity(
        dataset,
        embeddings=embeddings,
        backend="lancedb",
        brain_key=brain_key,
    )

    # Option 4: Pass precomputed embeddings by field name
    dataset.compute_embeddings(model, embeddings_field="embeddings")
    fob.compute_similarity(
        dataset,
        embeddings="embeddings",
        backend="lancedb",
        brain_key=brain_key,
    )

.. note::

    You can customize the LanceDB index by passing any
    :ref:`supported parameters <lancedb-config-parameters>` as extra kwargs.

.. _lancedb-patch-similarity-index:

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
        backend="lancedb",
        brain_key="lacnedb_index",
    )

.. note::

    You can customize the LanceDB index by passing any
    :ref:`supported parameters <lacnedb-config-parameters>` as extra kwargs.

.. _lancedb-connect-to-existing-index:

Connect to an existing index
----------------------------

If you have already created a LanceDB index storing the embedding vectors for
the samples or patches in your dataset, you can connect to it by passing the
`table_name` to
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
        table_name="your-table",            # the existing LanceDB index
        brain_key="lancedb_index",
        backend="lancedb",
    )

.. _lancedb-add-remove-embeddings:

Add/remove embeddings from an index
-----------------------------------

You can use
:meth:`add_to_index() <fiftyone.brain.similarity.SimilarityIndex.add_to_index>`
and
:meth:`remove_from_index() <fiftyone.brain.similarity.SimilarityIndex.remove_from_index>`
to add and remove embeddings from an existing Lancedb index.

These methods can come in handy if you modify your FiftyOne dataset and need
to update the LanceDB index to reflect these changes:

.. code:: python
    :linenos:

    import numpy as np

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    lancedb_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        brain_key="lacnedb_index",
        backend="lancedb",
    )
    print(lancedb_index.total_index_size)  # 200

    view = dataset.take(10)
    ids = view.values("id")

    # Delete 10 samples from a dataset
    dataset.delete_samples(view)

    # Delete the corresponding vectors from the index
    lancedb_index.remove_from_index(sample_ids=ids)

    # Add 20 samples to a dataset
    samples = [fo.Sample(filepath="tmp%d.jpg" % i) for i in range(20)]
    sample_ids = dataset.add_samples(samples)

    # Add corresponding embeddings to the index
    embeddings = np.random.rand(20, 512)
    lancedb_index.add_to_index(embeddings, sample_ids)

    print(lancedb_index.total_index_size)  # 210

.. _lancedb-get-embeddings:

Retrieve embeddings from an index
---------------------------------

You can use
:meth:`get_embeddings() <fiftyone.brain.similarity.SimilarityIndex.get_embeddings>`
to retrieve embeddings from a LanceDB index by ID:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    lancedb_index = fob.compute_similarity(
        dataset, 
        model="clip-vit-base32-torch"
        brain_key="lancedb_index",
        backend="lancedb",
    )

    # Retrieve embeddings for the entire dataset
    ids = dataset.values("id")
    embeddings, sample_ids, _ = lancedb_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (200, 512)
    print(sample_ids.shape)  # (200,)

    # Retrieve embeddings for a view
    ids = dataset.take(10).values("id")
    embeddings, sample_ids, _ = lancedb_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (10, 512)
    print(sample_ids.shape)  # (10,)

.. _lancedb-query:

Querying a LanceDB index
-------------------------

You can query a LanceDB index by appending a
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
        model="clip-vit-base32-torch"
        brain_key="lancedb_index",
        backend="lancedb",
    )

    # Query by vector
    query = np.random.rand(512)  # matches the dimension of CLIP embeddings
    view = dataset.sort_by_similarity(query, k=10, brain_key="lancedb_index")

    # Query by sample ID
    query = dataset.first().id
    view = dataset.sort_by_similarity(query, k=10, brain_key="lancedb_index")

    # Query by a list of IDs
    query = [dataset.first().id, dataset.last().id]
    view = dataset.sort_by_similarity(query, k=10, brain_key="lancedb_index")

    # Query by text prompt
    query = "a photo of a dog"
    view = dataset.sort_by_similarity(query, k=10, brain_key="lancedb_index")

.. note::

    Performing a similarity search on a |DatasetView| will **only** return
    results from the view; if the view contains samples that were not included
    in the index, they will never be included in the result.

    This means that you can index an entire |Dataset| once and then perform
    searches on subsets of the dataset by
    :ref:`constructing views <using-views>` that contain the images of
    interest.
