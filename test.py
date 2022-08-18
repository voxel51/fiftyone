import fiftyone as fo

from fiftyone import ViewField as F
import fiftyone.core.aggregations as foa

setattr(fo, "Aggregation", foa.Aggregation)


bbox_area = F("bounding_box")[2] * F("bounding_box")[3]
aggregations = [
    fo.Bounds("predictions.detections.confidence"),
    fo.Count(),
    fo.Count("predictions.detections"),
    fo.CountValues("predictions.detections.label"),
    fo.Distinct("predictions.detections.label"),
    fo.HistogramValues(
        "predictions.detections.confidence",
        bins=50,
        range=[0, 1],
    ),
    fo.Mean("predictions.detections[]", expr=bbox_area),
    fo.Std("predictions.detections[]", expr=bbox_area),
    fo.Sum("predictions.detections", expr=F().length()),
    fo.Values("id"),
]

for agg in aggregations:
    also_agg = fo.Aggregation._from_dict(agg._serialize())
    assert isinstance(also_agg, agg.__class__)
    assert also_agg._kwargs() == agg._kwargs()


# dataset = fo.load_dataset("quickstart-geo")

# filters = None
# sample_ids = None
# stages = None
# agg_dicts = [
#     foa.Values("id")._serialize(),
#     foa.Values("location.point.coordinates")._serialize(),
# ]


# for agg_dict in agg_dicts:
#     fo.pprint(agg_dict)

# # view = fosv.get_view("quickstart-geo", stages=stages, filters=filters)

# # if sample_ids:
# #     view = fov.make_optimized_select_view(view, sample_ids)

# # try:
# #     aggregate = view.aggregate(
# #         [foa.Aggregation._from_dict(agg_dict) for agg_dict in agg_dicts]
# #     )
# # except Exception as err:
# #     print(err)

# # print(aggregate)
