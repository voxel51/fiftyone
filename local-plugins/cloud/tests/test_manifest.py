import os
from dataclasses import dataclass

from engine import build_push_plan


@dataclass
class StubSample:
    filepath: str

    def to_dict(self, include_private=False):
        return {
            "filepath": self.filepath,
            "_id": "x" if include_private else None,
        }


def touch(directory, relative, content=b"12345"):
    path = os.path.join(directory, relative)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(content)
    return path


class TestBuildPushPlan:
    def test_plans_docs_media_and_summary(self, tmp_path):
        first = touch(str(tmp_path), "a/img1.jpg", b"123")
        second = touch(str(tmp_path), "a/img2.jpg", b"12345")

        plan = build_push_plan([StubSample(first), StubSample(second)])

        assert len(plan.sample_docs) == 2
        assert plan.sample_docs[0]["_id"] == "x"
        assert [entry.dest_key for entry in plan.media] == [
            "media/img1.jpg",
            "media/img2.jpg",
        ]
        assert plan.summary.file_count == 2
        assert plan.summary.total_bytes == 8

    def test_the_entries_itemize_the_summary_they_travel_with(self, tmp_path):
        first = touch(str(tmp_path), "img1.jpg", b"1234")
        second = touch(str(tmp_path), "img2.jpg", b"5678")

        plan = build_push_plan([StubSample(first), StubSample(second)])

        entries = plan.manifest_entries
        assert [entry.dest_key for entry in entries] == [
            entry.dest_key for entry in plan.media
        ]
        assert len(entries) == plan.summary.file_count
        assert (
            sum(entry.size_bytes for entry in entries)
            == plan.summary.total_bytes
        )

    def test_basename_collisions_get_a_stable_digest_suffix(self, tmp_path):
        first = touch(str(tmp_path), "a/img.jpg")
        second = touch(str(tmp_path), "b/img.jpg")
        samples = [StubSample(first), StubSample(second)]

        plan_one = build_push_plan(samples)
        plan_two = build_push_plan(samples)

        keys = [entry.dest_key for entry in plan_one.media]
        assert keys[0] == "media/img.jpg"
        assert keys[1] != keys[0]
        assert keys[1].startswith("media/img-")
        assert keys[1].endswith(".jpg")
        assert [entry.dest_key for entry in plan_two.media] == keys

    def test_shared_media_is_planned_once(self, tmp_path):
        path = touch(str(tmp_path), "img.jpg")

        plan = build_push_plan([StubSample(path), StubSample(path)])

        assert len(plan.sample_docs) == 2
        assert len(plan.media) == 1

    def test_missing_media_excludes_the_sample_and_reports_it(self, tmp_path):
        present = touch(str(tmp_path), "img.jpg")
        absent = os.path.join(str(tmp_path), "gone.jpg")

        plan = build_push_plan([StubSample(present), StubSample(absent)])

        assert len(plan.sample_docs) == 1
        assert plan.missing == [absent]
        assert plan.summary.file_count == 1

    def test_filepath_map_roots_keys_under_the_prefix(self, tmp_path):
        path = touch(str(tmp_path), "img.jpg")

        plan = build_push_plan([StubSample(path)])

        assert plan.filepath_map("org-1/dataset-u/") == {
            path: "org-1/dataset-u/media/img.jpg"
        }
