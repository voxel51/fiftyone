.. _model-zoo-design-overview:

Model Interface
===============

.. default-role:: code

All models in the Model Zoo are exposed via the |Model| class, which defines a
common interface for loading models and generating predictions with defined
input and output data formats.

.. note::

    If you write a wrapper for your custom model that implements the |Model|
    interface, then you can pass your models to built-in methods like
    :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
    and
    :meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`
    too!

    FiftyOne provides classes that make it easy to deploy models in custom
    frameworks easy. For example, if you have a PyTorch model that processes
    images, you can likely use
    :class:`TorchImageModel <fiftyone.utils.torch.TorchImageModel>` to run it
    using FiftyOne.

.. _model-zoo-design-prediction:

Prediction
----------

Inside built-in methods like
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`,
predictions of a |Model| instance are generated using the following pattern:

.. tabs::

  .. group-tab:: Image models

    .. code-block:: python
        :linenos:

        import numpy as np
        from PIL import Image

        import fiftyone as fo

        def read_rgb_image(path):
            """Utility function that loads an image as an RGB numpy array."""
            return np.asarray(Image.open(path).convert("rgb"))

        # Load a `Model` instance that processes images
        model = ...

        # Load a FiftyOne dataset
        dataset = fo.load_dataset(...)

        # A sample field in which to store the predictions
        label_field = "predictions"

        # Perform prediction on all images in the dataset
        with model:
            for sample in dataset:
                # Load image
                img = read_rgb_image(sample.filepath)

                # Perform prediction
                labels = model.predict(img)

                # Save labels
                sample.add_labels(labels, label_field=label_field)
                sample.save()

  .. group-tab:: Video models

    .. code-block:: python
        :linenos:

        import eta.core.video as etav

        import fiftyone as fo

        # Load a `Model` instance that processes videos
        model = ...

        # Load a FiftyOne dataset
        dataset = fo.load_dataset(...)

        # A sample field in which to store the predictions
        label_field = "predictions"

        # Perform prediction on all videos in the dataset
        with model:
            for sample in dataset:
                # Perform prediction
                with etav.FFmpegVideoReader(sample.filepath) as video_reader:
                    labels = model.predict(video_reader)

                # Save labels
                sample.add_labels(labels, label_field=label_field)
                sample.save()

By convention, |Model| instances must implement the context manager interface,
which handles any necessary setup and teardown required to use the model.

Predictions are generated via the
:meth:`Model.predict() <fiftyone.core.models.Model>` interface method, which
takes an image/video as input and returns the predictions.

In order to be compatible with built-in methods like
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`,
models should support the following basic signature of running inference and
storing the output labels:

.. code-block:: python
    :linenos:

    labels = model.predict(arg)
    sample.add_labels(labels, label_field=label_field)

where the model should, at minimum, support ``arg`` values that are:

-   *Image models:* uint8 numpy arrays (HWC)

-   *Video models:* ``eta.core.video.VideoReader`` instances

and the output ``labels`` can be any of the following:

-   A |Label| instance, in which case the labels are directly saved in the
    specified ``label_field`` of the sample

.. code-block:: python
    :linenos:

    # Single sample-level label
    sample[label_field] = labels

-   A dict mapping keys to |Label| instances. In this case, the labels are
    added as follows:

.. code-block:: python
    :linenos:

    # Multiple sample-level labels
    for key, value in labels.items():
        sample[label_key(key)] = value

-   A dict mapping frame numbers to |Label| instances. In this case, the
    provided labels are interpreted as frame-level labels that should be added
    as follows:

.. code-block:: python
    :linenos:

    # Single set of per-frame labels
    sample.frames.merge(
        {
            frame_number: {label_field: label}
            for frame_number, label in labels.items()
        }
    )

-   A dict mapping frame numbers to dicts mapping keys to |Label| instances. In
    this case, the provided labels are interpreted as frame-level labels that
    should be added as follows:

.. code-block:: python
    :linenos:

    # Multiple per-frame labels
    sample.frames.merge(
        {
            frame_number: {label_key(k): v for k, v in frame_dict.items()}
            for frame_number, frame_dict in labels.items()
        }
    )

In the above snippets, the ``label_key`` function maps label dict keys to field
names, and is defined from ``label_field`` as follows:

.. code-block:: python
    :linenos:

    if isinstance(label_field, dict):
        label_key = lambda k: label_field.get(k, k)
    elif label_field is not None:
        label_key = lambda k: label_field + "_" + k
    else:
        label_key = lambda k: k

For models that support batching, the |Model| interface also provides a
:meth:`predict_all() <fiftyone.core.models.Model.predict_all>` method that can
provide an efficient implementation of predicting on a batch of data.

.. note::

    Built-in methods like
    :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
    provide a ``batch_size`` parameter that can be used to control the batch
    size used when performing inference with models that support efficient
    batching.

.. note::

    PyTorch models can implement the |TorchModelMixin| mixin, in which case
    `DataLoaders <https://pytorch.org/docs/stable/data.html#torch.utils.data.DataLoader>`_
    are used to efficiently feed data to the models during inference.

.. _model-zoo-design-embeddings:

Embeddings
----------

Models that can compute embeddings for their input data can expose this
capability by implementing the |EmbeddingsMixin| mixin.

Inside built-in methods like
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`,
embeddings for a collection of samples are generated using an analogous pattern
to the prediction code shown above, except that the embeddings are generated
using :meth:`Model.embed() <fiftyone.core.models.EmbeddingsMixin.embed>` in
place of :meth:`Model.predict() <fiftyone.core.models.Model.predict>`.

By convention,
:meth:`Model.embed() <fiftyone.core.models.EmbeddingsMixin.embed>` should
return a numpy array containing the embedding.

.. note::

    Embeddings are typically 1D vectors, but this is not strictly required.

For models that support batching, the |EmbeddingsMixin| interface also provides
a :meth:`embed_all() <fiftyone.core.models.Model.predict_all>` method that can
provide an efficient implementation of embedding a batch of data.

.. _model-zoo-design-logits:

Logits
------

Models that generate logits for their predictions can expose them to FiftyOne
by implementing the |LogitsMixin| mixin.

Inside built-in methods like
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`,
if the user requests logits, the model's
:meth:`store_logits <fiftyone.core.models.LogitsMixin.store_logits>`
property is set to indicate that the model should store logits in the |Label|
instances that it produces during inference.

.. _model-zoo-custom-models:

Custom models
-------------

FiftyOne provides a
:class:`TorchImageModel <fiftyone.utils.torch.TorchImageModel>`
class that you can use to load your own custom Torch model and pass it to
built-in methods like
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
and
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`.

For example, the snippet below loads a pretrained model from `torchvision`
and uses it both as a classifier and to generate image embeddings:

.. code-block:: python
    :linenos:

    import os
    import eta

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.torch as fout

    dataset = foz.load_zoo_dataset("quickstart")

    labels_path = os.path.join(
        eta.constants.RESOURCES_DIR, "imagenet-labels-no-background.txt"
    )
    config = fout.TorchImageModelConfig(
        {
            "entrypoint_fcn": "torchvision.models.mobilenet.mobilenet_v2",
            "entrypoint_args": {"weights": "MobileNet_V2_Weights.DEFAULT"},
            "output_processor_cls": "fiftyone.utils.torch.ClassifierOutputProcessor",
            "labels_path": labels_path,
            "image_min_dim": 224,
            "image_max_dim": 2048,
            "image_mean": [0.485, 0.456, 0.406],
            "image_std": [0.229, 0.224, 0.225],
            "embeddings_layer": "<classifier.1",
        }
    )
    model = fout.TorchImageModel(config)

    dataset.apply_model(model, label_field="imagenet")
    embeddings = dataset.compute_embeddings(model)

The necessary configuration is provided via the
:class:`TorchImageModelConfig <fiftyone.utils.torch.TorchImageModelConfig>`
class, which exposes a number of built-in mechanisms for defining the model to
load and any necessary preprocessing and post-processing.

Under the hood, the torch model is loaded via:

.. code-block:: python

    torch_model = entrypoint_fcn(**entrypoint_args)

which is assumed to return a :class:`torch:torch.nn.Module` whose `__call__()`
method directly accepts Torch tensors (NCHW) as input.

The :class:`TorchImageModelConfig <fiftyone.utils.torch.TorchImageModelConfig>`
class provides a number of built-in mechanisms for specifying the required
preprocessing for your model, such as resizing and normalization. In the above
example, `image_min_dim`, `image_max_dim`, `image_mean`, and `image_std` are
used.

The `output_processor_cls` parameter of
:class:`TorchImageModelConfig <fiftyone.utils.torch.TorchImageModelConfig>`
must be set to the fully-qualified class name of an
:class:`OutputProcessor <fiftyone.utils.torch.OutputProcessor>` subclass that
defines how to translate the model's raw output into the suitable FiftyOne
|Label| types, and is instantiated as follows:

.. code-block:: python

    output_processor = output_processor_cls(classes=classes, **output_processor_args)

where your model's classes can be specified via any of the `classes`,
`labels_string`, or `labels_path` parameters of
:class:`TorchImageModelConfig <fiftyone.utils.torch.TorchImageModelConfig>`.

The following built-in output processors are available for use:

- :class:`ClassifierOutputProcessor <fiftyone.utils.torch.ClassifierOutputProcessor>`
- :class:`DetectorOutputProcessor <fiftyone.utils.torch.DetectorOutputProcessor>`
- :class:`InstanceSegmenterOutputProcessor <fiftyone.utils.torch.InstanceSegmenterOutputProcessor>`
- :class:`KeypointDetectorOutputProcessor <fiftyone.utils.torch.KeypointDetectorOutputProcessor>`
- :class:`SemanticSegmenterOutputProcessor <fiftyone.utils.torch.SemanticSegmenterOutputProcessor>`

or you can write your own
:class:`OutputProcessor <fiftyone.utils.torch.OutputProcessor>` subclass.

Finally, if you would like to pass your custom model to methods like
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`,
set the `embeddings_layer` parameter to the name of a layer whose output to
expose as embeddings (or prepend `<` to use the input tensor instead).

.. note::

    Did you know? You can also
    :ref:`register your custom model <model-zoo-add>` under a name of your
    choice so that it can be loaded and used as follows:

    .. code-block:: python

        model = foz.load_zoo_model("your-custom-model")
        dataset.apply_model(model, label_field="predictions")
