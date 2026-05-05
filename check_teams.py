import psycopg2
from psycopg2.extras import RealDictCursor
import os

DATABASE_URL = 'postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'

try:
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    cur = conn.cursor()
    cur.execute('SELECT id, team_name, is_active FROM waitlist')
    rows = cur.fetchall()
    print(f'Total teams: {len(rows)}')
    for r in rows:
        print(r)
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
