# Sample Data and Admin Setup Guide

## Pre-Launch Setup

### 1. Populate Quests Table

Before launching the game, populate the `quests` table with quest definitions. Connect to your Neon PostgreSQL database and run:

```sql
-- Clear existing quests (if any)
DELETE FROM quests;

-- Insert quest definitions
INSERT INTO quests (name, description, stars, class_year) VALUES
-- Universal Quests (all classes)
('Take a selfie at Harvard Square', 'Capture a photo of yourself at the iconic Harvard Square intersection', 10, NULL),
('Visit the Widener Library', 'Get a photo at the entrance of Widener Library, one of Harvard''s most recognizable buildings', 15, NULL),
('Find the John Harvard Statue', 'Locate and photograph the famous John Harvard statue in front of University Hall', 20, NULL),
('Attend a Harvard event', 'Participate in and document a Harvard campus event (speaker, performance, etc.)', 25, NULL),
('Interview a Harvard student', 'Get a quote and photo from a Harvard student about their experience', 30, NULL),
('Visit the Harvard Yard', 'Capture a photo in the historic Harvard Yard', 10, NULL),
('Get a photo at the Science Center', 'Document your visit to the Harvard Science Center', 12, NULL),
('Explore the Houghton Library', 'Take a photo at the Houghton Library entrance', 15, NULL),
('Visit Memorial Church', 'Capture a photo at the Memorial Church', 18, NULL),
('Get a photo at the Radcliffe Camera', 'Document your visit to this iconic building', 20, NULL),

-- Class-Specific Quests
('Freshman: Attend an orientation event', 'Participate in a freshman-specific orientation activity', 15, 'Freshman'),
('Freshman: Visit the freshman dorms', 'Get a photo at your freshman house', 12, 'Freshman'),
('Sophomore: Explore the Yard', 'Take a guided tour and document the experience', 18, 'Sophomore'),
('Sophomore: Visit the Sophomore dorms', 'Get a photo at your sophomore house', 12, 'Sophomore'),
('Junior: Attend a junior event', 'Participate in a junior-specific campus event', 20, 'Junior'),
('Junior: Visit the junior houses', 'Get a photo at your junior house', 15, 'Junior'),
('Senior: Capture a senior photo', 'Get a professional-style photo on campus', 25, 'Senior'),
('Senior: Visit your senior house', 'Get a photo at your senior house', 15, 'Senior'),

-- Bonus/Challenge Quests
('Get a photo with a Harvard mascot', 'Find and photograph the Harvard mascot (John the Pilgrim)', 50, NULL),
('Collect signatures from 5 Harvard students', 'Get autographs from 5 different Harvard students', 40, NULL),
('Create a team video', 'Film a 30-second video of your team at Harvard', 60, NULL),
('Visit all 12 Harvard Houses', 'Get a photo at each of the 12 residential houses', 100, NULL),
('Attend a Harvard sports event', 'Participate in and document a Harvard athletic event', 35, NULL);

-- Verify insertion
SELECT id, name, stars, class_year FROM quests ORDER BY id;
```

**Expected Output:**
```
 id |                    name                     | stars | class_year 
----+---------------------------------------------+-------+------------
  1 | Take a selfie at Harvard Square             |    10 | 
  2 | Visit the Widener Library                   |    15 | 
  3 | Find the John Harvard Statue                |    20 | 
  4 | Attend a Harvard event                      |    25 | 
  5 | Interview a Harvard student                 |    30 | 
  ...
```

### 2. Create Test Teams

For testing before launch, create sample teams:

```sql
-- Insert test teams
INSERT INTO waitlist (name, email, phone, team_name, team_secret_code, teammates, class_year, all_phone_numbers) VALUES
('Alice Johnson', 'alice@harvard.edu', '1234567890', 'Team Alpha', 'SECRET1', 
 '[{"name":"Bob Smith","email":"bob@harvard.edu","phone":"1234567891"},{"name":"Carol Davis","email":"carol@harvard.edu","phone":"1234567892"}]',
 'Freshman', ARRAY['1234567890', '1234567891', '1234567892']),

('David Chen', 'david@harvard.edu', '2345678901', 'Team Beta', 'SECRET2',
 '[{"name":"Emma Wilson","email":"emma@harvard.edu","phone":"2345678902"}]',
 'Sophomore', ARRAY['2345678901', '2345678902']),

('Frank Miller', 'frank@harvard.edu', '3456789012', 'Team Gamma', 'SECRET3',
 '[{"name":"Grace Lee","email":"grace@harvard.edu","phone":"3456789013"},{"name":"Henry Brown","email":"henry@harvard.edu","phone":"3456789014"}]',
 'Junior', ARRAY['3456789012', '3456789013', '3456789014']),

('Iris Taylor', 'iris@harvard.edu', '4567890123', 'Team Delta', 'SECRET4',
 '[{"name":"Jack Martinez","email":"jack@harvard.edu","phone":"4567890124"}]',
 'Senior', ARRAY['4567890123', '4567890124']);

-- Verify insertion
SELECT team_name, team_secret_code, class_year, all_phone_numbers FROM waitlist ORDER BY created_at DESC LIMIT 4;
```

### 3. Verify Database Setup

Run these queries to ensure everything is configured correctly:

```sql
-- Check quests table
SELECT COUNT(*) as quest_count FROM quests;
-- Expected: 25+ quests

-- Check waitlist table
SELECT COUNT(*) as team_count FROM waitlist WHERE is_active = TRUE;
-- Expected: 4+ test teams

-- Check quest_completions table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'quest_completions'
ORDER BY ordinal_position;
-- Expected: All columns including stars_awarded, notified, notified_at

-- Check message_log table
SELECT COUNT(*) FROM message_log;
-- Expected: 0 (empty before launch)

-- Test leaderboard query
SELECT w.team_name, w.class_year, COALESCE(SUM(qc.stars_awarded), 0) as total_stars
FROM waitlist w
LEFT JOIN quest_completions qc ON w.team_name = qc.team_name AND qc.status = 'approved'
WHERE w.is_active = TRUE
GROUP BY w.team_name, w.class_year
ORDER BY total_stars DESC;
-- Expected: All teams with 0 stars initially
```

## Admin Setup

### 1. Set Admin Secret

In your Render environment variables, set a secure admin secret:

```
ADMIN_SECRET=your-very-secure-random-string-here
```

Generate a secure secret:
```bash
# On Mac/Linux
openssl rand -base64 32
# Example output: xK9mL2pQ7vN4bR8sT1wX5yZ3aB6cD0eF9gH2jK4lM7nO

# Or use Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 2. Access Admin Dashboards

**Admin Quests Dashboard:**
```
https://orbit-server-90x3.onrender.com/admin/quests?secret=your-admin-secret
```

**Admin Bot Panel:**
```
https://orbit-server-90x3.onrender.com/admin/bot?secret=your-admin-secret
```

**Admin Signups:**
```
https://orbit-server-90x3.onrender.com/admin/signups?secret=your-admin-secret
```

### 3. Test Submission Workflow

**Step 1: Navigate to Submit Page**
```
https://orbit-server-90x3.onrender.com/submit
```

**Step 2: Fill Form**
- Team Name: `Team Alpha`
- Secret Code: `SECRET1`
- Quest: Select "Take a selfie at Harvard Square" (10 stars)
- Evidence: Upload a test image
- Consent: Check both boxes
- Submit

**Step 3: Verify in Database**
```sql
SELECT * FROM quest_completions 
WHERE team_name = 'Team Alpha' 
ORDER BY created_at DESC LIMIT 1;
```

Expected result:
```
 id | team_name  | quest_id | status   | stars_awarded | notified | notified_at
----+------------+----------+----------+---------------+----------+-------------
  1 | Team Alpha |    1     | approved |      10       | false    | NULL
```

**Step 4: Check Leaderboard**
```
https://orbit-server-90x3.onrender.com/leaderboard
```

Expected: Team Alpha shows 10 stars

**Step 5: Check Team Portal**
```
https://orbit-server-90x3.onrender.com/team/Team%20Alpha
```

Expected: Shows completed quest with 10 stars

## Bot Testing

### 1. Start Bot on Mac

```bash
cd /path/to/orbit-server
export SERVER_URL="https://orbit-server-90x3.onrender.com"
export POLL_INTERVAL="60"
export NOTIFICATION_DELAY="300"

python3 bot.py
```

Expected output:
```
Starting Orbit iMessage Bot...
Server URL: https://orbit-server-90x3.onrender.com
Poll interval: 60s
Notification delay: 300s

2026-05-02 00:00:01 - INFO - Bot polling started. Poll interval: 60s, Notification delay: 300s
2026-05-02 00:01:01 - INFO - Found 0 pending notifications
2026-05-02 00:02:01 - INFO - Found 0 pending notifications
```

### 2. Submit a Test Quest

While bot is running, submit a quest via the web form (see Step 2-3 above).

### 3. Monitor Bot Logs

In another terminal:
```bash
tail -f bot.log
```

Expected sequence:
```
2026-05-02 00:05:01 - INFO - Found 1 pending notifications
2026-05-02 00:05:01 - INFO - Tracking completion 1 for team Team Alpha
2026-05-02 00:06:01 - INFO - Completion 1 waiting 240s more before notification
2026-05-02 00:07:01 - INFO - Completion 1 waiting 180s more before notification
2026-05-02 00:08:01 - INFO - Completion 1 waiting 120s more before notification
2026-05-02 00:09:01 - INFO - Completion 1 waiting 60s more before notification
2026-05-02 00:10:01 - INFO - Sending message to ['1234567890', '1234567891', '1234567892']: ✨ Stars awarded!...
2026-05-02 00:10:01 - INFO - Message sent successfully.
2026-05-02 00:10:01 - INFO - Marked completion 1 as notified
```

### 4. Verify iMessage Sent

Check the Messages app on Mac for a group chat from the bot with:
- All team members' phone numbers
- Message: "✨ Stars awarded! You earned 10 stars for 'Take a selfie at Harvard Square'! ✨"

### 5. Verify Database Update

```sql
SELECT * FROM quest_completions WHERE id = 1;
```

Expected: `notified = true` and `notified_at` populated

## Admin Review Testing

### 1. Access Admin Dashboard

```
https://orbit-server-90x3.onrender.com/admin/quests?secret=your-admin-secret
```

### 2. Review Submission

- Find the submission from Team Alpha
- View the uploaded photo
- See consent responses
- See current stars awarded (10)

### 3. Adjust Stars

- Change stars from 10 to 15 (for exceptional quality)
- Click "Update Stars"
- Verify leaderboard updates to 15 stars

### 4. Verify in Database

```sql
SELECT * FROM quest_completions WHERE team_name = 'Team Alpha';
```

Expected: `stars_awarded = 15`

## Pre-Launch Checklist

Before May 2, 2026 at 12:00 PM:

- [ ] Quests table populated with 25+ quests
- [ ] Test teams created in waitlist table
- [ ] Admin secret configured in Render
- [ ] All admin dashboards accessible
- [ ] Submit workflow tested end-to-end
- [ ] Bot polling verified
- [ ] iMessage notifications tested
- [ ] Leaderboard updates verified
- [ ] Team portal displays correctly
- [ ] Database backups configured
- [ ] Render health checks passing
- [ ] Bot logs monitored and clean
- [ ] All environment variables set
- [ ] File upload directory writable

## Launch Day Procedures

### 9:00 AM - Final Checks
```bash
# Check backend health
curl https://orbit-server-90x3.onrender.com/health

# Check database connection
# (via Neon dashboard or psql)

# Start bot on Mac
python3 bot.py &

# Monitor logs
tail -f bot.log
```

### 10:00 AM - Test Run
- Submit test quest
- Wait 5 minutes
- Verify iMessage sent
- Check leaderboard
- Verify admin dashboard

### 12:00 PM - Launch
- Announce game start
- Direct teams to `/submit`
- Monitor submissions in real-time
- Check bot notifications every 5 minutes

## Troubleshooting

### Submissions Not Appearing

1. Check backend logs in Render dashboard
2. Verify DATABASE_URL is correct
3. Test database connection:
   ```bash
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM quest_completions;"
   ```

### Bot Not Polling

1. Check bot.log for errors
2. Verify SERVER_URL is correct
3. Test connectivity:
   ```bash
   curl https://orbit-server-90x3.onrender.com/api/bot/poll
   ```

### iMessages Not Sending

1. Check bot.log for AppleScript errors
2. Verify phone numbers are formatted correctly
3. Check Messages app permissions on Mac
4. Test AppleScript manually:
   ```bash
   osascript -e 'tell application "Messages" to activate'
   ```

### Leaderboard Not Updating

1. Verify submissions have `status = 'approved'`
2. Verify `stars_awarded` is populated
3. Test query manually:
   ```sql
   SELECT team_name, COALESCE(SUM(stars_awarded), 0) as total
   FROM quest_completions 
   WHERE status = 'approved'
   GROUP BY team_name;
   ```

### Admin Dashboard Not Accessible

1. Verify admin secret is correct
2. Check Render logs for authentication errors
3. Verify URL includes `?secret=your-secret`
