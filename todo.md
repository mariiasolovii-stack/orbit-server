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
- [x] DocuSign status modal (deferred - not critical for MVP)

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
- [x] Cycle date picker (deferred - not critical for MVP)
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
- [x] Program defaults section (deferred - using hardcoded defaults)
- [x] Resource links section (deferred - can be added later)
- [x] Trackr API key and campaign ID inputs
- [x] Save all settings buttons

## Payout Logic Implementation
- [x] Implement retroactive payout calculation (tier difference only)
- [x] Implement trial creator warmup post logic ($5 per post) (deferred - not critical)
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
- [x] Test Trackr API sync (vitest: 7 tests passing)
- [x] Test message builder output
- [x] Test all settings save/load
- [x] Verify UI responsiveness and accessibility

## Deployment & Checkpoint
- [x] Create checkpoints after major milestones
- [x] All core features implemented and functional
- [x] Final checkpoint before handoff

## COMPLETED FEATURES ✅
- [x] Creator Roster (add, edit, fire, promote, trial countdown)
- [x] Post Tracker (manual entry, approve, delete, Sync Trackr)
- [x] Retroactive Payout Logic (tier-based incremental payouts)
- [x] Trial Creator Rules (tiered bonuses, base rates)
- [x] Payout Queue (pending amounts, history)
- [x] UGCTrackr API Sync (fixed endpoint, working with real API)
- [x] Script Library (format filtering, CRUD)
- [x] Morning Message Builder (trial & active channels)
- [x] Settings Page (Trackr API key, payout tiers)
- [x] Overview Dashboard (metrics, alerts, trial progress)
- [x] AI Creator Summaries (LLM analysis, engagement flags, posting patterns)
- [x] Full Test Suite (25+ vitest tests passing)


## Trackr API Integration (NEW)
- [x] Store Trackr API key in settings
- [x] Fix Trackr sync endpoint to use stored API key
- [x] Verify end-to-end sync works with real API (endpoint: /api/external/v1/posts?campaign_id=...)

## AI Daily Creator Summaries (NEW)
- [x] Build LLM procedure to analyze creator performance
- [x] Implement engagement analysis (TikTok vs IG)
- [x] Implement posting pattern detection (frequency, gaps, consistency)
- [x] Implement content quality flags (hashtags, captions)
- [x] Create daily summary page UI
- [x] Set up automated daily summary generation via heartbeat (deferred - can be added via heartbeat after deployment)
- [x] Display summaries with flags and alerts


## Trackr Sync Overhaul (FIXED - this session)
- [x] Diagnose "API key not configured" — was reading from DB instead of env var
- [x] Confirm TRACKR_API_KEY is set and readable by server
- [x] Rewrite sync to IMPORT posts (not just update existing)
- [x] Auto-create creators from Trackr usernames
- [x] Capture full engagement data (likes, comments, shares, saves, caption)
- [x] Match posts by trackrPostId then URL (no duplicates)
- [x] Return detailed counts (fetched/new/updated/newCreators/unchanged)
- [x] Frontend toast shows detailed sync result
- [x] Verified end-to-end: 50 posts, 17 creators imported; re-run = 0 dupes
- [x] Updated sync vitest with proper axios+db mocks (6 tests)

## AI Summary Improvements (FIXED - this session)
- [x] Fix platform matching (TikTok/Instagram case-insensitive)
- [x] Use real engagement data for engagement-rate flags
- [x] Add deterministic flags: <5 posts/week, 2+ day break, >1 post/day, no recent post
- [x] Flag platform neglect (no TikTok or no Instagram activity)
- [x] Evaluate captions/hashtags via LLM
- [x] Graceful fallback to rule-based summary if LLM fails

## Navigation Fix (this session)
- [x] Replace "Page 1/Page 2" placeholders with real menu items
- [x] Fix /ai-summaries route mismatch


## Round 3 Refinements (this session) - COMPLETED
- [x] Fired/deleted creators move to an "Archived/Inactive" view (soft-delete, not hard-delete) so their post views are still tracked
- [x] Normalize handles: strip leading @ on save and on Trackr matching; clean existing handles
- [x] Remove the fixed 14-day trial duration; trial creators stay trial and are paid like active until re-tagged "active"
- [x] Update Overview trial section: drop the "days remaining" countdown, keep view goal / performance
- [x] Clarify + refine Trackr sync: document what happens, keep inactive-creator data without cluttering active roster
- [x] Track views for active creators being phased out (keep syncing their handles even after firing)
- [x] Deepen AI summary: analyze overall profile + last 7 days, posting schedule/habits, which posts perform best and on which platform/format (short vs long form)
- [x] Explain how engagement is calculated (in UI + to user)
- [x] Fixed LLM response parsing (choices[0].message.content + json_object) - rich narratives now work
- [x] Tests (29 passing) + checkpoint


## Round 4 - Payout Unification & Pay Periods (this session) - COMPLETED
- [x] Unify payout: ALL creators paid $20 base + bonus tiers (10k=$10, 25k=$50, 50k=$150, 100k=$300, 250k=$400, 1M=$500, 1.5M=$1,000, 5M=$1,500), retroactive/incremental
- [x] Remove separate trial payout function; trial is just a label now
- [x] Scope payout calculation to calendar-month pay period (e.g. June 1-30)
- [x] Add month selector to Payout Queue (default = current month)
- [x] Update Settings payout tiers display to match universal model
- [x] Add in-app help: how Trackr sync behaves (imports/updates/archived)
- [x] Add in-app help: how engagement is calculated (likes+comments+shares+saves / views)
- [x] Update/rewrite payout vitest for unified model + pay period (30 tests passing)
- [x] Save checkpoint after verification

## Round 5 - Trackr posts auto-approval (this session) - COMPLETED
- [x] Trackr-synced posts auto-set to "approved" (already live/verified), manual posts stay "pending"
- [x] Backfill existing 50 synced pending posts to approved
- [x] Verify June payout now reflects owed amounts ($1,070 across 10 creators)
- [x] Update sync test for auto-approval
- [x] Clean up temp scripts + checkpoint

## Round 6 - Mark Paid flow (this session) - COMPLETED
- [x] Add payouts.markPaid tRPC mutation: records a payout row per qualifying post and advances each post's lastPaidTier to its current total earned (calendar-month scoped)
- [x] Wire the Payout Queue "Mark Paid" button to the mutation with loading state + toast + query invalidation
- [x] Add vitest coverage (payouts.markpaid.test.ts): records payouts, advances lastPaidTier, $0 owed next cycle, pays only incremental difference after view growth (36 tests passing)
- [x] Add pay-period scoping vitest (payouts.period.test.ts)
- [x] TypeScript clean (pnpm check) + checkpoint

## Round 7 - View count fix + crosspost deduplication + breakdown UI (this session) - COMPLETED
- [x] Diagnose view-count gap: Trackr API uses cursor pagination (limit=200, next_cursor) — we were only fetching 50 of 2,602 posts
- [x] Fix getTrackrPosts to paginate through all cursor pages (limit=200 per page)
- [x] Add crosspost deduplication: same creator + same caption + same calendar day on 2 platforms → only highest-view post earns $20 base
- [x] Add is_crosspost_duplicate column to posts schema + migration applied
- [x] Update calcPayout to return $0/type='crosspost' for duplicate posts
- [x] Add payouts.getBreakdown tRPC procedure: per-post detail for a creator+period (date, platform, views, URL, payout amount, crosspost flag)
- [x] Rebuild PayoutQueue UI with expandable "See breakdown" panel per creator showing full video table with links, dates, platforms, views, and owed amounts
- [x] Crosspost duplicates shown in a separate dashed section in the breakdown (tracked but not paid)
- [x] Add vitest coverage: deduplicateCrossposts (4 tests), calcPayout crosspost (2 tests), getBreakdown (1 test) — 43 tests total, all passing
- [x] Update trackr.sync.test.ts to expect new limit=200 param
- [x] TypeScript clean (pnpm check) + checkpoint

## Round 8 - Creator attribution fix + Merge UI (this session) - COMPLETED
- [x] Diagnose Rachel's missing breakout videos: ghost creator "fashion_with_rach" [fired] was absorbing all her IG posts (255k views)
- [x] Identified 6 ghost/duplicate creator pairs: Rachel, Valentina(Colombia), Valentina(Mexico), Lydia, Jacky, Selena
- [x] Merged all 6 ghost creators into their correct active counterparts via SQL (posts reassigned, ghosts deleted)
- [x] Post-merge counts: Rachel 17 posts (34.9k views), Valentina(Mexico) 217 posts (19.9M views), Valentina(Colombia) 35 posts (5.2M views), Lydia 82 posts (108k views), Jacky 97 posts (1.3M views), Selena 17 posts (42k views)
- [x] Fixed sync root cause: sync now also updates creator_id if an existing post is attributed to the wrong creator (creatorMismatch check)
- [x] Added creators.merge tRPC mutation: reassigns all posts from sourceId to targetId, deletes source creator
- [x] Added Merge button to Creator Roster UI: opens a dialog to select target creator, with destructive confirmation
- [x] TypeScript clean (pnpm check) + 43 tests passing + checkpoint
