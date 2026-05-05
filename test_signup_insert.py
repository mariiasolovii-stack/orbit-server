import os
import psycopg2
import psycopg2.extras
import json
import traceback

DATABASE_URL = 'postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'

def test_insert():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # Mock data similar to what the form sends
        name = "Test User"
        email = "test@college.harvard.edu"
        phone = "1234567890"
        team_name = "Test Team"
        team_secret_code = "123456"
        teammates = [{"name": "Friend", "email": "friend@college.harvard.edu", "phone": "0987654321"}]
        class_year = "Freshman"
        ip_address = "127.0.0.1"
        user_agent = "TestAgent"
        all_team_phones = ["1234567890", "0987654321"]

        print("Attempting test insertion...")
        cur.execute("""
            INSERT INTO waitlist
              (name, email, phone, team_name, team_secret_code, teammates, class_year, ip_address, user_agent, all_phone_numbers)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            name, email.lower(), phone, team_name, team_secret_code,
            json.dumps(teammates), class_year,
            ip_address, user_agent,
            all_team_phones
        ))
        conn.commit()
        print("✅ Insertion successful!")
        
        # Clean up
        cur.execute("DELETE FROM waitlist WHERE email = %s", (email,))
        conn.commit()
        
    except Exception as e:
        print("❌ Insertion failed!")
        print(f"Error: {e}")
        print(traceback.format_exc())
    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()

if __name__ == "__main__":
    test_insert()
