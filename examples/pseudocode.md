# Interface

Existing Interfaces:

1. python primitives (`list`, `dict`)
2. `pandas`
3. MongoDB (`pymongo`)
4. MongoEngine (`mongoengine`)

Objects to consider:

-   `Dataset`
-   `Sample`
-   `DatasetView`
-   `Label`
-   `Insight`

## python `dict`

```python
d = {}

# python dict
for sample_id in d:
    ...
for sample in d.values():
    ...
for sample_id, sample in d.items():
    ...
```

## `pandas.DataFrame`

```python
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
```

## WIP

```python
sample.insights["my_int"] = 7
print(sample.insights.my_int)
# 7

sample.insights["my_scalar"] = 7.0
print(sample.insights.my_scalar)
# 7.0

sample.insights["my_string"] = "hello"
print(sample.insights.my_string)
# 'hello'

sample.insights["my_list"] = [1, 2, 3]
print(sample.insights.my_list)
# <fiftyone.core.insights.ListInsight at 0x...>

sample.insights["my_dict"] = {"a": 1, "b": 2}
print(sample.insights.my_dict)
# <fiftyone.core.insights.DictInsight at 0x...>
```
