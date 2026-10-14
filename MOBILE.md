# Frosty — private-league sync (mobile app + desktop extension)

ESPN blocks username/password logins from cloud servers (captcha wall) and blocks
browser-direct calls (CORS). Two paths bypass both — this is how FantasyPros-grade
private-league sync actually works:

## iPhone (no Mac needed) — one-time session copy

The ESPN session (`SWID` + `espn_s2`) is account-bound, lives for months, and works on
every device — so you copy it ONCE from your PC, paste into the app on your iPhone, and
the app remembers it (stored on your device, sent only to this app's own API):

1. On your PC (Chrome/Edge): load the `extension/` folder via `chrome://extensions` →
   Developer mode → **Load unpacked**.
2. Log into espn.com, click the ❄ Frosty icon → **Copy for iPhone**.
3. On your iPhone: open https://frosty-fantasy-pros.vercel.app → Connect → expand
   "Have a league URL? Paste it instead" → paste → Sync. Done — remembered thereafter.
4. Safari share sheet → **Add to Home Screen** for the real app feel.

A native iPhone app additionally requires a Mac + Xcode (Apple rule); the repo ships
`@capacitor/ios` so `npx cap add ios` + a Swift port of EspnBridge is ready if ever
you have Mac access.

## Android app (optional — true "Sign in with ESPN")

Capacitor-wrapped PWA with a native bridge: opens ESPN's REAL login page in a Custom
Tab (captcha works, it's ESPN's own UI on your IP), then the OS cookie store hands back
`espn_s2` + `SWID` after you log in. The app never sees your password.

One-time build (needs Android Studio or the Android SDK + JDK 17):

```
cd client
npm run build
npx cap sync android
npx cap open android     # then Build > Generate Signed Bundle / or press Run
```

CLI-only APK build (no Android Studio):

```
cd client/android
./gradlew assembleDebug
# APK at app/build/outputs/apk/debug/app-debug.apk — sideload it on your phone
```

## Desktop extension (Chrome/Edge)

Load it once:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select the `extension/` folder in this repo

Then: log in to espn.com in the browser → click the ❄ Frosty icon → "Send my ESPN
session". The app opens with your session live.

## Where the session lives

- Memory of the server per-request (headers `X-Fantasy-SWID` / `X-Fantasy-ESPN-S2`)
- Never written to disk, never committed, cleared when the tab closes
