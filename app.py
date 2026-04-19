import os
from flask import Flask, request, jsonify
import json

app = Flask(__name__)

STATE_FILE = "/tmp/orbit_state.json"

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"users": {}}

def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)

@app.route("/")
def index():
    return "orbit server is running v3"

@app.route("/save_orbit", methods=["POST"])
def save_orbit():
    data = request.json
    phone = data.get("phone")
    orbit_name = data.get("orbit_name", "my orbit").lower().replace(" ", "_")
    contacts = data.get("contacts", [])
    if not phone or not contacts:
        return jsonify({"error": "missing data"}), 400
    state = load_state()
    if phone not in state["users"]:
        state["users"][phone] = {"orbits": {}}
    state["users"][phone]["orbits"][orbit_name] = contacts
    save_state(state)
    return jsonify({"success": True})

@app.route("/get_orbits")
def get_orbits():
    phone = request.args.get("phone")
    state = load_state()
    user = state.get("users", {}).get(phone, {})
    return jsonify({"orbits": user.get("orbits", {})})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
