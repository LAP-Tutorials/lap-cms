# Security rollout and operations

Deploy these changes in dependency order so the private/public Firestore split
and App Check enforcement do not interrupt existing users.

1. Register the reCAPTCHA Enterprise provider for both Firebase web apps, but
   leave enforcement in monitoring mode.
2. Deploy Cloud Functions, Firestore indexes, and Storage rules.
3. Backfill and verify the safe `publicProfiles` and `publicAuthors` mirrors.
4. Deploy the public site and CMS with
   `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` present at build time.
5. Deploy the final Firestore rules.
6. Enable App Check enforcement for Authentication, Firestore, and Storage,
   and deploy Functions with `ENFORCE_APP_CHECK=true`.
7. Test email and Google registration, an existing login, a comment with an
   image, a report, ban/unban, and public team/profile pages in production.

The retired callable functions `checkPasswordResetEligibility` and `syncUserIp`
should be removed when the Functions deployment asks to delete exports that are
no longer present.

IP addresses are private investigation signals. Never recreate the legacy
public `bannedIps` check or use an IP address by itself as an enforcement key.

## Device fingerprint pepper rotation

The fingerprint hash includes the server-only `DEVICE_FINGERPRINT_PEPPER` and a
stored key version. Rotate the pepper as an explicit migration, not an in-place
secret overwrite: deploy code that can read the current and previous key
versions, re-attest active devices into the new version, then retire the old
version after the longest supported session window. An immediate overwrite
invalidates comparison with every existing fingerprint hash and should be used
only when deliberately resetting the signal database.

Device fingerprints are review signals only. Exact server-issued device IDs,
account status, handle ownership, and observed behaviour are evaluated
together. A public IP address is never sufficient to block a person because
many unrelated people can share one network.

## Reliable Cloud Functions deployment on Windows

Firebase CLI 15.28.1 can intermittently fail while discovering functions over
localhost with `TypeError: fetch failed`. Use its file-based discovery mode to
bypass that local HTTP request:

```powershell
$env:FIREBASE_FUNCTIONS_DISCOVERY_OUTPUT_PATH = "true"
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"

try {
  firebase.cmd deploy --only functions --project lap-docs-c9078 --force
  if ($LASTEXITCODE -ne 0) {
    throw "Firebase Functions deployment failed with exit code $LASTEXITCODE"
  }
}
finally {
  Remove-Item Env:FIREBASE_FUNCTIONS_DISCOVERY_OUTPUT_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:FUNCTIONS_DISCOVERY_TIMEOUT -ErrorAction SilentlyContinue
}
```

This temporary manifest contains function metadata and secret names only; it
does not contain the value of `DEVICE_FINGERPRINT_PEPPER`.
