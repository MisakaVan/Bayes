# Authentication profile repair

Authentication sessions are created only after the matching business profile is available.
The internal identity remains `auth_users.id = users.uid`. Public UID allocation and
profile insertion use one D1 batch. Historical numeric gaps are never reassigned.

## Local delivery and deployment

- Deliver and validate the backend and Atlos changes before production approval.
- No authentication table migration is required. Update the WAF allowlist during
  the separately approved deployment to include `/admin/v1/auth`.
- Leave `AUTH_PROFILE_REPAIR_ENABLED` unset or set to `0` during initial rollout.
- Refresh the ignored image coverage manifest before the backend deployment, as
  required by the existing release workflow.

## Review and apply historical repairs

Use an administrator session and `Origin: https://admin.opendfieldmap.org`.

1. Read `GET /admin/v1/reports/auth-consistency` and record the baseline.
2. Take a database backup and retain the repair preview outside application logs.
3. Call `POST /admin/v1/auth/profile-repairs` with `{ "dryRun": true, "limit": 20 }`.
   Follow each returned `nextCursor` until it is null. The preview does not reserve
   numbers. Repair candidates are verified identities older than five minutes.
4. After production repair approval, repeat with `dryRun: false`, saving each
   returned internal UUID and public UID. Existing records are left untouched;
   identity conflicts and failures are returned for investigation.
5. Reread the consistency report. Expect verified missing profiles and active
   sessions without profiles to be zero, except explicitly unresolved conflicts.
   Registration history increases on the original registration dates.
6. Enable `AUTH_PROFILE_REPAIR_ENABLED=1` only after the historical batch is reviewed.

Automatic recovery runs every five minutes, at most 20 accounts per run, using a
cursor in the existing OEM_KV namespace. `LOCK_SCHEDULED_JOBS` disables it too.
Failures advance the cursor so later accounts can recover; the next scan retries
unresolved accounts. Unverified identities are reported but never repaired by cron.

Repairs keep the provider-derived `auth_users.name`, with the existing nickname
collision fallbacks. Registration time comes from the authentication account;
activity time comes from the latest retained session creation or registration.
They create default normal-user profiles, not invented progress or contributions.

## Recovery and rollback

Disable the repair flag first when investigating unexpected changes. Preserve the
repair results and established UIDs. Rolling back application code does not require
renumbering users or deleting repaired profiles. Never reset `sqlite_sequence` or
fill historical numeric gaps to make the sequence contiguous.
