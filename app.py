import os
import re
import logging
import threading
import time
import requests as http_requests
from datetime import datetime

import psycopg2
import psycopg2.extras
from flask import Flask, request, jsonify, render_template, send_from_directory

application = Flask(__name__, template_folder='templates', static_folder='static')
app = application
logging.basicConfig(level=logging.INFO)

# Database
DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'
)

def get_db():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS waitlist (
            id              SERIAL PRIMARY KEY,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            name            TEXT NOT NULL,
            email           TEXT NOT NULL,
            phone           TEXT NOT NULL,
            team_name       TEXT NOT NULL,
            teammates       JSONB DEFAULT '[]',
            ip_address      TEXT,
            user_agent      TEXT,
            confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
            class_year      TEXT
        )""") """)
    # Migration: Add teammates column if it doesn't exist
    try:
        cur.execute("ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS teammates JSONB DEFAULT '[]'")
    except Exception:
        pass
    # Migration: Add class_year column if it doesn't exist
    try:
        cur.execute("ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS class_year TEXT")
    except Exception:
        pass
    # Add name columns if they don't exist yet (for existing tables)
    for col in ['t1_name', 't2_name', 't3_name']:
        try:
            cur.execute(f"ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS {col} TEXT")
        except Exception:
            pass
    # Make t1_phone optional if it was NOT NULL
    try:
        cur.execute("ALTER TABLE waitlist ALTER COLUMN t1_phone DROP NOT NULL")
    except Exception:
        pass
    cur.execute("""
        CREATE TABLE IF NOT EXISTS early_access (
            id          SERIAL PRIMARY KEY,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            name        TEXT,
            email       TEXT UNIQUE NOT NULL,
            phone       TEXT,
            ip_address  TEXT
        )
    """)
    # Add phone column if table already exists with old schema
    try:
        cur.execute("ALTER TABLE early_access ADD COLUMN IF NOT EXISTS phone TEXT")
    except Exception:
        pass
    # Remove school column reference gracefully (no-op if already gone)
    try:
        cur.execute("ALTER TABLE early_access DROP COLUMN IF EXISTS school")
    except Exception:
        pass
    cur.execute("""
        CREATE TABLE IF NOT EXISTS team_applications (
            id          SERIAL PRIMARY KEY,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            name        TEXT NOT NULL,
            email       TEXT UNIQUE NOT NULL,
            pitch       TEXT NOT NULL,
            ip_address  TEXT
        )
    """)
    conn.commit()
    cur.close()
    conn.close()
    logging.info("Database initialized.")

# ── Email via Resend ──
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
FROM_EMAIL     = os.environ.get('FROM_EMAIL', 'play@joinorbit.one')
FROM_NAME      = os.environ.get('FROM_NAME', 'Amazing Race Harvard')

def send_confirmation_email(to_email, name, team_name):
    if not RESEND_API_KEY:
        logging.warning("RESEND_API_KEY not configured — skipping confirmation email.")
        return

    subject = "you're on the Amazing Race Harvard waitlist"

    html_body = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You're on the waitlist</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 0">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <tr><td style="background-color:#0a0a0a;padding:32px 40px">
    <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.1em;color:rgba(255,255,255,0.6);text-transform:uppercase">ORBIT &#10022; AMAZING RACE HARVARD</p>
  </td></tr>
  <tr><td style="padding:40px">
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#0a0a0a;letter-spacing:-0.5px">you're on the waitlist.</h1>
    <p style="margin:0 0 12px;font-size:16px;color:#444;line-height:1.7">hey """ + name + """ &mdash; your team <strong style="color:#0a0a0a">""" + team_name + """</strong> is locked in.</p>
    <p style="margin:0 0 12px;font-size:16px;color:#444;line-height:1.7">your side quest drops soon. seven days, infinite challenges, earn stars to win.</p>
    <p style="margin:0 0 32px;font-size:16px;color:#444;line-height:1.7">stay close.</p>
    <table cellpadding="0" cellspacing="0">
      <tr><td style="background-color:#0a0a0a;border-radius:8px;padding:14px 28px">
        <a href="https://joinorbit.one" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.02em">visit joinorbit.one</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:24px 40px;border-top:1px solid #f0f0f0">
    <p style="margin:0;font-size:12px;color:#aaa">&#10022; orbit &middot; amazing race harvard &middot; <a href="https://joinorbit.one" style="color:#aaa">joinorbit.one</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""

    text_body = f"""orbit ✦

you're on the waitlist.

hey {name} — your team "{team_name}" is locked in.
your side quest drops soon.
stay close.

✦ orbit · amazing race harvard
"""

    payload = {
        "from": f"{FROM_NAME} <{FROM_EMAIL}>",
        "to": [to_email],
        "reply_to": FROM_EMAIL,
        "subject": subject,
        "html": html_body,
        "text": text_body,
        "headers": {
            "X-Entity-Ref-ID": f"orbit-waitlist-{to_email}",
        },
    }

    try:
        resp = http_requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        if resp.status_code in (200, 201):
            logging.info(f"Confirmation email sent to {to_email} via Resend (id={resp.json().get('id')})")
        else:
            logging.error(f"Resend error {resp.status_code}: {resp.text}")
    except Exception as e:
        logging.error(f"Failed to send email to {to_email}: {e}")

# Validation
HARVARD_DOMAINS = ('@college.harvard.edu', '@harvard.edu')

def is_harvard_email(email):
    if not email:
        return False
    lower = email.lower().strip()
    # Relaxed: any .harvard.edu address is fine
    return lower.endswith('.harvard.edu') or lower.endswith('@harvard.edu')

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/signup')
def signup():
    return render_template('signup.html')

@app.route('/freshmen')
def freshmen():
    return render_template('freshmen.html')

@app.route('/sophomore')
def sophomore():
    return render_template('sophomore.html')

@app.route('/junior')
def junior():
    return render_template('junior.html')

@app.route('/senior')
def senior():
    return render_template('senior.html')

@app.route('/thankyou')
def thankyou():
    return render_template('thankyou.html')

@app.route('/layout-preview')
def layout_preview():
    return render_template('layout_preview.html')

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/join')
def join():
    return render_template('join.html')

@app.route('/api/join', methods=['POST'])
def api_join():
    data  = request.get_json(force=True, silent=True) or {}
    name  = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    pitch = (data.get('pitch') or '').strip()

    if not name:
        return jsonify({'success': False, 'error': 'Name is required.'}), 400
    if not email or '@' not in email:
        return jsonify({'success': False, 'error': 'A valid email is required.'}), 400
    if not pitch:
        return jsonify({'success': False, 'error': 'Please tell us why you\'re interested.'}), 400

    try:
        ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO team_applications (name, email, pitch, ip_address) VALUES (%s, %s, %s, %s) ON CONFLICT (email) DO NOTHING",
            (name, email.lower(), pitch, ip_address)
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'success': True}), 201
    except Exception as e:
        logging.error(f"Join team DB error: {e}")
        return jsonify({'success': False, 'error': 'Database error. Please try again.'}), 500

@app.route('/api/early-access', methods=['POST'])
def api_early_access():
    data = request.get_json(force=True, silent=True) or {}
    name  = (data.get('name') or '').strip() or None
    email = (data.get('email') or '').strip()
    phone = (data.get('phone') or '').strip() or None

    if not email or '@' not in email:
        return jsonify({'success': False, 'error': 'A valid email is required.'}), 400

    try:
        ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO early_access (name, email, phone, ip_address) VALUES (%s, %s, %s, %s) ON CONFLICT (email) DO NOTHING",
            (name, email.lower(), phone, ip_address)
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'success': True}), 201
    except Exception as e:
        logging.error(f"Early access DB error: {e}")
        return jsonify({'success': False, 'error': 'Database error. Please try again.'}), 500

import json

@app.route('/api/signup', methods=['POST'])
def api_signup():
    data = request.get_json(force=True, silent=True) or {}

    name      = (data.get('name') or '').strip()
    email     = (data.get('email') or '').strip()
    phone     = (data.get('phone') or '').strip()
    team_name = (data.get('team_name') or '').strip()
    class_year = (data.get('class_year') or '').strip()
    teammates = data.get('teammates') or []

    if not name:
        return jsonify({'success': False, 'error': 'Name is required.'}), 400
    if not is_harvard_email(email):
        return jsonify({'success': False, 'error': 'Must use a Harvard email address.'}), 400
    # Accept any phone format — just need at least 10 digits
    phone_digits = re.sub(r'\D', '', phone)
    if len(phone_digits) < 10:
        return jsonify({'success': False, 'error': 'Please enter a valid phone number (at least 10 digits).'}), 400
    if not team_name:
        return jsonify({'success': False, 'error': 'Team name is required.'}), 400
    
    # Validate teammates
    for i, tm in enumerate(teammates):
        tm_email = (tm.get('email') or '').strip()
        if tm_email and not is_harvard_email(tm_email):
            return jsonify({'success': False, 'error': f'Teammate {i+1} must have a Harvard email if provided.'}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id FROM waitlist WHERE email = %s", (email.lower(),))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'success': False, 'error': 'This email is already on the waitlist.'}), 409
    except Exception as e:
        logging.error(f"DB duplicate check error: {e}")
        return jsonify({'success': False, 'error': 'Database error. Please try again.'}), 500

    try:
        ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
        user_agent = request.headers.get('User-Agent', '')

        cur.execute("""
            INSERT INTO waitlist
              (name, email, phone, team_name, teammates, class_year, ip_address, user_agent)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            name, email.lower(), phone, team_name,
            json.dumps(teammates), class_year,
            ip_address, user_agent
        ))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        logging.error(f"DB insert error: {e}")
        return jsonify({'success': False, 'error': 'Database error. Please try again.'}), 500

    send_confirmation_email(email, name, team_name)

    return jsonify({'success': True}), 201

@app.route('/admin/signups')
def admin_signups():
    secret = request.args.get('secret', '')
    admin_secret = os.environ.get('ADMIN_SECRET', '')
    if admin_secret and secret != admin_secret:
        return jsonify({'error': 'Unauthorized'}), 401
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM waitlist ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({'count': len(rows), 'signups': [dict(r) for r in rows]})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'timestamp': datetime.utcnow().isoformat()})

try:
    init_db()
except Exception as e:
    logging.error(f"Could not initialize DB on startup: {e}")

# ── Self-ping keep-alive (prevents Render free tier cold starts) ──
def _keep_alive():
    # Wait 30s after startup before first ping
    time.sleep(30)
    url = os.environ.get('RENDER_EXTERNAL_URL', 'https://orbit-server-90x3.onrender.com') + '/health'
    while True:
        try:
            http_requests.get(url, timeout=10)
            logging.info(f"Keep-alive ping sent to {url}")
        except Exception as e:
            logging.warning(f"Keep-alive ping failed: {e}")
        time.sleep(4 * 60)  # ping every 4 minutes

_t = threading.Thread(target=_keep_alive, daemon=True)
_t.start()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=False)
# Force redeploy - class year segmentation
