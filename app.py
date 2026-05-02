# -*- coding: utf-8 -*-
import os
import re
import logging
import traceback
import threading
import time
import random
import string
import requests
from datetime import datetime
from werkzeug.utils import secure_filename

import psycopg2
import psycopg2.extras
from flask import Flask, request, jsonify, render_template, send_from_directory, redirect, url_for

application = Flask(__name__, template_folder='templates', static_folder='static')
app = application
logging.basicConfig(level=logging.INFO)

# Configuration
UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'mov', 'webm'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Database
DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'
)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def generate_secret_code(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

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
            class_year      TEXT,
            team_secret_code TEXT,
            is_active BOOLEAN DEFAULT TRUE
        )""")
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
    # Migration: Add team_secret_code column if it doesn't exist
    try:
        cur.execute("ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS team_secret_code TEXT")
    except Exception:
        pass
    # Migration: Add is_active column if it doesn't exist
    try:
        cur.execute("ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE")
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
    # Update quest_completions status to pending
    try:
        cur.execute("ALTER TABLE quest_completions ALTER COLUMN status SET DEFAULT 'pending'")
    except Exception:
        pass
    # Migration: Add stars_awarded to quest_completions
    try:
        cur.execute("ALTER TABLE quest_completions ADD COLUMN IF NOT EXISTS stars_awarded INTEGER DEFAULT 0")
    except Exception:
        pass
    # Migration: Add consent columns to quest_completions
    try:
        cur.execute("ALTER TABLE quest_completions ADD COLUMN IF NOT EXISTS consent_under_21 BOOLEAN DEFAULT FALSE")
        cur.execute("ALTER TABLE quest_completions ADD COLUMN IF NOT EXISTS consent_promo BOOLEAN DEFAULT FALSE")
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
    cur.execute("""
        CREATE TABLE IF NOT EXISTS quests (
            id          SERIAL PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT NOT NULL,
            stars       INTEGER NOT NULL,
            class_year  TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS quest_completions (
            id          SERIAL PRIMARY KEY,
            team_name   TEXT NOT NULL,
            quest_id    INTEGER REFERENCES quests(id),
            photo_url   TEXT,
            status      TEXT NOT NULL DEFAULT 'pending',
            stars_awarded INTEGER DEFAULT 0,
            consent_under_21 BOOLEAN DEFAULT FALSE,
            consent_promo BOOLEAN DEFAULT FALSE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS game_schedule (
            id          SERIAL PRIMARY KEY,
            game_name   TEXT NOT NULL,
            start_date  DATE NOT NULL,
            end_date    DATE NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS quest_batches (
            id          SERIAL PRIMARY KEY,
            game_id     INTEGER REFERENCES game_schedule(id),
            batch_num   INTEGER NOT NULL,
            release_date TIMESTAMPTZ NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS message_log (
            id          SERIAL PRIMARY KEY,
            team_name   TEXT NOT NULL,
            event_type  TEXT NOT NULL,
            message_text TEXT,
            phone_numbers TEXT[],
            status      TEXT DEFAULT 'pending',
            sent_at     TIMESTAMPTZ,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    conn.commit()
    cur.close()
    conn.close()
    logging.info("Database initialized.")

with app.app_context():
    init_db()

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
<title>Waitlist Confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 0">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <tr><td style="background-color:#0a0a0a;padding:32px 40px">
    <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.1em;color:rgba(255,255,255,0.6);text-transform:uppercase">ORBIT AMAZING RACE HARVARD</p>
  </td></tr>
  <tr><td style="padding:40px">
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#0a0a0a;letter-spacing:-0.5px">you are on the waitlist.</h1>
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
    <p style="margin:0;font-size:12px;color:#aaa">orbit &middot; amazing race harvard &middot; <a href="https://joinorbit.one" style="color:#aaa">joinorbit.one</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""

    text_body = f"""orbit *

you are on the waitlist.

hey {name} - your team "{team_name}" is locked in.
your side quest drops soon.
stay close.

* orbit . amazing race harvard
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
        resp = requests.post(
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
    return render_template('welcome.html')

@app.route('/gate')
def gate():
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

@app.route('/team/<team_name>')
def team_portal(team_name):
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Get team info
        cur.execute("SELECT name, teammates, class_year FROM waitlist WHERE team_name = %s", (team_name,))
        team = cur.fetchone()
        if not team:
            cur.close()
            conn.close()
            return "Team not found", 404
            
        members = [team['name']]
        if team['teammates']:
            for tm in team['teammates']:
                if tm.get('name'):
                    members.append(tm['name'])
        
        # Get completions
        cur.execute("""
            SELECT qc.*, q.name as quest_name, q.stars as default_stars
            FROM quest_completions qc
            JOIN quests q ON qc.quest_id = q.id
            WHERE qc.team_name = %s AND qc.status = 'approved'
            ORDER BY qc.created_at DESC
        """, (team_name,))
        completions = cur.fetchall()
        
        total_stars = sum(c['stars_awarded'] for c in completions)
        
        cur.close()
        conn.close()
        
        return render_template('team_portal.html', 
                             team_name=team_name, 
                             members=members, 
                             member_count=len(members),
                             completions=completions,
                             completed_count=len(completions),
                             total_stars=total_stars)
    except Exception as e:
        logging.error(f"Team portal error: {e}")
        return "Internal server error", 500

@app.route('/submit')
def submit_quest():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, name, stars FROM quests ORDER BY stars ASC")
        quests = cur.fetchall()
        cur.close()
        conn.close()
        return render_template('submit_quest.html', quests=quests)
    except Exception as e:
        logging.error(f"Submit quest page error: {e}")
        return "Internal server error", 500

@app.route('/leaderboard')
def leaderboard():
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Get all teams and their stars
        cur.execute("""
            SELECT w.team_name, w.class_year, COALESCE(SUM(qc.stars_awarded), 0) as total_stars
            FROM waitlist w
            LEFT JOIN quest_completions qc ON w.team_name = qc.team_name AND qc.status = 'approved'
            GROUP BY w.team_name, w.class_year
            ORDER BY total_stars DESC, w.team_name ASC
        """)
        leaderboard_data = cur.fetchall()
        
        # Class breakdown
        class_breakdown = {}
        for row in leaderboard_data:
            cy = row['class_year'] or 'unknown'
            class_breakdown[cy] = class_breakdown.get(cy, 0) + row['total_stars']
            
        winning_class = max(class_breakdown, key=class_breakdown.get) if class_breakdown else None
        
        cur.close()
        conn.close()
        
        return render_template('leaderboard.html', 
                             leaderboard=leaderboard_data,
                             class_breakdown=class_breakdown,
                             winning_class=winning_class)
    except Exception as e:
        logging.error(f"Leaderboard error: {e}")
        return "Internal server error", 500

@app.route('/admin/quests')
def admin_quests():
    secret = request.args.get('secret', '')
    admin_secret = os.environ.get('ADMIN_SECRET', '')
    if admin_secret and secret != admin_secret:
        return "Unauthorized", 401
        
    try:
        conn = get_db()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT qc.*, q.name as quest_name, q.stars 
            FROM quest_completions qc
            JOIN quests q ON qc.quest_id = q.id
            ORDER BY qc.created_at DESC
        """)
        submissions = cur.fetchall()
        
        cur.execute("SELECT COUNT(*) FROM quest_completions WHERE status = 'pending'")
        pending_count = cur.fetchone()['count']
        
        cur.execute("SELECT COUNT(*) FROM quest_completions WHERE status = 'approved'")
        approved_count = cur.fetchone()['count']
        
        cur.execute("SELECT COUNT(DISTINCT team_name) FROM waitlist")
        total_teams = cur.fetchone()['count']
        
        cur.close()
        conn.close()
        
        return render_template('admin_quests.html', 
                             submissions=submissions,
                             pending_count=pending_count,
                             approved_count=approved_count,
                             total_teams=total_teams)
    except Exception as e:
        logging.error(f"Admin quests error: {e}")
        return "Internal server error", 500

@app.route('/api/submit-quest', methods=['POST'])
def api_submit_quest():
    team_name = request.form.get('team_name', '').strip()
    secret_code = request.form.get('secret_code', '').strip()
    quest_id = request.form.get('quest_id')
    file = request.files.get('evidence')
    
    if not all([team_name, secret_code, quest_id, file]):
        return jsonify({'success': False, 'error': 'All fields are required.'}), 400
        
    consent_under_21 = request.form.get('consent_under_21') == 'true'
    consent_promo = request.form.get('consent_promo') == 'true'
    
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Verify team and secret code
        cur.execute("SELECT id FROM waitlist WHERE team_name = %s AND team_secret_code = %s", (team_name, secret_code))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'success': False, 'error': 'Invalid team name or secret code.'}), 401
            
        # Save file
        if file and allowed_file(file.filename):
            filename = secure_filename(f"{team_name}_{quest_id}_{int(time.time())}_{file.filename}")
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            photo_url = f"/static/uploads/{filename}"
            
            # Insert completion with PENDING status
            cur.execute("""
                INSERT INTO quest_completions (team_name, quest_id, photo_url, status, consent_under_21, consent_promo)
                VALUES (%s, %s, %s, 'pending', %s, %s)
                RETURNING id
            """, (team_name, quest_id, photo_url, consent_under_21, consent_promo))
            completion_id = cur.fetchone()['id']
            
            conn.commit()
            cur.close()
            conn.close()
            
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'Invalid file type.'}), 400
            
    except Exception as e:
        logging.error(f"Submit quest API error: {e}")
        return jsonify({'success': False, 'error': 'Database error.'}), 500

@app.route('/api/admin/update-submission', methods=['POST'])
def api_update_submission():
    data = request.get_json()
    sub_id = data.get('id')
    status = data.get('status')
    stars_awarded = data.get('stars', 0)
    
    if not sub_id or status not in ['approved', 'rejected']:
        return jsonify({'success': False, 'error': 'Invalid request.'}), 400
        
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Update status and stars
        cur.execute("""
            UPDATE quest_completions 
            SET status = %s, stars_awarded = %s 
            WHERE id = %s 
            RETURNING team_name, quest_id
        """, (status, stars_awarded, sub_id))
        result = cur.fetchone()
        
        if result and status == 'approved':
            team_name = result['team_name']
            quest_id = result['quest_id']
            
            # Get quest name
            cur.execute("SELECT name FROM quests WHERE id = %s", (quest_id,))
            quest = cur.fetchone()
            quest_name = quest['name'] if quest else "Quest"
            
            # Get all phone numbers for the team
            cur.execute("SELECT all_phone_numbers FROM waitlist WHERE team_name = %s", (team_name,))
            team_data = cur.fetchone()
            phone_numbers = team_data["all_phone_numbers"] if team_data else []
            
            # Log message for bot
            message_text = f"Stars awarded! You earned {stars_awarded} stars for {quest_name}! ✨"
            cur.execute("""
                INSERT INTO message_log (team_name, event_type, message_text, phone_numbers, status)
                VALUES (%s, %s, %s, %s, %s)
            """, (team_name, 'quest_approved', message_text, phone_numbers, 'pending'))
            
            # Trigger webhook to local bot
            webhook_url = os.environ.get('BOT_WEBHOOK_URL', 'http://localhost:5000/webhook')
            try:
                requests.post(webhook_url, json={
                    'event': 'quest_approved',
                    'team_name': team_name,
                    'quest_name': quest_name,
                    'stars': stars_awarded,
                    'phone_numbers': phone_numbers,
                    'timestamp': datetime.utcnow().isoformat()
                }, timeout=5)
            except Exception as e:
                logging.warning(f"Webhook call failed: {e}")
        
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        logging.error(f"Update submission error: {e}")
        return jsonify({'success': False, 'error': 'Database error.'}), 500

@app.route('/admin/bot')
def admin_bot():
    secret = request.args.get('secret', '')
    admin_secret = os.environ.get('ADMIN_SECRET', '')
    if admin_secret and secret != admin_secret:
        return "Unauthorized", 401
    return render_template('admin_bot.html')

@app.route('/api/admin/send-message', methods=['POST'])
def api_send_message():
    data = request.get_json()
    msg_type = data.get('type', 'custom')
    message = data.get('message', '')
    team = data.get('team', 'all')
    
    try:
        conn = get_db()
        cur = conn.cursor()
        
        if team == 'all':
            cur.execute("SELECT DISTINCT team_name, teammates FROM waitlist")
        else:
            cur.execute("SELECT team_name, teammates FROM waitlist WHERE team_name = %s", (team,))
        
        teams = cur.fetchall()
        count = 0
        
        for t in teams:
            # Get all phone numbers for the team
            cur.execute("SELECT all_phone_numbers FROM waitlist WHERE team_name = %s", (t['team_name'],))
            team_data = cur.fetchone()
            phone_numbers = team_data["all_phone_numbers"] if team_data and team_data["all_phone_numbers"] else []
            
            if phone_numbers:
                cur.execute("""
                    INSERT INTO message_log (team_name, event_type, message_text, phone_numbers, status)
                    VALUES (%s, %s, %s, %s, %s)
                """, (t['team_name'], msg_type, message, phone_numbers, 'pending'))
                count += 1
                
                # Trigger webhook
                webhook_url = os.environ.get('BOT_WEBHOOK_URL', 'http://localhost:5000/webhook')
                try:
                    requests.post(webhook_url, json={
                        'event': 'manual_message',
                        'team_name': t['team_name'],
                        'message': message,
                        'phone_numbers': phone_numbers,
                        'timestamp': datetime.utcnow().isoformat()
                    }, timeout=5)
                except Exception as e:
                    logging.warning(f"Webhook call failed: {e}")
        
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'success': True, 'count': count})
    except Exception as e:
        logging.error(f"Send message error: {e}")
        return jsonify({'success': False, 'error': 'Database error.'}), 500

@app.route('/api/admin/message-log')
def api_message_log():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM message_log ORDER BY created_at DESC LIMIT 50")
        messages = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify([dict(m) for m in messages])
    except Exception as e:
        logging.error(f"Message log error: {e}")
        return jsonify([]), 500

@app.route('/api/admin/recent-submissions')
def api_recent_submissions():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT qc.*, q.name as quest_name, q.stars
            FROM quest_completions qc
            JOIN quests q ON qc.quest_id = q.id
            ORDER BY qc.created_at DESC
            LIMIT 20
        """)
        submissions = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify([dict(s) for s in submissions])
    except Exception as e:
        logging.error(f"Recent submissions error: {e}")
        return jsonify([]), 500

@app.route('/api/admin/teams')
def api_admin_teams():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, team_name, name, phone, teammates, all_phone_numbers, team_secret_code FROM waitlist WHERE is_active = TRUE ORDER BY created_at DESC")
        teams = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify([dict(t) for t in teams])
    except Exception as e:
        logging.error(f"Admin teams error: {e}")
        return jsonify([]), 500

@app.route('/api/admin/delete-team', methods=['POST'])
def api_delete_team():
    data = request.get_json()
    team_id = data.get('id')
    secret = request.args.get('secret', '')
    admin_secret = os.environ.get('ADMIN_SECRET', 'ORBIT_ADMIN_2026')
    
    if secret != admin_secret:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE waitlist SET is_active = FALSE WHERE id = %s", (team_id,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        logging.error(f"Delete team error: {e}")
        return jsonify({'success': False, 'error': 'Database error.'}), 500

@app.route('/api/admin/batches')
def api_admin_batches():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM quest_batches ORDER BY release_date ASC")
        batches = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify([dict(b) for b in batches])
    except Exception as e:
        logging.error(f"Batches error: {e}")
        return jsonify([]), 500

@app.route('/api/admin/create-batch', methods=['POST'])
def api_create_batch():
    data = request.get_json()
    batch_num = data.get('batch_num')
    release_date = data.get('release_date')
    quests = data.get('quests', [])
    
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Create batch
        cur.execute("""
            INSERT INTO quest_batches (game_id, batch_num, release_date)
            VALUES (1, %s, %s)
        """, (batch_num, f"{release_date} 23:59:00"))
        
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        logging.error(f"Create batch error: {e}")
        return jsonify({'success': False, 'error': 'Database error.'}), 500

@app.route('/api/admin/game-schedule', methods=['POST'])
def api_game_schedule():
    data = request.get_json()
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    
    try:
        conn = get_db()
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO game_schedule (game_name, start_date, end_date)
            VALUES ('Orbit 2026', %s, %s)
            ON CONFLICT DO NOTHING
        """, (start_date, end_date))
        
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        logging.error(f"Game schedule error: {e}")
        return jsonify({'success': False, 'error': 'Database error.'}), 500

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
    team_secret_code = (data.get('team_secret_code') or '').strip()
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

        # Get all phone numbers for the team
        all_team_phones = [phone]
        for tm in teammates:
            if tm.get("phone"):
                all_team_phones.append(tm["phone"])

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
        
        # Get all phone numbers for the team
        all_team_phones = [phone]
        for tm in teammates:
            if tm.get("phone"):
                all_team_phones.append(tm["phone"])

        # Log and trigger webhook for acceptance message
        webhook_url = os.environ.get("BOT_WEBHOOK_URL", "http://localhost:5000/webhook")
        acceptance_message = f"Welcome to Orbit! You've been accepted into the Harvard Race 🏁\n\nYour team secret code: {team_secret_code}\nRules: joinorbit.one/about"
        
        cur.execute("""
            INSERT INTO message_log (team_name, event_type, message_text, phone_numbers, status)
            VALUES (%s, %s, %s, %s, %s)
        """, (team_name, "acceptance", acceptance_message, all_team_phones, "pending"))
        conn.commit()

        try:
            requests.post(webhook_url, json={
                "event": "acceptance",
                "team_name": team_name,
                "message": acceptance_message,
                "phone_numbers": all_team_phones,
                "timestamp": datetime.utcnow().isoformat()
            }, timeout=5)
        except Exception as e:
            logging.warning(f"Acceptance webhook call failed: {e}")

        cur.close()
        conn.close()

    except Exception as e:
        logging.error(f"DB insert error: {e}\n{traceback.format_exc()}")
        return jsonify({"success": False, "error": "Database error. Please try again."}), 500

    send_confirmation_email(email, name, team_name)

    return jsonify({"success": True}), 201

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
            requests.get(url, timeout=10)
            logging.info(f"Keep-alive ping sent to {url}")
        except Exception as e:
            logging.warning(f"Keep-alive ping failed: {e}")
        time.sleep(4 * 60)  # ping every 4 minutes

_t = threading.Thread(target=_keep_alive, daemon=True)
_t.start()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=False)
# Force redeploy - class year segmentation
