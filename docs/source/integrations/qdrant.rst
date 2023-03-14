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

In order to connect to a Labelbox server, you must provide your API key, which
can be done in a variety of ways.

**Environment variables (recommended)**

The recommended way to configure your Labelbox API key is to store it in the
`FIFTYONE_LABELBOX_API_KEY` environment variable. This is automatically
accessed by FiftyOne whenever a connection to Labelbox is made.

.. code-block:: shell

    export FIFTYONE_LABELBOX_API_KEY=...

**FiftyOne annotation config**

You can also store your credentials in your
:ref:`annotation config <annotation-config>` located at
`~/.fiftyone/annotation_config.json`:

.. code-block:: text

    {
        "backends": {
            "labelbox": {
                "api_key": ...,
            }
        }
    }

Note that this file will not exist until you create it.

**Keyword arguments**

You can manually provide your API key as a keyword argument each time you call
methods like
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>` and
:meth:`load_annotations() <fiftyone.core.collections.SampleCollection.load_annotations>`
that require connections to Labelbox:

.. code:: python
    :linenos:

    view.annotate(
        anno_key,
        backend="labelbox",
        label_field="ground_truth",
        api_key=...,
    )

**Command line prompt**

If you have not stored your API key via another method, you will be prompted to
enter it interactively in your shell each time you call a method that requires
a connection to Labelbox:

.. code:: python
    :linenos:

    view.annotate(
        anno_key,
        backend="labelbox",
        label_field="ground_truth",
        launch_editor=True,
    )

.. code-block:: text

    Please enter your API key.
    You can avoid this in the future by setting your `FIFTYONE_LABELBOX_API_KEY` environment variable.
    API key: ...

.. _labelbox-on-premises:

On-premises servers
-------------------

If you have an
`on-premises Labelbox server <https://docs.labelbox.com/docs/labelbox-on-premises>`_,
you can configure the URL of your server in any of the following ways:

-   Set the `FIFTYONE_LABELBOX_URL` environment variable:

.. code-block:: shell

    export FIFTYONE_LABELBOX_URL=http://localhost:8080

-   Store the `url` of your server in your
    :ref:`annotation config <annotation-config>` at
    `~/.fiftyone/annotation_config.json`:

.. code-block:: text

    {
        "backends": {
            "labelbox": {
                "url": "http://localhost:8080"
            }
        }
    }

-   Pass the `url` parameter manually each time you call
    :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`:

.. code:: python
    :linenos:

    view.annotate(
        anno_key,
        backend="labelbox",
        label_field="ground_truth",
        url="http://localhost:8080",
        api_key=...,
    )


.. _labelbox-label-schema:

Label schema
------------

The `label_schema`, `label_field`, `label_type`, `classes`, `attributes`, and
`mask_targets` parameters to
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>` allow
you to define the annotation schema that you wish to be used.

The label schema may define new label field(s) that you wish to populate, and
it may also include existing label field(s), in which case you can add, delete,
or edit the existing labels on your FiftyOne dataset.

The `label_schema` argument is the most flexible way to define how to construct
tasks in Labelbox. In its most verbose form, it is a dictionary that defines
the label type, annotation type, possible classes, and possible attributes for
each label field:

.. code:: python
    :linenos:

    anno_key = "..."

    label_schema = {
        "new_field": {
            "type": "classifications",
            "classes": ["class1", "class2"],
            "attributes": {
                "attr1": {
                    "type": "select",
                    "values": ["val1", "val2"],
                },
                "attr2": {
                    "type": "radio",
                    "values": [True, False],
                }
            },
        },
        "existing_field": {
            "classes": ["class3", "class4"],
            "attributes": {
                "attr3": {
                    "type": "text",
                }
            }
        },
    }

    dataset.annotate(anno_key, backend="labelbox", label_schema=label_schema)

You can also define class-specific attributes by setting elements of the
`classes` list to dicts that specify groups of `classes` and their
corresponding `attributes`. For example, in the configuration below, `attr1`
only applies to `class1` and `class2` while `attr2` applies to all classes:

.. code:: python
    :linenos:

    anno_key = "..."

    label_schema = {
        "new_field": {
            "type": "detections",
            "classes": [
                {
                    "classes": ["class1", "class2"],
                    "attributes": {
                        "attr1": {
                            "type": "select",
                            "values": ["val1", "val2"],
                        }
                     }
                },
                "class3",
                "class4",
            ],
            "attributes": {
                "attr2": {
                    "type": "radio",
                    "values": [True, False],
                }
            },
        },
    }

    dataset.annotate(anno_key, backend="labelbox", label_schema=label_schema)

Alternatively, if you are only editing or creating a single label field, you
can use the `label_field`, `label_type`, `classes`, `attributes`, and
`mask_targets` parameters to specify the components of the label schema
individually:

.. code:: python
    :linenos:

    anno_key = "..."

    label_field = "new_field",
    label_type = "classifications"
    classes = ["class1", "class2"]

    # These are optional
    attributes = {
        "attr1": {
            "type": "select",
            "values": ["val1", "val2"],
        },
        "attr2": {
            "type": "radio",
            "values": [True, False],
        }
    }

    dataset.annotate(
        anno_key,
        backend="labelbox",
        label_field=label_field,
        label_type=label_type,
        classes=classes,
        attributes=attributes,
    )

When you are annotating existing label fields, you can omit some of these
parameters from
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`, as
FiftyOne can infer the appropriate values to use:

-   **label_type**: if omitted, the |Label| type of the field will be used to
    infer the appropriate value for this parameter
-   **classes**: if omitted for a non-semantic segmentation field, the observed
    labels on your dataset will be used to construct a classes list

.. note::

    See :ref:`this section <labelbox-editing-labels-paid>` for details about
    editing existing labels.

.. _labelbox-label-attributes:

Label attributes
----------------

The `attributes` parameter allows you to configure whether
:ref:`custom attributes <using-labels>` beyond the default `label` attribute
are included in the annotation tasks.

When adding new label fields for which you want to include attributes, you must
use the dictionary syntax demonstrated below to define the schema of each
attribute that you wish to label:

.. code:: python
    :linenos:

    anno_key = "..."

    attributes = {
        "occluded": {
            "type": "radio",
            "values": [True, False],
        },
        "weather": {
            "type": "select",
            "values": ["cloudy", "sunny", "overcast"],
        },
        "caption": {
            "type": "text",
        }
    }

    view.annotate(
        anno_key,
        backend="labelbox",
        label_field="new_field",
        label_type="detections",
        classes=["dog", "cat", "person"],
        attributes=attributes,
    )

You can always omit this parameter if you do not require attributes beyond the
default `label`.

For Labelbox, the following `type` values are supported:

-   `text`: a free-form text box. In this case, `values` is unused
-   `select`: a selection dropdown. In this case, `values` is required
-   `radio`: a radio button list UI. In this case, `values` is required
-   `checkbox`: a list of checkboxes. In this case, `values` is required

When you are annotating existing label fields, the `attributes` parameter can
take additional values:

-   `True` (default): export all custom attributes observed on the existing
    labels, using their observed values to determine the appropriate UI type
    and possible values, if applicable
-   `False`: do not include any custom attributes in the export
-   a list of custom attributes to include in the export
-   a full dictionary syntax described above

Note that only scalar-valued label attributes are supported. Other attribute
types like lists, dictionaries, and arrays will be omitted.

.. note::

    Labelbox does not support default values for attributes, so the `default`
    key :ref:`described here <annotation-label-attributes>` will be ignored if
    included in label schemas provided when annotating with Labelbox.

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
:meth:`get_brain_info() <fiftyone.core.collections.SampleCollection.get_annotation_info>`
to retrieve information about the configuration of an annotation run:

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

    All of the examples below assume you have configured your Labelbox server
    as described in :ref:`this section <qdrant-setup>`.

.. _qdrant-new-similarity-index:

Create new similarity index
-----------------------------

In order to create a new `QdrantSimilarityIndex`, you need to specify either the
`embeddings` or `model` argument to 
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
        model =  "resnet-50-imagenet-torch"
        brain_key = "qdrant_patches", 
        backend="qdrant",
    )

    print(dataset.get_brain_info(brain_key))

.. _qdrant-connect-to-client:

Connect to Qdrant client
------------------------

You can connect to the Qdrant client instance using the `client` attribute. You
can then access all of the Qdrant client's methods:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    res = fob.compute_similarity(
        dataset, 
        model =  "resnet-50-imagenet-torch"
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
`get_embeddings()` method. This can be applied to an entire dataset, or a view
into a dataset:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    qdrant_index = fob.compute_similarity(
        dataset, 
        model =  "resnet-50-imagenet-torch"
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
`sort_by_similarity()` method. This can be applied to an entire dataset, or a
view into a dataset. The query can be any of the following:

1. A single numerical vector of the same length as the embeddings
2. An ID (sample or patch)
3. A list of IDs (sample or patches)

Additionally, if the model used to compute the embeddings supports text prompts,
then the query can also be a text prompt. Here are examples of all of these, 
using the CLIP model, which supports text prompts:

.. code:: python
    :linenos:

    import numpy as np

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset, 
        model =  "clip-vit-base32-torch"
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
the collection. This can be done using the `add_to_index()` and 
`remove_from_index()` methods. These methods can come in handy if you want to 
add or remove samples or object patches from your dataset, and then update the
Qdrant index to reflect these changes.

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    qdrant_index = fob.compute_similarity(
        dataset, 
        model =  "clip-vit-base32-torch"
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
`total_index_size` attribute. Continuing the above code:

.. code:: python
    :linenos:

    print(qdrant_index.total_index_size)
    ## will return 210, since we removed 10 samples and then added 20 samples 


.. _qdrant-advanced-usage:

Advanced usage
--------------------------

You can also specify configuration parameters for the Qdrant client. These 
include `hnsw_config`, `wal_config`, and `optimizers_config` parameters. These
can be specified as arguments to the `compute_similarity()` method, as 
environment variables, or as settings in your FiftyOne Brain config file.

TO DO
