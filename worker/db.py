import os
import uuid

import psycopg
from psycopg.rows import dict_row


def connect() -> psycopg.Connection:
    """Autocommit: each statement commits on its own; multi-row writes use conn.transaction()."""
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row, autocommit=True)


def new_id() -> str:
    return "w" + uuid.uuid4().hex
