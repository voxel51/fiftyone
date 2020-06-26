FiftyOne Recipes
================

.. include:: ../substitutions.rst
.. default-role:: code

Welcome to FiftyOne recipes!

FiftyOne turbocharges your current workflows, transforming hours of scripting
into minutes so that you can focus on your models. Browse the recipes below to
see how you can leverage FiftyOne to enhance key parts of your machine learning
workflows.

.. :rubric: :doc:`Dataset Audit <data_audit>`

.. Browse your dataset and audit a subset in order to estimate the accuracy of
.. the labels. Search by label and track which samples were audited easily
.. using **FiftyOne**.

.. :rubric: :doc:`Visualize prediction errors <visualize_errors>`

.. Have a model? Rapidly hone in on which samples it is making errors on and
.. visually inspect for unexpected factors and interesting patterns.

.. rubric:: :doc:`Remove duplicate images from a dataset<image_deduplication>`

Turn your data into a FiftyOne |Dataset| and automatically find and remove
duplicate and near-duplicate images from your dataset.

.. code-block:: python

    # Find duplicates
    dup_view = (
        dataset.view()
        # Extract samples with duplicate file hashes
        .match({"file_hash": {"$in": dup_filehashes}})
        # Sort by file hash so duplicates will be adjacent
        .sort_by("file_hash")
    )

    # Visualize in dashboard
    fo.launch_dashboard(view=dup_view)

.. rubric:: :doc:`Add model predictions to a datasets<model_inference>`

Add FiftyOne to your model training and analysis loop to visualize and analyze
your model's predictions.

.. code-block:: python

    for img, sample_id in your_data:
        # Perform prediction
        label, confidence = your_model.predict(img)

        # Add prediction to FiftyOne dataset
        sample = dataset[sample_id]
        sample["your_model"] = fo.Classification(
            label=label, confidence=confidence,
        )
        sample.save()

.. toctree::
   :maxdepth: 1
   :hidden:

   Remove duplicate images<image_deduplication.ipynb>
   Add model predictions<model_inference.ipynb>
