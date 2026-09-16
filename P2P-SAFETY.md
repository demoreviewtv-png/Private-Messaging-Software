# PrivacyChat add-on

`p2p.js` adds a small, safety-focused WebRTC data-channel feature to the existing app.

## Enable it

Add this immediately after the existing Firebase module setup in `index.html`:

```html
<script type="module" src="./p2p.js"></script>
```

The module expects the existing app to expose `window.db` and the signed-in UID as `window.friendCode` (the current app already uses that name). It injects a private-chat card, a connection status, and rate-limited text messaging. Firebase carries only short-lived WebRTC signaling; chat text travels over the encrypted WebRTC data channel.

## Safety features included

- Explicit friend-code connection instead of open discovery.
- Block and report API: `PrivateChatP2P.block(uid)` and `PrivateChatP2P.report(uid, reason)`.
- Short-lived signaling records, message length limits, and send throttling.
- Clear reminders not to share addresses, passwords, schedules, or private photos.
- No media permissions are requested by the data-channel feature.

For ages 12–14, keep accounts school/guardian managed, use server-side Firebase Security Rules, moderate reports, restrict friend-code sharing, and add a real age/guardian-consent flow before production use. Client-side checks alone cannot protect users.
