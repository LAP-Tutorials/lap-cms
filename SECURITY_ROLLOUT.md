# Security rollout order

Deploy these changes in this order so existing public profiles remain available
while the private/public Firestore split is introduced.

1. Create the Cloud Functions secret `DEVICE_FINGERPRINT_PEPPER` with a new,
   randomly generated value of at least 32 bytes. Do not commit that value.
2. Deploy Cloud Functions. This installs device attestation, report submission,
   moderation validation, attachment cleanup, and the public-profile mirror
   triggers.
3. Deploy the CMS, sign in as an Admin or Super Admin, open **Users**, and run
   **Sync Safe Public Profiles**. Confirm that both reader and staff counts are
   reported.
4. Deploy `firestore.rules` and `storage.rules`.
5. Deploy the public site and the remaining CMS changes.
6. Test email and Google registration, an existing login, a comment with an
   image, a report, ban/unban, and a public team/profile page in production.

The retired callable functions `checkPasswordResetEligibility` and `syncUserIp`
should be removed when the Functions deployment asks to delete exports that are
no longer present.

IP addresses are private investigation signals. Never recreate the legacy
public `bannedIps` check or use an IP address by itself as an enforcement key.

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
