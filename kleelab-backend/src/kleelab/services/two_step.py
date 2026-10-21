"""Two-step sign-in for the team: a code from an authenticator app after the password.

Codes are standard TOTP (RFC 6238: SHA-1, 6 digits, 30-second steps), so any
authenticator app works. The shared secret is encrypted at rest with a key
derived from SECRET_KEY, so a copy of the database alone cannot mint codes.

Recovery codes are for a lost phone. Each works once and only its keyed hash
is stored.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import struct
import time
from datetime import datetime, timedelta
from urllib.parse import quote

import segno
from cryptography.fernet import Fernet, InvalidToken

from kleelab.core.config import settings
from kleelab.models.user import User

ISSUER = "KleeLab"
STEP_SECONDS = 30
DIGITS = 6
RECOVERY_CODE_COUNT = 10
# Every this many wrong codes in a row locks two-step for LOCK_MINUTES.
MAX_FAILURES = 5
LOCK_MINUTES = 15
# No 0/o, 1/l/i: recovery codes get read off paper and typed by hand.
_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def _fernet() -> Fernet:
    key = hashlib.sha256(f"kleelab-two-step:{settings.SECRET_KEY}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode()


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(stored: str | None) -> str | None:
    if not stored:
        return None
    try:
        return _fernet().decrypt(stored.encode()).decode()
    except InvalidToken:
        # SECRET_KEY changed since this was saved. The secret is unusable, which
        # surfaces as wrong codes; recovery codes still work.
        return None


def is_enabled(user: User) -> bool:
    return user.two_step_enabled_at is not None and bool(user.totp_secret)


def _code_at(secret: str, counter: int) -> str:
    digest = hmac.new(base64.b32decode(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def current_step(at: float | None = None) -> int:
    return int((time.time() if at is None else at) // STEP_SECONDS)


def code_for(secret: str, at: float | None = None) -> str:
    """The code an authenticator shows right now. Used by tests."""

    return _code_at(secret, current_step(at))


def match_code(secret: str, code: str, last_step: int | None, at: float | None = None) -> int | None:
    """The time step `code` belongs to, or None.

    One step either side is accepted for clock drift. A step at or before the
    last one used is refused, so a code seen over someone's shoulder cannot be
    replayed.
    """

    code = "".join(ch for ch in code if ch.isdigit())
    if len(code) != DIGITS:
        return None
    step = current_step(at)
    for candidate in (step - 1, step, step + 1):
        if last_step is not None and candidate <= last_step:
            continue
        if hmac.compare_digest(_code_at(secret, candidate), code):
            return candidate
    return None


def otpauth_uri(secret: str, email: str) -> str:
    label = quote(f"{ISSUER}:{email}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(ISSUER)}&algorithm=SHA1&digits={DIGITS}&period={STEP_SECONDS}"


def qr_data_uri(uri: str) -> str:
    return segno.make(uri, error="m").svg_data_uri(scale=5, border=2, dark="#0b0b0f", light="#ffffff")


# --- Recovery codes -------------------------------------------------------------


def _normalise_recovery(code: str) -> str:
    return "".join(ch for ch in code.lower() if ch.isalnum())


def _hash_recovery(code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), _normalise_recovery(code).encode(), hashlib.sha256).hexdigest()


def new_recovery_codes(user: User) -> list[str]:
    """Replace the user's recovery codes and return the new ones, in clear, once."""

    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(_ALPHABET) for _ in range(8))
        codes.append(f"{raw[:4]}-{raw[4:]}")
    user.recovery_codes = json.dumps([_hash_recovery(code) for code in codes])
    return codes


def recovery_codes_left(user: User) -> int:
    try:
        return len(json.loads(user.recovery_codes or "[]"))
    except ValueError:
        return 0


def looks_like_recovery_code(code: str) -> bool:
    return any(ch.isalpha() for ch in code)


def use_recovery_code(user: User, code: str) -> bool:
    try:
        hashes: list[str] = json.loads(user.recovery_codes or "[]")
    except ValueError:
        return False
    wanted = _hash_recovery(code)
    match = next((h for h in hashes if hmac.compare_digest(h, wanted)), None)
    if match is None:
        return False
    hashes.remove(match)
    user.recovery_codes = json.dumps(hashes)
    return True


# --- Checking a code, with a lockout -----------------------------------------------


def locked_minutes(user: User, now: datetime) -> int:
    """Minutes left on a lockout, or 0."""

    if user.two_step_locked_until is None or user.two_step_locked_until <= now:
        return 0
    return max(1, int((user.two_step_locked_until - now).total_seconds() // 60) + 1)


def check(user: User, code: str, now: datetime, *, allow_recovery: bool = True) -> str | None:
    """Check a code against the user's two-step. Returns "app", "recovery" or None.

    Updates the user (last step used, recovery codes left, failure count and
    lockout); the caller commits. Call `locked_minutes` first.
    """

    method = None
    code = (code or "").strip()
    if allow_recovery and looks_like_recovery_code(code):
        if use_recovery_code(user, code):
            method = "recovery"
    else:
        secret = decrypt_secret(user.totp_secret)
        step = match_code(secret, code, user.two_step_last_step) if secret else None
        if step is not None:
            user.two_step_last_step = step
            method = "app"

    if method is None:
        user.two_step_failures = (user.two_step_failures or 0) + 1
        if user.two_step_failures % MAX_FAILURES == 0:
            user.two_step_locked_until = now + timedelta(minutes=LOCK_MINUTES)
    else:
        user.two_step_failures = 0
        user.two_step_locked_until = None
    return method


def just_locked(user: User, now: datetime) -> bool:
    return user.two_step_failures % MAX_FAILURES == 0 and locked_minutes(user, now) > 0


def turn_off(user: User) -> None:
    user.totp_secret = None
    user.two_step_enabled_at = None
    user.two_step_last_step = None
    user.two_step_failures = 0
    user.two_step_locked_until = None
    user.recovery_codes = None
