# End-to-End Test Plan: Harvard Race Quest System

## Overview
This document outlines the complete workflow for testing the quest submission, auto-approval, and iMessage notification system.

## Game Schedule
- **Start Date**: May 2, 2026
- **End Date**: May 13, 2026
- **Duration**: 12 days

## System Architecture

```
Team Submission
    ↓
/api/submit-quest (Auto-Approve)
    ↓
quest_completions table (status='approved', stars_awarded=X, notified=FALSE)
    ↓
Leaderboard Updates Immediately
    ↓
Bot Polls /api/bot/poll (every 60 seconds)
    ↓
Bot Waits 5 Minutes (tracks completion_id timestamp)
    ↓
Bot Sends iMessage to Group Chat
    ↓
Bot Calls /api/bot/mark-notified
    ↓
quest_completions (notified=TRUE, notified_at=NOW())
```

## Test Scenarios

### Scenario 1: Single Quest Submission
**Objective**: Verify complete workflow from submission to iMessage notification

**Prerequisites**:
- Team registered in waitlist
- Team has valid `team_secret_code`
- At least one quest available in `quests` table
- Bot running and polling server

**Steps**:
1. Navigate to `/submit` page
2. Enter team name and secret code
3. Select a quest (e.g., "Take a selfie at Harvard Square")
4. Upload evidence photo
5. Check consent boxes (Under 21, Promo use)
6. Submit form

**Expected Results**:
- ✅ Form submission succeeds with "success" response
- ✅ Entry appears in `quest_completions` with `status='approved'`
- ✅ `stars_awarded` set to quest's default stars value
- ✅ `notified=FALSE` initially
- ✅ Leaderboard updates immediately with new stars
- ✅ Team portal shows completed quest
- ✅ After 5 minutes: iMessage sent to team group chat
- ✅ `notified=TRUE` and `notified_at` populated

**Verification Queries**:
```sql
-- Check submission
SELECT * FROM quest_completions WHERE team_name = 'Test Team' ORDER BY created_at DESC LIMIT 1;

-- Check leaderboard
SELECT team_name, COALESCE(SUM(stars_awarded), 0) as total_stars 
FROM quest_completions 
WHERE team_name = 'Test Team' AND status = 'approved'
GROUP BY team_name;

-- Check notification status
SELECT id, team_name, status, notified, notified_at 
FROM quest_completions 
WHERE team_name = 'Test Team' 
ORDER BY created_at DESC LIMIT 1;
```

### Scenario 2: Multiple Team Members Notification
**Objective**: Verify iMessage group chat includes all team members

**Prerequisites**:
- Team with 2+ members registered
- All members have valid phone numbers in `all_phone_numbers` array

**Steps**:
1. Submit quest as team
2. Wait 5 minutes
3. Check Messages app on Mac for group chat notification

**Expected Results**:
- ✅ Group chat created with all team members
- ✅ Message includes quest name and stars awarded
- ✅ All members receive notification simultaneously

**Verification**:
- Check Messages app for group chat
- Verify all phone numbers in group
- Check bot.log for successful iMessage send

### Scenario 3: Admin Review and Star Adjustment
**Objective**: Verify admin can review, reject, or adjust stars after submission

**Prerequisites**:
- Admin dashboard accessible at `/admin/quests?secret=ADMIN_SECRET`
- Submission already in database

**Steps**:
1. Navigate to admin dashboard
2. Find submission in review list
3. Test approve/reject buttons
4. Test star adjustment input
5. Submit changes

**Expected Results**:
- ✅ Submission appears in admin list
- ✅ Admin can adjust stars
- ✅ Changes reflected in leaderboard
- ✅ Notification status updates correctly

### Scenario 4: Bot Polling Verification
**Objective**: Verify bot correctly polls and processes notifications

**Prerequisites**:
- Bot running with polling enabled
- Server accessible at `SERVER_URL`

**Steps**:
1. Check bot.log for polling activity
2. Submit quest
3. Monitor bot.log for pending notification detection
4. Wait 5 minutes
5. Monitor bot.log for iMessage send

**Expected Results**:
- ✅ Bot logs show poll requests every 60 seconds
- ✅ Pending notification detected
- ✅ Timestamp tracked for 5-minute delay
- ✅ After 5 minutes: iMessage sent
- ✅ Completion marked as notified

**Sample Bot Log Output**:
```
2026-05-02 10:00:00 - INFO - Bot polling started. Poll interval: 60s, Notification delay: 300s
2026-05-02 10:01:00 - INFO - Found 1 pending notifications
2026-05-02 10:01:00 - INFO - Tracking completion 42 for team Test Team
2026-05-02 10:02:00 - INFO - Completion 42 waiting 240s more before notification
2026-05-02 10:06:00 - INFO - Sending message to ['1234567890']: ✨ Stars awarded!...
2026-05-02 10:06:00 - INFO - Message sent successfully.
2026-05-02 10:06:00 - INFO - Marked completion 42 as notified
```

### Scenario 5: Leaderboard Real-Time Updates
**Objective**: Verify leaderboard reflects stars immediately after submission

**Prerequisites**:
- Leaderboard accessible at `/leaderboard`
- Multiple teams with submissions

**Steps**:
1. Note current leaderboard standings
2. Submit quest as team
3. Refresh leaderboard
4. Verify new stars reflected

**Expected Results**:
- ✅ Leaderboard updates within seconds
- ✅ Team moves up in rankings if applicable
- ✅ Class breakdown recalculated
- ✅ Winning class highlighted

### Scenario 6: Consent Tracking
**Objective**: Verify consent answers are recorded

**Prerequisites**:
- Submission form with consent questions

**Steps**:
1. Submit quest with both consents checked
2. Submit another quest with consents unchecked
3. Query database

**Expected Results**:
- ✅ `consent_under_21` and `consent_promo` correctly recorded
- ✅ Admin can filter by consent status

**Verification Query**:
```sql
SELECT team_name, consent_under_21, consent_promo 
FROM quest_completions 
ORDER BY created_at DESC LIMIT 5;
```

## Deployment Checklist

### Backend (app.py)
- [ ] Auto-approval logic implemented
- [ ] Stars awarded immediately on submission
- [ ] `/api/bot/poll` endpoint working
- [ ] `/api/bot/mark-notified` endpoint working
- [ ] Leaderboard calculation correct
- [ ] Admin review dashboard functional
- [ ] Database migrations applied

### Bot (bot.py)
- [ ] Polling loop implemented
- [ ] 5-minute delay logic working
- [ ] iMessage sending functional
- [ ] Notification marking working
- [ ] Environment variables configured
- [ ] Logging comprehensive

### Database (Neon PostgreSQL)
- [ ] `quest_completions` table has all columns
- [ ] `notified` column defaults to FALSE
- [ ] `notified_at` column for timestamps
- [ ] `all_phone_numbers` array populated for all teams
- [ ] Indexes on `status` and `notified` for performance

### Frontend (templates)
- [ ] Submit page accepts file uploads
- [ ] Consent questions displayed
- [ ] Team portal shows completions
- [ ] Leaderboard displays rankings
- [ ] Admin dashboard accessible

## Performance Considerations

### Database Queries
- Leaderboard query uses LEFT JOIN for efficiency
- Polling query filters on `notified = FALSE` for speed
- Consider adding indexes:
  ```sql
  CREATE INDEX idx_quest_completions_status ON quest_completions(status);
  CREATE INDEX idx_quest_completions_notified ON quest_completions(notified);
  CREATE INDEX idx_quest_completions_team ON quest_completions(team_name);
  ```

### Bot Polling
- Poll interval: 60 seconds (configurable)
- Reduces database load vs. webhook model
- Scales to handle many teams
- Timestamp tracking prevents memory leaks

## Rollback Plan

If issues arise:
1. Stop bot polling: Set `POLL_INTERVAL` to very large value
2. Revert to webhook model: Modify bot.py to use `/webhook` endpoint
3. Manual notification: Use admin dashboard to send messages
4. Database recovery: Use soft delete to preserve data

## Monitoring and Logging

### Key Metrics to Track
- Submissions per hour
- Average notification delay
- Bot polling success rate
- iMessage send success rate
- Leaderboard update latency

### Log Files
- **app.log**: Flask application logs
- **bot.log**: Bot polling and iMessage logs
- **database.log**: Query performance logs

## Success Criteria

✅ All scenarios pass
✅ Notifications sent within 5-10 minutes of submission
✅ Leaderboard updates within 1 second
✅ No data loss or corruption
✅ Bot handles 100+ teams without issues
✅ Admin can review and adjust submissions
✅ Consent tracking working correctly
