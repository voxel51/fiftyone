.. _fiftyone-brain:

pandas vs FiftyOne
==============

.. default-role:: code

.. list-table:: Data Representation
   :widths: 25 25
   :header-rows: 1

   * - pandas
     - FiftyOne
   * - DataFrame
     - Dataset
   * - Row
     - Sample
   * - Column
     - Field

.. list-table:: Getting Started
   :widths: 30 60 60
   :header-rows: 1
   :stub-columns: 1

   * - 
     - **pandas**
     - **FiftyOne**
   * - Importing the packages
     - ``import pandas as pd``
     - | ``import fiftyone as fo``
       | ``import fiftyone.zoo as fo``
       | ``from fiftyone import ViewField as F``
   * - Load dataset
     - ``df = pd.read_csv("data.csv")``
     - ``dataset = fo.Dataset.from_images("/path/to/images")``
   * - Create empty dataset
     - ``empty_df = pd.DataFrame()``
     - ``empty_dataset = fo.Dataset()``


.. note::

    ``*`` dentoes column or row for pandas DataFrame and field or sample for FiftyOne Dataset.

.. list-table:: Basics
   :widths: 30 60 60
   :header-rows: 1
   :stub-columns: 1

   * - 
     - **pandas**
     - **FiftyOne**
   * - Get first few entries
     - ``df.head()``
     - ``ds.head()`` 
   * - Get last few entries
     - ``df.tail()``
     - ``ds.tail()`` 
   * - First row/sample
     - ``df.iloc[0]`` or ``df.head(1)``
     - ``ds.first()`` or ``ds.head()[0]``
   * - First row/sample
     - ``df.iloc[-1]`` or ``df.tail(1)``
     - ``ds.last()`` or ``ds.tail()[0]``
   * - Get :math:`j^{th}` row/sample
     - ``row = df.loc[j]``
     - ``sample = ds.skip(j).first()``
   * - Number of rows/samples
     - ``len(df)``
     - ``len(ds)``
   * - Column names/field schema
     - ``df.columns``
     - ``ds.get_field_schema()``
   * - Get all values in column/field
     - ``df[*].tolist()``
     - ``ds.values(*)``


.. list-table:: View Stages
   :widths: 30 60 60
   :header-rows: 1
   :stub-columns: 1

   * - 
     - **pandas**
     - **FiftyOne**
   * - Copy DataFrame/Dataset
     - ``df.copy()``
     - ``ds.clone()`` 
   * - Slice between indices *start* and *end*
     - ``df[start:end]``
     - ``ds[start:end]`` 
   * - Get :math:`n` random samples
     - ``df.sample(n=n)``
     - ``ds.take(k, seed = random_seed_value)``
   * - Shuffle data
     - ``df.sample(frac=1)``
     - ``ds.shuffle(seed = random_seed_value)``
   * - Filtering by column/field values
     - ``df[df[*] > threshold_value]``
     - ``ds.match(F(*) > threshold_value)``
   * - Sort Values
     - ``df.sort_values()``
     - ``ds.sort_by()``
   * - Delete DataFrame or Dataset object
     - | ``import gc #garbage collector``
       | ``del df``
       | ``gc.collect()``
     - ``ds.delete()``


.. list-table:: Aggregations
   :widths: 30 60 60
   :header-rows: 1
   :stub-columns: 1

   * - 
     - **pandas**
     - **FiftyOne**
   * - Count
     - ``df[*].count()``
     - ``ds.count(*)`` 
   * - Sum
     - ``df[*].sum()``
     - ``ds.sum(*)`` 
   * - Unique values
     - ``df[*].unique()``
     - ``ds.distinct(*)``
   * - Bounds :math:`=` (Min, Max)
     - | ``_min = df[*].min()``
       | ``_max = df[*].max()``
     - ``_min, _max = ds.bounds(*)``
   * - Mean
     - ``df[*].mean()``
     - ``ds.mean(*)``
   * - Standard deviation
     - ``df[*].std()``
     - ``ds.std(*)``
   * - Quantile
     - ``df[*].quantile(percentiles_list)``
     - | ``import numpy as np``
       | ``np.median(ds.values(*, unwind =True))``


.. list-table:: Structural Change Operations
   :widths: 30 60 60
   :header-rows: 1
   :stub-columns: 1

   * - 
     - **pandas**
     - **FiftyOne**
   * - New column/field as constant value
     - ``df['const_column'] = 'const_value'``
     - | Step 1. ``ds.add_sample_field("const_field", ftype = fo.StringField)`` 
       | Step 2. ``view = ds.set_field("const_field", "const_value")``
       | Step 3. ``view.save()``
   * - New column/field from external data
     - ``df['external_data_column'] = external_data``
     - ``ds.set_values("new_field_name", field_values)`` 
   * - New column/field from existing columns/fields
     - ``df["new_feature_col"] = df.apply(function, axis=1)``
     - | Step 1. ``ds.add_sample_field("field_name", ftype = "my_field_type")``
       | Step 2. ``view = ds.set_field("field_name",  expression)``
       | Step 3. ``view.save()``
   * - Remove a column/field
     - ``df = df.drop(["column_to_remove"], axis = 1)``
     - | ``ds.exclude_fields("field_to_remove")`` or
       | ``ds.delete_sample_field("field_to_delete")`` or
       | ``ds.delete_sample_fields(["field_to_delete1, field_to_delete2"])``
   * - Keep only specified columns/fields
     - ``specified_cols_df = df["specified_col_1","specified_col_2"]``
     - ``specified_fields_ds = ds.select_fields("specified_field").clone()``
   * - Concatenate DataFrames or DatasetViews
     - ``pd.concat([df1, df2])``
     - ``view1.concat(view2)``
   * - Adding a single row/sample
     - ``df = df.append(single_row, ignore_index=True)``
     - ``ds.add_sample(single_sample)``
   * - Remove rows/samples
     - ``df.drop(rows_to_remove)``
     - | ``new_view = ds.exclude(samples_to_remove)`` or
       | Step 1. ``new_ds = ds.clone()``
       | Step 2. ``new_ds.delete_samples(samples_to_remove)``
   * - Keep only specified rows/samples
     - ``df.iloc[rows_to_keep]``
     - ``ds.select(rows_to_keep)``
   * - Rename column/field
     - ``df.rename(columns = {"old_name": "new_name"})``
     - ``ds.rename_sample_field("old_name", "new_name")``


.. note::

    In the following table, ``F`` is the FiftyOne ``ViewField``, which can be imported via 
    ``from fiftyone import ViewField as F``.

.. list-table:: Expressions
   :widths: 30 60 60
   :header-rows: 1
   :stub-columns: 1

   * - 
     - **pandas**
     - **FiftyOne**
   * - Exact equality
     - ``df[df[*] == "data_to_be_matched"]``
     - ``ds.match(F(*) == "data_to_be_matched"``
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
   * - Subset-superset: is in
     - ``df[*].isin(columns_list)``
     - ``ds.filter_labels(*, F("label").isin(fields_list))``
   * - Subset-superset: contains string
     - ``df[*].str.contains(substr)``
     - ``ds.filter_labels(*, F("label").contains_str(substr))``
   * - Check if numeric type
     - | Step 1. ``from pandas.api.types import is_numeric_dtype``
       | Step 2. ``is_numeric_dtype(df[*])``
     - ``ds.match(F(*).is_number()).count() > 0``
   * - Check if string type
     - | Step 1. ``from pandas.api.types import is_string_dtype``
       | Step 2. ``is_string_dtype(df[*])``
     - ``ds.match(F(*).is_string()).count() > 0``
   * - Check for null entries
     - ``df.isna().any()``
     - ``ds.match(F(*).is_null()).count() > 0``















    
