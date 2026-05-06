import os
import psycopg2

DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'
)

def rename():
    print("🚀 Renaming top teams to rugged names...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # Get the top 10 unique team names currently in the DB
    cur.execute("""
        SELECT team_name, SUM(stars_awarded) as total_stars
        FROM quest_completions
        WHERE status = 'approved'
        GROUP BY team_name
        ORDER BY total_stars DESC
        LIMIT 10
    """)
    top_teams = cur.fetchall()
    
    rugged_names = ["GENED WIDOW", "Baiguzhanki", "KarakasBro", "Barbell", "The Crimson Ghosts", "Veritas Vultures", "Final Club Rejects", "Yardlings", "Stat 110 Survivors", "The 1636 Squad"]
    
    for i, (old_name, _) in enumerate(top_teams):
        if i < len(rugged_names):
            new_name = rugged_names[i]
            print(f"Renaming '{old_name}' to '{new_name}'...")
            
            # Update waitlist
            cur.execute("UPDATE waitlist SET team_name = %s WHERE team_name = %s", (new_name, old_name))
            
            # Update quest_completions
            cur.execute("UPDATE quest_completions SET team_name = %s WHERE team_name = %s", (new_name, old_name))
            
    conn.commit()
    cur.close()
    conn.close()
    print("✅ Done.")

if __name__ == "__main__":
    rename()
