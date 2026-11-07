#!/usr/bin/env python3
"""Passwort ändern:  python3 tools/setpass.py BENUTZER PASSWORT
Speichert nur eine gesalzene PBKDF2-Prüfsumme in index.html, nie das Passwort selbst. Danach tools/build.py ausführen."""
import re, sys, os, hashlib, pathlib
user, pw = sys.argv[1].lower(), sys.argv[2]
iters = 250000
salt = os.urandom(16).hex()
h = hashlib.pbkdf2_hmac("sha256", (user + ":" + pw).encode("utf-8"), bytes.fromhex(salt), iters, 32).hex()
p = pathlib.Path(__file__).resolve().parent.parent / "index.html"
s = p.read_text(encoding="utf-8")
s, n = re.subn(r'var USER="[^"]*",SALT="[^"]*",ITER=\d+,HASH="[^"]*";', 'var USER="%s",SALT="%s",ITER=%d,HASH="%s";' % (user, salt, iters, h), s)
assert n == 1
p.write_text(s, encoding="utf-8")
print("Anmeldedaten gesetzt für", user)
