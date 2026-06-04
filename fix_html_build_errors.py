"""
fix_html_build_errors.py
Finds and fixes pre-existing HTML parse errors in solution pages that prevent Vite build.
Fixes:
  1. Unescaped bare < before digits in text content (e.g. <5 seconds -> &lt;5 seconds)
  2. Nested HTML comments (<!-- <!-- ... --> -> <!-- ... -->)
"""
import re, os

FILES = [
    'solutions/account-executives.html',
    'solutions/revenue-operations.html',
    'solutions/sales-leaders.html',
    'solutions.html',
]

fixed_count = 0

for filepath in FILES:
    if not os.path.exists(filepath):
        print(f"SKIP (not found): {filepath}")
        continue
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content

    # Fix 1: bare <N in text content — replace with &lt;N
    # Match: end of tag > then text containing <digit
    content = re.sub(r'(?<=>)([^<]*)<(\d)', lambda m: m.group(1) + '&lt;' + m.group(2), content)

    # Fix 2: nested comments  <!--  <!-- ... -->  -> <!-- ... -->
    content = re.sub(r'<!--\s*<!--', '<!--', content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"FIXED: {filepath}")
        fixed_count += 1
    else:
        print(f"OK (no changes): {filepath}")

print(f"\nTotal files fixed: {fixed_count}")
