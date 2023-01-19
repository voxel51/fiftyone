.. _pandas-cheat-sheet:

pandas vs FiftyOne
==================

.. default-role:: code

This cheat sheet shows how to translate common
`pandas <https://pandas.pydata.org>`_ operations into FiftyOne.

Nomenclature
____________

.. list-table::
   :widths: 50 50
   :header-rows: 1

   * - pandas
     - FiftyOne
   * - DataFrame (``df``)
     - Dataset (``ds``)
   * - Row
     - Sample
   * - Column
     - Field

Getting started
_______________

.. list-table::
   :widths: 30 60 60
   :header-rows: 1
   :stub-columns: 1

   * - 
     - pandas
     - FiftyOne
   * - Importing the packages
     - ``import pandas as pd``
     - ``import fiftyone as fo``
   * - Create empty dataset
     - ``df = pd.DataFrame()``
     - ``ds = fo.Dataset()``
   * - Load dataset
     - ``df = pd.read_csv(*)``
     - ``ds = fo.Dataset.from_dir(*)``

Basics
______

.. list-table::
   :widths: 20 40 40
   :header-rows: 1
   :stub-columns: 1

   * - 
     - pandas
     - FiftyOne
   * - First row/sample
     - ``df.iloc[0]`` or ``df.head(1)``
     - ``ds.first()`` or ``ds.head(1)``
   * - First row/sample
     - ``df.iloc[-1]`` or ``df.tail(1)``
     - ``ds.last()`` or ``ds.tail(1)``
   * - First few rows/samples
     - ``df.head()``
     - ``ds.head()``
   * - Last few rows/samples
     - ``df.tail()``
     - ``ds.tail()``
   * - Get specific row/sample
     - ``df.loc[j]``
     - ``ds[sample_id]``
   * - Number of rows/samples
     - ``len(df)``
     - ``len(ds)``
   * - Column names/field schema
     - ``df.columns``
     - ``ds.get_field_schema()``
   * - Get all values in column/field
     - ``df[*].tolist()``
     - ``ds.values(*)``

View stages
___________

.. list-table::
   :widths: 20 40 40
   :header-rows: 1
   :stub-columns: 1

   * - 
     - pandas
     - FiftyOne
   * - Make a copy
     - ``df.copy()``
     - ``ds.clone()`` 
   * - Slice
     - ``df[start:end]``
     - ``ds[start:end]`` 
   * - Random sample
     - ``df.sample(n=n)``
     - ``ds.take(n)``
   * - Shuffle data
     - ``df.sample(frac=1)``
     - ``ds.shuffle()``
   * - Filter by column/field value
     - ``df[df[*] > threshold]``
     - ``ds.match(F(*) > threshold)``
   * - Sort values
     - ``df.sort_values()``
     - ``ds.sort_by(*)``
   * - Delete all
     - | ``import gc``
       | ``del df; gc.collect()``
     - ``ds.delete()``

Aggregations
____________

.. list-table::
   :widths: 20 40 40
   :header-rows: 1
   :stub-columns: 1

   * - 
     - pandas
     - FiftyOne
   * - Count
     - ``df[*].count()``
     - ``ds.count(*)`` 
   * - Sum
     - ``df[*].sum()``
     - ``ds.sum(*)`` 
   * - Unique values
     - ``df[*].unique()``
     - ``ds.distinct(*)``
   * - Bounds
     - | ``min = df[*].min()``
       | ``max = df[*].max()``
     - ``min, max = ds.bounds(*)``
   * - Mean
     - ``df[*].mean()``
     - ``ds.mean(*)``
   * - Standard deviation
     - ``df[*].std()``
     - ``ds.std(*)``
   * - Quantile
     - ``df[*].quantile(values)``
     - ``ds.quantiles(*, values))``

Structural changes
__________________

.. list-table::
   :widths: 20 40 40
   :header-rows: 1
   :stub-columns: 1

   * - 
     - pandas
     - FiftyOne
   * - New column/field as constant value
     - ``df["col"] = value``
     - | ``ds.add_sample_field("field", fo.StringField)``
       | ``ds.set_field("field", value).save()``
   * - New column/field from external data
     - ``df["col"] = data``
     - ``ds.set_values("field", data)``
   * - New column/field from existing columns/fields
     - ``df["col"] = df.apply(fcn, axis=1)``
     - | ``ds.add_sample_field("field", fo.FloatField)``
       | ``ds.set_field("field", expression).save()``
   * - Remove a column/field
     - ``df = df.drop(["col"], axis=1)``
     - | ``ds.delete_sample_fields(["field"])`` or
       | ``ds.exclude_fields(["field"]).keep_fields()``
   * - Keep only specified columns/fields
     - ``df["col1", "col2"]``
     - ``ds.select_fields(["field1", "field2"])``
   * - Concatenate DataFrames or DatasetViews
     - ``pd.concat([df1, df2])``
     - ``view1.concat(view2)``
   * - Add a single row/sample
     - ``df.append(row, ignore_index=True)``
     - ``ds.add_sample(sample)``
   * - Remove rows/samples
     - ``df.drop(rows)``
     - | ``ds.delete_samples(sample_ids)`` or
       | ``ds.exclude(samples).keep()``
   * - Keep only specified rows/samples
     - ``df.iloc[rows]``
     - ``ds.select(sample_ids)``
   * - Rename column/field
     - ``df.rename(columns={"old": "new"})``
     - ``ds.rename_sample_field("old", "new")``

Expressions
___________

.. list-table::
   :widths: 20 40 40
   :header-rows: 1
   :stub-columns: 1

   * - 
     - pandas
     - FiftyOne
   * - Exact equality
     - ``df[df[*] == value]``
     - ``ds.match(F(*) == value)``
   * - Less than or equal to
     - ``new_df = df[df[*] <= value]``
     - ``new_view = ds.match(F(*) <= value)``
   * - Logical complement
     - ``new_df = df[~(df[*] <= value)]``
     - ``new_view = ds.match(~(F(*) <= value))``
   * - Logical AND
     - ``df[pd_cond1 & pd_cond2]``
     - ``ds.match(fo_cond1 & fo_cond2)``
   * - Logical OR
     - ``df[pd_cond1 | pd_cond2]``
     - ``ds.match(fo_cond1 | fo_cond2)``
   * - Is in
     - ``df[*].isin(cols)``
     - ``ds.filter_labels(*, F("label").is_in(fields))``
   * - Contains string
     - ``df[*].str.contains(substr)``
     - ``ds.filter_labels(*, F("label").contains_str(substr))``
   * - Check for numerics
     - ``pdt.is_numeric_dtype(df[*])``
     - | ``isinstance(ds.get_field_schema()[*], (fo.FloatField, fo.IntField))`` or
       | ``len(ds.match(F(*).is_number())) > 0``
   * - Check for strings
     - ``pdt.is_string_dtype(df[*])``
     - | ``isinstance(ds.get_field_schema()[*], fo.StringField)`` or
       | ``len(ds.match(F(*).is_string())) > 0``
   * - Check for null entries
     - ``df.isna().any()``
     - ``len(ds.match(F(*) == None)) > 0``

.. note::

    The table above assumes you have imported:

    .. code-block:: python

        import pandas.api.types as pdt
        from fiftyone import ViewField as F
