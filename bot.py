import os
import subprocess
import time
import json
import logging
import requests
import threading
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
import anthropic

# Initialize Claude client
# Set ANTHROPIC_API_KEY in your environment
client = anthropic.Anthropic()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("bot.log"),
        logging.StreamHandler()
    ]
)

app = Flask(__name__)

# Configuration
SERVER_URL = os.environ.get('SERVER_URL', 'https://joinorbit.one')
POLL_INTERVAL = int(os.environ.get('POLL_INTERVAL', 60))  # Poll every 60 seconds
NOTIFICATION_DELAY = int(os.environ.get('NOTIFICATION_DELAY', 300))  # 5 minutes

# SAFETY SWITCH: Set to True only when you are ready to start the race
RACE_ACTIVE = False 
MAINTENANCE_MODE = True # Disables all automated broadcasts when True

# Track completion IDs and their submission times
completion_timestamps = {}
last_leaderboard_state = []

# Race Schedule (May 7 - May 13)
RACE_START_DATE = datetime(2026, 5, 7)
CHALLENGE_SCHEDULE = [
    {"day": 1, "date": datetime(2026, 5, 7), "title": "The Commencement", "description": "Find the oldest tree in Harvard Yard and take a team selfie with it."},
    {"day": 3, "date": datetime(2026, 5, 9), "title": "The Scholar's Path", "description": "Visit 3 different libraries and find a book with 'Orbit' in the title."},
    {"day": 5, "date": datetime(2026, 5, 11), "title": "The Crimson Sprint", "description": "Run from Widener to the River and back. Record your time."},
    {"day": 7, "date": datetime(2026, 5, 13), "title": "The Final Orbit", "description": "The ultimate challenge. Details will be revealed at noon."}
]

def get_current_race_day():
    now = datetime.now()
    if now < RACE_START_DATE:
        return 0
    delta = now - RACE_START_DATE
    return delta.days + 1

def send_imessage(phone_numbers, message):
    """
    Sends an iMessage to a group of phone numbers using AppleScript.
    Uses a more robust method for group chats.
    """
    # Clean and format phone numbers: ensure +1 for US numbers
    cleaned_numbers = []
    for num in phone_numbers:
        digits = "".join(filter(str.isdigit, str(num)))
        if len(digits) == 10:
            cleaned_numbers.append("+1" + digits)
        elif len(digits) == 11 and digits.startswith('1'):
            cleaned_numbers.append("+" + digits)
        elif digits:
            cleaned_numbers.append("+" + digits if not str(num).startswith('+') else str(num))
    
    if not cleaned_numbers:
        logging.error("No valid phone numbers provided.")
        return False

    # Escape double quotes in message for AppleScript
    escaped_message = message.replace('"', '\\"')
    
    if len(cleaned_numbers) == 1:
        target = cleaned_numbers[0]
        script = f'''
        tell application "Messages"
            set targetService to 1st service whose service type is iMessage
            set targetBuddy to buddy "{target}" of targetService
            send "{escaped_message}" to targetBuddy
        end tell
        '''
    else:
        # Robust Group Chat Script
        participants_list = ", ".join([f'buddy "{num}" of targetService' for num in cleaned_numbers])
        script = f'''
        tell application "Messages"
            set targetService to 1st service whose service type is iMessage
            set targetBuddies to {{{participants_list}}}
            
            -- Attempt to find an existing chat with these participants
            set foundChat to missing value
            set allChats to every chat
            repeat with aChat in allChats
                set chatParticipants to participants of aChat
                set chatHandles to {{}}
                repeat with aParticipant in chatParticipants
                    copy handle of aParticipant to end of chatHandles
                end repeat
                
                set matchCount to 0
                set targetHandles to {{{", ".join([f'"{num}"' for num in cleaned_numbers])}}}
                repeat with h in targetHandles
                    if chatHandles contains h then
                        set matchCount to matchCount + 1
                    end if
                end repeat
                
                if matchCount is equal to (count of targetHandles) and (count of chatHandles) is equal to (count of targetHandles) then
                    set foundChat to aChat
                    exit repeat
                end if
            end repeat
            
            if foundChat is not missing value then
                send "{escaped_message}" to foundChat
            else
                -- Create new group chat
                send "{escaped_message}" to targetBuddies
            end if
        end tell
        '''

    try:
        logging.info(f"Sending message to {cleaned_numbers}: {message[:50]}...")
        process = subprocess.Popen(['osascript', '-e', script], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate()
        
        if process.returncode == 0:
            logging.info("Message sent successfully.")
            return True
        else:
            err_msg = stderr.decode('utf-8')
            logging.error(f"AppleScript Error: {err_msg}")
            
            # Fallback: Try sending to each person individually if group fails
            if "(-1700)" in err_msg or "Can’t make" in err_msg:
                logging.info("Group chat failed, falling back to individual messages...")
                success = True
                for num in cleaned_numbers:
                    fallback_script = f'''
                    tell application "Messages"
                        set targetService to 1st service whose service type is iMessage
                        set targetBuddy to buddy "{num}" of targetService
                        send "{escaped_message}" to targetBuddy
                    end tell
                    '''
                    fb_process = subprocess.Popen(['osascript', '-e', fallback_script], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    fb_process.communicate()
                    if fb_process.returncode != 0:
                        success = False
                return success
            return False
    except Exception as e:
        logging.error(f"Failed to execute AppleScript: {e}")
        return False

def broadcast_to_all_teams(message):
    try:
        response = requests.get(f'{SERVER_URL}/api/admin/teams', timeout=10)
        if response.status_code == 200:
            teams = response.json()
            for team in teams:
                phone_numbers = team.get('all_phone_numbers', [])
                if phone_numbers:
                    send_imessage(phone_numbers, message)
    except Exception as e:
        logging.error(f"Broadcast error: {e}")

def check_and_drop_challenges():
    if MAINTENANCE_MODE or not RACE_ACTIVE:
        return
        
    current_day = get_current_race_day()
    now = datetime.now()
    
    # Check if we need to drop a challenge today
    for challenge in CHALLENGE_SCHEDULE:
        # Drop at 9:00 AM on the scheduled day
        drop_time = challenge['date'].replace(hour=9, minute=0, second=0)
        if now >= drop_time and now < drop_time + timedelta(minutes=POLL_INTERVAL/60 + 1):
            msg = f"🚀 CHALLENGE DROP: Day {challenge['day']} - {challenge['title']} 🚀\n\n{challenge['description']}\n\nGo to {SERVER_URL}/submit to upload your proof. Good luck."
            broadcast_to_all_teams(msg)
            
    # Automated Reminders on "Off-Days" (Days 2, 4, 6)
    reminder_days = [2, 4, 6]
    if current_day in reminder_days:
        # Send reminder at 2:00 PM
        reminder_time = now.replace(hour=14, minute=0, second=0)
        if now >= reminder_time and now < reminder_time + timedelta(minutes=POLL_INTERVAL/60 + 1):
            prompt = f"Write a casual and competitive reminder for Day {current_day} of The Harvard Race. Remind teams that they can still complete old quests to earn stars. Keep it mysterious and motivating."
            try:
                response = client.messages.create(
                    model="claude-3-5-sonnet-latest",
                    max_tokens=150,
                    system="You are the Orbit Bot. Casual, competitive, and mysterious.",
                    messages=[{"role": "user", "content": prompt}]
                )
                msg = response.content[0].text
            except:
                msg = f"Day {current_day} is halfway through. Old quests are still open. Don't let the other teams pull ahead. ✦"
            broadcast_to_all_teams(msg)

    # Winner Announcement (Day 7 at 9:00 PM)
    if current_day == 7:
        winner_time = now.replace(hour=21, minute=0, second=0)
        if now >= winner_time and now < winner_time + timedelta(minutes=POLL_INTERVAL/60 + 1):
            try:
                res = requests.get(f'{SERVER_URL}/api/admin/teams', timeout=10)
                if res.status_code == 200:
                    teams = res.json()
                    winner = teams[0]['team_name']
                    msg = f"🏆 THE RACE HAS ENDED 🏆\n\nAfter 7 days of intense competition, the winner of The Harvard Race is...\n\n✨ TEAM {winner.upper()} ✨\n\nCongratulations to the champions. To everyone else: the orbit continues. ✦"
                    broadcast_to_all_teams(msg)
            except:
                pass

def check_leaderboard_updates():
    if MAINTENANCE_MODE or not RACE_ACTIVE:
        return
        
    global last_leaderboard_state
    try:
        response = requests.get(f'{SERVER_URL}/leaderboard', timeout=10)
        # This is a bit tricky since /leaderboard returns HTML. 
        # In a real scenario, we'd have an API for this. 
        # Let's assume there's an API endpoint /api/leaderboard
        api_response = requests.get(f'{SERVER_URL}/api/admin/teams', timeout=10)
        if api_response.status_code == 200:
            current_teams = api_response.json()
            # Sort by stars (we'd need to calculate stars here or get them from API)
            # For now, let's just detect if the order of top 3 changes
            current_top_3 = [t['team_name'] for t in current_teams[:3]]
            
            if last_leaderboard_state and current_top_3 != last_leaderboard_state:
                msg = f"📊 LEADERBOARD ALERT: The top 3 has shifted! 📊\n\n1. {current_top_3[0]}\n2. {current_top_3[1] if len(current_top_3) > 1 else '---'}\n3. {current_top_3[2] if len(current_top_3) > 2 else '---'}\n\nCheck the full standings at {SERVER_URL}/leaderboard"
                broadcast_to_all_teams(msg)
            
            last_leaderboard_state = current_top_3
    except Exception as e:
        logging.error(f"Leaderboard check error: {e}")

def poll_and_notify():
    logging.info(f"Bot polling started. Poll interval: {POLL_INTERVAL}s, Notification delay: {NOTIFICATION_DELAY}s")
    while True:
        try:
            # Check for scheduled challenge drops
            check_and_drop_challenges()
            
            # Check for leaderboard shifts
            check_leaderboard_updates()
            
            response = requests.get(f'{SERVER_URL}/api/bot/poll', timeout=10)
            response = requests.get(f'{SERVER_URL}/api/bot/poll', timeout=10)
            if response.status_code != 200:
                time.sleep(POLL_INTERVAL)
                continue
            
            pending = response.json()
            if pending:
                logging.info(f"Found {len(pending)} pending notifications")
            
            for notification in pending:
                msg_type = notification.get('type')
                if msg_type == 'stars':
                    completion_id = notification.get('completion_id')
                    team_name = notification.get('team_name')
                    quest_name = notification.get('quest_name')
                    stars_awarded = notification.get('stars_awarded')
                    phone_numbers = notification.get('all_phone_numbers', [])
                    
                    if completion_id not in completion_timestamps:
                        completion_timestamps[completion_id] = datetime.now()
                        continue
                    
                    submission_time = completion_timestamps[completion_id]
                    elapsed = (datetime.now() - submission_time).total_seconds()
                    if elapsed < NOTIFICATION_DELAY:
                        continue
                    
                    # Personality-driven star message
                    prompt = f"Write a casual and competitive message for team '{team_name}' who just earned {stars_awarded} stars for completing the quest '{quest_name}'. Keep it short, punchy, and slightly mysterious. Mention their progress on the leaderboard."
                    try:
                        response = client.messages.create(
                            model="claude-3-5-sonnet-latest",
                            max_tokens=150,
                            system="You are the Orbit Bot. Casual, competitive, and mysterious.",
                            messages=[{"role": "user", "content": prompt}]
                        )
                        message = response.content[0].text
                    except:
                        message = f"✨ Stars awarded! Team {team_name} earned {stars_awarded} stars for '{quest_name}'! The leaderboard is shifting... ✨"

                    if send_imessage(phone_numbers, message):
                        requests.post(f'{SERVER_URL}/api/bot/mark-notified', json={'completion_id': completion_id}, timeout=10)
                        del completion_timestamps[completion_id]
                
                elif msg_type == 'manual':
                    message_id = notification.get('message_id')
                    team_name = notification.get('team_name')
                    message_text = notification.get('message_text')
                    phone_numbers = notification.get('phone_numbers', [])
                    
                    if send_imessage(phone_numbers, message_text):
                        requests.post(f'{SERVER_URL}/api/bot/mark-notified', json={'message_id': message_id}, timeout=10)
                
                elif msg_type == 'welcome':
                    team_id = notification.get('team_id')
                    team_name = notification.get('team_name')
                    captain_name = notification.get('captain_name')
                    teammates = notification.get('teammates', [])
                    phone_numbers = notification.get('all_phone_numbers', [])
                    
                    # Personalize the welcome message
                    member_names = [captain_name]
                    for tm in teammates:
                        if tm.get('name'):
                            member_names.append(tm['name'])
                    
                    names_str = ""
                    if len(member_names) == 1:
                        names_str = member_names[0]
                    elif len(member_names) == 2:
                        names_str = f"{member_names[0]} and {member_names[1]}"
                    else:
                        names_str = ", ".join(member_names[:-1]) + f", and {member_names[-1]}"
                    
                    prompt = f"Write a casual and competitive welcome message for a team named '{team_name}' participating in 'The Harvard Race'. The members are {names_str}. Mention that the race officially starts on May 7th and they should be ready. Keep it short and punchy for iMessage."
                    
                    try:
                        response = client.messages.create(
                            model="claude-3-5-sonnet-latest",
                            max_tokens=150,
                            system="You are the Orbit Bot, the AI managing The Harvard Race. Your tone is casual, slightly mysterious, and highly competitive.",
                            messages=[{"role": "user", "content": prompt}]
                        )
                        welcome_msg = response.content[0].text
                    except Exception as ai_err:
                        logging.error(f"AI Error: {ai_err}")
                        welcome_msg = f"Welcome {names_str} to The Harvard Race! Team {team_name} is officially in. Get ready—the race starts May 7th. ✦"

                    if send_imessage(phone_numbers, welcome_msg):
                        requests.post(f'{SERVER_URL}/api/bot/mark-notified', json={'team_id': team_id}, timeout=10)
        
        except Exception as e:
            logging.error(f"Error in polling loop: {e}")
        
        time.sleep(POLL_INTERVAL)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "bot": "Orbit iMessage Bot"}), 200

# ── Test Mode Endpoints ──
@app.route('/test/welcome', methods=['POST'])
def test_welcome():
    data = request.get_json() or {}
    team_name = data.get('team_name', 'Test Team')
    captain_name = data.get('captain_name', 'Captain')
    teammates = data.get('teammates', [{'name': 'Teammate 1'}])
    phone_numbers = data.get('phone_numbers', []) # Provide your own number to test
    
    member_names = [captain_name] + [tm['name'] for tm in teammates if tm.get('name')]
    names_str = ", ".join(member_names[:-1]) + f", and {member_names[-1]}" if len(member_names) > 1 else member_names[0]
    
    prompt = f"Write a casual and competitive welcome message for a team named '{team_name}' participating in 'The Harvard Race'. The members are {names_str}. Mention that the race officially starts on May 7th and they should be ready. Keep it short and punchy for iMessage."
    
    response = client.messages.create(
        model="claude-3-5-sonnet-latest",
        max_tokens=150,
        system="You are the Orbit Bot, the AI managing The Harvard Race. Your tone is casual, slightly mysterious, and highly competitive.",
        messages=[{"role": "user", "content": prompt}]
    )
    msg = response.content[0].text
    if phone_numbers:
        send_imessage(phone_numbers, msg)
    return jsonify({"message": msg})

@app.route('/test/challenge', methods=['POST'])
def test_challenge():
    data = request.get_json() or {}
    day = data.get('day', 1)
    challenge = CHALLENGE_SCHEDULE[day-1]
    msg = f"🚀 CHALLENGE DROP: Day {challenge['day']} - {challenge['title']} 🚀\n\n{challenge['description']}\n\nGo to {SERVER_URL}/submit to upload your proof. Good luck."
    phone_numbers = data.get('phone_numbers', [])
    if phone_numbers:
        send_imessage(phone_numbers, msg)
    return jsonify({"message": msg})

@app.route('/test/reminder', methods=['POST'])
def test_reminder():
    data = request.get_json() or {}
    day = data.get('day', 2)
    phone_numbers = data.get('phone_numbers', [])
    prompt = f"Write a casual and competitive reminder for Day {day} of The Harvard Race. Remind teams that they can still complete old quests to earn stars. Keep it mysterious and motivating."
    response = client.messages.create(
        model="claude-3-5-sonnet-latest",
        max_tokens=150,
        system="You are the Orbit Bot. Casual, competitive, and mysterious.",
        messages=[{"role": "user", "content": prompt}]
    )
    msg = response.content[0].text
    if phone_numbers:
        send_imessage(phone_numbers, msg)
    return jsonify({"message": msg})

if __name__ == '__main__':
    polling_thread = threading.Thread(target=poll_and_notify, daemon=True)
    polling_thread.start()
    app.run(port=5000, debug=False)
