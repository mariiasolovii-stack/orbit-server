import os
import re
import logging
import traceback
import requests
import json
from datetime import datetime
from flask import Flask, request, jsonify, render_template, redirect, url_for

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key')

# ── Database Setup ──
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'
)

def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

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
            is_active BOOLEAN DEFAULT TRUE,
            all_phone_numbers TEXT[] DEFAULT '{}',
            welcomed        BOOLEAN NOT NULL DEFAULT FALSE
        )""")
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS quests (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            stars INTEGER DEFAULT 0,
            class_year TEXT
        )""")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS quest_completions (
            id SERIAL PRIMARY KEY,
            team_name TEXT NOT NULL,
            quest_id INTEGER REFERENCES quests(id),
            evidence_url TEXT,
            status TEXT DEFAULT 'pending',
            stars_awarded INTEGER DEFAULT 0,
            notified BOOLEAN DEFAULT FALSE,
            notified_at TIMESTAMPTZ,
            consent_under_21 BOOLEAN DEFAULT FALSE,
            consent_promo BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )""")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS message_log (
            id SERIAL PRIMARY KEY,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            team_name TEXT,
            event_type TEXT,
            message_text TEXT,
            phone_numbers TEXT[],
            status TEXT DEFAULT 'pending'
        )""")

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

    html_body = f"""<!DOCTYPE html>
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
    <p style="margin:0 0 12px;font-size:16px;color:#444;line-height:1.7">hey {name} &mdash; your team <strong style="color:#0a0a0a">{team_name}</strong> is locked in.</p>
    <p style="margin:0 0 12px;font-size:16px;color:#444;line-height:1.7">your side quest drops soon. 10 days, infinite challenges, earn stars to win.</p>
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
your side quest drops soon. 10 days, infinite challenges, earn stars to win.
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

# ── Helper Functions ──
def is_harvard_email(email):
    if not email: return False
    email = email.lower().strip()
    return email.endswith('.harvard.edu') or email.endswith('@harvard.edu')

# ── Game State (In-Memory for now, should be DB for persistence) ──
game_state = {
    "race_active": False,
    "maintenance_mode": True
}

# ── Routes ──
@app.route('/')
def index():
    return render_template('welcome.html')

@app.route('/gate')
def gate():
    return render_template('gate.html')

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

@app.route('/signup')
def signup():
    return render_template('signup.html')

@app.route('/thankyou')
def thankyou():
    return render_template('thankyou.html')

@app.route('/leaderboard')
def leaderboard():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT w.team_name, w.class_year, COALESCE(SUM(qc.stars_awarded), 0) as total_stars
            FROM waitlist w
            LEFT JOIN quest_completions qc ON w.team_name = qc.team_name AND qc.status = 'approved'
            WHERE w.is_active = TRUE
            GROUP BY w.team_name, w.class_year
            ORDER BY total_stars DESC
        """)
        teams = cur.fetchall()
        cur.close()
        conn.close()
        return render_template('leaderboard.html', teams=teams)
    except Exception as e:
        logging.error(f"Leaderboard error: {e}")
        return "Error loading leaderboard", 500

@app.route('/submit')
def submit_page():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, name, stars, class_year FROM quests ORDER BY name ASC")
        quests = cur.fetchall()
        cur.close()
        conn.close()
        return render_template('submit.html', quests=quests)
    except Exception as e:
        logging.error(f"Submit page error: {e}")
        return "Error loading submission page", 500

@app.route('/api/submit-quest', methods=['POST'])
def api_submit_quest():
    data = request.get_json(force=True, silent=True) or {}
    team_name = data.get('team_name')
    secret_code = data.get('secret_code')
    quest_id = data.get('quest_id')
    evidence_url = data.get('evidence_url')
    consent_under_21 = data.get('consent_under_21', False)
    consent_promo = data.get('consent_promo', False)

    if not all([team_name, secret_code, quest_id]):
        return jsonify({'success': False, 'error': 'Missing required fields.'}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Verify team
        cur.execute("SELECT all_phone_numbers FROM waitlist WHERE team_name = %s AND team_secret_code = %s", (team_name, secret_code))
        team = cur.fetchone()
        if not team:
            return jsonify({'success': False, 'error': 'Invalid team name or secret code.'}), 401

        # Get quest stars for auto-approval
        cur.execute("SELECT name, stars FROM quests WHERE id = %s", (quest_id,))
        quest = cur.fetchone()
        if not quest:
            return jsonify({'success': False, 'error': 'Invalid quest ID.'}), 400

        # Insert completion as approved (Auto-Approval)
        cur.execute("""
            INSERT INTO quest_completions 
            (team_name, quest_id, evidence_url, status, stars_awarded, notified, consent_under_21, consent_promo)
            VALUES (%s, %s, %s, 'approved', %s, FALSE, %s, %s)
            RETURNING id
        """, (team_name, quest_id, evidence_url, quest['stars'], consent_under_21, consent_promo))
        
        completion_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({'success': True, 'message': f'Quest submitted and {quest["stars"]} stars awarded!'}), 201
    except Exception as e:
        logging.error(f"Submit quest error: {e}")
        return jsonify({'success': False, 'error': 'Database error.'}), 500

@app.route('/api/bot/poll')
def api_bot_poll():
    try:
        # Include game state in poll response
        conn = get_db()
        cur = conn.cursor()
        
        # 1. Fetch approved completions (Stars)
        cur.execute("""
            SELECT qc.id as completion_id, qc.team_name, q.name as quest_name, qc.stars_awarded, w.all_phone_numbers, qc.created_at, 'stars' as type
            FROM quest_completions qc
            JOIN quests q ON qc.quest_id = q.id
            JOIN waitlist w ON qc.team_name = w.team_name
            WHERE qc.status = 'approved' AND qc.notified = FALSE
        """)
        stars_pending = cur.fetchall()
        
        # 2. Fetch manual admin messages
        cur.execute("""
            SELECT id as message_id, team_name, message_text, phone_numbers, created_at, 'manual' as type
            FROM message_log
            WHERE status = 'pending'
        """)
        manual_pending = cur.fetchall()

        # 3. Fetch new teams for Welcome message
        cur.execute("""
            SELECT id as team_id, team_name, name as captain_name, teammates, all_phone_numbers, created_at, 'welcome' as type
            FROM waitlist
            WHERE welcomed = FALSE
        """)
        welcome_pending = cur.fetchall()
        
        cur.close()
        conn.close()
        
        # Combine and format
        results = []
        for p in stars_pending:
            p['created_at'] = p['created_at'].isoformat() if p['created_at'] else None
            results.append(p)
        for m in manual_pending:
            m['created_at'] = m['created_at'].isoformat() if m['created_at'] else None
            results.append(m)
        for w in welcome_pending:
            w['created_at'] = w['created_at'].isoformat() if w['created_at'] else None
            results.append(w)
                
        return jsonify({
            "notifications": results,
            "game_state": game_state
        })
    except Exception as e:
        logging.error(f"Bot poll error: {e}")
        return jsonify([]), 500

@app.route('/api/bot/mark-notified', methods=['POST'])
def api_bot_mark_notified():
    data = request.get_json() or {}
    completion_id = data.get('completion_id')
    message_id = data.get('message_id')
    team_id = data.get('team_id')
    
    try:
        conn = get_db()
        cur = conn.cursor()
        if completion_id:
            cur.execute("UPDATE quest_completions SET notified = TRUE, notified_at = NOW() WHERE id = %s", (completion_id,))
        elif message_id:
            cur.execute("UPDATE message_log SET status = 'sent' WHERE id = %s", (message_id,))
        elif team_id:
            cur.execute("UPDATE waitlist SET welcomed = TRUE WHERE id = %s", (team_id,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        logging.error(f"Mark notified error: {e}")
        return jsonify({'success': False}), 500

@app.route('/admin/bot')
def admin_bot():
    secret = request.args.get('secret', '')
    admin_secret = os.environ.get('ADMIN_SECRET', 'HarvardRace2026_Secure_Admin_Access')
    if admin_secret and secret != admin_secret:
        return "Unauthorized", 401
    return render_template('admin_bot.html', game_state=game_state, admin_secret=admin_secret)

@app.route('/api/admin/update-game-state', methods=['POST'])
def api_update_game_state():
    secret = request.args.get('secret', '')
    admin_secret = os.environ.get('ADMIN_SECRET', 'HarvardRace2026_Secure_Admin_Access')
    if admin_secret and secret != admin_secret:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
    data = request.get_json()
    if 'race_active' in data:
        game_state['race_active'] = data['race_active']
    if 'maintenance_mode' in data:
        game_state['maintenance_mode'] = data['maintenance_mode']
    
    return jsonify({'success': True, 'game_state': game_state})

@app.route('/api/admin/send-message', methods=['POST'])
def api_send_message():
    data = request.get_json()
    msg_type = data.get('message_type', 'custom')
    message = data.get('message_template', '')
    team = data.get('send_to_team', 'all')
    
    try:
        conn = get_db()
        cur = conn.cursor()
        
        if team == 'all':
            cur.execute("SELECT team_name, all_phone_numbers FROM waitlist WHERE is_active = TRUE")
        else:
            cur.execute("SELECT team_name, all_phone_numbers FROM waitlist WHERE team_name = %s AND is_active = TRUE", (team,))
            
        teams = cur.fetchall()
        count = 0
        for t in teams:
            phone_numbers = t['all_phone_numbers']
            if phone_numbers:
                cur.execute("""
                    INSERT INTO message_log (team_name, event_type, message_text, phone_numbers, status)
                    VALUES (%s, %s, %s, %s, %s)
                """, (t['team_name'], msg_type, message, phone_numbers, 'pending'))
                count += 1
        
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
    admin_secret = os.environ.get('ADMIN_SECRET', 'HarvardRace2026_Secure_Admin_Access')
    
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

@app.route('/api/signup', methods=['POST'])
def api_signup():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    phone = (data.get('phone') or '').strip()
    team_name = (data.get('team_name') or '').strip()
    team_secret_code = (data.get('team_secret_code') or '').strip()
    class_year = (data.get('class_year') or '').strip()
    teammates = data.get('teammates') or []

    if not name or not is_harvard_email(email) or not team_name:
        return jsonify({'success': False, 'error': 'Invalid input.'}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Get all phone numbers
        all_team_phones = [phone]
        for tm in teammates:
            if tm.get("phone"):
                all_team_phones.append(tm["phone"])

        cur.execute("""
            INSERT INTO waitlist
            (name, email, phone, team_name, team_secret_code, teammates, class_year, all_phone_numbers)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (email) DO NOTHING
        """, (name, email.lower(), phone, team_name, team_secret_code, json.dumps(teammates), class_year, all_team_phones))
        conn.commit()
        cur.close()
        conn.close()
        
        # Send confirmation email
        send_confirmation_email(email, name, team_name)
        
        return jsonify({'success': True}), 201
    except Exception as e:
        logging.error(f"Signup error: {e}")
        return jsonify({'success': False, 'error': 'Database error.'}), 500

if __name__ == '__main__':
    app.run(debug=True)
