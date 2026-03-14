#!/usr/bin/env python3
# mcp-agent-mail guard hook (pre-commit)
import json
import os
import sys
import subprocess
from pathlib import Path
import fnmatch as _fn
from datetime import datetime, timezone

# Optional Git pathspec support (preferred when available)
try:
    from pathspec import PathSpec as _PS  # type: ignore[import-not-found]
except Exception:
    _PS = None  # type: ignore[assignment]

FILE_RESERVATIONS_DIR = Path("/Users/ivintik/.mcp_agent_mail_git_mailbox_repo/projects/users-ivintik-dev-personal-bmad-orchestrator/file_reservations")
STORAGE_ROOT = Path("/Users/ivintik/.mcp_agent_mail_git_mailbox_repo/projects/users-ivintik-dev-personal-bmad-orchestrator")

# Gate variables (presence) and mode
GATE = (os.environ.get("WORKTREES_ENABLED","0") or os.environ.get("GIT_IDENTITY_ENABLED","0") or "0")

# Exit early if gate is not enabled (WORKTREES_ENABLED=0 and GIT_IDENTITY_ENABLED=0)
if GATE.strip().lower() not in {"1","true","t","yes","y"}:
    sys.exit(0)

# Advisory/blocking mode: default to 'block' unless explicitly set to 'warn'.
MODE = (os.environ.get("AGENT_MAIL_GUARD_MODE","block") or "block").strip().lower()
ADVISORY = MODE in {"warn","advisory","adv"}

# Emergency bypass
if (os.environ.get("AGENT_MAIL_BYPASS","0") or "0").strip().lower() in {"1","true","t","yes","y"}:
    sys.stderr.write("[pre-commit] bypass enabled via AGENT_MAIL_BYPASS=1\n")
    sys.exit(0)
AGENT_NAME = os.environ.get("AGENT_NAME")
if not AGENT_NAME:
    sys.stderr.write("[pre-commit] AGENT_NAME environment variable is required.\n")
    sys.exit(1)

# Collect staged paths (name-only) and expand renames/moves (old+new)
paths = []
try:
    co = subprocess.run(["git","diff","--cached","--name-only","-z","--diff-filter=ACMRDTU"],
                        check=True,capture_output=True)
    data = co.stdout.decode("utf-8","ignore")
    for p in data.split("\x00"):
        if p:
            paths.append(p)
    # Rename detection: capture both old and new names
    cs = subprocess.run(["git","diff","--cached","--name-status","-M","-z"],
                        check=True,capture_output=True)
    sdata = cs.stdout.decode("utf-8","ignore")
    parts = [x for x in sdata.split("\x00") if x]
    i = 0
    while i < len(parts):
        status = parts[i]
        i += 1
        if status.startswith("R") and i + 1 < len(parts):
            oldp = parts[i]; newp = parts[i+1]; i += 2
            if oldp: paths.append(oldp)
            if newp: paths.append(newp)
        else:
            # Status followed by one path
            if i < len(parts):
                pth = parts[i]; i += 1
                if pth: paths.append(pth)
except Exception:
    pass

if not paths:
    sys.exit(0)

# Local conflict detection against FILE_RESERVATIONS_DIR
def _now_utc():
    return datetime.now(timezone.utc)
def _parse_iso(value):
    if not value:
        return None
    try:
        text = value
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None
def _not_expired(expires_ts):
    parsed = _parse_iso(expires_ts)
    if parsed is None:
        return True
    return parsed > _now_utc()
def _compile_one(patt):
    q = patt.replace("\\","/")
    if _PS:
        try:
            return _PS.from_lines("gitignore", [q])
        except Exception:
            return None
    return None

# Phase 1: Pre-load and compile all reservation patterns ONCE
compiled_patterns = []
all_pattern_strings = []
seen_ids = set()
try:
    for f in FILE_RESERVATIONS_DIR.iterdir():
        if not f.name.endswith('.json'):
            continue
        try:
            data = json.loads(f.read_text(encoding='utf-8'))
        except Exception:
            continue
        recs = data if isinstance(data, list) else [data]
        for r in recs:
            if not isinstance(r, dict):
                continue
            rid = r.get('id')
            if rid is not None:
                rid_key = str(rid)
                if rid_key in seen_ids:
                    continue
                seen_ids.add(rid_key)
            patt = (r.get('path_pattern') or '').strip()
            if not patt:
                continue
            # Skip virtual namespace reservations (tool://, resource://, service://) — bd-14z
            if any(patt.startswith(pfx) for pfx in ('tool://', 'resource://', 'service://')):
                continue
            holder = (r.get('agent') or '').strip()
            exclusive = r.get('exclusive', True)
            expires = (r.get('expires_ts') or '').strip()
            if not exclusive:
                continue
            if holder and holder == AGENT_NAME:
                continue
            if not _not_expired(expires):
                continue
            # Pre-compile pattern ONCE (not per-path)
            spec = _compile_one(patt)
            patt_norm = patt.replace('\\','/').lstrip('/')
            compiled_patterns.append((spec, patt, patt_norm, holder))
            all_pattern_strings.append(patt_norm)
except Exception:
    compiled_patterns = []
    all_pattern_strings = []

# Phase 2: Build union PathSpec for fast-path rejection
union_spec = None
if _PS and all_pattern_strings:
    try:
        union_spec = _PS.from_lines("gitignore", all_pattern_strings)
    except Exception:
        union_spec = None

# Phase 3: Check paths against compiled patterns
conflicts = []
if compiled_patterns:
    for p in paths:
        norm = p.replace('\\','/').lstrip('/')
        # Fast-path: if union_spec exists and path doesn't match ANY pattern, skip
        if union_spec is not None and not union_spec.match_file(norm):
            continue
        # Detailed matching for conflict attribution
        for spec, patt, patt_norm, holder in compiled_patterns:
            matched = spec.match_file(norm) if spec is not None else _fn.fnmatch(norm, patt_norm)
            if matched:
                conflicts.append((patt, p, holder))
if conflicts:
    sys.stderr.write("Exclusive file_reservation conflicts detected\n")
    for patt, path, holder in conflicts[:10]:
        sys.stderr.write(f"- {path} matches {patt} (holder: {holder})\n")
    if ADVISORY:
        sys.exit(0)
    sys.exit(1)
sys.exit(0)
