import os
import subprocess
import time
import json
import logging
from flask import Flask, request, jsonify
import threading

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

@app.route('/webhook', methods=['POST'])
def webhook():
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
    print("\nStarting Orbit iMessage Bot on port 5000...")
    print("Make sure to run 'ngrok http 5000' in another terminal window.\n")
    app.run(port=5000)
