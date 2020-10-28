Using FiftyOne Aggregations
===========================

.. default-role:: code

FiftyOne uses MongoDB as its backing store for label data. This offers 
powerful querying capabilities that are meant to scale with your datasets,
but also means that querying FiftyOne datasets and views should leverage
MongoDB, not be hindered by it.

Aggregations offer declaritive ways to learn about your datasets in the
aggregate, efficiently.

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
    for result in view.aggregations:
       # results are returned in the order the aggregations are supplied
       print(result)
    
    
Looking forward
---------------

FiftyOne Aggregations exist as a best practice approach to understanding your
datasets and views in the aggregate. Learning about your data in FiftyOne
should be easy, but also fast.
