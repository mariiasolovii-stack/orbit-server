import os
import psycopg2
import psycopg2.extras

DATABASE_URL = 'postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'

def fix():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        print("Checking waitlist table columns...")
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'waitlist'")
        columns = [row[0] for row in cur.fetchall()]
        print(f"Current columns: {columns}")
        
        # Ensure all required columns exist
        required_columns = [
            ('all_phone_numbers', 'TEXT[] DEFAULT \'{}\''),
            ('user_agent', 'TEXT'),
            ('ip_address', 'TEXT'),
            ('class_year', 'TEXT'),
            ('team_secret_code', 'TEXT'),
            ('is_active', 'BOOLEAN DEFAULT TRUE')
        ]
        
        for col_name, col_type in required_columns:
            if col_name not in columns:
                print(f"Adding missing column: {col_name}")
                cur.execute(f"ALTER TABLE waitlist ADD COLUMN {col_name} {col_type}")
        
        # Check if email is unique
        print("Ensuring email is unique...")
        try:
            cur.execute("ALTER TABLE waitlist ADD CONSTRAINT waitlist_email_key UNIQUE (email)")
        except Exception as e:
            print(f"Note: Email constraint might already exist or there are duplicates: {e}")
            conn.rollback()
            cur = conn.cursor()

        conn.commit()
        cur.close()
        conn.close()
        print("Database fix complete!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fix()
