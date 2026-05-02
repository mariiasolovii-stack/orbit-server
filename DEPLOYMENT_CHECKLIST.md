# Deployment and Launch Checklist

## Pre-Deployment Verification (May 1, 2026)

### Code Quality
- [x] `app.py` passes Python syntax validation
- [x] `bot.py` passes Python syntax validation
- [x] All imports available and dependencies installed
- [x] No hardcoded secrets in code (using environment variables)
- [x] Error handling comprehensive with logging

### Database Schema
- [x] `waitlist` table has `all_phone_numbers` TEXT[] column
- [x] `quest_completions` table has all required columns:
  - [x] `id` (SERIAL PRIMARY KEY)
  - [x] `team_name` (TEXT NOT NULL)
  - [x] `quest_id` (INTEGER REFERENCES quests(id))
  - [x] `photo_url` (TEXT)
  - [x] `status` (TEXT DEFAULT 'pending')
  - [x] `stars_awarded` (INTEGER)
  - [x] `consent_under_21` (BOOLEAN)
  - [x] `consent_promo` (BOOLEAN)
  - [x] `notified` (BOOLEAN DEFAULT FALSE)
  - [x] `notified_at` (TIMESTAMPTZ)
  - [x] `created_at` (TIMESTAMPTZ DEFAULT NOW())
- [x] `quests` table populated with quest definitions
- [x] `message_log` table for tracking notifications

### API Endpoints
- [x] `/api/submit-quest` (POST) - Auto-approve with immediate star award
- [x] `/api/bot/poll` (GET) - Fetch pending notifications
- [x] `/api/bot/mark-notified` (POST) - Mark notification as sent
- [x] `/api/admin/update-submission` (POST) - Admin review capability
- [x] `/leaderboard` (GET) - Real-time leaderboard
- [x] `/team/<team_name>` (GET) - Team portal
- [x] `/admin/quests` (GET) - Admin dashboard
- [x] `/health` (GET) - Health check

### Frontend Templates
- [x] `submit_quest.html` - Quest submission form with consent questions
- [x] `leaderboard.html` - Real-time leaderboard display
- [x] `team_portal.html` - Team progress tracking
- [x] `admin_quests.html` - Admin review dashboard
- [x] `admin_bot.html` - Bot control panel

### Bot Configuration
- [x] Polling loop implemented with configurable interval
- [x] 5-minute delay logic implemented
- [x] iMessage sending via AppleScript
- [x] Notification marking in database
- [x] Comprehensive logging to `bot.log`
- [x] Environment variables:
  - [x] `SERVER_URL` - Backend server URL
  - [x] `POLL_INTERVAL` - Polling frequency (default: 60s)
  - [x] `NOTIFICATION_DELAY` - Delay before sending (default: 300s = 5min)

## Deployment Steps (May 1, 2026)

### 1. Backend Deployment (Render)
```bash
# Push code to GitHub
git add app.py
git commit -m "Phase 2: Auto-approval and bot polling implementation"
git push origin main

# Render auto-deploys on push
# Verify deployment at: https://orbit-server-90x3.onrender.com/health
```

**Verification:**
```bash
curl https://orbit-server-90x3.onrender.com/health
# Expected: {"status": "ok", "timestamp": "2026-05-01T..."}
```

### 2. Database Migrations
Migrations run automatically on app startup via `init_db()`:
- Creates tables if they don't exist
- Adds missing columns to existing tables
- Sets appropriate defaults

**Verify migrations:**
```sql
-- Connect to Neon PostgreSQL
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'quest_completions'
ORDER BY ordinal_position;

-- Should show all columns including stars_awarded, notified, notified_at
```

### 3. Populate Quests
Before game launch, populate the `quests` table:

```sql
INSERT INTO quests (name, description, stars, class_year) VALUES
('Take a selfie at Harvard Square', 'Capture a photo of yourself at the iconic Harvard Square', 10, NULL),
('Visit the Widener Library', 'Get a photo at the entrance of Widener Library', 15, NULL),
('Find the John Harvard Statue', 'Locate and photograph the famous John Harvard statue', 20, NULL),
('Attend a Harvard event', 'Participate in and document a Harvard campus event', 25, NULL),
('Interview a Harvard student', 'Get a quote from a Harvard student about their experience', 30, NULL);
```

### 4. Bot Deployment (Mac)
```bash
# On Mac, run bot.py with environment variables
export SERVER_URL="https://orbit-server-90x3.onrender.com"
export POLL_INTERVAL="60"
export NOTIFICATION_DELAY="300"

python3 bot.py

# Monitor logs
tail -f bot.log
```

**Verification:**
```
2026-05-02 00:00:00 - INFO - Starting Orbit iMessage Bot...
2026-05-02 00:00:00 - INFO - Server URL: https://orbit-server-90x3.onrender.com
2026-05-02 00:00:00 - INFO - Poll interval: 60s
2026-05-02 00:00:00 - INFO - Notification delay: 300s
2026-05-02 00:00:01 - INFO - Bot polling started. Poll interval: 60s, Notification delay: 300s
```

### 5. Environment Variables (Render)
Set in Render dashboard:
```
ADMIN_SECRET=<secure_random_string>
DATABASE_URL=<neon_postgres_url>
RESEND_API_KEY=<resend_api_key>
FROM_EMAIL=play@joinorbit.one
FROM_NAME=Amazing Race Harvard
```

### 6. File Upload Directory
Ensure `/static/uploads` directory exists and is writable:
```bash
mkdir -p /home/ubuntu/orbit-server/static/uploads
chmod 755 /home/ubuntu/orbit-server/static/uploads
```

## Launch Day (May 2, 2026)

### Morning Checklist (9:00 AM)
- [ ] Backend server running and healthy
- [ ] Bot running on Mac and polling
- [ ] Database connected and accessible
- [ ] All environment variables set
- [ ] File upload directory writable
- [ ] Leaderboard accessible at `/leaderboard`
- [ ] Admin dashboard accessible at `/admin/quests?secret=ADMIN_SECRET`

### Pre-Launch Test (10:00 AM)
1. **Submit a test quest:**
   - Navigate to `/submit`
   - Enter test team credentials
   - Upload test image
   - Check consent boxes
   - Submit form
   - Verify success response

2. **Check database:**
   ```sql
   SELECT * FROM quest_completions 
   WHERE team_name = 'Test Team' 
   ORDER BY created_at DESC LIMIT 1;
   ```
   - Should show `status='approved'`
   - Should show `stars_awarded=<quest_stars>`
   - Should show `notified=FALSE`

3. **Check leaderboard:**
   - Navigate to `/leaderboard`
   - Verify test team appears with correct stars
   - Verify class breakdown calculated

4. **Monitor bot:**
   - Check `bot.log` for polling activity
   - Verify pending notification detected
   - Wait 5 minutes
   - Verify iMessage sent
   - Verify `notified=TRUE` in database

### Launch (12:00 PM)
- [ ] Announce game start
- [ ] Direct teams to `/submit` page
- [ ] Monitor submissions in real-time
- [ ] Check bot notifications every 5 minutes
- [ ] Monitor leaderboard updates

## Post-Launch Monitoring (May 2-13, 2026)

### Daily Checks
- [ ] Backend server health: `curl /health`
- [ ] Database connection working
- [ ] Bot polling active: Check `bot.log` for recent polls
- [ ] Submissions processing: Check `quest_completions` table
- [ ] Leaderboard updating: Verify latest submissions reflected
- [ ] No error logs in Render dashboard

### Performance Metrics
- Average submission processing time: < 1 second
- Leaderboard update latency: < 2 seconds
- Bot notification delay: 5-6 minutes (expected)
- Bot polling success rate: > 99%

### Issues and Resolutions

**Issue: Submissions not auto-approving**
- Check: `/api/submit-quest` endpoint working
- Check: `stars_awarded` being set from quest table
- Check: Database connection active

**Issue: Bot not sending notifications**
- Check: Bot polling `/api/bot/poll` successfully
- Check: Pending notifications found in database
- Check: 5-minute delay has elapsed
- Check: Phone numbers formatted correctly
- Check: AppleScript permissions on Mac

**Issue: Leaderboard not updating**
- Check: Submissions marked as `status='approved'`
- Check: `stars_awarded` populated
- Check: Leaderboard query working: 
  ```sql
  SELECT team_name, COALESCE(SUM(stars_awarded), 0) as total_stars
  FROM quest_completions 
  WHERE status = 'approved'
  GROUP BY team_name
  ORDER BY total_stars DESC;
  ```

**Issue: Admin can't adjust stars**
- Check: Admin secret correct
- Check: `/api/admin/update-submission` endpoint working
- Check: Database update reflected in leaderboard

## Rollback Procedures

### If Backend Fails
1. Revert to previous commit on GitHub
2. Render auto-redeploys
3. Check `/health` endpoint
4. Verify database still accessible

### If Bot Fails
1. Stop bot process: `Ctrl+C`
2. Check `bot.log` for errors
3. Verify server connectivity: `curl SERVER_URL/api/bot/poll`
4. Restart bot with fresh polling state

### If Database Fails
1. Check Neon dashboard for connection issues
2. Verify DATABASE_URL environment variable
3. Attempt manual reconnection
4. If persistent, use database backup

## Success Criteria

✅ **Functional Requirements:**
- Teams can submit quests with evidence photos
- Submissions auto-approved with stars awarded immediately
- Leaderboard updates in real-time
- Bot sends iMessage notifications after 5-minute delay
- Admin can review and adjust submissions
- Consent questions tracked correctly

✅ **Performance Requirements:**
- Submission processing: < 1 second
- Leaderboard update: < 2 seconds
- Bot notification: 5-6 minutes
- Database queries: < 100ms
- No data loss or corruption

✅ **Reliability Requirements:**
- 99.9% uptime during game period
- All submissions persisted
- All notifications sent
- No duplicate notifications
- Graceful error handling

## Post-Game (May 13, 2026)

### Data Preservation
- [ ] Export final leaderboard
- [ ] Archive all submissions and photos
- [ ] Backup database
- [ ] Document final statistics

### Cleanup
- [ ] Stop bot process
- [ ] Archive logs
- [ ] Remove sensitive data if needed
- [ ] Document lessons learned
