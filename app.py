import os
import re
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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
            t1_email        TEXT NOT NULL,
            t1_phone        TEXT NOT NULL,
            t2_email        TEXT,
            t2_phone        TEXT,
            t3_email        TEXT,
            t3_phone        TEXT,
            ip_address      TEXT,
            user_agent      TEXT,
            confirmed       BOOLEAN NOT NULL DEFAULT FALSE
        )
    """)
    conn.commit()
    cur.close()
    conn.close()
    logging.info("Database initialized.")

# Email
SMTP_HOST     = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT     = int(os.environ.get('SMTP_PORT', '587'))
SMTP_USER     = os.environ.get('SMTP_USER', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
FROM_EMAIL    = os.environ.get('FROM_EMAIL', SMTP_USER)
FROM_NAME     = os.environ.get('FROM_NAME', 'orbit')

def send_confirmation_email(to_email, name, team_name):
    if not SMTP_USER or not SMTP_PASSWORD:
        logging.warning("SMTP credentials not configured - skipping email.")
        return

    subject = "you're on the waitlist. your side quest drops soon."

    html_body = """<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:0}
.wrap{max-width:480px;margin:0 auto;padding:48px 32px}
.logo{font-size:20px;font-weight:700;letter-spacing:.06em;color:rgba(255,255,255,.7);margin-bottom:40px}
h1{font-size:28px;font-weight:800;letter-spacing:-.5px;margin-bottom:16px}
p{font-size:16px;color:rgba(255,255,255,.55);line-height:1.7;margin-bottom:12px}
.tag{font-size:13px;color:rgba(255,255,255,.25);margin-top:40px}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">orbit &#10022;</div>
  <h1>you're on the waitlist.</h1>
  <p>hey """ + name + """ &mdash; your team <strong style="color:#fff">""" + team_name + """</strong> is locked in.</p>
  <p>your side quest drops soon.</p>
  <p>stay close.</p>
  <p class="tag">&#10022; orbit &nbsp;&middot;&nbsp; amazing race harvard</p>
</div>
</body>
</html>"""

    text_body = f"""orbit

you're on the waitlist.

hey {name} - your team "{team_name}" is locked in.
your side quest drops soon.
stay close.

orbit - amazing race harvard
"""

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = f'{FROM_NAME} <{FROM_EMAIL}>'
    msg['To']      = to_email
    msg.attach(MIMEText(text_body, 'plain'))
    msg.attach(MIMEText(html_body, 'html'))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(FROM_EMAIL, [to_email], msg.as_string())
        logging.info(f"Confirmation email sent to {to_email}")
    except Exception as e:
        logging.error(f"Failed to send email to {to_email}: {e}")

# Validation
HARVARD_DOMAINS = ('@college.harvard.edu', '@harvard.edu')

def is_harvard_email(email):
    if not email:
        return False
    lower = email.lower().strip()
    return any(lower.endswith(d) for d in HARVARD_DOMAINS)

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/signup')
def signup():
    return render_template('signup.html')

@app.route('/thankyou')
def thankyou():
    return render_template('thankyou.html')

@app.route('/api/signup', methods=['POST'])
def api_signup():
    data = request.get_json(force=True, silent=True) or {}

    name      = (data.get('name') or '').strip()
    email     = (data.get('email') or '').strip()
    phone     = (data.get('phone') or '').strip()
    team_name = (data.get('team_name') or '').strip()
    t1_email  = (data.get('t1_email') or '').strip()
    t1_phone  = (data.get('t1_phone') or '').strip()
    t2_email  = (data.get('t2_email') or '').strip() or None
    t2_phone  = (data.get('t2_phone') or '').strip() or None
    t3_email  = (data.get('t3_email') or '').strip() or None
    t3_phone  = (data.get('t3_phone') or '').strip() or None

    if not name:
        return jsonify({'success': False, 'error': 'Name is required.'}), 400
    if not is_harvard_email(email):
        return jsonify({'success': False, 'error': 'Must use a @college.harvard.edu or @harvard.edu email.'}), 400
    if not phone:
        return jsonify({'success': False, 'error': 'Phone number is required.'}), 400
    if not team_name:
        return jsonify({'success': False, 'error': 'Team name is required.'}), 400
    if not is_harvard_email(t1_email):
        return jsonify({'success': False, 'error': 'Teammate 1 must have a Harvard email.'}), 400
    if not t1_phone:
        return jsonify({'success': False, 'error': 'Teammate 1 phone is required.'}), 400
    if t2_email and not is_harvard_email(t2_email):
        return jsonify({'success': False, 'error': 'Teammate 2 must have a Harvard email if provided.'}), 400
    if t3_email and not is_harvard_email(t3_email):
        return jsonify({'success': False, 'error': 'Teammate 3 must have a Harvard email if provided.'}), 400

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
              (name, email, phone, team_name,
               t1_email, t1_phone,
               t2_email, t2_phone,
               t3_email, t3_phone,
               ip_address, user_agent)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            name, email.lower(), phone, team_name,
            t1_email.lower(), t1_phone,
            t2_email.lower() if t2_email else None, t2_phone,
            t3_email.lower() if t3_email else None, t3_phone,
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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=False)
