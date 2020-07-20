FiftyOne Recipes
================

.. default-role:: code
.. include:: ../substitutions.rst

Welcome to FiftyOne recipes!

FiftyOne turbocharges your current workflows, transforming hours of scripting
into minutes so that you can focus on your models. Browse the recipes below to
see how you can leverage FiftyOne to enhance key parts of your machine learning
workflows.

:doc:`Remove duplicate images from a dataset<image_deduplication>`

Turn your data into a FiftyOne |Dataset| and automatically find and remove
duplicate and near-duplicate images from your dataset.

.. code-block:: python
    :linenos:

    # Find duplicates
    dup_view = (
        dataset.view()
        # Extract samples with duplicate file hashes
        .match({"file_hash": {"$in": dup_filehashes}})
        # Sort by file hash so duplicates will be adjacent
        .sort_by("file_hash")
    )

    # Visualize in App
    fo.launch_app(view=dup_view)

:doc:`Add model predictions to a dataset<model_inference>`

Add FiftyOne to your model training and analysis loop to visualize and analyze
your model's predictions.

.. code-block:: python
    :linenos:

    for img, sample_id in your_data:
        # Perform prediction
        label, confidence = your_model.predict(img)

        # Add prediction to FiftyOne dataset
        sample = dataset[sample_id]
        sample["your_model"] = fo.Classification(
            label=label, confidence=confidence,
        )
        sample.save()

:doc:`Convert dataset formats on disk <convert_datasets>`

Use FiftyOne's data powerful dataset import/export features to convert your
datasets on disk between standard (or custom) formats.

.. code-block:: shell
    :linenos:

    # Convert a COCO dataset to CVAT image format

    INPUT_DIR=/path/to/coco/dataset
    OUTPUT_DIR=/path/for/cvat/dataset

    fiftyone convert \
        --input-dir ${INPUT_DIR} --input-type fiftyone.types.COCODetectionDataset \
        --output-dir ${OUTPUT_DIR} --output-type fiftyone.types.CVATImageDataset

:doc:`Import datasets in custom formats <custom_importer>`

Write your own :ref:`custom DatasetImporter <custom-dataset-importer>` and use
it to import datasets in your custom format into FiftyOne.

.. code-block:: python
    :linenos:

    dataset_dir = "/path/to/custom-dataset"

    # Create an instance of your custom importer
    importer = CustomDatasetImporter(dataset_dir)

    dataset = fo.Dataset.from_importer(importer)

:doc:`Export datasets in custom formats <custom_exporter>`

Write your own :ref:`custom DatasetExporter <custom-dataset-exporter>` and use
it to export a FiftyOne |Dataset| to disk in your custom format.

.. code-block:: python
    :linenos:

    export_dir = "/path/for/custom-dataset"

    # Create an instance of your custom exporter
    exporter = CustomDatasetExporter(export_dir)

    dataset.export(dataset_exporter=exporter)

:doc:`Parse samples in custom formats <custom_parser>`

Write your own :ref:`custom SampleParser <custom-sample-parser>` and use it to
add samples in your custom format to a FiftyOne |Dataset|.

.. code-block:: python
    :linenos:

    # An iterable of custom samples
    # For example, this can be a `tf.data.Dataset` or a `torch.utils.DataLoader`
    samples = ...

    # Create an instance of your custom parser
    sample_parser = CustomSampleParser()

    dataset.add_labeled_images(samples, sample_parser)

.. toctree::
   :maxdepth: 1
   :hidden:

   Remove duplicate images<image_deduplication.ipynb>
   Add model predictions<model_inference.ipynb>
   Convert dataset formats<convert_datasets.ipynb>
   Custom dataset importers<custom_importer.ipynb>
   Custom dataset exporters<custom_exporter.ipynb>
   Custom sample parsers<custom_parser.ipynb>
