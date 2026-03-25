# Test cases for no-bare-except-pass and no-bare-except-ellipsis Semgrep rules

# ruleid: no-bare-except-pass
try:
    do_something()
except Exception:
    pass

# ruleid: no-bare-except-ellipsis
try:
    do_something()
except Exception:
    ...

# ok: no-bare-except-pass
try:
    do_something()
except Exception as e:
    logger.error("Failed: %s", e)

# ok: no-bare-except-pass
try:
    do_something()
except Exception as e:
    print(f"Error: {e}")
    raise

# ok: no-bare-except-pass
try:
    do_something()
except ValueError:
    pass

# ok: no-bare-except-ellipsis
try:
    do_something()
except Exception as e:
    logging.warning("Ignored: %s", e)
