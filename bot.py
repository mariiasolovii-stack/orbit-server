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
        # This script attempts to find an existing chat with these participants or creates a new one
        participants_list = ", ".join([f'"{num}"' for num in cleaned_numbers])
        script = f'''
        tell application "Messages"
            set targetService to 1st service whose service type is iMessage
            set participantPhones to {{{participants_list}}}
            
            -- Try to find an existing chat with these exact participants
            set foundChat to missing value
            set allChats to every chat
            repeat with aChat in allChats
                set chatParticipants to participants of aChat
                set chatPhones to {{}}
                repeat with aParticipant in chatParticipants
                    copy handle of aParticipant to end of chatPhones
                end repeat
                
                -- Check if participants match (simplified check)
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
                -- Create new group chat by sending to the list of buddies
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
    Implements a 5-minute delay before sending notifications.
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
            
            data = response.json()
            pending = data.get('pending', [])
            
            if pending:
                logging.info(f"Found {len(pending)} pending notifications")
            
            # Process each pending notification
            for notification in pending:
                completion_id = notification.get('completion_id')
                team_name = notification.get('team_name')
                quest_name = notification.get('quest_name')
                stars_awarded = notification.get('stars_awarded')
                phone_numbers = notification.get('phone_numbers', [])
                
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
                    # Mark as notified in the database
                    try:
                        mark_response = requests.post(
                            f'{SERVER_URL}/api/bot/mark-notified',
                            json={'completion_id': completion_id},
                            timeout=10
                        )
                        if mark_response.status_code == 200:
                            logging.info(f"Marked completion {completion_id} as notified")
                            del completion_timestamps[completion_id]
                        else:
                            logging.warning(f"Failed to mark {completion_id} as notified: {mark_response.status_code}")
                    except Exception as e:
                        logging.error(f"Error marking notified: {e}")
                else:
                    logging.error(f"Failed to send iMessage for completion {completion_id}")
        
        except Exception as e:
            logging.error(f"Error in polling loop: {e}")
        
        time.sleep(POLL_INTERVAL)

@app.route('/webhook', methods=['POST'])
def webhook():
    """Legacy webhook endpoint for backward compatibility."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    event_type = data.get('event')
    team_name = data.get('team_name')
    message = data.get('message')
    phone_numbers = data.get('phone_numbers', [])
    
    if not phone_numbers or not message:
        return jsonify({"error": "Missing phone_numbers or message"}), 400
    
    # Run sending in a separate thread to avoid blocking the webhook response
    thread = threading.Thread(target=send_imessage, args=(phone_numbers, message))
    thread.start()
    
    return jsonify({"status": "queued", "team": team_name, "event": event_type}), 200

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
