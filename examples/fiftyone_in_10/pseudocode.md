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
