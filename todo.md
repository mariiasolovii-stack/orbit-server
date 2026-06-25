# Alta UGC Dashboard TODO

## Database & Schema
- [x] Define creators table (name, email, status, comp_type, base_rate, retainer_amount, platforms, tiktok_handle, instagram_handle, trial dates, docusign status)
- [x] Define posts table (creator_id, platform, post_date, views, review_status, post_url, is_trial_post, last_paid_tier)
- [x] Define payout_tiers table (views_threshold, payout_amount)
- [x] Define payouts table (creator_id, post_id, amount, payout_date, payout_type)
- [x] Define scripts table (title, format, content, created_at)
- [x] Define settings table (key, value pairs for config)
- [x] Run migrations and verify tables exist

## Backend Procedures
- [x] Create creators CRUD procedures (list, create, update, promote, fire)
- [x] Create posts CRUD procedures (list, create, update views, approve, delete)
- [x] Create payout calculation procedure (retroactive logic)
- [x] Create payout history procedure
- [x] Create scripts CRUD procedures
- [x] Create settings CRUD procedures
- [x] Create trial creator payout calculation procedure

## UGCTrackr API Integration
- [x] Create server-side proxy route for Trackr API calls
- [x] Implement bearer token authentication
- [x] Implement campaign ID parameter (0c300a5a-987d-4c2d-ac2f-c50a4bbbd98f)
- [x] Sync post view counts from Trackr API
- [x] Handle errors and rate limiting

## Frontend - Overview Page
- [x] Display key stats (active creators, trial creators, total posts, total views, payouts owed)
- [x] Show trial creator progress bars with countdown
- [x] Show needs-attention alerts (low post count, unsigned contracts)
- [x] Display top 5 posts table

## Frontend - Creator Roster Page
- [x] List all creators with status, compensation type, rate, platforms
- [x] Show trial countdown
- [x] Show DocuSign status
- [x] Add creator modal (name, email, platforms, comp_type, rate, retainer, trial start date)
- [x] Edit creator functionality
- [x] Promote creator from trial to active
- [x] Fire creator button
- [ ] DocuSign status modal (deferred - not critical for MVP)

## Frontend - Post Tracker Page
- [x] List all posts with creator, platform, date, views, review status
- [x] Manual post entry modal (creator, platform, date, views, post_url, review_status)
- [x] Update views modal (via Sync Trackr)
- [x] Approve post button
- [x] Delete post button
- [x] Sync Trackr button (calls proxy route)
- [x] Show pending vs approved posts

## Frontend - Payout Queue Page
- [x] Show current cycle payout amounts owed per creator
- [x] Display full payout history table (date, creator, post, type, amount)
- [ ] Cycle date picker (deferred - not critical for MVP)
- [x] Calculate retroactive payouts correctly

## Frontend - Script Library Page
- [x] List scripts with format tags
- [x] Filter by format (Talking Head, Non-Talking Head, Skit, Slideshow)
- [x] Add script modal (title, format, content)
- [x] Edit script functionality
- [x] Delete script button
- [x] Display script content in card format

## Frontend - Morning Message Builder Page
- [x] Tab for trial creator channel
- [x] Tab for active creator channel
- [x] Input fields: week start/end dates, min posts, announcement, script links, resources
- [x] Checkbox for "like to read" prompt
- [x] Generate message button
- [x] Preview pane
- [x] Copy to clipboard button
- [x] Format message correctly for Discord

## Frontend - Settings Page
- [x] Payout tiers table (views threshold, payout amount)
- [x] Add/delete tier buttons (via form)
- [x] Save tiers button
- [ ] Program defaults section (deferred - using hardcoded defaults)
- [ ] Resource links section (deferred - can be added later)
- [x] Trackr API key and campaign ID inputs
- [x] Save all settings buttons

## Payout Logic Implementation
- [x] Implement retroactive payout calculation (tier difference only)
- [ ] Implement trial creator warmup post logic ($5 per post) (deferred - not critical)
- [x] Implement trial creator base rate ($20 per video)
- [x] Implement trial creator tiered bonuses (10k, 25k, 50k, 100k, 250k, 1M, 1.5M, 5M views)
- [x] Implement active creator payout logic
- [x] Ensure minimum 300 views to qualify for payment
- [x] Handle retroactive payments when posts cross tiers

## Testing & Verification
- [x] Test creator CRUD operations
- [x] Test post creation and view updates
- [x] Test retroactive payout calculation (vitest: 9 tests passing)
- [x] Test trial creator payout logic (vitest: 9 tests passing)
- [ ] Test Trackr API sync (needs end-to-end verification)
- [x] Test message builder output
- [x] Test all settings save/load
- [x] Verify UI responsiveness and accessibility

## Deployment & Checkpoint
- [x] Create checkpoints after major milestones
- [x] All core features implemented and functional
- [ ] Final checkpoint before handoff


## Trackr API Integration (NEW)
- [ ] Store Trackr API key in settings
- [ ] Fix Trackr sync endpoint to use stored API key
- [ ] Verify end-to-end sync works with real API

## AI Daily Creator Summaries (NEW)
- [x] Build LLM procedure to analyze creator performance
- [x] Implement engagement analysis (TikTok vs IG)
- [x] Implement posting pattern detection (frequency, gaps, consistency)
- [x] Implement content quality flags (hashtags, captions)
- [x] Create daily summary page UI
- [ ] Set up automated daily summary generation via heartbeat
- [x] Display summaries with flags and alerts
