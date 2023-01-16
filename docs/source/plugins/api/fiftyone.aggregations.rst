fiftyone.aggregations
=====================

.. js:module:: fiftyone.aggregations

Hooks
-----

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.useAggregation:

useAggregation
~~~~~~~~~~~~~~

.. js:function:: useAggregation(options)


   :param options:
   :type options: AggregationParams
   :rtype: ``Array<`` ``any`` ``>``

A hook for aggregating data from the **FiftyOne** backend.

**Aggregation Classes**

.. csv-table::
   :header: "JavaScript", "Python"

   :js:class:`Values`, :py:class:`fiftyone.core.aggregations.Values`
   :js:class:`Bounds`, :py:class:`fiftyone.core.aggregations.Bounds`
   :js:class:`Count`, :py:class:`fiftyone.core.aggregations.Count`
   :js:class:`CountValues`, :py:class:`fiftyone.core.aggregations.CountValues`
   :js:class:`Distinct`, :py:class:`fiftyone.core.aggregations.Distinct`
   :js:class:`HistogramValues`, :py:class:`fiftyone.core.aggregations.HistogramValues`
   :js:class:`Mean`, :py:class:`fiftyone.core.aggregations.Mean`
   :js:class:`Std`, :py:class:`fiftyone.core.aggregations.Std`
   :js:class:`Sum`, :py:class:`fiftyone.core.aggregations.Sum`
   :js:class:`Values`, :py:class:`fiftyone.core.aggregations.Values`

**Example**

.. code-block:: typescript

   const [aggregate, points, loading] = foa.useAggregation({
     dataset,
     filters,
     view,
   });
   
   React.useEffect(() => {
     aggregate(
       [
         new foa.aggregations.Values({
           fieldOrExpr: "id",
         }),
         new foa.aggregations.Values({
           fieldOrExpr: `${path}.point.coordinates`,
         }),
       ],
       dataset.name
     );
   }, [dataset, filters, view, path]);

Types
-----

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Bounds:

Bounds
~~~~~~

.. js:class:: Bounds


.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Bounds.constructor:

.. js:function:: new Bounds(params)


   :param params:
   :type params: BoundsParams
   :rtype: :js:class:`fiftyone.aggregations.Bounds`

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Count:

Count
~~~~~

.. js:class:: Count


.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Count.constructor:

.. js:function:: new Count(params)


   :param params:
   :type params: CountParams
   :rtype: :js:class:`fiftyone.aggregations.Count`

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.CountValues:

CountValues
~~~~~~~~~~~

.. js:class:: CountValues


.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.CountValues.constructor:

.. js:function:: new CountValues(params)


   :param params:
   :type params: CountValuesParams
   :rtype: :js:class:`fiftyone.aggregations.CountValues`

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Distinct:

Distinct
~~~~~~~~

.. js:class:: Distinct


.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Distinct.constructor:

.. js:function:: new Distinct(params)


   :param params:
   :type params: DistinctParams
   :rtype: :js:class:`fiftyone.aggregations.Distinct`

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.HistogramValues:

HistogramValues
~~~~~~~~~~~~~~~

.. js:class:: HistogramValues


.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.HistogramValues.constructor:

.. js:function:: new HistogramValues(params)


   :param params:
   :type params: HistogramValuesParams
   :rtype: :js:class:`fiftyone.aggregations.HistogramValues`

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Mean:

Mean
~~~~

.. js:class:: Mean


.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Mean.constructor:

.. js:function:: new Mean(params)


   :param params:
   :type params: MeanParams
   :rtype: :js:class:`fiftyone.aggregations.Mean`

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Std:

Std
~~~

.. js:class:: Std


.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Std.constructor:

.. js:function:: new Std(params)


   :param params:
   :type params: StdParams
   :rtype: :js:class:`fiftyone.aggregations.Std`

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Sum:

Sum
~~~

.. js:class:: Sum


.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Sum.constructor:

.. js:function:: new Sum(params)


   :param params:
   :type params: SumParams
   :rtype: :js:class:`fiftyone.aggregations.Sum`

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Values:

Values
~~~~~~

.. js:class:: Values


.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.Values.constructor:

.. js:function:: new Values(params)


   :param params:
   :type params: ValuesParams
   :rtype: :js:class:`fiftyone.aggregations.Values`

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.BoundsParams:

.. js:class:: BoundsParams


BoundsParams
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "BoundsParams.expr","``any``"
  "BoundsParams.fieldOrExpr","``any``"
  "BoundsParams.safe","``any``"

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.CountParams:

.. js:class:: CountParams


CountParams
~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "CountParams.expr","``any``"
  "CountParams.fieldOrExpr","``any``"
  "CountParams.safe","``any``"

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.CountValuesParams:

.. js:class:: CountValuesParams


CountValuesParams
~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "CountValuesParams.expr","``any``"
  "CountValuesParams.fieldOrExpr","``any``"
  "CountValuesParams.safe","``any``"

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.DistinctParams:

.. js:class:: DistinctParams


DistinctParams
~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "DistinctParams.expr","``any``"
  "DistinctParams.fieldOrExpr","``any``"
  "DistinctParams.safe","``any``"

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.HistogramValuesParams:

.. js:class:: HistogramValuesParams


HistogramValuesParams
~~~~~~~~~~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "HistogramValuesParams.auto","``any``"
  "HistogramValuesParams.bins","``any``"
  "HistogramValuesParams.expr","``any``"
  "HistogramValuesParams.fieldOrExpr","``any``"
  "HistogramValuesParams.range","``any``"

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.MeanParams:

.. js:class:: MeanParams


MeanParams
~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "MeanParams.expr","``any``"
  "MeanParams.fieldOrExpr","``any``"
  "MeanParams.safe","``any``"

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.StdParams:

.. js:class:: StdParams


StdParams
~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "StdParams.expr","``any``"
  "StdParams.fieldOrExpr","``any``"
  "StdParams.safe","``any``"
  "StdParams.sample","``any``"

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.SumParams:

.. js:class:: SumParams


SumParams
~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "SumParams.expr","``any``"
  "SumParams.fieldOrExpr","``any``"
  "SumParams.safe","``any``"

.. _fos.@fiftyone/fiftyone.@fiftyone/aggregations.aggregations.ValuesParams:

.. js:class:: ValuesParams


ValuesParams
~~~~~~~~~~~~

.. csv-table::
  :header: Name, Type, Description
  :align: left

  "ValuesParams.expr","``any``"
  "ValuesParams.fieldOrExpr","``any``"
  "ValuesParams.missingValue","``any``"
  "ValuesParams.unwind","``any``"
