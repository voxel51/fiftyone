.. _fiftyone-brain:

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
    `the license <https://github.com/voxel51/fiftyone/blob/develop/package/brain/LICENSE>`_
    for more details.

The FiftyOne Brain methods are useful across the stages of the machine learning
workflow:

* **Uniqueness**: During the training loop for a model, the best results will
  be seen when training on unique data. The FiftyOne Brain provides a
  *uniqueness measure* for images that compare the content of every image in a
  :ref:`dataset <using-datasets>` with all other images. Uniqueness operates on
  raw images and does not require any prior annotation on the data. It is hence
  very useful in the early stages of the machine learning workflow when you are
  likely asking "What data should I select to annotate?"

* **Mistakenness**: Annotations mistakes create an artificial ceiling on the
  performance of your models. However, finding these mistakes by hand is at
  least as arduous as the original annotation was, especially in cases of
  larger datasets. The FiftyOne Brain provides a quantitative
  *mistakenness measure* to identify possible label mistakes. Mistakenness
  operates on labeled images and requires the logit-output of your model
  predictions in order to provide maximum efficacy. It also works on detection
  datasets to find missed objects, incorrect annotations, and localization
  issues.

* **Hardness**: While a model is training, it will learn to understand
  attributes of certain samples faster than others. The FiftyOne Brain provides
  a *hardness measure* that calculates how easy or difficult it is for your
  model to understand any given sample. Mining hard samples is a tried and
  true measure of mature machine learning processes. Use your current model
  instance to compute predictions on unlabeled samples to determine which are
  the most valuable to have annotated and fed back into the system as training
  samples, for example.

Each of these functions has a detailed :ref:`tutorial <tutorials>`
demonstrating a workflow.

.. _brain-image-uniqueness:

Image uniqueness
________________

The FiftyOne Brain allows for the computation of the uniqueness of an image,
in comparison with other images in a dataset; it does so without requiring
any model from you. One good use of uniqueness is in the early stages of the
machine learning workflow when you are deciding what subset of data with which
to bootstrap your models. Unique samples are vital in creating training
batches that help your model learn as efficiently and effectively as possible.

The uniqueness of a |Dataset| can be computed directly without need the
predictions of a pre-trained model via the
:meth:`compute_uniqueness() <fiftyone.brain.compute_uniqueness>` method:

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_uniqueness(dataset)

**Input**: An unlabeled (or labeled) image dataset. There are
:ref:`recipes <recipes>` for building datasets from a wide variety of image
formats, ranging from a simple directory of images to complicated dataset
structures like `COCO <https://cocodataset.org/#home>`_.

**Output**: A scalar-valued ``uniqueness`` field is populated on each sample
that ranks the uniqueness of that sample (higher value means more unique).
The uniqueness values for a dataset are normalized to ``[0, 1]``, with the most
unique sample in the collection having a uniqueness value of ``1``.

You can customize the name of this field by passing the optional
``uniqueness_field`` argument to
:meth:`compute_uniqueness() <fiftyone.brain.compute_uniqueness>`.

**What to expect**: Uniqueness uses a tuned algorithm that measures the
distribution of each |Sample| in the |Dataset|. Using this distribution, it
ranks each sample based on its relative *similarity* to other samples. Those
that are close to other samples are not unique whereas those that are far from
most other samples are more unique.

.. note::

    You can also specify a region of interest within each image to use to
    compute uniqueness by providing the optional ``roi_field`` argument to
    :meth:`compute_uniqueness() <fiftyone.brain.compute_uniqueness>`, which
    contains |Detections| or |Polylines| that define the ROI for each sample.

.. note::

    Check out the :doc:`uniqueness tutorial <../tutorials/uniqueness>` to see
    an example use case of the Brain's uniqueness method.

.. _brain-label-mistakes:

Label mistakes
______________

Label mistakes can be calculated for both classification and detection
datasets.

.. tabs::

    .. tab:: Classification

        Correct annotations are crucial in developing high performing models.
        Using the FiftyOne Brain and the predictions of a pre-trained model,
        you can identify possible labels mistakes in |Classification| fields
        of your dataset via the
        :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`
        method:

        .. code-block:: python
            :linenos:

            import fiftyone.brain as fob

            fob.compute_mistakenness(
                samples, "predictions", label_field="ground_truth"
            )

        **Input**: Label mistakes operate on samples for which there are both
        human annotations (`"ground_truth"` above) and model predictions
        (`"predictions"` above).

        **Output**: A float ``mistakenness`` field is populated on each sample
        that ranks the chance that the human annotation is mistaken. You can
        customize the name of this field by passing the optional
        ``mistakenness_field`` argument to
        :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`.

        **What to expect**: Finding mistakes in human annotations is
        non-trivial (if it could be done perfectly then the approach would
        sufficiently replace your prediction model!) The FiftyOne Brain uses a
        proprietary scoring model that ranks samples for which your prediction
        model is highly confident but wrong (according to the human annotation
        label) as a high chance of being a mistake.

        .. note::

            Check out the
            :doc:`label mistakes tutorial <../tutorials/classification_mistakes>`
            to see an example use case of the Brain's mistakenness method on
            a classification dataset.

    .. tab:: Detection

        Correct annotations are crucial in developing high performing models.
        Using the FiftyOne Brain and the predictions of a pre-trained model,
        you can identify possible labels mistakes in |Detections| fields of
        your dataset via the
        :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`
        method:

        .. code-block:: python
            :linenos:

            import fiftyone.brain as fob

            fob.compute_mistakenness(
                samples, "predictions", label_field="ground_truth"
            )

        **Input**: You can compute label mistakes on samples for which there
        are both human annotations (`"ground_truth"` above) and model
        predictions (`"predictions"` above).

        **Output**: New fields on both the detections in `label_field` and the
        samples will be populated:

        Detection-level fields:

        * `mistakenness` (float): Objects in `label_field` that matched with a
          prediction have their `mistakenness` field populated with a measure
          of the likelihood that the ground truth annotation is a mistake.

        * `mistakenness_loc` (float): Objects in `label_field` that matched
          with a prediction have their `mistakenness_loc` field populated with
          a measure of the mistakenness in the localization (bounding box) of
          the ground truth annotation.

        * `possible_missing` (bool): If there are predicted objects with no
          matches in `label_field` but which are deemed to be likely correct
          annotations, these objects will have their `possible_missing`
          attribute set to True. In addition, if you pass the optional
          ``copy_missing=True`` flag to
          :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`,
          then these objects will be copied into `label_field`.

        * `possible_spurious` (bool): Objects in `label_field` that were not
          matched with a prediction and deemed to be likely spurious
          annotations will have their `possible_spurious` field set to True.

        Sample-level fields:

        * `mistakenness` (float): The maximum mistakenness of an object in the
          `label_field` of the sample.

        * `possible_missing` (int): The number of objects that were added to
          the `label_field` of the sample and marked as likely missing
          annotations.

        * `possible_spurious` (int): The number of objects in the `label_field`
          of the sample that were deemed to be likely spurious annotations.

        You can customize the names of these fields by passing optional
        arguments to
        :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`.

        **What to expect**: Finding mistakes in human annotations is
        non-trivial (if it could be done perfectly then the approach would
        sufficiently replace your prediction model!) The FiftyOne Brain uses a
        proprietary scoring model that ranks detections for which your
        prediction model is highly confident but wrong (according to the human
        annotation label) as a high chance of being a mistake.

        .. note::

            Check out the
            :doc:`detection mistakes tutorials <../tutorials/detection_mistakes>`
            to see an example use case of the Brain's mistakenness method on a
            detection dataset.

.. _brain-sample-hardness:

Sample hardness
_______________

During training, it is useful to identify samples that are more difficult for a
model to learn so that training can be more focused around these hard samples.
These hard samples are also useful as seeds when considering what other new
samples to add to a training dataset.

In order to compute hardness, all you need to do is add your model predictions
and their logits to your FiftyOne |Dataset| and then run the
:meth:`compute_hardness() <fiftyone.brain.compute_hardness>` method:

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_hardness(dataset, "predictions")

**Input**: A |Dataset| or |DatasetView| on which predictions have been
computed and are stored in the ``"predictions"`` argument. Ground truth
annotations are not required for hardness.

**Output**: A scalar-valued ``hardness`` field is populated on each sample that
ranks the hardness of the sample. You can customize the name of this field via
the ``hardness_field`` argument of
:meth:`compute_hardness() <fiftyone.brain.compute_hardness>`.

**What to expect**: Hardness is computed in the context of a prediction model.
The FiftyOne Brain hardness measure defines hard samples as those for which the
prediction model is unsure about what label to assign. This measure
incorporates prediction confidence and logits in a tuned model that has
demonstrated empirical value in many model training exercises.

.. note::

    Tutorial coming soon!

.. _brain-managing-runs:

Managing brain runs
___________________

When you run a brain method on a dataset, the run is recorded on the dataset,
allowing you to retrive information about it later, delete it (along with any
modifications to your dataset that were performed by it), or even retrieve the
view into your dataset that you processed.

Brain method runs can be accessed later by their `brain_key`:

.. tabs::

    .. tab:: Uniqueness

        The brain key of uniqueness runs is the value of the
        ``uniqueness_field`` passed to
        :meth:`compute_uniqueness() <fiftyone.brain.compute_uniqueness>`.

    .. tab:: Mistakenness

        The brain key of mistakenness runs is the value of the
        ``mistakenness_field`` passed to
        :meth:`compute_mistakenness() <fiftyone.brain.compute_mistakenness>`.

    .. tab:: Hardness

        The brain key of hardness runs is the value of the ``hardness_field``
        passed to :meth:`compute_hardness() <fiftyone.brain.compute_hardness>`.

The example below demonstrates the basic interface:

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_uniqueness(dataset)

    print(dataset.list_brain_runs())
    # ['uniqueness']

    # Print information about a brain run
    print(dataset.get_brain_info("uniqueness"))

    # Delete the brain run
    # This will delete any fields that were populated on the dataset
    dataset.delete_brain_run("uniqueness")
