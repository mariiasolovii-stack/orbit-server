import os
import json
import subprocess
from flask import Flask, request, jsonify
import logging
import threading
import time

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# This is the ngrok URL that will be dynamically updated when ngrok starts
NGROK_PUBLIC_URL = None

def send_imessage(phone_number, message):
    # AppleScript to send iMessage
    # Note: This requires 'Messages' app to be open and logged in on the Mac
    # And 'Allow JavaScript from Apple Events' to be enabled in Script Editor preferences
    script = f"""
    tell application "Messages"
        set targetService to 1st service whose service type = iMessage
        set targetBuddy to buddy "{phone_number}" of targetService
        send "{message}" to targetBuddy
    end tell
    """
    try:
        subprocess.run(["osascript", "-e", script], check=True)
        logging.info(f"iMessage sent to {phone_number}: {message}")
        return True
    except subprocess.CalledProcessError as e:
        logging.error(f"Failed to send iMessage to {phone_number}: {e}")
        return False

@app.route('/webhook', methods=['POST'])
def webhook_receiver():
    data = request.json
    if not data:
        return jsonify({'status': 'error', 'message': 'No JSON data received'}), 400

    event = data.get('event')
    team_name = data.get('team_name')
    phone_numbers = data.get('phone_numbers', [])
    message_text = data.get('message')
    quest_name = data.get('quest_name')
    stars = data.get('stars')

    logging.info(f"Received webhook event: {event} for team {team_name}")

    if event == 'quest_approved':
        msg = f"Your submission for '{quest_name}' was approved! You earned {stars} stars! Check the leaderboard: joinorbit.one/leaderboard"
    elif event == 'manual_message':
        msg = message_text
    else:
        msg = f"Orbit Update for {team_name}: {message_text}"

    if not msg:
        return jsonify({'status': 'error', 'message': 'No message to send'}), 400

    sent_count = 0
    for phone in phone_numbers:
        if send_imessage(phone, msg):
            sent_count += 1

    return jsonify({'status': 'success', 'sent_messages': sent_count}), 200

def run_ngrok():
    global NGROK_PUBLIC_URL
    logging.info("Starting ngrok tunnel...")
    try:
        # Start ngrok process
        ngrok_process = subprocess.Popen(['ngrok', 'http', '5000'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # Wait for ngrok to start and get the public URL
        time.sleep(5) # Give ngrok some time to start
        
        # Fetch ngrok tunnels info from its API
        response = requests.get("http://localhost:4040/api/tunnels")
        tunnels = response.json()['tunnels']
        for tunnel in tunnels:
            if tunnel['proto'] == 'https':
                NGROK_PUBLIC_URL = tunnel['public_url']
                break

        if NGROK_PUBLIC_URL:
            logging.info(f"ngrok tunnel established at: {NGROK_PUBLIC_URL}")
            os.environ['BOT_WEBHOOK_URL'] = NGROK_PUBLIC_URL + '/webhook'
            logging.info(f"BOT_WEBHOOK_URL set to: {os.environ['BOT_WEBHOOK_URL']}")
        else:
            logging.error("Failed to get ngrok public URL.")

    except Exception as e:
        logging.error(f"Error starting ngrok: {e}")

if __name__ == '__main__':
    # Start ngrok in a separate thread
    ngrok_thread = threading.Thread(target=run_ngrok)
    ngrok_thread.daemon = True
    ngrok_thread.start()

    # Run Flask app
    app.run(port=5000, debug=True, use_reloader=False) # use_reloader=False to prevent ngrok from starting twice
