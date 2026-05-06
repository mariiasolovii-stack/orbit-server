import os
import json
import random
import psycopg2
from datetime import datetime, timedelta

DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'
)

def populate():
    print("🚀 Starting RUGGED Population V8...")
    with open("real_students.json", "r") as f:
        all_students = json.load(f)
    
    random.shuffle(all_students)
    
    num_teams = 312
    houses = ["Dunster", "Lowell", "Adams", "Quincy", "Leverett", "Mather", "Kirkland", "Winthrop", "Eliot", "Cabot", "Currier", "Pfoho"]
    nouns = ["Wolves", "Scholars", "Runners", "Ghosts", "Legends", "Pioneers", "Hustlers", "Grinders", "Dreamers", "Orbiters"]
    quest_ids = [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106]

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    print("Clearing...")
    cur.execute("DELETE FROM quest_completions")
    cur.execute("DELETE FROM waitlist WHERE email LIKE '%@college.harvard.edu'")
    conn.commit()
    
    student_idx = 0
    for i in range(num_teams):
        team_size = random.choices([1, 2, 3, 4, 5], weights=[5, 15, 50, 20, 10])[0]
        members = all_students[student_idx : student_idx + team_size]
        student_idx += team_size
        if not members: break
        
        captain = members[0]
        teammates = members[1:]
        t_name = f"{random.choice(houses)} {random.choice(nouns)}"
        
        year = captain['year']
        phone = f"+1{random.randint(6000000000, 6999999999)}"
        teammate_json = json.dumps([{"name": tm['name'], "phone": f"+1{random.randint(6000000000, 6999999999)}"} for tm in teammates])
        all_phones = [phone] + [f"+1{random.randint(6000000000, 6999999999)}" for _ in teammates]
        signup_time = datetime.now() - timedelta(days=random.randint(7, 10), hours=random.randint(0, 23))
        
        try:
            cur.execute("""
                INSERT INTO waitlist (name, email, phone, team_name, teammates, class_year, all_phone_numbers, confirmed, is_active, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, TRUE, %s)
                ON CONFLICT (email) DO NOTHING
            """, (captain['name'], captain['email'], phone, t_name, teammate_json, year, all_phones, signup_time))
            
            # Completions
            activity = random.randint(1, 8)
            for _ in range(activity):
                q_id = random.choice(quest_ids)
                status = 'approved'
                stars = random.randint(1, 3)
                comp_time = signup_time + timedelta(days=random.randint(1, 6), hours=random.randint(0, 23))
                cur.execute("INSERT INTO quest_completions (team_name, quest_id, status, stars_awarded, created_at) VALUES (%s, %s, %s, %s, %s)", (t_name, q_id, status, stars, comp_time))
            
            conn.commit()
            if i % 10 == 0:
                print(f"Processed {i} teams...")
        except Exception as e:
            print(f"Error on team {i}: {e}. Reconnecting...")
            try:
                conn.rollback()
            except:
                pass
            conn = psycopg2.connect(DATABASE_URL)
            cur = conn.cursor()
            
    cur.close()
    conn.close()
    print("✅ Done.")

if __name__ == "__main__":
    populate()
