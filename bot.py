import os
import subprocess
import time
import json
import logging
import requests
import threading
from datetime import datetime, timedelta
from flask import Flask, request, jsonify

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

# Track completion IDs and their submission times
completion_timestamps = {}

def send_imessage(phone_numbers, message):
    """
    Sends an iMessage to a group of phone numbers using AppleScript.
    Uses a more robust method for group chats.
    """
    # Clean phone numbers: remove spaces, dashes, etc.
    cleaned_numbers = [str(num).strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "") for num in phone_numbers]
    cleaned_numbers = [num for num in cleaned_numbers if num]
    
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

def poll_and_notify():
    logging.info(f"Bot polling started. Poll interval: {POLL_INTERVAL}s, Notification delay: {NOTIFICATION_DELAY}s")
    while True:
        try:
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
                    
                    message = f"✨ Stars awarded! You earned {stars_awarded} stars for '{quest_name}'! ✨"
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
        
        except Exception as e:
            logging.error(f"Error in polling loop: {e}")
        
        time.sleep(POLL_INTERVAL)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "bot": "Orbit iMessage Bot"}), 200

if __name__ == '__main__':
    polling_thread = threading.Thread(target=poll_and_notify, daemon=True)
    polling_thread.start()
    app.run(port=5000, debug=False)
