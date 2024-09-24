.. _model-zoo:

FiftyOne Model Zoo
==================

.. default-role:: code

The FiftyOne Model Zoo provides a powerful interface for downloading models
and applying them to your FiftyOne datasets.

It provides native access to hundreds of pre-trained models, and it also
supports downloading arbitrary public or private models whose definitions are
provided via GitHub repositories or URLs.

.. note::

    Zoo models may require additional packages such as PyTorch or TensorFlow
    (or specific versions of them) in order to be used. See
    :ref:`this section <model-zoo-requirements>` for more information on
    viewing/installing package requirements for models.

    If you try to load a zoo model without the proper packages installed, you
    will receive an error message that will explain what you need to install.

    Depending on your compute environment, some package requirement failures
    may be erroneous. In such cases, you can
    :ref:`suppress error messages <model-zoo-load>`.

Built-in models
---------------

The Model Zoo provides built-in access to hundreds of pre-trained models that
you can apply to your datasets with a few simple commands.

.. custombutton::
    :button_text: Explore the models in the zoo
    :button_link: models.html

.. note::

    Did you know? You can also pass
    :ref:`custom models <model-zoo-custom-models>` to methods like
    :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
    and :meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`!

__SUB_NEW__ Remotely-sourced models
-----------------------------------

The Model Zoo also supports downloading and applying models whose definitions
are provided via GitHub repositories or URLs.

.. custombutton::
    :button_text: Learn how to download remote models
    :button_link: remote.html

Model interface
---------------

All models in the Model Zoo are exposed via the |Model| class, which defines a
common interface for loading models and generating predictions with
defined input and output data formats.

.. custombutton::
    :button_text: Grok the Model interface
    :button_link: design.html

API reference
-------------

The Model Zoo can be accessed via the Python library and the CLI. Consult the
API reference belwo to see how to download, apply, and manage zoo models.

.. custombutton::
    :button_text: Check out the API reference
    :button_link: api.html

.. _model-zoo-basic-recipe:

Basic recipe
------------

Methods for working with the Model Zoo are conveniently exposed via the Python
library and the CLI. The basic recipe is that you load a model from the zoo and
then apply it to a dataset (or a subset of the dataset specified by a
|DatasetView|) using methods such as
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
and
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`.

Prediction
~~~~~~~~~~

The Model Zoo provides a number of convenient methods for generating
predictions with zoo models for your datasets.

For example, the code sample below shows a self-contained example of loading a
Faster R-CNN model from the model zoo and adding its predictions to the
COCO-2017 dataset from the :ref:`Dataset Zoo <dataset-zoo>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    # List available zoo models
    print(foz.list_zoo_models())

    # Download and load a model
    model = foz.load_zoo_model("faster-rcnn-resnet50-fpn-coco-torch")

    # Load some samples from the COCO-2017 validation split
    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name="coco-2017-validation-sample",
        max_samples=50,
        shuffle=True,
    )

    #
    # Choose some samples to process. This can be the entire dataset, or a
    # subset of the dataset. In this case, we'll choose some samples at
    # random
    #
    samples = dataset.take(25)

    #
    # Generate predictions for each sample and store the results in the
    # `faster_rcnn` field of the dataset, discarding all predictions with
    # confidence below 0.5
    #
    samples.apply_model(model, label_field="faster_rcnn", confidence_thresh=0.5)
    print(samples)

    # Visualize predictions in the App
    session = fo.launch_app(view=samples)

Embeddings
~~~~~~~~~~

Many models in the Model Zoo expose embeddings for their predictions:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    # Load zoo model
    model = foz.load_zoo_model("inception-v3-imagenet-torch")

    # Check if model exposes embeddings
    print(model.has_embeddings)  # True

For models that expose embeddings, you can generate embeddings for all
samples in a dataset (or a subset of it specified by a |DatasetView|) by
calling
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    # Load zoo model
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    print(model.has_embeddings)  # True

    # Load zoo dataset
    dataset = foz.load_zoo_dataset("imagenet-sample")

    # Select some samples to process
    samples = dataset.take(10)

    #
    # Option 1: Generate embeddings for each sample and return them in a
    # `num_samples x dim` array
    #
    embeddings = samples.compute_embeddings(model)

    #
    # Option 2: Generate embeddings for each sample and store them in an
    # `embeddings` field of the dataset
    #
    samples.compute_embeddings(model, embeddings_field="embeddings")

You can also use
:meth:`compute_patch_embeddings() <fiftyone.core.collections.SampleCollection.compute_patch_embeddings>`
to generate embeddings for image patches defined by another label field, e.g,.
the detections generated by a detection model.

Logits
~~~~~~

Many classifiers in the Model Zoo can optionally store logits for their
predictions.

.. note::

    Storing logits for predictions enables you to run Brain methods such as
    :ref:`label mistakes <brain-label-mistakes>` and
    :ref:`sample hardness <brain-sample-hardness>` on your datasets!

You can check if a model exposes logits via
:meth:`has_logits() <fiftyone.core.models.Model.has_logits>`:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    # Load zoo model
    model = foz.load_zoo_model("inception-v3-imagenet-torch")

    # Check if model has logits
    print(model.has_logits)  # True

For models that expose logits, you can store logits for all predictions
generated by
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
by passing the optional ``store_logits=True`` argument:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    # Load zoo model
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    print(model.has_logits)  # True

    # Load zoo dataset
    dataset = foz.load_zoo_dataset("imagenet-sample")

    # Select some samples to process
    samples = dataset.take(10)

    # Generate predictions and populate their `logits` fields
    samples.apply_model(model, store_logits=True)

.. toctree::
   :maxdepth: 1
   :hidden:

   Built-in models <models>
   Remote models <remote>
   Model interface <design>
   API reference <api>
