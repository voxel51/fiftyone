# `pandas.DataFrame`

Generally speaking, operations on dataframes return dataframes. A single column
dataframe is a series.

```python
import numpy as np
import pandas as pd

df = pd.DataFrame(
    {
        "A": 1.0,
        "B": pd.Timestamp("20130102"),
        "C": pd.Series(1, index=list(range(4)), dtype="float32"),
        "D": np.array([3] * 4, dtype="int32"),
        "E": pd.Categorical(["test", "train", "test", "train"]),
        "F": "foo",
    }
)
```

## Viewing

```python
df.describe()  # -> pandas.core.frame.DataFrame
#          A    C    D
# count  4.0  4.0  4.0
# mean   1.0  1.0  3.0
# std    0.0  0.0  0.0
# min    1.0  1.0  3.0
# 25%    1.0  1.0  3.0
# 50%    1.0  1.0  3.0
# 75%    1.0  1.0  3.0
# max    1.0  1.0  3.0

df.head()  # -> pandas.core.frame.DataFrame (subset of df)
#      A          B    C  D      E    F
# 0  1.0 2013-01-02  1.0  3   test  foo
# 1  1.0 2013-01-02  1.0  3  train  foo
# 2  1.0 2013-01-02  1.0  3   test  foo
# 3  1.0 2013-01-02  1.0  3  train  foo
df.tail()  # -> pandas.core.frame.DataFrame (subset of df)
# ...

df["A"]  # -> pandas.core.series.Series
df.A  # -> pandas.core.series.Series
# 0    1.0
# 1    1.0
# 2    1.0
# 3    1.0
# Name: A, dtype: float64
```

## Sorting

```python
df.sort_values(by="B")  # -> pandas.core.frame.DataFrame (reorder of df)
```

## Selection

### Slicing by Label

```python
# indexing returns a DataFrame, Series or "dtype" depending on the return shape
# df.loc[index1:index2, [COL1, COL2, ...]]
df.loc["20130102":"20130104", ["A", "B"]]
#                    A         B
# 2013-01-02  1.212112 -0.173215
# 2013-01-03 -0.861849 -2.104569
# 2013-01-04  0.721555 -0.706771

# access a single cell by label
df.loc[dates[0], "A"]
# 0.4691122999071863

# fast access a single cell by label (same behavior as above)
df.at[dates[0], "A"]
# 0.4691122999071863
```

### Slicing by Positing

```python
df.iloc[3:5, 0:2]
#                    A         B
# 2013-01-04  0.721555 -0.706771
# 2013-01-05 -0.424972  0.567020

# access a single cell by position
df.iloc[1, 1]
# -0.17321464905330858

# fast access a single cell by position (same behavior as above)
df.iat[1, 1]
# -0.17321464905330858
```

### "Implicit" Slicing

```python
# slicing rows (accepts position or label. position takes precedence)
df[2:4]  # -> pandas.core.frame.DataFrame (subset of df)
#      A          B    C  D      E    F
# 2  1.0 2013-01-02  1.0  3   test  foo
# 3  1.0 2013-01-02  1.0  3  train  foo

df["A"]  # -> pandas.core.series.Series
# 0    1.0
# 1    1.0
# 2    1.0
# 3    1.0
# Name: A, dtype: float64

df[["A", "B"]]  # -> pandas.core.frame.DataFrame
#      A          B
# 0  1.0 2013-01-02
# 1  1.0 2013-01-02
# 2  1.0 2013-01-02
# 3  1.0 2013-01-02

df[1]
# KeyError: 1

df[1:2]  # -> pandas.core.frame.DataFrame
#      A          B    C  D      E    F
# 1  1.0 2013-01-02  1.0  3  train  foo
```

## Querying (Boolean Indexing)

```python
df["A"] > 0  # -> pandas.core.series.Series
# 0    True
# 1    True
# 2    True
# 3    True
# Name: A, dtype: bool

df[df["A"] > 0]
#                    A         B         C         D
# 2013-01-01  0.469112 -0.282863 -1.509059 -1.135632
# 2013-01-02  1.212112 -0.173215  0.119209 -1.044236
# 2013-01-04  0.721555 -0.706771 -1.039575  0.271860

df["E"].isin(["test", "train"])  # -> pandas.core.series.Series
# 0    True
# 1    True
# 2    True
# 3    True
# Name: E, dtype: bool
```

## Setting

```python
# Set a series
s1 = pd.Series([1, 2, 3, 4, 5, 6], index=pd.date_range("20130102", periods=6))
df["F"] = s1

# Set a cell
df.at[dates[0], "A"] = 0

# A "where" option with setting
df[df > 0] = -df
```

## Operations

```python
df.apply(np.cumsum)  # -> pandas.core.frame.DataFrame
#                    A         B         C   D     F
# 2013-01-01  0.000000  0.000000 -1.509059   5   NaN
# 2013-01-02  1.212112 -0.173215 -1.389850  10   1.0
# 2013-01-03  0.350263 -2.277784 -1.884779  15   3.0
# 2013-01-04  1.071818 -2.984555 -2.924354  20   6.0
# 2013-01-05  0.646846 -2.417535 -2.648122  25  10.0
# 2013-01-06 -0.026844 -2.303886 -4.126549  30  15.0

df2 = pd.DataFrame(
    {
        "A": ["foo", "bar", "foo", "bar", "foo", "bar", "foo", "foo"],
        "B": ["one", "one", "two", "three", "two", "two", "one", "three"],
        "C": np.random.randn(8),
        "D": np.random.randn(8),
    }
)
df2
#      A      B         C         D
# 0  foo    one  1.346061 -1.577585
# 1  bar    one  1.511763  0.396823
# 2  foo    two  1.627081 -0.105381
# 3  bar  three -0.990582 -0.532532
# 4  foo    two -0.441652  1.453749
# 5  bar    two  1.211526  1.208843
# 6  foo    one  0.268520 -0.080952
# 7  foo  three  0.024580 -0.264610
df2.groupby("A")  # -> pandas.core.groupby.generic.DataFrameGroupBy
df2.groupby("A").sum()  # -> pandas.core.frame.DataFrame
#             C         D
# A
# bar  0.995306  2.592467
# foo -1.733846 -1.967416
```
