Drawing Labels on Samples
=========================

.. default-role:: code

FiftyOne provides native support for rendering annotated versions of samples
with |Label| fields overlaid on the source data (e.g., images).

Basic recipe
------------

The interface for drawing labels on samples in conveniently exposed via the
Python library and the CLI. You can easily annotate one or more |Label| fields
on entire datasets or arbitrary subsets of your datasets that you have
identified by constructing a |DatasetView|.

.. tabs::

  .. group-tab:: Python

    You can draw labels on a collection of samples via the
    :meth:`Dataset.draw_labels() <fiftyone.core.dataset.Dataset.draw_labels>` and
    :meth:`DatasetView.draw_labels() <fiftyone.core.view.DatasetView.draw_labels>`
    methods:

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        # The Dataset or DatasetView containing the samples you wish to draw
        dataset_or_view = fo.Dataset(...)

        # The directory to which to write the annotated data
        anno_dir = "/path/for/annotations"

        # The list of `Label` fields containing the labels that you wish to render on
        # the source data (e.g., classifications or detections)
        label_fields = ["ground_truth", "predicted"]  # for example

        # Render the annotations!
        dataset_or_view.draw_labels(anno_dir, label_fields=label_fields)

  .. group-tab:: CLI

    You can render annotations for an entire FiftyOne dataset
    :doc:`via the CLI </cli/index>`:

    .. code-block:: shell

        # The name of the FiftyOne dataset to annotate
        NAME="your-dataset"

        # The directory to which to write the annotated files
        ANNO_DIR=/path/for/annotations

        # A comma-separated list of `Label` fields containing the labels that you wish
        # to render on the source data (e.g., classifications or detections)
        LABEL_FIELDS=ground_truth,predictions  # for example

        # Render the annotations!
        fiftyone datasets draw $NAME --anno-dir $ANNO_DIR --label-fields $LABEL_FIELDS

Drawing labels for individual samples
-------------------------------------

You can also annotate individual samples directly by using the various methods
exposed in the :mod:`fiftyone.utils.annotations` module.

For example, you can draw an annotated version of an image sample with its
label field(s) overlaid as follows:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.annotations as foua


    # Example data
    sample = fo.Sample(
        filepath="~/fiftyone/coco-2017/validation/data/000003.jpg",
        gt_label=fo.Classification(label="bedroom"),
        pred_label=fo.Classification(label="house", confidence=0.95),
        gt_objects=fo.Detections(
            detections=[
                fo.Detection(
                    label="bed",
                    bounding_box=[0.00510938, 0.55248447, 0.62692188, 0.43115942],
                ),
                fo.Detection(
                    label="chair",
                    bounding_box=[0.38253125, 0.47712215, 0.16362500, 0.18155280],
                ),
            ]
        ),
        pred_objects=fo.Detections(
            detections=[
                fo.Detection(
                    label="bed",
                    bounding_box=[0.10, 0.63, 0.50, 0.35],
                    confidence=0.74,
                ),
                fo.Detection(
                    label="chair",
                    bounding_box=[0.39, 0.53, 0.15, 0.13],
                    confidence=0.92,
                ),
            ]
        ),
    )

    # The label fields to render
    label_fields = ["gt_label", "pred_label", "gt_objects", "pred_objects"]

    # The path to write the annotated image
    outpath = "/path/for/image-annotated.jpg"

    # Render the annotated image
    foua.draw_labeled_image(sample, label_fields, outpath)

.. image:: ../images/draw_labels_example1.jpg
   :alt: image-annotated.jpg
   :align: center

Customizing annotation rendering
--------------------------------

You can customize the look-and-feel of the annotations rendered by FiftyOne
by providing a custom |AnnotationConfig| to the relevant drawing method, such
as :meth:`SampleCollection.draw_labels() <fiftyone.core.collections.SampleCollection.draw_labels>`
or the underlying methods in the :mod:`fiftyone.utils.annotations` module.

Consult the |AnnotationConfig| API docs for a complete description of the
available parameters.

For example, the snippet below increases the font size and line thickness of
the annotations in the example above and includes the confidence of the
predictions:

.. code-block:: python
    :linenos:

    # Continuing from example above...

    # Customize annotation rendering
    annotation_config = foua.AnnotationConfig(
        {
            "font_size": 24,
            "bbox_linewidth": 5,
            "show_all_confidences": True,
            "per_object_label_colors": False,
        }
    )

    # Render the annotated image
    foua.draw_labeled_image(
        sample, label_fields, outpath, annotation_config=annotation_config
    )

.. image:: ../images/draw_labels_example2.jpg
   :alt: image-annotated.jpg
   :align: center
