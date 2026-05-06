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
POLL_INTERVAL = int(os.environ.get('POLL_INTERVAL', 3))  # Poll every 3 seconds
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
    {"day": 1, "date": datetime(2026, 5, 7), "title": "The Kickoff Batch", "description": "• High five 5 strangers passing by in the yard (*)\n• Compliment 3 outfits dramatically (*)\n• Walk into Cabot library and take a photo with what you think is the most stressed looking person (*)\n• Do a slow motion walk through science center plaza (*)\n• Convince a tourist of a fake Harvard tradition (**)"},
    {"day": 2, "date": datetime(2026, 5, 8), "title": "The Social Batch", "description": "• Find a group studying in the Smith Center and ask them what keeps them motivated to grind (*)\n• Take photos of 5 bunnies on campus and rank them (*)\n• Try a cringy pick up line on someone in Lamont cafe (*)\n• Dramatic break up scene on campus (**)\n• Ask a tourist to teach you something random (**)"},
    {"day": 3, "date": datetime(2026, 5, 9), "title": "The Explorer Batch", "description": "• Ask a librarian what their fav book is and find it (*)\n• Sunset picnic by Charles (**)\n• Revisit your most meaningful location on campus (**)\n• Film a romcom meet cute on campus (**)"},
    {"day": 4, "date": datetime(2026, 5, 10), "title": "The Fitness Batch", "description": "• Ask someone at HLS what they study and then act really confused (**)\n• Share a pint of berryline (**)\n• Get in an elevator and give three strangers your elevator pitch (**)\n• Host a potluck with strangers (***)"},
    {"day": 5, "date": datetime(2026, 5, 11), "title": "The Creative Batch", "description": "• Do a house grille crawl (all 4 grills) (**)\n• Build your own ice cream sandwich at insomnia (**)\n• Trade a dining hall item for smth better (***)\n• Do a themed photoshoot (***)\n• 1 minute documentary about your team (***)"},
    {"day": 6, "date": datetime(2026, 5, 12), "title": "The Boston Batch", "description": "• Try and review a cafe you’ve never been to before in Boston (***)\n• Walk the freedom trail (***)\n• Film a fake proposal at Boston Public Garden (***)\n• Thrift quest in Buffalo exchange (***)\n• Take a pic with the cutest bartender/barista (***)"},
    {"day": 7, "date": datetime(2026, 5, 13), "title": "The Grand Finale", "description": "• Watch the sunrise on John Weeks Bridge (***)\n• Blue bike around the esplanade (***)\n• Send water shots to a random table at a bar (***)\n• Capture a 1 minute day in Boston vlog (***)\n• Ask 5 ppl in the Boston Commons for advice (***)"}
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
            
            -- ALWAYS send individual messages for maximum reliability
            -- Group chat creation via AppleScript is notoriously buggy on macOS
            repeat with aBuddy in targetBuddies
                send "{escaped_message}" to aBuddy
            end repeat
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
    # DISABLED: We now only send scheduled messages when manually triggered from the dashboard
    pass

def get_game_master_reply(text=None):
    """Returns a high-quality, mysterious Game Master reply."""
    import random
    replies = [
        "The orbit is watching. Focus on the quests. ✦",
        "Stars don't earn themselves. Get moving. ✦",
        "I see you. The leaderboard is shifting... ✦",
        "Casual? Maybe. Competitive? Always. ✦",
        "The Yard is full of secrets. Find them. ✦",
        "Tick tock. The clock is always running. ✦",
        "Nice try. But can you do it faster? ✦",
        "The championship is within reach. Don't blink. ✦",
        "Mysterious? I prefer 'optimized'. ✦",
        "Harvard is your playground. Play hard. ✦",
        "Your progress has been noted. ✦",
        "The race waits for no one. ✦",
        "Eyes on the prize. The orbit is watching. ✦"
    ]
    return random.choice(replies)

def listen_for_messages():
    """Listens for incoming iMessages and replies using AI."""
    logging.info("Message listener started.")
    
    # Path to the iMessage database on macOS
    db_path = os.path.expanduser("~/Library/Messages/chat.db")
    if not os.path.exists(db_path):
        logging.error(f"iMessage database not found at {db_path}. Ensure you are on a Mac and have given Full Disk Access.")
        return

    import sqlite3
    last_id = 0
    
    # Get the last message ID to start from
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT MAX(ROWID) FROM message")
        last_id = cur.fetchone()[0] or 0
        conn.close()
    except Exception as e:
        logging.error(f"Error connecting to iMessage DB: {e}")
        return

    while True:
        try:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            cur = conn.cursor()
            # Fetch new messages from the last minute
            cur.execute("""
                SELECT m.ROWID, m.text, h.id as sender
                FROM message m
                JOIN handle h ON m.handle_id = h.ROWID
                WHERE m.ROWID > ? AND m.is_from_me = 0 AND m.text IS NOT NULL
                ORDER BY m.ROWID ASC
            """, (last_id,))
            
            new_messages = cur.fetchall()
            for rowid, text, sender in new_messages:
                last_id = rowid
                logging.info(f"New message from {sender}: {text}")
                
                # Use high-quality pre-written reply
                reply = get_game_master_reply(text)
                
                # Only send if not in maintenance mode OR if it's a reply to the admin
                if not MAINTENANCE_MODE or sender == "+16175993308":
                    send_imessage([sender], reply)
                else:
                    logging.info(f"Maintenance Mode: Suppressing reply to {sender}")
            
            conn.close()
        except Exception as e:
            logging.error(f"Error polling iMessage DB: {e}")
            
        time.sleep(5) # Check for new messages every 5 seconds

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
    global RACE_ACTIVE, MAINTENANCE_MODE
    logging.info(f"Bot polling started. Poll interval: {POLL_INTERVAL}s, Notification delay: {NOTIFICATION_DELAY}s")
    while True:
        try:
            response = requests.get(f'{SERVER_URL}/api/bot/poll', timeout=10)
            if response.status_code != 200:
                time.sleep(POLL_INTERVAL)
                continue
            
            data = response.json()
            # Sync game state from server
            server_state = data.get('game_state', {})
            RACE_ACTIVE = server_state.get('race_active', False)
            MAINTENANCE_MODE = server_state.get('maintenance_mode', True)
            
            # Check for scheduled challenge drops
            check_and_drop_challenges()
            
            # Check for leaderboard shifts
            check_leaderboard_updates()
            
            pending = data.get('notifications', [])
            if pending:
                logging.info(f"Found {len(pending)} pending notifications")
            
            for notification in pending:
                # CRITICAL: Respect Maintenance Mode for ALL automated messages
                # EXCEPTION: Allow messages to the admin's phone number for testing
                phone_numbers = notification.get('all_phone_numbers', []) or notification.get('phone_numbers', [])
                is_admin_test = "+16175993308" in [str(n) for n in phone_numbers] or "6175993308" in [str(n) for n in phone_numbers]

                if MAINTENANCE_MODE and not is_admin_test:
                    # Only allow 'manual' messages that are explicitly triggered
                    if notification.get('type') != 'manual':
                        logging.info(f"Maintenance Mode: Skipping automated {notification.get('type')} notification")
                        continue

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
                    message = f"✨ Stars awarded! Team {team_name} earned {stars_awarded} stars for '{quest_name}'! The leaderboard is shifting... keep pushing. ✦"

                    if send_imessage(phone_numbers, message):
                        requests.post(f'{SERVER_URL}/api/bot/mark-notified', json={'completion_id': completion_id}, timeout=10)
                        del completion_timestamps[completion_id]
                
                elif msg_type == 'manual':
                    message_id = notification.get('message_id')
                    message = notification.get('message_text')
                    phone_numbers = notification.get('phone_numbers', [])
                    
                    # Handle Instant Triggers
                    if message.startswith("TRIGGERED_EVENT:"):
                        parts = message.split(":")
                        event_type = parts[1]
                        if event_type == 'challenge_drop':
                            # Get specific day if provided, else current day
                            day = int(parts[2]) if len(parts) > 2 else get_current_race_day()
                            challenge = CHALLENGE_SCHEDULE[day-1] if day <= len(CHALLENGE_SCHEDULE) else CHALLENGE_SCHEDULE[-1]
                            message = f"🚀 CHALLENGE DROP: Day {challenge['day']} - {challenge['title']} 🚀\n\n{challenge['description']}\n\nGo to {SERVER_URL}/submit to upload your proof. Good luck."
                        elif event_type == 'leaderboard_alert':
                            try:
                                res = requests.get(f'{SERVER_URL}/leaderboard', timeout=10)
                                # Simplified for trigger
                                message = f"📊 LEADERBOARD ALERT: The standings have shifted! Check the latest at {SERVER_URL}/leaderboard"
                            except:
                                message = f"📊 LEADERBOARD ALERT: The standings have shifted! Check the latest at {SERVER_URL}/leaderboard"
                        elif event_type == 'reminder':
                            day = get_current_race_day()
                            message = f"Day {day} is halfway through. Old quests are still open. Don't let the other teams pull ahead. The orbit is watching. ✦"

                    # Personalize manual/triggered messages
                    if "[TEAM_NAME]" in message or "[MEMBER_NAMES]" in message:
                        # Fetch team details for personalization
                        try:
                            res = requests.get(f'{SERVER_URL}/api/admin/teams', timeout=10)
                            if res.status_code == 200:
                                teams = res.json()
                                team_data = next((t for t in teams if t['team_name'] == team_name), None)
                                if team_data:
                                    member_names = [team_data['name']] + [tm['name'] for tm in team_data['teammates'] if tm.get('name')]
                                    names_str = ", ".join(member_names[:-1]) + f", and {member_names[-1]}" if len(member_names) > 1 else member_names[0]
                                    message = message.replace("[TEAM_NAME]", team_name).replace("[MEMBER_NAMES]", names_str)
                        except:
                            pass

                    if send_imessage(phone_numbers, message):
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
                    
                    welcome_msg = f"Welcome {names_str} to The Harvard Race! Team {team_name} is officially in. Get ready—the race starts May 7th. The orbit is watching. ✦"

                    if send_imessage(phone_numbers, welcome_msg):
                        requests.post(f'{SERVER_URL}/api/bot/mark-notified', json={'team_id': team_id}, timeout=10)

                elif msg_type == 'scheduled':
                    schedule_id = notification.get('schedule_id')
                    message = notification.get('message_text')
                    phone_numbers = notification.get('phone_numbers', [])
                    
                    if send_imessage(phone_numbers, message):
                        requests.post(f'{SERVER_URL}/api/bot/mark-notified', json={'schedule_id': schedule_id}, timeout=10)
        
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
    
    msg = f"Welcome {names_str} to The Harvard Race! Team {team_name} is officially in. Get ready—the race starts May 7th. The orbit is watching. ✦"
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
    msg = f"Day {day} is halfway through. Old quests are still open. Don't let the other teams pull ahead. The orbit is watching. ✦"
    if phone_numbers:
        send_imessage(phone_numbers, msg)
    return jsonify({"message": msg})

@app.route('/test/leaderboard', methods=['POST'])
def test_leaderboard():
    data = request.get_json() or {}
    phone_numbers = data.get('phone_numbers', [])
    top_3 = data.get('top_3', ['Test Team A', 'Test Team B', 'Test Team C'])
    msg = f"📊 LEADERBOARD ALERT: The top 3 has shifted! 📊\n\n1. {top_3[0]}\n2. {top_3[1]}\n3. {top_3[2]}\n\nCheck the full standings at {SERVER_URL}/leaderboard"
    if phone_numbers:
        send_imessage(phone_numbers, msg)
    return jsonify({"message": msg})

@app.route('/test/winner', methods=['POST'])
def test_winner():
    data = request.get_json() or {}
    phone_numbers = data.get('phone_numbers', [])
    winner = data.get('winner', 'Test Team A')
    msg = f"🏆 THE RACE HAS ENDED 🏆\n\nAfter 7 days of intense competition, the winner of The Harvard Race is...\n\n✨ TEAM {winner.upper()} ✨\n\nCongratulations to the champions. To everyone else: the orbit continues. ✦"
    if phone_numbers:
        send_imessage(phone_numbers, msg)
    return jsonify({"message": msg})

if __name__ == '__main__':
    # Start the polling thread
    polling_thread = threading.Thread(target=poll_and_notify, daemon=True)
    polling_thread.start()
    
    # Start the iMessage listener thread
    listener_thread = threading.Thread(target=listen_for_messages, daemon=True)
    listener_thread.start()
    
    # Start the Flask app for test endpoints
    app.run(port=5000, debug=False)
