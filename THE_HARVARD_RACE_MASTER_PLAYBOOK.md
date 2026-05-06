# ✦ The Harvard Race: Master Playbook ✦

This document is your end-to-end operational guide for launching and managing **The Harvard Race**. It covers everything from the initial 6,000-email blast to the final winner announcement.

---

## 1. Phase 1: The Launch (May 5-6)
### The 6,000 Email Blast
*   **Goal**: Drive signups and build hype.
*   **The Link**: Your emails should point to `https://joinorbit.one`.
*   **Server Load**: Render's auto-scaling will handle the traffic. The database is optimized for rapid inserts.
*   **The Experience**:
    1.  **Welcome Page**: Students see the animated "Welcome to the Harvard Race" text.
    2.  **The Gate**: One tap takes them to the class-selection page.
    3.  **The Countdown**: They see their class-specific clock (e.g., "Freshman year ends in...").
    4.  **The Signup**: They form a team, enter names/phones, and receive an instant confirmation email.

### The Bot's First Move
*   The moment a team signs up, the bot on your Mac detects it.
*   **Action**: It sends a personalized, AI-generated welcome iMessage to the team group: *"Welcome [Name] and [Name] to the Race. Team [TeamName] is locked in. May 7th is the day. Be ready."*

---

## 2. Phase 2: The Race (May 7-13)
The race is a 7-day sprint. The bot handles the schedule autonomously, but you have the "Master Switches" in your Admin Panel.

| Day | Time | Event | Bot Action |
| :--- | :--- | :--- | :--- |
| **Day 1 (May 7)** | 9:00 AM | **Challenge Drop #1** | Broadcasts the first quest to all teams. |
| **Day 2 (May 8)** | 2:00 PM | **Daily Reminder** | AI-generated nudge: "Old quests are still open. Don't fall behind." |
| **Day 3 (May 9)** | 9:00 AM | **Challenge Drop #2** | Broadcasts the second quest. |
| **Day 4 (May 10)** | 2:00 PM | **Daily Reminder** | AI-generated competitive push. |
| **Day 5 (May 11)** | 9:00 AM | **Challenge Drop #3** | Broadcasts the third quest. |
| **Day 6 (May 12)** | 2:00 PM | **Daily Reminder** | "Final 24 hours approaching. The leaderboard is tight." |
| **Day 7 (May 13)** | 9:00 AM | **Final Challenge** | The most difficult quest drops. |
| **Day 7 (May 13)** | 9:00 PM | **Winner Reveal** | Broadcasts the champion team to everyone. |

---

## 3. Phase 3: The Admin Command Center
You are the "Game Master." Use the [Admin Dashboard](https://joinorbit.one/admin/bot?secret=HarvardRace2026_Secure_Admin_Access) to control the flow.

### Your Daily Workflow:
1.  **Review Submissions**: Go to `/admin/quests`. Look at the evidence (photos/videos) students upload.
2.  **Award Stars**: Click "Approve" and set the star count.
    *   *Bot Action*: The bot instantly sends a "Stars Awarded!" iMessage to that team: *"Nice work [TeamName]. {Stars} stars added. You're climbing the ranks."*
3.  **Monitor Leaderboard**: Watch the standings shift in real-time at `/leaderboard`.
    *   *Bot Action*: If the Top 3 changes, the bot automatically alerts everyone.
4.  **AI Broadcasts**: Need to say something custom? Use the **AI Message Generator** on the dashboard. Type your intent, let Claude draft it, and hit send.

---

## 4. Technical Pre-Flight Checklist
Before you blast those 6,000 emails, ensure these 3 things are true:

1.  **Bot is Running**: Your Mac must be awake, logged into iMessage, and running `python3 bot.py`.
2.  **API Keys Set**: `ANTHROPIC_API_KEY` must be exported in your Mac's terminal.
3.  **Master Switches**:
    *   `MAINTENANCE_MODE` = **OFF** (Turn this off in the Admin Dashboard when you want the bot to start sending).
    *   `RACE_ACTIVE` = **ON** (Turn this on May 7th at 9:00 AM).

---

## 5. Emergency Procedures
*   **Bot Stops Sending**: Check your Mac's internet connection and ensure the Messages app is open. Restart `bot.py`.
*   **Wrong Message Sent**: Immediately turn **Maintenance Mode ON** in the Admin Dashboard. This kills all outgoing bot traffic instantly.
*   **Server Issues**: Render will alert you, but the database is backed up and the code is lightweight.

---
**The orbit is yours. Good luck, Game Master.** ✦
