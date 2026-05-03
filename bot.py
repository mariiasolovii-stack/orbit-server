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
SERVER_URL = os.environ.get('SERVER_URL', 'https://orbit-server-90x3.onrender.com')
POLL_INTERVAL = int(os.environ.get('POLL_INTERVAL', 60))  # Poll every 60 seconds
NOTIFICATION_DELAY = int(os.environ.get('NOTIFICATION_DELAY', 300))  # 5 minutes

# Track completion IDs and their submission times
completion_timestamps = {}

def send_imessage(phone_numbers, message):
    """
    Sends an iMessage to a group of phone numbers using AppleScript.
    If multiple numbers are provided, it creates/uses a group chat.
    """
    # Clean phone numbers: remove spaces, dashes, etc.
    cleaned_numbers = [str(num).strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "") for num in phone_numbers]
    
    # Filter out empty strings
    cleaned_numbers = [num for num in cleaned_numbers if num]
    
    if not cleaned_numbers:
        logging.error("No valid phone numbers provided.")
        return False

    # Escape double quotes in message for AppleScript
    escaped_message = message.replace('"', '\\"')
    
    if len(cleaned_numbers) == 1:
        # Single recipient script
        target = cleaned_numbers[0]
        script = f'''
        tell application "Messages"
            set targetService to 1st service whose service type is iMessage
            set targetBuddy to buddy "{target}" of targetService
            send "{escaped_message}" to targetBuddy
        end tell
        '''
    else:
        # Group chat script
        participants_list = ", ".join([f'"{num}"' for num in cleaned_numbers])
        script = f'''
        tell application "Messages"
            set targetService to 1st service whose service type is iMessage
            set participantPhones to {{{participants_list}}}
            
            set foundChat to missing value
            set allChats to every chat
            repeat with aChat in allChats
                set chatParticipants to participants of aChat
                set chatPhones to {{}}
                repeat with aParticipant in chatParticipants
                    copy handle of aParticipant to end of chatPhones
                end repeat
                
                set matchCount to 0
                repeat with p in participantPhones
                    if chatPhones contains p then
                        set matchCount to matchCount + 1
                    end if
                end repeat
                
                if matchCount is equal to (count of participantPhones) and (count of chatPhones) is equal to (count of participantPhones) then
                    set foundChat to aChat
                    exit repeat
                end if
            end repeat
            
            if foundChat is not missing value then
                send "{escaped_message}" to foundChat
            else
                set targetBuddies to {{}}
                repeat with p in participantPhones
                    copy buddy p of targetService to end of targetBuddies
                end repeat
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
            logging.error(f"AppleScript Error: {stderr.decode('utf-8')}")
            return False
    except Exception as e:
        logging.error(f"Failed to execute AppleScript: {e}")
        return False

def poll_and_notify():
    """
    Continuously polls the server for pending notifications and sends them.
    """
    logging.info(f"Bot polling started. Poll interval: {POLL_INTERVAL}s, Notification delay: {NOTIFICATION_DELAY}s")
    
    while True:
        try:
            # Poll the server for pending notifications
            response = requests.get(f'{SERVER_URL}/api/bot/poll', timeout=10)
            
            if response.status_code != 200:
                logging.warning(f"Poll failed with status {response.status_code}")
                time.sleep(POLL_INTERVAL)
                continue
            
            # The server returns a list of notifications directly
            pending = response.json()
            
            if pending:
                logging.info(f"Found {len(pending)} pending notifications")
            
            # Process each pending notification
            for notification in pending:
                msg_type = notification.get('type')
                
                if msg_type == 'stars':
                    # Handle Quest Approvals (with 5-minute delay)
                    completion_id = notification.get('completion_id')
                    team_name = notification.get('team_name')
                    quest_name = notification.get('quest_name')
                    stars_awarded = notification.get('stars_awarded')
                    phone_numbers = notification.get('all_phone_numbers', [])
                    
                    # Track submission time if not already tracked
                    if completion_id not in completion_timestamps:
                        completion_timestamps[completion_id] = datetime.now()
                        logging.info(f"Tracking completion {completion_id} for team {team_name}")
                        continue
                    
                    # Check if 5 minutes have passed since submission
                    submission_time = completion_timestamps[completion_id]
                    elapsed = (datetime.now() - submission_time).total_seconds()
                    
                    if elapsed < NOTIFICATION_DELAY:
                        logging.info(f"Completion {completion_id} waiting {NOTIFICATION_DELAY - elapsed:.0f}s more before notification")
                        continue
                    
                    # 5 minutes have passed, send the notification
                    message = f"✨ Stars awarded! You earned {stars_awarded} stars for '{quest_name}'! ✨"
                    
                    if send_imessage(phone_numbers, message):
                        try:
                            requests.post(f'{SERVER_URL}/api/bot/mark-notified', json={'completion_id': completion_id}, timeout=10)
                            logging.info(f"Marked completion {completion_id} as notified")
                            del completion_timestamps[completion_id]
                        except Exception as e:
                            logging.error(f"Error marking notified: {e}")
                
                elif msg_type == 'manual':
                    # Handle Manual Admin Messages (Immediate)
                    message_id = notification.get('message_id')
                    team_name = notification.get('team_name')
                    message_text = notification.get('message_text')
                    phone_numbers = notification.get('phone_numbers', [])
                    
                    logging.info(f"Processing manual message {message_id} for team {team_name}")
                    
                    if send_imessage(phone_numbers, message_text):
                        try:
                            requests.post(f'{SERVER_URL}/api/bot/mark-notified', json={'message_id': message_id}, timeout=10)
                            logging.info(f"Marked manual message {message_id} as sent")
                        except Exception as e:
                            logging.error(f"Error marking manual message notified: {e}")
        
        except Exception as e:
            logging.error(f"Error in polling loop: {e}")
        
        time.sleep(POLL_INTERVAL)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "bot": "Orbit iMessage Bot"}), 200

if __name__ == '__main__':
    # Start polling thread
    polling_thread = threading.Thread(target=poll_and_notify, daemon=True)
    polling_thread.start()
    
    print("\nStarting Orbit iMessage Bot...")
    print(f"Server URL: {SERVER_URL}")
    print(f"Poll interval: {POLL_INTERVAL}s")
    print(f"Notification delay: {NOTIFICATION_DELAY}s\n")
    
    app.run(port=5000, debug=False)
