#!/usr/bin/env python3
import argparse, csv, json, sys
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

def iter_json_records(p: Path):
    try:
        if p.suffix == ".jsonl":
            with p.open("r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        yield json.loads(line)
                    except Exception:
                        continue
        elif p.suffix == ".json":
            with p.open("r", encoding="utf-8", errors="ignore") as f:
                data = json.load(f)
            if isinstance(data, list):
                for obj in data:
                    if isinstance(obj, dict):
                        yield obj
            elif isinstance(data, dict):
                for k in ("records","events","history","lines","items"):
                    v = data.get(k)
                    if isinstance(v, list):
                        for obj in v:
                            if isinstance(obj, dict):
                                yield obj
                if any(k in data for k in ("text","prompt","response","completion","usage","created","ts","timestamp","choices","messages")):
                    yield data
    except Exception:
        return

def parse_timestamp(rec, fallback_mtime: float) -> datetime:
    for k in ("ts","created","time","t"):
        v = rec.get(k)
        if isinstance(v, (int,float)):
            try:
                return datetime.fromtimestamp(float(v), tz=timezone.utc)
            except Exception:
                pass
    for k in ("timestamp","date","datetime","created_at"):
        v = rec.get(k)
        if isinstance(v, str):
            try:
                dt = datetime.fromisoformat(v.replace("Z","+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc)
            except Exception:
                for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ","%Y-%m-%d %H:%M:%S","%a, %d %b %Y %H:%M:%S %Z"):
                    try:
                        return datetime.strptime(v, fmt).replace(tzinfo=timezone.utc)
                    except Exception:
                        pass
    return datetime.fromtimestamp(fallback_mtime, tz=timezone.utc)

def classify_role(rec) -> str:
    role = rec.get("role")
    if role in ("user","assistant"):
        return role
    if "messages" in rec and isinstance(rec["messages"], list):
        msgs = rec["messages"]
        if msgs:
            last = msgs[-1]
            r = last.get("role") if isinstance(last, dict) else None
            if r in ("assistant","user"):
                return r
    if "prompt" in rec and ("completion" in rec or "response" in rec):
        return "assistant"
    if "text" in rec and not any(k in rec for k in ("response","completion","choices")):
        return "user"
    if any(k in rec for k in ("response","completion","choices")):
        return "assistant"
    ev = (rec.get("event") or rec.get("type") or "").lower()
    if "user" in ev:
        return "user"
    if "assistant" in ev or "completion" in ev:
        return "assistant"
    return "unknown"

def extract_usage(rec):
    def to_int(v):
        return int(v) if isinstance(v, (int,float)) else 0
    u = rec.get("usage") or rec.get("meta", {}).get("usage")
    if isinstance(u, dict):
        pt = u.get("prompt_tokens") or u.get("promptTokens") or 0
        ct = u.get("completion_tokens") or u.get("completionTokens") or 0
        tt = u.get("total_tokens") or u.get("totalTokens") or (pt or 0) + (ct or 0)
        return to_int(pt), to_int(ct), to_int(tt)
    if isinstance(rec.get("choices"), list) and isinstance(rec.get("usage"), dict):
        return extract_usage({"usage": rec.get("usage")})
    return 0, 0, 0

def format_int(n):
    return f"{n:,}"

def main():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--root", default=str(Path.home() / ".codex"))
    parser.add_argument("--csv", default=None)
    parser.add_argument("--since", default=None)
    parser.add_argument("--until", default=None)
    args = parser.parse_args()

    root = Path(args.root).expanduser()
    if not root.exists():
        print(f"Path not found: {root}", file=sys.stderr)
        sys.exit(1)

    candidates = []
    for pat in ("history.jsonl","history.json","*.jsonl","*.json"):
        for p in root.glob(pat):
            candidates.append(p)
    for sub in ("sessions","log","logs"):
        d = root / sub
        if d.exists():
            candidates.extend(list(d.rglob("*.jsonl")))
            candidates.extend(list(d.rglob("*.json")))

    seen = set()
    files = []
    for p in candidates:
        if p not in seen:
            files.append(p)
            seen.add(p)

    daily = defaultdict(lambda: {
        "user_msgs": 0,
        "assistant_msgs": 0,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
    })

    def parse_date(s):
        return datetime.strptime(s, "%Y-%m-%d").date()

    since_date = parse_date(args.since) if args.since else None
    until_date = parse_date(args.until) if args.until else None

    for p in files:
        mtime = p.stat().st_mtime
        for rec in iter_json_records(p):
            ts = parse_timestamp(rec, mtime)
            local_day = ts.astimezone().date()
            if since_date and local_day < since_date:
                continue
            if until_date and local_day > until_date:
                continue
            key = local_day.isoformat()
            role = classify_role(rec)
            if role == "user":
                daily[key]["user_msgs"] += 1
            elif role == "assistant":
                daily[key]["assistant_msgs"] += 1
            pt, ct, tt = extract_usage(rec)
            daily[key]["prompt_tokens"] += pt
            daily[key]["completion_tokens"] += ct
            daily[key]["total_tokens"] += tt

    rows = []
    total = {k: 0 for k in ("user_msgs","assistant_msgs","prompt_tokens","completion_tokens","total_tokens")}
    for day in sorted(daily.keys()):
        d = daily[day]
        rows.append((day, d["user_msgs"], d["assistant_msgs"], d["prompt_tokens"], d["completion_tokens"], d["total_tokens"]))
        for k in total:
            total[k] += d[k]

    headers = ["Date","User","Assistant","Prompt","Completion","Total"]
    data = [headers] + [[r[0]] + [str(r[i]) for i in range(1,6)] for r in rows]
    if rows:
        data.append(["Sum", str(total["user_msgs"]), str(total["assistant_msgs"]), str(total["prompt_tokens"]), str(total["completion_tokens"]), str(total["total_tokens"])])
    widths = [max(len(row[i]) for row in data) for i in range(6)] if data else [4,4,9,6,10,5]
    def line(c1, c2, c3):
        return c1 + "+".join(c2 * (w + 2) for w in widths) + c3
    if not rows:
        print("No records found.")
    else:
        print(line("+", "-", "+"))
        print("| " + " | ".join(h.ljust(widths[i]) for i, h in enumerate(headers)) + " |")
        print(line("+", "-", "+"))
        for r in rows:
            vals = [r[0], *(format_int(r[i]) for i in range(1,6))]
            print("| " + " | ".join(vals[i].rjust(widths[i]) if i else vals[i].ljust(widths[i]) for i in range(6)) + " |")
        print(line("+", "-", "+"))
        sums = ["Sum", *(format_int(total[k]) for k in ("user_msgs","assistant_msgs","prompt_tokens","completion_tokens","total_tokens"))]
        print("| " + " | ".join(sums[i].rjust(widths[i]) if i else sums[i].ljust(widths[i]) for i in range(6)) + " |")
        print(line("+", "-", "+"))

    if args.csv:
        out = Path(args.csv).expanduser()
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["date","user_msgs","assistant_msgs","prompt_tokens","completion_tokens","total_tokens"])
            for r in rows:
                w.writerow([r[0], r[1], r[2], r[3], r[4], r[5]])
        print(f"Wrote CSV: {out}")

if __name__ == "__main__":
    main()

