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

for sample_id in d:
    ...
for sample in d.values():
    ...
for sample_id, sample in d.items():
    ...
```
