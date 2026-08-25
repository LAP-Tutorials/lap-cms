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
