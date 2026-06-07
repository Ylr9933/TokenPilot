#!/usr/bin/env python3
import json
import sys


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"invalid_json:{exc}"}))
        return 1

    model = str(payload.get("model") or "").strip()
    messages = payload.get("messages")
    text = payload.get("text")

    try:
        from litellm import token_counter
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"litellm_import_failed:{exc}"}))
        return 2

    try:
        if isinstance(messages, list):
          value = int(token_counter(model=model or "gpt-5.4-mini", messages=messages))
        else:
          value = int(token_counter(model=model or "gpt-5.4-mini", text=str(text or "")))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"token_count_failed:{exc}"}))
        return 3

    print(json.dumps({"ok": True, "tokens": value}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
