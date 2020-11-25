FiftyOne Brain
==============

.. default-role:: code

The FiftyOne Brain provides powerful machine learning techniques that are
designed to transform how you curate your data from an art into a measurable
science.

.. note::

    The FiftyOne Brain is a separate Python package that is bundled with
    FiftyOne. Although it is closed-source, it is licensed as freeware, and you
    have permission to use it for commercial or non-commercial purposes. See
    `the license <https://github.com/voxel51/fiftyone/blob/develop/LICENSE-BRAIN>`_
    for more details.

The FiftyOne Brain methods are useful across the stages of the machine learning
workflow:

* **Uniqueness**: During the training loop for a model, the best results will
  be seen when training on unique data. The FiftyOne Brain provides a
  `uniqueness` measure for images that compare the content of every image in a
  |WhatIsAFiftyOneDataset| with all other images. Uniqueness operates on raw
  images and does not require any prior annotation on the data. It is hence
  very useful in the early stages of the machine learning workflow when you are
  likely asking "What data should I select to annotate?"

* **Mistakenness**: Annotations mistakes create an artificial ceiling on the
  performance of your models.  However, finding these mistakes by hand is at
  least as arduous as the original annotation was, especially in cases of
  larger datasets.  The FiftyOne Brain provides a quantitative `mistakenness`
  measure to identify possible label mistakes.  Mistakenness operates on
  labeled images and requires the logit-output of your model predictions in
  order to provide maximum efficacy. It also works on detection datasets to
  find missed objects, incorrect annotations, and localization issues.

* **Hardness**: While a model is training, it will learn to understand
  attributes of certain samples faster than others. The FiftyOne Brain provides
  a `hardness` measure that calculates how easy or difficult it is for your
  model to understand any given sample.  Mining hard samples is a tried and
  true measure of mature machine learning processes.  Use your current model
  instance to compute predictions on unlabeled samples to determine which are
  the most valuable to have annotated and fed back into the system as training
  samples, for example.

Each of these functions has a detailed :doc:`tutorial <../tutorials/index>`
demonstrating a workflow.

.. _brain-image-uniqueness:

Image Uniqueness
________________

The FiftyOne Brain allows for the computation of the `uniqueness` of an image,
in comparison with other images in a |Dataset|; it does so without requiring
any model from you.  One good use of uniqueness is in the early stages of the
machine learning workflow when you are deciding what subset of data with which
to bootstrap your models.  Unique samples are vital in creating training
batches that help your model learn as efficiently and effectively as possible.

The `uniqueness` of a |Dataset| can be computed directly without need the
predictions of a pre-trained model:

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_uniqueness(dataset)

**Input**: An unlabeled (or labeled) image dataset.  There are
:doc:`recipes<../recipes/index>` for building datasets from a wide variety of
image formats, ranging from a simple directory of images to complicated dataset
structures like `MS-COCO <https://cocodataset.org/#home>`_.

**Output**: A scalar-valued field per |Sample| that ranks the uniqueness of
that sample (higher value means more unique).  The default name of this field
is `uniqueness`, but you can customize its name by using the `uniqueness_field`
named argument.  The uniqueness value is normalized so it is comparable across
datasets and data-subsets.

**What to expect**: Uniqueness uses a tuned algorithm that measures the
distribution of each |Sample| in the |Dataset|.  Using this distribution, it
ranks each |Sample| based on its relative *similarity* to other samples.  Those
that are close to other samples are not unique whereas those that are far from
most other samples are more unique.

.. note::

    Check out the :doc:`uniqueness tutorial<../tutorials/uniqueness>` to see an
    example use case of the Brain's uniqueness method.

.. _brain-label-mistakes:

Label Mistakes
______________


Label mistakes can be calculated for both classification and detection datasets.

.. tabs::

    .. tab:: Classification 

        Correct annotations are crucial in developing high performing models. Using the
        FiftyOne Brain and the predictions of a pre-trained model, you can identify
        possible labels mistakes in your |Dataset|:
        
        .. code-block:: python
            :linenos:
        
            import fiftyone.brain as fob
        
            fob.compute_mistakenness(
                samples, pred_field="my_model", label_field="ground_truth"
            )
        
        **Input**: Label mistakes operate on samples for which there are both human
        annotations (`label_field` in the example block) and model predictions
        (`pred_field` above).
        
        **Output**: A scalar-valued field per |Sample| that ranks the chance of a
        mistaken annotation.  The default name of this field is `mistakenness`, but you
        can customize its name by using the `mistakenness_field` named argument.
        
        **What to expect**: Finding mistakes in human annotations is non-trivial (if it
        could be done perfectly then the approach would sufficiently replace your
        prediction model).  The FiftyOne Brain uses a proprietary scoring model that
        ranks samples for which your prediction model is highly confident but wrong
        (according to the human annotation label) as a high chance of being a mistake.
        
        .. note::
        
            Check out the :doc:`label mistakes tutorial<../tutorials/label_mistakes>`
            to see an example use case of the Brain's mistakenness method.

    .. tab:: Detection 

        Correct annotations are crucial in developing high performing models. Using the
        FiftyOne Brain and the predictions of a pre-trained model, you can identify
        possible labels mistakes in your |Dataset|:
        
        .. code-block:: python
            :linenos:
        
            import fiftyone.brain as fob
        
            fob.compute_mistakenness(
                samples, pred_field="my_model", label_field="ground_truth"
            )
        
        **Input**: Label mistakes operate on samples for which there are both human
        annotations (`label_field` in the example block) and model predictions
        (`pred_field` above). While it is recommended that you add logits to
        every prediction, if that is not possible then you can specify the
        kwarg `use_logits=False` when calling `compute_mistakenness` and it
        will use the confidence of the predictions instead.
        
        **Output**: New fields in detections and samples will be populated. 

        Ground truth |Detection| level fields:

        * `mistakenness` (float): Calculated for any ground truth objects that
          matched with a prediction. It is a measure of the agreement between
          the gt annotation and the prediction modulated by the confidence of
          the prediction. 

        * `mistakenness_loc` (float): Calculated for any ground truth objects
          that matched with a prediction. A measure of the mistakenness in the
          bounding box localization of the annotation computed using the
          confidence and IoU of the prediction. 

        * `possible_spurious` (bool): Calculated for ground truth objects that
          were not matched with a prediction. Since the model did not predict
          this object, it is flagged as a possible spurious annotation.


        Predictions that had a high confidence will be copied over to the
        ground truth |Detections| of the |Sample| and tagged with the following
        field:

        * `possible_missing` (bool): A highly confident prediction that was not
          matched with a ground truth annotation and was possibly missed by
          annotators.

        |Sample|-level fields:

        * `mistakenness` (float): The maximum `mistakenness` of all ground truth
          detections in the |Sample|. 

        * `possible_missing` (int): The total number of `possible_missing`
          detections in the |Sample|.

        * `possible_spurious` (int): The total number of `possible_spurious`
          detections in the |Sample|.
        
        **What to expect**: Finding mistakes in human annotations is non-trivial (if it
        could be done perfectly then the approach would sufficiently replace your
        prediction model).  The FiftyOne Brain uses a proprietary scoring model that
        ranks detections for which your prediction model is highly confident but wrong
        (according to the human annotation label) as a high chance of being a mistake.
        
        .. note::
        
            Check out the :doc:`detection mistakenness recipe<../recipes/detection_mistakenness>`
            to see an example use case of the Brain's mistakenness method on a
            detection Dataset.


.. _brain-sample-hardness:

Sample Hardness
_______________

During training, it is useful to identify samples that are more difficult for a
model to learn so that training can be more focused around these hard samples.
These hard samples are also useful as seeds when considering what other new
samples of add to a training dataset.

In order to compute hardness, model predictions must be generated on the
samples of a |Dataset|. These predictions can then be loaded into FiftyOne into
the same |Dataset| and the FiftyOne Brain can be used to compute hardness:

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_hardness(dataset, label_field="predictions")

**Input**: The `dataset` argument has samples on which predictions (logits)
have been computed and are stored in the `label_field`.  Annotations and labels
are not required for hardness.

**Output**: A scalar-valued field per |Sample| that ranks the hardness of the
sample.  The default name of this field is `mistakenness`, but you can
customize its name by using the `mistakenness_field` named argument.

**What to expect**: Hardness is computed in the context of a prediction model.
The FiftyOne Brain hardness measure defines hard samples as those for which the
prediction model is unsure about what label to assign.  This measure
incorporates prediction confidence and logits in a tuned model that has
demonstrated empirical value in many model training exercises.

.. note::

    Tutorial coming soon!
