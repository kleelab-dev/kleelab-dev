"""UTC time helpers that match the database's timestamp columns."""

from datetime import datetime, timezone

__all__ = ["utcnow"]


def utcnow() -> datetime:
    """Return the current UTC time as a timezone-naive datetime.

    Every timestamp column in the schema is ``TIMESTAMP WITHOUT TIME ZONE`` and
    asyncpg rejects timezone-aware values for those columns with
    ``DataError: can't subtract offset-naive and offset-aware datetimes``.
    Returning a naive UTC value keeps every write and comparison consistent with
    the schema without needing a migration to move the columns to ``timestamptz``.
    """

    return datetime.now(timezone.utc).replace(tzinfo=None)
