from starlette.endpoints import HTTPEndpoint

class TagsAggregations(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        sample_ids = data.get("sample_ids", None)
        labels = data.get("labels", None)
        count_labels = data.get("count_labels", False)
        active_label_fields = data.get("active_label_fields", [])
        hidden_labels = data.get("hidden_labels", None)

        view = fosv.get_view(dataset, stages=stages, filters=filters)

        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)

        if count_labels and labels:
            view = view.select_labels(labels)
        elif count_labels and hidden_labels:
            view = view.exclude_labels(hidden_labels)

        if count_labels:
            view = view.select_fields(active_label_fields)
            count_aggs, tag_aggs = build_label_tag_aggregations(view)
            results = await view._async_aggregate(count_aggs + tag_aggs)

            count = sum(results[: len(count_aggs)])
            tags = defaultdict(int)

            for result in results[len(count_aggs) :]:
                for tag, num in result.items():
                    tags[tag] += num
        else:
            tags = await view._async_aggregate(foa.CountValues("tags"))
            count = sum(tags.values())

        return {"count": count, "tags": tags}

