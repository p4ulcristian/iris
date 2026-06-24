#!/usr/bin/env python3
"""
usage-tracker — read Claude Code's local transcripts and report token usage + cost.

Like claudia, this scrapes the JSONL session transcripts under
``~/.claude/projects/`` (one file per session, one JSON object per line). Every
assistant turn carries a ``message.usage`` block with input/output/cache token
counts and a ``model`` id; we sum those, price them per-model, and print a
summary.

Usage:
    usage-tracker.py                # human summary (today + all-time + breakdowns)
    usage-tracker.py --json         # machine-readable JSON (used by the panel /usage)
    usage-tracker.py --today        # restrict the human summary to today
    usage-tracker.py --days 7       # restrict to the last N days

Pricing (USD per 1M tokens), per the task brief plus the standard cache
multipliers (cache-write = 1.25x input, cache-read = 0.1x input):

    opus    : $15 in  / $75 out
    sonnet  : $3  in  / $15 out
    haiku   : $0.80 in / $4 out   (included for completeness)
"""
import glob
import json
import os
import sys
from datetime import datetime, timezone

PROJECTS_DIR = os.path.expanduser(
    os.environ.get("CLAUDE_PROJECTS_DIR", "~/.claude/projects"))

# per-model rates in USD per token
RATES = {
    "opus":   {"in": 15.0,  "out": 75.0,  "cache_write": 18.75, "cache_read": 1.50},
    "sonnet": {"in": 3.0,   "out": 15.0,  "cache_write": 3.75,  "cache_read": 0.30},
    "haiku":  {"in": 0.80,  "out": 4.0,   "cache_write": 1.0,   "cache_read": 0.08},
}
DEFAULT_FAMILY = "sonnet"   # unknown models priced as sonnet


def model_family(model):
    m = (model or "").lower()
    if "opus" in m:
        return "opus"
    if "sonnet" in m:
        return "sonnet"
    if "haiku" in m:
        return "haiku"
    return DEFAULT_FAMILY


def cost_for(family, tok):
    r = RATES.get(family, RATES[DEFAULT_FAMILY])
    return (tok["in"] * r["in"]
            + tok["out"] * r["out"]
            + tok["cache_write"] * r["cache_write"]
            + tok["cache_read"] * r["cache_read"]) / 1_000_000


def _empty():
    return {"in": 0, "out": 0, "cache_write": 0, "cache_read": 0}


def _add(dst, u):
    dst["in"] += u.get("input_tokens", 0) or 0
    dst["out"] += u.get("output_tokens", 0) or 0
    dst["cache_write"] += u.get("cache_creation_input_tokens", 0) or 0
    dst["cache_read"] += u.get("cache_read_input_tokens", 0) or 0


def _local_date(ts):
    """ISO timestamp -> local YYYY-MM-DD (None if unparseable)."""
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone().strftime("%Y-%m-%d")
    except (ValueError, AttributeError):
        return None


def scan():
    """Walk every transcript, dedup repeated turns, and aggregate token usage.

    Returns a dict with totals plus breakdowns by date, by model family, and by
    project. Dedup mirrors claudia: a single assistant message can appear in
    several transcripts (resumes, sidechains), so we key on
    ``message.id`` + ``requestId`` and count each only once.
    """
    seen = set()
    by_date = {}        # "YYYY-MM-DD" -> {family -> tok}
    by_model = {}       # family -> tok
    by_project = {}     # project name -> tok
    files = glob.glob(os.path.join(PROJECTS_DIR, "**", "*.jsonl"), recursive=True)

    for path in files:
        project = os.path.basename(os.path.dirname(path)).lstrip("-").replace("-", "/")
        try:
            f = open(path, "r", errors="replace")
        except OSError:
            continue
        with f:
            for line in f:
                line = line.strip()
                if not line or '"usage"' not in line:
                    continue
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                if rec.get("type") != "assistant":
                    continue
                msg = rec.get("message") or {}
                usage = msg.get("usage")
                if not usage:
                    continue
                key = (msg.get("id"), rec.get("requestId"))
                if key != (None, None):
                    if key in seen:
                        continue
                    seen.add(key)
                family = model_family(msg.get("model"))
                date = _local_date(rec.get("timestamp"))

                by_model.setdefault(family, _empty())
                _add(by_model[family], usage)

                by_project.setdefault(project, _empty())
                _add(by_project[project], usage)

                if date:
                    by_date.setdefault(date, {}).setdefault(family, _empty())
                    _add(by_date[date][family], usage)

    return {"by_date": by_date, "by_model": by_model, "by_project": by_project}


def _sum_toks(*toks):
    out = _empty()
    for t in toks:
        for k in out:
            out[k] += t[k]
    return out


def _bucket_summary(by_family):
    """Collapse a {family -> tok} map into totals + cost + per-model lines."""
    total = _empty()
    cost = 0.0
    models = {}
    for fam, tok in by_family.items():
        for k in total:
            total[k] += tok[k]
        c = cost_for(fam, tok)
        cost += c
        models[fam] = {**tok, "cost_usd": round(c, 4)}
    return {
        "tokens": total,
        "total_tokens": sum(total.values()),
        "cost_usd": round(cost, 4),
        "by_model": models,
    }


def report(data):
    today = datetime.now().astimezone().strftime("%Y-%m-%d")
    today_summary = _bucket_summary(data["by_date"].get(today, {}))

    # all-time, by family
    all_summary = _bucket_summary(data["by_model"])

    # per-day series (newest first), each already family-collapsed
    days = {}
    for d, fams in sorted(data["by_date"].items(), reverse=True):
        days[d] = _bucket_summary(fams)

    # per-project (treat each project as a single family bucket via its models —
    # we only have a flat tok per project, so price it as a weighted mix is hard;
    # report tokens and a sonnet-equivalent floor is misleading, so just tokens).
    projects = {}
    for p, tok in sorted(data["by_project"].items(),
                         key=lambda kv: -sum(kv[1].values())):
        projects[p] = {**tok, "total_tokens": sum(tok.values())}

    return {
        "today": today,
        "today_summary": today_summary,
        "all_time": all_summary,
        "by_day": days,
        "by_project": projects,
    }


def _fmt_n(n):
    return f"{n:,}"


def print_human(rep, scope="all"):
    def block(title, s):
        t = s["tokens"]
        print(f"\n{title}")
        print(f"  tokens : in {_fmt_n(t['in'])}  out {_fmt_n(t['out'])}  "
              f"cache(w/r) {_fmt_n(t['cache_write'])}/{_fmt_n(t['cache_read'])}")
        print(f"  total  : {_fmt_n(s['total_tokens'])} tokens")
        print(f"  cost   : ${s['cost_usd']:.2f}")
        if s["by_model"]:
            for fam, m in sorted(s["by_model"].items()):
                print(f"    - {fam:7} ${m['cost_usd']:.2f}  "
                      f"(in {_fmt_n(m['in'])}, out {_fmt_n(m['out'])})")

    print(f"iris usage — {rep['today']}")
    block(f"TODAY ({rep['today']})", rep["today_summary"])
    if scope == "all":
        block("ALL-TIME", rep["all_time"])
        if rep["by_day"]:
            print("\nRECENT DAYS")
            for d, s in list(rep["by_day"].items())[:7]:
                print(f"  {d}  ${s['cost_usd']:7.2f}  {_fmt_n(s['total_tokens']):>14} tok")
        if rep["by_project"]:
            print("\nTOP PROJECTS (by tokens)")
            for p, t in list(rep["by_project"].items())[:8]:
                print(f"  {t['total_tokens']:>14,}  {p}")


def main():
    args = sys.argv[1:]
    rep = report(scan())
    if "--json" in args:
        if "--today" in args:
            print(json.dumps({"today": rep["today"],
                              "today_summary": rep["today_summary"]}, indent=2))
        else:
            print(json.dumps(rep, indent=2))
        return
    scope = "today" if "--today" in args else "all"
    print_human(rep, scope)


if __name__ == "__main__":
    main()
