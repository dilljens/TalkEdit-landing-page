import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

TLDS = [".com", ".app", ".co", ".io"]

WORDS = [
    # Prefixes
    "get", "try", "go", "use", "app", "official",
    "hello", "hey", "join", "with", "on", "just",
    # Suffixes
    "app", "pro", "hq", "studio", "video", "editor",
    "audio", "tools", "works", "live", "hub", "desk",
    "lab", "labs", "craft", "kit", "box", "zone",
    "pal", "deck", "board", "flow", "forge", "space",
]

def check_domain(domain):
    try:
        result = subprocess.run(
            ["host", "-W", "2", domain],
            capture_output=True, text=True, timeout=5
        )
        if "not found" in result.stderr.lower() or "nxdomain" in result.stdout.lower() or "not found" in result.stdout.lower():
            return domain, "AVAILABLE"
        if "has address" in result.stdout or "has IPv6 address" in result.stdout or "mail is handled" in result.stdout:
            return domain, "TAKEN"
        return domain, "UNCERTAIN"
    except subprocess.TimeoutExpired:
        return domain, "TIMEOUT"
    except Exception as e:
        return domain, f"ERROR: {e}"

def generate_candidates():
    seen = set()
    base = "talkedit"
    yield base  # talkedit.com, etc.
    yield "talk-editor"
    yield "talk-edit"
    yield "talkeditapp"
    yield "talkeditvideo"
    yield "talkeditor"
    yield "talkeditpro"
    yield "talkeditai"
    yield "talkeditio"
    yield "thetalkedit"
    yield "officialtalkedit"

    for w in WORDS:
        # prefix + base: gettalkedit, trytalkedit, etc.
        cand = f"{w}{base}"
        if cand not in seen:
            seen.add(cand)
            yield cand
        # compound with hyphen: get-talkedit, get-talk-edit, etc.
        cand_h = f"{w}-{base}"
        if cand_h not in seen:
            seen.add(cand_h)
            yield cand_h
        # base + suffix: talkeditpro, talkeditapp, etc.
        cand_s = f"{base}{w}"
        if cand_s not in seen:
            seen.add(cand_s)
            yield cand_s
        # base + hyphen + suffix: talkedit-pro, talkedit-app, etc.
        cand_sh = f"{base}-{w}"
        if cand_sh not in seen:
            seen.add(cand_sh)
            yield cand_sh

def main():
    candidates = list(generate_candidates())
    total = len(candidates) * len(TLDS)
    print(f"Checking {len(candidates)} names x {len(TLDS)} TLDs = {total} domains...\n")

    all_domains = [f"{name}{tld}" for name in candidates for tld in TLDS]

    results = {"AVAILABLE": [], "UNCERTAIN": [], "TAKEN": [], "TIMEOUT": [], "ERROR": []}

    with ThreadPoolExecutor(max_workers=20) as pool:
        futures = {pool.submit(check_domain, d): d for d in all_domains}
        for i, future in enumerate(as_completed(futures)):
            domain, status = future.result()
            results.setdefault(status, []).append(domain)
            sys.stdout.write(f"\r  Checked {i+1}/{total}...")
            sys.stdout.flush()

    print("\n\n=== RESULTS ===\n")

    print("--- AVAILABLE (no DNS records) ---")
    for d in sorted(results["AVAILABLE"]):
        print(f"  {d}")

    if results["UNCERTAIN"]:
        print(f"\n--- UNCERTAIN (could not determine) ---")
        for d in sorted(results["UNCERTAIN"]):
            print(f"  {d}")

    if results["TIMEOUT"]:
        print(f"\n--- TIMEOUT ---")
        for d in sorted(results["TIMEOUT"]):
            print(f"  {d}")

    if results["ERROR"]:
        print(f"\n--- ERRORS ---")
        for d in results["ERROR"]:
            print(f"  {d}")

    print(f"\nAvailable: {len(results['AVAILABLE'])}")
    print(f"Taken:     {len(results['TAKEN'])}")
    print(f"Uncertain: {len(results['UNCERTAIN'])}")
    print(f"Timeout:   {len(results['TIMEOUT'])}")
    print(f"Errors:    {len(results.get('ERROR', []))}")

if __name__ == "__main__":
    main()
