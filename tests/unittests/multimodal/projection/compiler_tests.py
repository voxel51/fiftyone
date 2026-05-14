"""
Unit tests for the MCAP projection manifest compiler pipeline.

Covers: parser, expander, resolver, dag, emitter, model, expression, and the
top-level compile() entrypoint.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest

from fiftyone.multimodal.projection.compiler.dag import (
    CyclicDependencyError,
    build_dag,
)
from fiftyone.multimodal.projection.compiler.emitter import dispatch, emit_plan
from fiftyone.multimodal.projection.compiler.expander import (
    TemplateExpansionError,
    expand_manifest,
)
from fiftyone.multimodal.projection.compiler.expression import (
    CapturedExpression,
    StubExpressionEngine,
)
from fiftyone.multimodal.projection.compiler.model import (
    CompiledPlan,
    Grain,
    JobStatus,
    ProjectionJob,
)
from fiftyone.multimodal.projection.compiler.parser import (
    ManifestParseError,
    parse_manifest,
)
from fiftyone.multimodal.projection.compiler.resolver import (
    ManifestResolveError,
    resolve_manifest,
)
from fiftyone.multimodal.projection.compiler import compile as compiler_compile


# ---------------------------------------------------------------------------
# Shared YAML fixtures
# ---------------------------------------------------------------------------

_MINIMAL_YAML = """\
channel_bindings:
  - id: imu
    match: { topic: /imu, schema_name: IMU, encoding: json }
    codec: nuscenes_imu_json
    timestamp_source:
      candidates:
        - mcap: log_time

projections:
  - id: obs
    sources:
      - name: sensor
        channel_bindings: [imu]
    observation:
      rows:
        for_each: sensor
        time:
          shape: point
          timestamp: { path: sensor.timestamp }
      columns:
        - { id: ts, value: { path: sensor.timestamp }, type: int64 }
"""

_REPEAT_YAML = """\
channel_binding_repeats:
  - var: cam
    values:
      - { stream_id: front, topic: CAM_FRONT }
      - { stream_id: back, topic: CAM_BACK }
    templates:
      - id: "{{cam.stream_id}}_image"
        match: { topic: "/{{cam.topic}}/image" }
        codec: image_codec

logical_stream_repeats:
  - var: cam
    values:
      - { stream_id: front, topic: CAM_FRONT }
      - { stream_id: back, topic: CAM_BACK }
    templates:
      - id: "{{cam.stream_id}}"
        kind: bundle
        components:
          - name: image
            source: { channel_binding: "{{cam.stream_id}}_image" }

projections:
  - id: obs
    sources:
      - name: camera
        logical_streams: [front]
    observation:
      rows:
        for_each: camera
        time: { shape: point, timestamp: { path: camera.timestamp } }
      columns: []
"""

_DAG_YAML = """\
channel_bindings:
  - id: raw
    match: { topic: /raw }

projections:
  - id: base
    sources:
      - name: src
        channel_bindings: [raw]
    observation:
      rows: { for_each: src, time: { shape: point, timestamp: { path: src.ts } } }
      columns: []

  - id: derived
    sources:
      - name: up
        projections: [base]
    scene_summary:
      aggregate:
        time: { shape: interval }
      columns: []
"""


# ---------------------------------------------------------------------------
# Parser tests
# ---------------------------------------------------------------------------


class TestParser:
    def test_minimal_valid_manifest(self):
        result = parse_manifest(_MINIMAL_YAML)
        assert len(result["channel_bindings"]) == 1
        assert result["channel_bindings"][0]["id"] == "imu"
        assert len(result["projections"]) == 1

    def test_empty_sections_default_to_empty_lists(self):
        result = parse_manifest("channel_bindings:\nprojections:\n")
        assert result["channel_bindings"] == []
        assert result["logical_streams"] == []

    def test_missing_sections_default_to_empty_lists(self):
        result = parse_manifest("projections: []")
        assert result["channel_bindings"] == []
        assert result["channel_binding_repeats"] == []
        assert result["logical_stream_repeats"] == []

    def test_invalid_yaml_raises(self):
        with pytest.raises(ManifestParseError, match="Invalid YAML"):
            parse_manifest("key: [unclosed")

    def test_non_dict_root_raises(self):
        with pytest.raises(ManifestParseError, match="mapping"):
            parse_manifest("- item1\n- item2")

    def test_unknown_top_level_key_raises(self):
        with pytest.raises(ManifestParseError, match="Unknown top-level keys"):
            parse_manifest("channel_bindings: []\nunknown_key: []")

    def test_channel_binding_missing_id_raises(self):
        yaml = "channel_bindings:\n  - match: { topic: /foo }\n"
        with pytest.raises(
            ManifestParseError, match="missing required string field 'id'"
        ):
            parse_manifest(yaml)

    def test_channel_binding_invalid_match_raises(self):
        yaml = "channel_bindings:\n  - id: foo\n    match: not_a_dict\n"
        with pytest.raises(
            ManifestParseError, match="match must be a mapping"
        ):
            parse_manifest(yaml)

    def test_projection_missing_grain_raises(self):
        yaml = "projections:\n  - id: p1\n    sources: []\n"
        with pytest.raises(
            ManifestParseError, match="must declare exactly one grain key"
        ):
            parse_manifest(yaml)

    def test_projection_multiple_grains_raises(self):
        yaml = (
            "projections:\n"
            "  - id: p1\n"
            "    observation: {}\n"
            "    annotation: {}\n"
        )
        with pytest.raises(
            ManifestParseError, match="declares multiple grain keys"
        ):
            parse_manifest(yaml)

    def test_logical_stream_invalid_kind_raises(self):
        yaml = "logical_streams:\n  - id: s1\n    kind: unknown\n"
        with pytest.raises(
            ManifestParseError, match="kind must be 'bundle' or 'virtual'"
        ):
            parse_manifest(yaml)

    def test_repeat_block_missing_var_raises(self):
        yaml = (
            "channel_binding_repeats:\n"
            "  - values: []\n"
            "    templates: []\n"
        )
        with pytest.raises(ManifestParseError, match="missing string 'var'"):
            parse_manifest(yaml)

    def test_repeat_block_missing_values_raises(self):
        yaml = (
            "channel_binding_repeats:\n" "  - var: cam\n" "    templates: []\n"
        )
        with pytest.raises(ManifestParseError, match="missing list 'values'"):
            parse_manifest(yaml)


# ---------------------------------------------------------------------------
# Expander tests
# ---------------------------------------------------------------------------


class TestExpander:
    def test_expands_channel_binding_repeats(self):
        raw = parse_manifest(_REPEAT_YAML)
        expanded = expand_manifest(raw)
        ids = [b["id"] for b in expanded["channel_bindings"]]
        assert "front_image" in ids
        assert "back_image" in ids

    def test_expands_logical_stream_repeats(self):
        raw = parse_manifest(_REPEAT_YAML)
        expanded = expand_manifest(raw)
        ids = [s["id"] for s in expanded["logical_streams"]]
        assert "front" in ids
        assert "back" in ids

    def test_removes_repeat_keys(self):
        raw = parse_manifest(_REPEAT_YAML)
        expanded = expand_manifest(raw)
        assert "channel_binding_repeats" not in expanded
        assert "logical_stream_repeats" not in expanded

    def test_interpolates_nested_string_fields(self):
        raw = parse_manifest(_REPEAT_YAML)
        expanded = expand_manifest(raw)
        front = next(
            b for b in expanded["channel_bindings"] if b["id"] == "front_image"
        )
        assert front["match"]["topic"] == "/CAM_FRONT/image"

    def test_duplicate_ids_after_expansion_raises(self):
        yaml = (
            "channel_binding_repeats:\n"
            "  - var: cam\n"
            "    values:\n"
            "      - { stream_id: same }\n"
            "      - { stream_id: same }\n"
            "    templates:\n"
            "      - id: '{{cam.stream_id}}'\n"
            "        match: { topic: /x }\n"
        )
        raw = parse_manifest(yaml)
        with pytest.raises(TemplateExpansionError, match="Duplicate id"):
            expand_manifest(raw)

    def test_unknown_template_variable_raises(self):
        yaml = (
            "channel_binding_repeats:\n"
            "  - var: cam\n"
            "    values:\n"
            "      - { stream_id: front }\n"
            "    templates:\n"
            "      - id: '{{other.field}}'\n"
            "        match: { topic: /x }\n"
        )
        raw = parse_manifest(yaml)
        with pytest.raises(TemplateExpansionError, match="unknown variable"):
            expand_manifest(raw)

    def test_unknown_template_field_raises(self):
        yaml = (
            "channel_binding_repeats:\n"
            "  - var: cam\n"
            "    values:\n"
            "      - { stream_id: front }\n"
            "    templates:\n"
            "      - id: '{{cam.no_such_field}}'\n"
            "        match: { topic: /x }\n"
        )
        raw = parse_manifest(yaml)
        with pytest.raises(TemplateExpansionError, match="no field"):
            expand_manifest(raw)

    def test_static_bindings_preserved(self):
        raw = parse_manifest(_MINIMAL_YAML)
        expanded = expand_manifest(raw)
        assert expanded["channel_bindings"][0]["id"] == "imu"


# ---------------------------------------------------------------------------
# Resolver tests
# ---------------------------------------------------------------------------


class TestResolver:
    def _expanded(self, yaml_src):
        return expand_manifest(parse_manifest(yaml_src))

    def test_valid_manifest_passes(self):
        expanded = self._expanded(_MINIMAL_YAML)
        resolved = resolve_manifest(expanded)
        assert resolved is expanded

    def test_unknown_channel_binding_in_projection_raises(self):
        yaml = (
            "channel_bindings:\n"
            "  - id: real\n"
            "    match: { topic: /x }\n"
            "projections:\n"
            "  - id: p1\n"
            "    sources:\n"
            "      - name: src\n"
            "        channel_bindings: [no_such_binding]\n"
            "    observation:\n"
            "      rows: { for_each: src, time: { shape: point, timestamp: { path: src.ts } } }\n"
            "      columns: []\n"
        )
        with pytest.raises(
            ManifestResolveError, match="unknown id 'no_such_binding'"
        ):
            resolve_manifest(self._expanded(yaml))

    def test_unknown_projection_source_raises(self):
        yaml = (
            "channel_bindings:\n"
            "  - id: raw\n"
            "    match: { topic: /x }\n"
            "projections:\n"
            "  - id: p1\n"
            "    sources:\n"
            "      - name: up\n"
            "        projections: [no_such_proj]\n"
            "    scene_summary:\n"
            "      aggregate: { time: { shape: interval } }\n"
            "      columns: []\n"
        )
        with pytest.raises(
            ManifestResolveError, match="unknown id 'no_such_proj'"
        ):
            resolve_manifest(self._expanded(yaml))

    def test_self_referencing_projection_raises(self):
        yaml = (
            "channel_bindings:\n"
            "  - id: raw\n"
            "    match: { topic: /x }\n"
            "projections:\n"
            "  - id: loop\n"
            "    sources:\n"
            "      - name: up\n"
            "        projections: [loop]\n"
            "    scene_summary:\n"
            "      aggregate: { time: { shape: interval } }\n"
            "      columns: []\n"
        )
        with pytest.raises(ManifestResolveError, match="references itself"):
            resolve_manifest(self._expanded(yaml))

    def test_unknown_logical_stream_in_bundle_component_raises(self):
        yaml = (
            "channel_bindings:\n"
            "  - id: raw\n"
            "    match: { topic: /x }\n"
            "logical_streams:\n"
            "  - id: bundle\n"
            "    kind: bundle\n"
            "    components:\n"
            "      - name: part\n"
            "        source: { channel_binding: no_such }\n"
            "projections:\n"
            "  - id: p1\n"
            "    sources: []\n"
            "    observation: { rows: { for_each: x, time: { shape: point, timestamp: { path: x.ts } } }, columns: [] }\n"
        )
        with pytest.raises(ManifestResolveError, match="unknown id 'no_such'"):
            resolve_manifest(self._expanded(yaml))


# ---------------------------------------------------------------------------
# DAG tests
# ---------------------------------------------------------------------------


class TestDag:
    def _projs(self, *specs):
        """Build minimal projection dicts from (id, upstream_ids) pairs."""
        return [
            {"id": pid, "sources": [{"name": "s", "projections": ups}]}
            for pid, ups in specs
        ]

    def test_single_projection_level_zero(self):
        order, levels, dep_map = build_dag(self._projs(("p1", [])))
        assert order == ["p1"]
        assert levels == {"0": ["p1"]}
        assert dep_map == {"p1": []}

    def test_linear_chain_order(self):
        projs = self._projs(("a", []), ("b", ["a"]), ("c", ["b"]))
        order, levels, _ = build_dag(projs)
        assert order.index("a") < order.index("b") < order.index("c")
        assert levels["0"] == ["a"]
        assert levels["1"] == ["b"]
        assert levels["2"] == ["c"]

    def test_parallel_projections_same_level(self):
        projs = self._projs(("x", []), ("y", []))
        order, levels, _ = build_dag(projs)
        assert set(order) == {"x", "y"}
        assert set(levels["0"]) == {"x", "y"}

    def test_diamond_dependency(self):
        projs = self._projs(
            ("a", []), ("b", ["a"]), ("c", ["a"]), ("d", ["b", "c"])
        )
        order, levels, _ = build_dag(projs)
        assert order.index("a") < order.index("b")
        assert order.index("a") < order.index("c")
        assert order.index("b") < order.index("d")
        assert order.index("c") < order.index("d")
        assert levels["2"] == ["d"]

    def test_cycle_detection_raises(self):
        projs = self._projs(("a", ["b"]), ("b", ["a"]))
        with pytest.raises(CyclicDependencyError, match="Circular dependency"):
            build_dag(projs)

    def test_unknown_upstream_raises(self):
        projs = self._projs(("a", ["no_such"]))
        with pytest.raises(ValueError, match="unknown upstream projection"):
            build_dag(projs)


# ---------------------------------------------------------------------------
# Emitter tests
# ---------------------------------------------------------------------------


class TestEmitter:
    def _resolved(self, yaml_src=_MINIMAL_YAML):
        raw = parse_manifest(yaml_src)
        expanded = expand_manifest(raw)
        return resolve_manifest(expanded)

    def test_emit_plan_returns_compiled_plan(self):
        resolved = self._resolved()
        plan = emit_plan(
            resolved, dataset_id="ds1", manifest_source=_MINIMAL_YAML
        )
        assert isinstance(plan, CompiledPlan)
        assert plan.dataset_id == "ds1"

    def test_emit_plan_id_is_sha256_hex(self):
        resolved = self._resolved()
        plan = emit_plan(
            resolved, dataset_id="ds1", manifest_source=_MINIMAL_YAML
        )
        assert len(plan.plan_id) == 64
        assert all(c in "0123456789abcdef" for c in plan.plan_id)

    def test_emit_plan_id_is_content_addressed(self):
        resolved = self._resolved()
        plan_a = emit_plan(
            resolved, dataset_id="ds1", manifest_source=_MINIMAL_YAML
        )
        plan_b = emit_plan(
            resolved, dataset_id="ds2", manifest_source="other source"
        )
        assert (
            plan_a.plan_id == plan_b.plan_id
        )  # dataset_id and source not in hash

    def test_emit_plan_different_content_different_id(self):
        resolved_a = self._resolved(_MINIMAL_YAML)
        resolved_b = self._resolved(_DAG_YAML)
        plan_a = emit_plan(resolved_a, dataset_id="ds1", manifest_source="")
        plan_b = emit_plan(resolved_b, dataset_id="ds1", manifest_source="")
        assert plan_a.plan_id != plan_b.plan_id

    def test_emit_plan_dag_order_topo_sorted(self):
        resolved = self._resolved(_DAG_YAML)
        plan = emit_plan(resolved, dataset_id="ds1", manifest_source="")
        ids = [p.id for p in plan.projections]
        assert ids.index("base") < ids.index("derived")

    def test_emit_plan_projection_grain(self):
        resolved = self._resolved(_MINIMAL_YAML)
        plan = emit_plan(resolved, dataset_id="ds1", manifest_source="")
        assert plan.projections[0].grain == Grain.OBSERVATION

    def test_emit_plan_channel_bindings_captured(self):
        resolved = self._resolved(_MINIMAL_YAML)
        plan = emit_plan(resolved, dataset_id="ds1", manifest_source="")
        assert plan.channel_bindings[0].id == "imu"
        assert plan.channel_bindings[0].codec == "nuscenes_imu_json"

    def test_emit_plan_where_expr_captured(self):
        yaml = (
            "channel_bindings:\n"
            "  - id: diag\n"
            "    match: { topic: /diag }\n"
            "    where: { expr: 'name == \"foo\"' }\n"
            "    codec: nuscenes_diagnostics_json\n"
            "projections:\n"
            "  - id: p\n"
            "    sources:\n"
            "      - name: s\n"
            "        channel_bindings: [diag]\n"
            "    observation:\n"
            "      rows: { for_each: s, time: { shape: point, timestamp: { path: s.ts } } }\n"
            "      columns: []\n"
        )
        resolved = resolve_manifest(expand_manifest(parse_manifest(yaml)))
        plan = emit_plan(resolved, dataset_id="ds1", manifest_source="")
        assert plan.channel_bindings[0].where_expr == 'name == "foo"'

    def test_dispatch_correct_batch_count(self):
        resolved = self._resolved(_MINIMAL_YAML)
        plan = emit_plan(resolved, dataset_id="ds1", manifest_source="")
        episodes = [f"ep{i}.mcap" for i in range(45)]
        jobs = dispatch(plan, episodes, base_path="gs://bucket", batch_size=20)
        assert len(jobs) == 3  # ceil(45/20)

    def test_dispatch_batch_contents(self):
        resolved = self._resolved(_MINIMAL_YAML)
        plan = emit_plan(resolved, dataset_id="ds1", manifest_source="")
        episodes = [f"ep{i}.mcap" for i in range(5)]
        jobs = dispatch(plan, episodes, base_path="gs://bucket", batch_size=3)
        assert jobs[0].episode_paths == ["ep0.mcap", "ep1.mcap", "ep2.mcap"]
        assert jobs[1].episode_paths == ["ep3.mcap", "ep4.mcap"]

    def test_dispatch_output_paths_contain_plan_and_projection_ids(self):
        resolved = self._resolved(_MINIMAL_YAML)
        plan = emit_plan(resolved, dataset_id="ds1", manifest_source="")
        jobs = dispatch(plan, ["ep.mcap"], base_path="gs://bucket")
        path = jobs[0].output_paths["obs"]
        assert plan.plan_id in path
        assert "obs" in path
        assert path.endswith(".parquet")

    def test_dispatch_empty_episodes_returns_no_jobs(self):
        resolved = self._resolved(_MINIMAL_YAML)
        plan = emit_plan(resolved, dataset_id="ds1", manifest_source="")
        jobs = dispatch(plan, [], base_path="gs://bucket")
        assert jobs == []


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------


class TestModel:
    def test_compiled_plan_to_mongo_doc_has_required_keys(self):
        resolved = resolve_manifest(
            expand_manifest(parse_manifest(_MINIMAL_YAML))
        )
        plan = emit_plan(
            resolved, dataset_id="ds1", manifest_source=_MINIMAL_YAML
        )
        doc = plan.to_mongo_doc()
        assert doc["plan_id"] == plan.plan_id
        assert doc["dataset_id"] == "ds1"
        assert doc["is_current"] is True
        assert "channel_bindings" in doc
        assert "projections" in doc
        assert "dag" in doc
        assert "order" in doc["dag"]
        assert "levels" in doc["dag"]

    def test_make_plan_id_is_deterministic(self):
        id1 = CompiledPlan.make_plan_id([], [], [])
        id2 = CompiledPlan.make_plan_id([], [], [])
        assert id1 == id2

    def test_make_plan_id_changes_with_content(self):
        id1 = CompiledPlan.make_plan_id([], [], [])
        id2 = CompiledPlan.make_plan_id([{"id": "x"}], [], [])
        assert id1 != id2

    def test_projection_job_initialises_episode_status(self):
        job = ProjectionJob(
            plan_id="p1",
            dataset_id="ds1",
            batch_index=0,
            episode_paths=["a.mcap", "b.mcap"],
            output_paths={},
        )
        assert job.episode_status == {
            "a.mcap": JobStatus.PENDING.value,
            "b.mcap": JobStatus.PENDING.value,
        }

    def test_projection_job_to_mongo_doc_episode_status_is_array(self):
        job = ProjectionJob(
            plan_id="p1",
            dataset_id="ds1",
            batch_index=0,
            episode_paths=["a.mcap"],
            output_paths={},
        )
        doc = job.to_mongo_doc()
        assert isinstance(doc["episode_status"], list)
        assert doc["episode_status"][0]["path"] == "a.mcap"
        assert doc["episode_status"][0]["status"] == JobStatus.PENDING.value

    def test_projection_job_to_mongo_doc_status_is_string(self):
        job = ProjectionJob(
            plan_id="p1",
            dataset_id="ds1",
            batch_index=0,
            episode_paths=[],
            output_paths={},
        )
        doc = job.to_mongo_doc()
        assert doc["status"] == "pending"

    def test_job_status_enum_values(self):
        assert JobStatus.PENDING.value == "pending"
        assert JobStatus.RUNNING.value == "running"
        assert JobStatus.COMPLETED.value == "completed"
        assert JobStatus.FAILED.value == "failed"
        assert JobStatus.PARTIAL.value == "partial"


# ---------------------------------------------------------------------------
# Expression tests
# ---------------------------------------------------------------------------


class TestExpression:
    def test_captured_expression_str(self):
        expr = CapturedExpression(expr="x > 0", context_hint="col 'foo'")
        assert str(expr) == "x > 0"

    def test_captured_expression_depends_on_defaults_empty(self):
        expr = CapturedExpression(expr="x > 0")
        assert expr.depends_on == []

    def test_stub_engine_raises_not_implemented(self):
        engine = StubExpressionEngine()
        expr = CapturedExpression(expr="x > 0")
        with pytest.raises(NotImplementedError, match="not yet implemented"):
            engine.evaluate(expr, {"x": 1})

    def test_stub_engine_includes_expr_in_message(self):
        engine = StubExpressionEngine()
        expr = CapturedExpression(expr="my_expr == 42")
        with pytest.raises(NotImplementedError, match="my_expr == 42"):
            engine.evaluate(expr, {})

    def test_stub_engine_includes_context_hint_when_present(self):
        engine = StubExpressionEngine()
        expr = CapturedExpression(expr="x", context_hint="binding 'foo' where")
        with pytest.raises(NotImplementedError, match="binding 'foo' where"):
            engine.evaluate(expr, {})


# ---------------------------------------------------------------------------
# compile() integration tests
# ---------------------------------------------------------------------------


class TestCompileEntrypoint:
    def test_compile_minimal_yaml(self):
        plan = compiler_compile(_MINIMAL_YAML, dataset_id="ds1")
        assert plan.dataset_id == "ds1"
        assert len(plan.projections) == 1

    def test_compile_with_repeats(self):
        plan = compiler_compile(_REPEAT_YAML, dataset_id="ds1")
        binding_ids = [b.id for b in plan.channel_bindings]
        assert "front_image" in binding_ids
        assert "back_image" in binding_ids

    def test_compile_with_dag(self):
        plan = compiler_compile(_DAG_YAML, dataset_id="ds1")
        ids = [p.id for p in plan.projections]
        assert ids.index("base") < ids.index("derived")
        derived = next(p for p in plan.projections if p.id == "derived")
        assert derived.depends_on == ["base"]
        assert derived.dag_level == 1

    def test_compile_nuscenes_yaml(self):
        import os

        yaml_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "..", "..", "nuscenes.yaml"
        )
        if not os.path.exists(yaml_path):
            pytest.skip("nuscenes.yaml not found")
        with open(yaml_path) as f:
            yaml_src = f.read()
        plan = compiler_compile(yaml_src, dataset_id="nuscenes_ds")
        assert len(plan.channel_bindings) > 0
        assert len(plan.projections) > 0
        # DAG order must be topologically valid
        seen = set()
        for proj in plan.projections:
            assert all(dep in seen for dep in proj.depends_on), (
                f"projection '{proj.id}' depends on {proj.depends_on} "
                f"but only seen {seen} so far"
            )
            seen.add(proj.id)
