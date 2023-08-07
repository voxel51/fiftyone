.. _pytorch-hub:

PyTorch Hub Integration
=======================

.. default-role:: code

FiftyOne integrates natively with `PyTorch Hub <https://pytorch.org/hub>`_, so
you can load any Hub model and run inference on your FiftyOne datasets with
just a few lines of code!

.. _pytorch-hub-load-model:

Loading a model
_______________

Image models
------------

You can use the builtin
:func:`load_torch_hub_image_model() <fiftyone.utils.torch.load_torch_hub_image_model>`
utility to load models from the PyTorch Hub:

.. code-block:: python
    :linenos:

    import fiftyone.utils.torch as fout

    model = fout.load_torch_hub_image_model(
        "pytorch/vision",
        "resnet18",
        hub_kwargs=dict(weights="ResNet18_Weights.DEFAULT"),
    )

The function returns a
:class:`TorchImageModel <fiftyone.utils.torch.TorchImageModel>` instance that
wraps the raw Torch model in FiftyOne's
:ref:`Model interface <model-zoo-design-overview>`, which means that you can
directly pass the model to builtin methods like
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`,
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`,
:meth:`compute_patch_embeddings() <fiftyone.core.collections.SampleCollection.compute_patch_embeddings>`,
:meth:`compute_visualization() <fiftyone.brain.compute_visualization>`, and
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`.

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    dataset.limit(10).apply_model(model, label_field="resnet18")

    # Logits
    print(dataset.first().resnet18.shape)  # (1000,)

.. note::

    In the above example, the `resnet18` field is populated with raw logits.
    Refer to :ref:`this page <model-zoo-custom-models>` to see how to configure
    output processors to automatically parse model outputs into FiftyOne
    :ref:`label types <using-labels>`.

Utilities
---------

FiftyOne also provides lower-level utilities for direct access to information
about PyTorch Hub models:

.. code-block:: python
    :linenos:

    import fiftyone.utils.torch as fout

    # Load a raw Hub model
    model = fout.load_torch_hub_raw_model(
        "facebookresearch/dinov2",
        "dinov2_vits14",
    )
    print(type(model))
    # <class 'dinov2.models.vision_transformer.DinoVisionTransformer'>

    # Locate the `requirements.txt` for the model on disk
    req_path = fout.find_torch_hub_requirements("facebookresearch/dinov2")
    print(req_path)
    # '~/.cache/torch/hub/facebookresearch_dinov2_main/requirements.txt'

    # Load the package requirements for the model
    requirements = fout.load_torch_hub_requirements("facebookresearch/dinov2")
    print(requirements)
    # ['torch==2.0.0', 'torchvision==0.15.0', ...]

Example: YOLOv5
---------------

Here's how to load `Ultralytics YOLOv5 <https://docs.ultralytics.com/yolov5>`_
and use it to generate object detections:

.. code-block:: python
    :linenos:

    from PIL import Image
    import numpy as np

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.torch as fout

    class YOLOv5OutputProcessor(fout.OutputProcessor):
        """Transforms ``ultralytics/yolov5`` outputs to FiftyOne format."""

        def __call__(self, result, frame_size, confidence_thresh=None):
            batch = []
            for df in result.pandas().xywhn:
                if confidence_thresh is not None:
                    df = df[df["confidence"] >= confidence_thresh]

                batch.append(self._to_detections(df))

            return batch

        def _to_detections(self, df):
            return fo.Detections(
                detections=[
                    fo.Detection(
                        label=row.name,
                        bounding_box=[
                            row.xcenter - 0.5 * row.width,
                            row.ycenter - row.height,
                            row.width,
                            row.height,
                        ],
                        confidence=row.confidence,
                    )
                    for row in df.itertuples()
                ]
            )

    dataset = foz.load_zoo_dataset("quickstart")

    model = fout.load_torch_hub_image_model(
        "ultralytics/yolov5",
        "yolov5s",
        hub_kwargs=dict(pretrained=True),
        output_processor=YOLOv5OutputProcessor(),
        raw_inputs=True,
    )

    # Generate preditions for a single image
    img = np.asarray(Image.open(dataset.first().filepath))
    predictions = model.predict(img)
    print(predictions)  # <Detections: {...}>

    # Generate predictions for all images in a collection
    dataset.limit(10).apply_model(model, label_field="yolov5")
    dataset.count("yolov5.detections")  # 26

Example: DINOv2
---------------

Here's how to load `DINOv2 <https://github.com/facebookresearch/dinov2>`_ and
use it to compute embeddings:

.. code-block:: python
    :linenos:

    from PIL import Image
    import numpy as np

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.torch as fout

    dataset = foz.load_zoo_dataset("quickstart")

    model = fout.load_torch_hub_image_model(
        "facebookresearch/dinov2",
        "dinov2_vits14",
        image_patch_size=14,
        embeddings_layer="head",
    )
    assert model.has_embeddings

    # Embed a single image
    img = np.asarray(Image.open(dataset.first().filepath))
    embedding = model.embed(img)
    print(embedding.shape)  # (384,)

    # Embed all images in a collection
    embeddings = dataset.limit(10).compute_embeddings(model)
    print(embeddings.shape)  # (10, 384)

.. _pytorch-hub-load-model:

Adding Hub models to your local zoo
___________________________________

You can add PyTorch Hub models to your :ref:`local model zoo <model-zoo-add>`
and then load and use them via the :mod:`fiftyone.zoo` package and the CLI
using the same syntax that you would with the
:ref:`publicly available models <model-zoo-models>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = fo.load_dataset("...")
    model = foz.load_zoo_model("your-custom-model")

    dataset.apply_model(model, ...)
    dataset.compute_embeddings(model, ...)

Example: DINOv2
---------------

Here's how to add `DINOv2 <https://github.com/facebookresearch/dinov2>`_ to
your local model zoo and then load it to compute embeddings.

1.  Create a custom manifest file and add DINOv2 to it:

.. code-block:: json

    {
        "models": [
            {
                "base_name": "dinov2-vits14",
                "description": "DINOv2: Learning Robust Visual Features without Supervision. Model: ViT-S/14 distilled",
                "source": "https://github.com/facebookresearch/dinov2",
                "default_deployment_config_dict": {
                    "type": "fiftyone.utils.torch.TorchImageModel",
                    "config": {
                        "entrypoint_fcn": "fiftyone.utils.torch.load_torch_hub_raw_model",
                        "entrypoint_args": {
                            "repo_or_dir": "facebookresearch/dinov2",
                            "model": "dinov2_vits14"
                        },
                        "image_patch_size": 14,
                        "embeddings_layer": "head"
                    }
                }
            }
        ]
    }

2.  Expose your manifest to FiftyOne by setting this environment variable:

.. code-block:: shell

    export FIFTYONE_MODEL_ZOO_MANIFEST_PATHS=/path/to/custom-manifest.json

3. Now you can load and use the model using
   :func:`load_zoo_model() <fiftyone.zoo.models.load_zoo_model>`:

.. code-block:: python
    :linenos:

    import numpy as np
    from PIL import Image

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    model = foz.load_zoo_model("dinov2-vits14")
    assert model.has_embeddings

    # Embed a single image
    img = np.asarray(Image.open(dataset.first().filepath))
    embedding = model.embed(img)
    print(embedding.shape)  # (384,)

    # Embed all images in a collection
    embeddings = dataset.limit(10).compute_embeddings(model)
    print(embeddings.shape)  # (10, 384)
