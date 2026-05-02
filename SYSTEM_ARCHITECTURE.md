# Harvard Race System Architecture

## Overview

The Harvard Race is a quest-based competition system built on a modern serverless architecture. Teams submit evidence of completed quests, receive immediate star awards, and get notified via iMessage group chats. The system emphasizes real-time updates, autonomous notification delivery, and comprehensive admin controls.

## System Components

### 1. Frontend Layer

**Landing Pages:**
- `/` - Welcome gate with "touch to begin" interaction
- `/freshmen`, `/sophomore`, `/junior`, `/senior` - Class-specific landing pages with personalized countdowns
- `/submit` - Quest submission form with file upload and consent questions
- `/leaderboard` - Real-time leaderboard with class breakdown
- `/team/<team_name>` - Team portal showing completed quests and total stars

**Admin Interfaces:**
- `/admin/quests?secret=ADMIN_SECRET` - Review submissions, adjust stars, approve/reject
- `/admin/bot?secret=ADMIN_SECRET` - Bot control panel for manual triggers
- `/admin/signups?secret=ADMIN_SECRET` - View all team signups

### 2. Backend API (Flask on Render)

**Quest Submission Pipeline:**
```
POST /api/submit-quest
├── Verify team credentials (team_name + secret_code)
├── Fetch quest default stars from quests table
├── Save uploaded evidence file to /static/uploads/
├── Create quest_completion entry with:
│   ├── status = 'approved' (auto-approval)
│   ├── stars_awarded = quest.stars (immediate award)
│   ├── notified = FALSE (pending bot notification)
│   └── consent tracking
└── Return success response
```

**Bot Polling Pipeline:**
```
GET /api/bot/poll (called every 60 seconds by Mac bot)
├── Query quest_completions WHERE status='approved' AND notified=FALSE
├── For each pending notification:
│   ├── Return completion_id, team_name, quest_name, stars_awarded, phone_numbers
│   └── Bot tracks submission timestamp
├── Return JSON array of pending notifications
└── Bot waits 5 minutes before sending iMessage

POST /api/bot/mark-notified (called after iMessage sent)
├── Update quest_completions SET notified=TRUE, notified_at=NOW()
├── Bot removes completion_id from tracking
└── Return success response
```

**Admin Review Pipeline:**
```
POST /api/admin/update-submission
├── Verify admin secret
├── Allow admin to:
│   ├── Approve/reject submissions
│   ├── Adjust stars_awarded
│   ├── View consent responses
│   └── Trigger manual notifications
└── Update database and leaderboard
```

**Leaderboard Calculation:**
```
GET /leaderboard
├── Query: SELECT team_name, COALESCE(SUM(stars_awarded), 0) as total_stars
│          FROM quest_completions 
│          WHERE status = 'approved'
│          GROUP BY team_name
│          ORDER BY total_stars DESC
├── Calculate class breakdown
├── Determine winning class
└── Return ranked leaderboard with class stats
```

### 3. Database Layer (Neon PostgreSQL)

**Tables:**

#### `waitlist`
```sql
id              SERIAL PRIMARY KEY
created_at      TIMESTAMPTZ DEFAULT NOW()
name            TEXT NOT NULL
email           TEXT NOT NULL
phone           TEXT NOT NULL
team_name       TEXT NOT NULL
teammates       JSONB (array of {name, email, phone})
class_year      TEXT
team_secret_code TEXT
all_phone_numbers TEXT[] (array of phone numbers for group chat)
is_active       BOOLEAN DEFAULT TRUE (soft delete)
```

#### `quests`
```sql
id          SERIAL PRIMARY KEY
name        TEXT NOT NULL
description TEXT NOT NULL
stars       INTEGER NOT NULL (default stars awarded)
class_year  TEXT (optional: class-specific quests)
```

#### `quest_completions`
```sql
id              SERIAL PRIMARY KEY
team_name       TEXT NOT NULL
quest_id        INTEGER REFERENCES quests(id)
photo_url       TEXT (path to uploaded evidence)
status          TEXT DEFAULT 'pending' (pending/approved/rejected)
stars_awarded   INTEGER (actual stars awarded, may differ from quest default)
consent_under_21 BOOLEAN (age consent)
consent_promo   BOOLEAN (promotional use consent)
notified        BOOLEAN DEFAULT FALSE (bot notification status)
notified_at     TIMESTAMPTZ (when bot sent notification)
created_at      TIMESTAMPTZ DEFAULT NOW()
```

#### `message_log`
```sql
id          SERIAL PRIMARY KEY
team_name   TEXT NOT NULL
event_type  TEXT (quest_approved, acceptance, custom)
message_text TEXT
phone_numbers TEXT[]
status      TEXT DEFAULT 'pending' (pending/sent/failed)
sent_at     TIMESTAMPTZ
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### 4. Bot Layer (Mac iMessage Bot)

**Architecture:**
- Local Python Flask app running on Mac
- Polls backend every 60 seconds for pending notifications
- Implements 5-minute delay before sending iMessages
- Uses AppleScript to interface with Messages app
- Tracks completion timestamps in memory
- Logs all activity to `bot.log`

**Polling Loop:**
```python
while True:
    # Every 60 seconds
    response = requests.get('SERVER_URL/api/bot/poll')
    pending = response.json()['pending']
    
    for notification in pending:
        completion_id = notification['completion_id']
        
        # First poll: track timestamp
        if completion_id not in tracked:
            tracked[completion_id] = datetime.now()
            continue
        
        # Check if 5 minutes elapsed
        elapsed = (datetime.now() - tracked[completion_id]).total_seconds()
        if elapsed < 300:
            continue
        
        # Send iMessage
        send_imessage(notification['phone_numbers'], message)
        
        # Mark as notified
        requests.post('SERVER_URL/api/bot/mark-notified', 
                     json={'completion_id': completion_id})
        
        del tracked[completion_id]
    
    time.sleep(60)
```

**iMessage Sending:**
- Single recipient: Direct message to phone number
- Multiple recipients: Group chat with all team members
- Uses AppleScript to interface with macOS Messages app
- Handles phone number formatting and cleanup
- Includes error handling and logging

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         TEAM SUBMISSION                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  /submit page    │
                    │  - Team name     │
                    │  - Secret code   │
                    │  - Quest select  │
                    │  - Photo upload  │
                    │  - Consent Q's   │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────────────┐
                    │ POST /api/submit-quest   │
                    │ - Verify credentials    │
                    │ - Save file             │
                    │ - Auto-approve          │
                    │ - Award stars           │
                    └──────────────────────────┘
                              │
                              ▼
                    ┌──────────────────────────┐
                    │  quest_completions      │
                    │  - status: approved     │
                    │  - stars_awarded: X     │
                    │  - notified: FALSE      │
                    └──────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
        ┌──────────────────┐  ┌──────────────────┐
        │  Leaderboard     │  │   Bot Polling    │
        │  Updates         │  │   (every 60s)    │
        │  (Real-time)     │  │                  │
        └──────────────────┘  └──────────────────┘
                                      │
                                      ▼
                            ┌──────────────────────┐
                            │ GET /api/bot/poll    │
                            │ Returns pending      │
                            │ notifications        │
                            └──────────────────────┘
                                      │
                                      ▼
                            ┌──────────────────────┐
                            │  Bot Waits 5 min     │
                            │  (tracks timestamp)  │
                            └──────────────────────┘
                                      │
                                      ▼
                            ┌──────────────────────┐
                            │  Send iMessage       │
                            │  (AppleScript)       │
                            │  Group chat with     │
                            │  all team members    │
                            └──────────────────────┘
                                      │
                                      ▼
                            ┌──────────────────────┐
                            │ POST /api/bot/       │
                            │ mark-notified        │
                            │ Sets notified=TRUE   │
                            └──────────────────────┘
                                      │
                                      ▼
                            ┌──────────────────────┐
                            │  quest_completions   │
                            │  - notified: TRUE    │
                            │  - notified_at: NOW  │
                            └──────────────────────┘
```

## Key Features

### 1. Auto-Approval System
- Submissions automatically approved upon receipt
- Stars awarded immediately to leaderboard
- No manual approval bottleneck
- Admin can still adjust stars post-submission

### 2. Real-Time Leaderboard
- Updates within 1-2 seconds of submission
- Aggregates stars across all approved completions
- Class-based breakdown and rankings
- Persistent storage in database

### 3. Autonomous Bot Notification
- Polls database instead of relying on webhooks
- No external services or ngrok required
- Implements 5-minute delay for suspense
- Handles group chats with all team members
- Tracks notification status in database

### 4. Admin Controls
- Review submissions with photos
- Adjust stars for quality/creativity
- Reject submissions if needed
- Manually trigger notifications
- View all team signups and stats

### 5. Data Protection
- Soft delete for teams (is_active flag)
- Consent tracking for legal compliance
- Comprehensive audit trail in message_log
- Database backups via Neon

### 6. Scalability
- Serverless backend on Render
- Managed database on Neon
- Stateless API design
- Efficient polling-based bot model

## Performance Characteristics

| Operation | Latency | Notes |
|-----------|---------|-------|
| Submit Quest | < 1s | File upload + DB insert |
| Leaderboard Update | < 2s | Query aggregation |
| Bot Polling | 60s interval | Configurable |
| iMessage Send | 5-6 min | 5 min delay + send time |
| Admin Review | < 1s | DB update |

## Security Measures

1. **Authentication:**
   - Team secret codes for submissions
   - Admin secret for dashboard access
   - Environment variables for API keys

2. **Data Protection:**
   - HTTPS for all communications
   - PostgreSQL with SSL
   - Soft delete prevents data loss
   - File uploads to private directory

3. **Rate Limiting:**
   - Can be added via Render middleware
   - Prevents submission spam
   - Protects bot polling

4. **Logging:**
   - Comprehensive audit trail
   - Error tracking in Render dashboard
   - Bot activity in bot.log

## Deployment Architecture

```
┌─────────────────────────────────────────────────────┐
│              GitHub Repository                      │
│  - app.py (Flask backend)                          │
│  - bot.py (iMessage bot)                           │
│  - templates/ (HTML/JS frontend)                   │
│  - static/ (CSS/images)                            │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
        ┌──────────────────────────────┐
        │   Render (Backend)           │
        │   - Flask app                │
        │   - Auto-deploy on push      │
        │   - Environment variables    │
        │   - Health checks            │
        └──────────────────────────────┘
                        │
                        ▼
        ┌──────────────────────────────┐
        │   Neon PostgreSQL            │
        │   - Managed database         │
        │   - Automatic backups        │
        │   - Connection pooling       │
        └──────────────────────────────┘

        ┌──────────────────────────────┐
        │   Mac Bot                    │
        │   - Local Python app         │
        │   - Polls Render API         │
        │   - AppleScript iMessages    │
        │   - Autonomous operation     │
        └──────────────────────────────┘
```

## Monitoring and Observability

**Metrics to Track:**
- Submissions per hour
- Average notification delay
- Bot polling success rate
- Leaderboard update latency
- Error rates by endpoint
- Database query performance

**Logs:**
- Render application logs (app.py)
- Bot logs (bot.log on Mac)
- Database query logs (Neon)
- Message delivery logs (message_log table)

**Alerts:**
- Backend health check failures
- Bot polling errors
- Database connection issues
- High error rates
- Unusual submission patterns

## Future Enhancements

1. **Batch Quests:** Release quests in timed batches
2. **Quest Categories:** Organize quests by type/difficulty
3. **Team Challenges:** Head-to-head competitions
4. **Bonus Multipliers:** Special events with star multipliers
5. **Photo Gallery:** Public showcase of best submissions
6. **Mobile App:** Native iOS/Android apps
7. **Webhook Notifications:** SMS/email in addition to iMessage
8. **Analytics Dashboard:** Detailed game statistics and insights
