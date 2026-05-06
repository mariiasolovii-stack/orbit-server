import os
import random
import psycopg2
from datetime import datetime, timedelta

DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'
)

def simulate():
    print("🚀 Simulating BELIEVABLE leaderboard...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # 1. Clear existing completions
    print("Clearing old completions...")
    cur.execute("DELETE FROM quest_completions")
    
    # 2. Get all active teams
    cur.execute("SELECT team_name, created_at FROM waitlist WHERE is_active = TRUE")
    teams = cur.fetchall()
    
    quest_ids = [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106]
    
    rugged_names = ["GENED WIDOW", "Baiguzhanki", "KarakasBro", "Barbell", "The Crimson Ghosts", "Veritas Vultures", "Final Club Rejects", "Yardlings", "Stat 110 Survivors", "The 1636 Squad"]
    
    for team in teams:
        t_name = team[0]
        signup_time = team[1]
        
        # Determine activity level
        if t_name in rugged_names:
            # Top teams: 5-8 quests, 8-20 stars
            num_quests = random.randint(5, 8)
        else:
            # Other teams: 0-4 quests, 0-10 stars
            num_quests = random.choices([0, 1, 2, 3, 4], weights=[20, 30, 25, 15, 10])[0]
            
        used_quests = random.sample(quest_ids, min(num_quests, len(quest_ids)))
        
        for q_id in used_quests:
            stars = random.randint(1, 3)
            comp_time = signup_time + timedelta(days=random.randint(1, 6), hours=random.randint(0, 23))
            if comp_time > datetime.now():
                comp_time = datetime.now() - timedelta(minutes=random.randint(1, 60))
                
            cur.execute("""
                INSERT INTO quest_completions (team_name, quest_id, status, stars_awarded, created_at)
                VALUES (%s, %s, 'approved', %s, %s)
            """, (t_name, q_id, stars, comp_time))
            
    conn.commit()
    cur.close()
    conn.close()
    print("✅ Believable simulation complete.")

if __name__ == "__main__":
    simulate()
