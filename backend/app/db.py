import os
import psycopg
from psycopg.rows import dict_row
from pgvector.psycopg import register_vector


def get_conn():
    conn = psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)
    register_vector(conn)
    return conn
