import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, request, jsonify

application = Flask(__name__)
app = application

NEON_URL = os.environ.get("NEON_URL", "postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require")

def get_db():
    return psycopg2.connect(NEON_URL, cursor_factory=RealDictCursor)

def normalize_phone(phone):
    if not phone:
        return None
    digits = ''.join(filter(str.isdigit, str(phone)))
    if len(digits) == 10:
        return '+1' + digits
    elif len(digits) == 11 and digits.startswith('1'):
        return '+' + digits
    elif len(digits) > 6:
        return '+' + digits
    return None

@app.route('/')
def index():
    try:
        with open('index.html', 'r') as f:
            return f.read()
    except:
        return 'orbit 🪐'

@app.route('/save_orbit', methods=['POST'])
def save_orbit():
    data = request.json
    phone = normalize_phone(data.get('phone', ''))
    if not phone:
        return jsonify({'error': 'missing phone'}), 400
    orbit_name = data.get('orbit_name', 'my orbit').lower().replace(' ', '_').strip()
    digits_only = ''.join(filter(str.isdigit, orbit_name))
    if len(digits_only) >= 10:
        return jsonify({'error': 'invalid orbit name'}), 400
    contact_names = data.get('contacts', [])
    contact_phones = data.get('phones', [])
    if isinstance(contact_names, str):
        contact_names = [n.strip() for n in contact_names.split('\n') if n.strip()]
    if isinstance(contact_phones, str):
        contact_phones = [p.strip() for p in contact_phones.split('\n') if p.strip()]
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT INTO users (phone) VALUES (%s) ON CONFLICT (phone) DO NOTHING", (phone,))
        cur.execute("""
            INSERT INTO orbits (user_phone, orbit_name)
            VALUES (%s, %s)
            ON CONFLICT (user_phone, orbit_name) DO UPDATE SET orbit_name = EXCLUDED.orbit_name
            RETURNING id
        """, (phone, orbit_name))
        orbit_id = cur.fetchone()['id']
        cur.execute("DELETE FROM contacts WHERE orbit_id = %s", (orbit_id,))
        for i, name in enumerate(contact_names):
            p = contact_phones[i] if i < len(contact_phones) else None
            normalized_p = normalize_phone(p) if p else None
            cur.execute("INSERT INTO contacts (orbit_id, name, phone) VALUES (%s, %s, %s)",
                (orbit_id, name, normalized_p))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'orbit': orbit_name, 'count': len(contact_names)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get_orbits')
def get_orbits():
    phone = normalize_phone(request.args.get('phone', '').replace(' ', '+'))
    if not phone:
        return jsonify({'orbits': {}})
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT o.orbit_name,
                   json_agg(json_build_object('name', c.name, 'phone', c.phone)) as contacts
            FROM orbits o
            LEFT JOIN contacts c ON c.orbit_id = o.id
            WHERE o.user_phone = %s
            GROUP BY o.orbit_name
        """, (phone,))
        rows = cur.fetchall()
        conn.close()
        result = {}
        for row in rows:
            contacts = row['contacts'] if row['contacts'] != [None] else []
            result[row['orbit_name']] = contacts
        return jsonify({'orbits': result})
    except Exception as e:
        return jsonify({'orbits': {}, 'error': str(e)})

@app.route('/debug')
def debug():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT phone, step, name FROM users")
        users = [dict(r) for r in cur.fetchall()]
        cur.execute("SELECT user_phone, orbit_name FROM orbits")
        orbits = [dict(r) for r in cur.fetchall()]
        cur.execute("SELECT name, phone FROM contacts LIMIT 20")
        contacts = [dict(r) for r in cur.fetchall()]
        conn.close()
        return jsonify({'users': users, 'orbits': orbits, 'contacts': contacts})
    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/add_to_orbit', methods=['POST'])
def add_to_orbit():
    data = request.json
    phone = normalize_phone(data.get('phone', ''))
    if not phone:
        return jsonify({'error': 'missing phone'}), 400
    orbit_name = data.get('orbit_name', '').lower().replace(' ', '_').strip()
    if not orbit_name:
        return jsonify({'error': 'missing orbit name'}), 400
    contact_names = data.get('contacts', [])
    contact_phones = data.get('phones', [])
    if isinstance(contact_names, str):
        contact_names = [n.strip() for n in contact_names.split('\n') if n.strip()]
    if isinstance(contact_phones, str):
        contact_phones = [p.strip() for p in contact_phones.split('\n') if p.strip()]
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT INTO users (phone) VALUES (%s) ON CONFLICT (phone) DO NOTHING", (phone,))
        cur.execute("""
            INSERT INTO orbits (user_phone, orbit_name)
            VALUES (%s, %s)
            ON CONFLICT (user_phone, orbit_name) DO UPDATE SET orbit_name = EXCLUDED.orbit_name
            RETURNING id
        """, (phone, orbit_name))
        orbit_id = cur.fetchone()['id']
        added = 0
        for i, name in enumerate(contact_names):
            p = contact_phones[i] if i < len(contact_phones) else None
            normalized_p = normalize_phone(p) if p else None
            cur.execute("""
                INSERT INTO contacts (orbit_id, name, phone)
                VALUES (%s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (orbit_id, name, normalized_p))
            added += 1
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'orbit': orbit_name, 'added': added})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/list_orbits')
def list_orbits():
    phone = normalize_phone(request.args.get('phone', '').replace(' ', '+'))
    if not phone:
        return jsonify({'orbits': []})
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT orbit_name FROM orbits WHERE user_phone = %s", (phone,))
        rows = cur.fetchall()
        conn.close()
        return jsonify({'orbits': [r['orbit_name'].replace('_', ' ') for r in rows]})
    except Exception as e:
        return jsonify({'orbits': [], 'error': str(e)})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))