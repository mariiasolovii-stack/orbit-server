import os
import psycopg2

DATABASE_URL = 'postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'

def fix_constraints():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        legacy_columns = [
            't1_email', 't1_phone', 't1_name',
            't2_email', 't2_phone', 't2_name',
            't3_email', 't3_phone', 't3_name'
        ]
        
        print("Removing NOT NULL constraints from legacy columns...")
        for col in legacy_columns:
            try:
                cur.execute(f"ALTER TABLE waitlist ALTER COLUMN {col} DROP NOT NULL")
                print(f"✅ Dropped NOT NULL for {col}")
            except Exception as e:
                print(f"⚠️ Could not drop for {col} (might not exist or already dropped): {e}")
                conn.rollback()
                cur = conn.cursor()
        
        conn.commit()
        cur.close()
        conn.close()
        print("Constraint fix complete!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fix_constraints()
