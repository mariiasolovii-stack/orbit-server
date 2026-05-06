import os
import sqlite3
import subprocess
import requests
import sys

def check_step(name, success, message):
    status = "✅ SUCCESS" if success else "❌ FAILED"
    print(f"{status} - {name}: {message}")
    return success

def run_diagnostic():
    print("\n--- 🚀 THE HARVARD RACE: PRE-FLIGHT CHECK ---")
    print("Running diagnostics to ensure your Mac is ready for launch...\n")
    
    all_passed = True

    # 1. Check Server Connection
    SERVER_URL = "https://joinorbit.one"
    try:
        resp = requests.get(f"{SERVER_URL}/health", timeout=5)
        all_passed &= check_step("Server Connection", resp.status_code == 200, f"Connected to {SERVER_URL}")
    except Exception as e:
        all_passed &= check_step("Server Connection", False, f"Could not connect to {SERVER_URL}: {e}")

    # 2. Check iMessage Database Access (Full Disk Access)
    db_path = os.path.expanduser("~/Library/Messages/chat.db")
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            conn.close()
            all_passed &= check_step("Full Disk Access", True, "Can read iMessage database.")
        except Exception as e:
            all_passed &= check_step("Full Disk Access", False, "Cannot read iMessage database. Please grant Full Disk Access to Terminal.")
    else:
        all_passed &= check_step("Full Disk Access", False, f"iMessage database not found at {db_path}. Are you on a Mac?")

    # 3. Check AppleScript Capability
    test_msg = "Orbit Pre-Flight Check: System is online. ✦"
    test_phone = "6175993308" # User's phone
    script = f'''
    tell application "Messages"
        set targetService to 1st service whose service type is iMessage
        set targetBuddy to buddy "{test_phone}" of targetService
        send "{test_msg}" to targetBuddy
    end tell
    '''
    try:
        process = subprocess.Popen(['osascript', '-e', script], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate()
        if process.returncode == 0:
            all_passed &= check_step("iMessage Sending", True, f"Test message sent to {test_phone}.")
        else:
            all_passed &= check_step("iMessage Sending", False, f"AppleScript error: {stderr.decode('utf-8')}")
    except Exception as e:
        all_passed &= check_step("iMessage Sending", False, f"Failed to run AppleScript: {e}")

    # 4. Check Python Dependencies
    try:
        import flask
        import requests
        import anthropic
        all_passed &= check_step("Python Libraries", True, "All required libraries (flask, requests, anthropic) are installed.")
    except ImportError as e:
        all_passed &= check_step("Python Libraries", False, f"Missing library: {e}. Run 'pip install flask requests anthropic'")

    print("\n--- FINAL VERDICT ---")
    if all_passed:
        print("🎉 YOUR MAC IS READY FOR LAUNCH! Run 'python3 bot.py' to start the race.")
    else:
        print("⚠️ SOME CHECKS FAILED. Please fix the issues above before launching.")
    print("----------------------\n")

if __name__ == "__main__":
    run_diagnostic()
