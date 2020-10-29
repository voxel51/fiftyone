Using FiftyOne Aggregations
===========================

.. note::
    This API is still in development. The core motiviations for Aggregations
    are unchanging, but making the API consistent, flexible, and easy-to-use
    is equally important. We love feedback, and
    `feature requests <https://github.com/voxel51/fiftyone/issues/new?labels=enhancement&template=feature_request_template.md&title=%5BFR%5D>`_ on the FiftyOne GitHub!

.. default-role:: code

FiftyOne uses MongoDB as its backing store for label data. This offers 
powerful querying capabilities that are meant to scale with your datasets,
but it also means that for loops and lambdas should be traded in for NoSQL
queries that are fast. Furthermore, the number requests to MongoDB should be
minimized, or at least kept constant.

With this in mind, and to not burden you as user with NoSQL best practices,
aggregations offer a declaritive approach to answering common questions about
your datasets and views, quickly. These aggregations can be combined together
and executed as a single request to the  database.

The following sections provide details of how to use of a FiftyOne
|Aggregation|.

.. _using-aggregations:

Basics
______

Instantiating an |Aggregation| object creates a new aggregation. It is not
tied to any dataset or view, merely a field name.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    my_field_count = fo.Count("my_field")
    dataset = fo.load_dataset("my_dataset_with_my_field")
    my_field_count_result = dataset.aggregate(my_field_count)
    my_field_count_result.count # number of samples where 'my_field' exists


Executing multiple aggregations
-------------------------------

The convenience of aggregations becomes apparent when one would like to learn
more than one thing about a dataset or view.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    aggregations = [
        fo.CountLabels("predictions"),
        fo.ConfidenceBounds("predictions")
    ]
    dataset = fo.load_dataset("my_dataset")
    view = datatset.sort_by("uniqueness", reverse=True).limit(10)
    for result in view.aggregate(aggregations):
       # results are returned in the order the aggregations are supplied
       print(result)


Aggregations for frame labels
-----------------------------

For video datasets, one can compute aggregations for frame labels by adding
a "frames." prefix to the field name.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    aggregations = [
        fo.CountLabels("frames.predictions"),
        fo.ConfidenceBounds("frames.predictions")
    ]
    dataset = fo.load_dataset("my_dataset")
    for result in dataset.aggregate(aggregations):
       print(result)
    
    
Looking forward
---------------

FiftyOne Aggregations exist as a best practice, declaritive approach to
understanding your datasets and views in the aggregate. We look forward to
expanding on the set of aggregations already found in
:mod:`fiftyone.core.aggregations`.
