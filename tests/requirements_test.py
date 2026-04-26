import json
import subprocess
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def run_spec(name: str) -> dict:
    result = subprocess.run(
        ["pnpm", "exec", "tsx", "scripts/requirements-spec.ts", name],
        cwd=PROJECT_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["spec"] == name
    return payload


def test_freshness_fresh_state():
    run_spec("freshness_fresh")


def test_freshness_degrading_state():
    run_spec("freshness_degrading")


def test_stale_structure_blocks_high_confidence_routing():
    run_spec("freshness_stale_blocks_routing")


def test_same_family_dedupe_keeps_single_primary():
    run_spec("fusion_same_family_dedupes_primary")


def test_cross_family_resonance_is_not_collapsed():
    run_spec("fusion_cross_family_resonates")


def test_discovery_without_structure_stays_watchlist():
    run_spec("router_discovery_without_structure_is_watchlist")


def test_structure_confirmation_unlocks_lana_candidate():
    run_spec("router_structure_unlocks_long")


def test_blowoff_exhaustion_unlocks_skanda_candidate():
    run_spec("router_blowoff_exhaustion_short")


def test_auto_execution_request_is_flagged():
    run_spec("safety_flags_auto_execution")


def test_prompt_injection_is_blocked():
    run_spec("safety_blocks_prompt_injection")


def test_ai_advisor_falls_back_to_manual_only_mode():
    run_spec("advisor_fallback_is_manual_only")


def test_market_structure_veto_beats_social_heat():
    run_spec("conflict_structure_beats_social")
