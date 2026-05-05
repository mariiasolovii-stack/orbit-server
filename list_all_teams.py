import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = "postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require"

def list_teams():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT team_name, all_phone_numbers FROM waitlist LIMIT 20")
        teams = cur.fetchall()
        for team in teams:
            print(f"Team: {team['team_name']} | Phones: {team['all_phone_numbers']}")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_teams()
