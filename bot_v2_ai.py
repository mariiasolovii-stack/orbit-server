import os, subprocess, time, json, logging, requests, threading, psycopg2
from datetime import datetime, timedelta
from flask import Flask, jsonify
from psycopg2.extras import RealDictCursor
from openai import OpenAI

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
app = Flask(__name__)

# Configuration
SERVER_URL = "https://joinorbit.one"
DATABASE_URL = "postgresql://neondb_owner:npg_y8dGAPgVKr0z@ep-green-glitter-an853t8z.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require"
POLL_INTERVAL = 60
NOTIFICATION_DELAY = 300
completion_timestamps = {}

# Initialize OpenAI client
client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

def get_db():
    return psycopg2.connect(DATABASE_URL)

def get_team_members(team_name):
    """Fetch all team member names for personalization."""
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT team_name, all_phone_numbers 
            FROM waitlist 
            WHERE team_name = %s
        """, (team_name,))
        result = cur.fetchone()
        cur.close()
        conn.close()
        return result
    except Exception as e:
        logging.error(f"Error fetching team members: {e}")
        return None

def personalize_message(message, team_name, phone_numbers):
    """Personalize message with team member names using AI."""
    try:
        team_data = get_team_members(team_name)
        if not team_data:
            return message
        
        # Use AI to personalize the message
        prompt = f"""
        You are a friendly and engaging bot for the Harvard Race. 
        Personalize this message for the team "{team_name}" with {len(phone_numbers)} members.
        Make it fun, engaging, and include specific mentions if possible.
        Keep it concise and energetic.
        
        Original message: {message}
        
        Return ONLY the personalized message, nothing else.
        """
        
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=300
        )
        
        return response.choices[0].message.content.strip()
    except Exception as e:
        logging.error(f"Error personalizing message: {e}")
        return message

def send_imessage_personalized(phone_numbers, message, team_name=""):
    """Send personalized iMessage to each team member."""
    success = True
    for num in phone_numbers:
        # Format number
        clean_num = str(num).strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        if len(clean_num) == 10: clean_num = "+1" + clean_num
        if not clean_num.startswith("+"): clean_num = "+" + clean_num
        
        # Personalize message
        personalized = personalize_message(message, team_name, phone_numbers) if team_name else message
        personalized = personalized.replace("joinorbit.one", "https://joinorbit.one")
        escaped_msg = personalized.replace('"', '\\"')
        
        logging.info(f"Sending personalized message to {clean_num}...")
        
        script = f'''
        tell application "Messages"
            set targetService to 1st service whose service type is iMessage
            set targetBuddy to buddy "{clean_num}" of targetService
            send "{escaped_msg}" to targetBuddy
        end tell
        '''
        process = subprocess.Popen(['osascript', '-e', script], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate()
        
        if process.returncode != 0:
            logging.error(f"Error for {clean_num}: {stderr.decode('utf-8')}")
            success = False
            
    return success

def auto_welcome_new_teams():
    """Automatically send welcome messages to newly signed-up teams."""
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Find teams that haven't been welcomed yet
        cur.execute("""
            SELECT w.team_name, w.all_phone_numbers, w.team_secret_code
            FROM waitlist w
            LEFT JOIN message_log ml ON w.team_name = ml.team_name AND ml.message_type = 'welcome'
            WHERE ml.id IS NULL
            LIMIT 10
        """)
        new_teams = cur.fetchall()
        
        for team in new_teams:
            team_name = team['team_name']
            phone_numbers = team['all_phone_numbers']
            secret_code = team['team_secret_code']
            
            welcome_msg = f"""
🏁 Welcome to the Harvard Race!

Your team: {team_name}
Secret Code: {secret_code}

📋 Rules:
1. Complete challenges and submit photo/video evidence
2. Earn stars based on challenge difficulty
3. Climb the leaderboard to win prizes
4. Race runs for 10 days (May 5-15)

🎯 How to Play:
Visit: https://joinorbit.one/submit
Enter your secret code and submit evidence

Good luck! 🚀
            """.strip()
            
            if send_imessage_personalized(phone_numbers, welcome_msg, team_name):
                # Log the welcome message
                cur.execute("""
                    INSERT INTO message_log (team_name, message_type, message_text, status, created_at)
                    VALUES (%s, %s, %s, %s, NOW())
                """, (team_name, 'welcome', welcome_msg, 'sent'))
                conn.commit()
                logging.info(f"Sent welcome message to {team_name}")
        
        cur.close()
        conn.close()
    except Exception as e:
        logging.error(f"Error in auto_welcome_new_teams: {e}")

def poll_and_notify():
    """Main polling loop for notifications."""
    logging.info("Bot polling started (AI-Powered V2)...")
    
    # Run welcome check every 5 minutes
    last_welcome_check = datetime.now()
    
    while True:
        try:
            # Check for new teams to welcome
            if (datetime.now() - last_welcome_check).total_seconds() > 300:
                auto_welcome_new_teams()
                last_welcome_check = datetime.now()
            
            # Poll for quest completions and manual messages
            response = requests.get(f'{SERVER_URL}/api/bot/poll', timeout=10)
            if response.status_code == 200:
                for n in response.json():
                    if n.get('type') == 'stars':
                        cid = n.get('completion_id')
                        if cid not in completion_timestamps:
                            completion_timestamps[cid] = datetime.now(); continue
                        if (datetime.now() - completion_timestamps[cid]).total_seconds() >= NOTIFICATION_DELAY:
                            msg = f"✨ Stars awarded! You earned {n.get('stars_awarded')} stars for '{n.get('quest_name')}'! Check the leaderboard: https://joinorbit.one/leaderboard"
                            if send_imessage_personalized(n.get('all_phone_numbers', []), msg, n.get('team_name', '')):
                                requests.post(f'{SERVER_URL}/api/bot/mark-notified', json={'completion_id': cid}, timeout=10)
                                del completion_timestamps[cid]
                    elif n.get('type') == 'manual':
                        mid = n.get('message_id')
                        if send_imessage_personalized(n.get('phone_numbers', []), n.get('message_text'), n.get('team_name', '')):
                            requests.post(f'{SERVER_URL}/api/bot/mark-notified', json={'message_id': mid}, timeout=10)
        except Exception as e: 
            logging.error(f"Error: {e}")
        time.sleep(POLL_INTERVAL)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "bot": "Orbit AI Bot V2"}), 200

if __name__ == '__main__':
    threading.Thread(target=poll_and_notify, daemon=True).start()
    app.run(port=5000)
