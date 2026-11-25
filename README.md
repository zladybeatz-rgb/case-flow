# Case Flow (PWA)

Private case notes for up to 20 clients, laid out like your Word case note template (Date, Present, Purpose, Child sighted, then General, Attachment/Parenting, Safety/Wellbeing, CFP, Services, Plan). Voice dictation, reminders, PIN lock, backups, and one-tap Word export or send to your email.
Runs in the browser and installs to your phone's home screen. No server, no account, no tracking.
All data is stored on your device only (IndexedDB). GitHub Pages hosts the code, not your data.

## Put it online with GitHub Pages
1. On github.com, create a new repository (e.g. `case-flow-app`). Free Pages needs it to be public; that's fine because it only holds code.
2. Upload every file and the `icons` folder from this project to the repo root (Add file > Upload files).
3. Repo > Settings > Pages > Source: "Deploy from a branch", Branch: `main`, Folder: `/ (root)` > Save.
4. After a minute it's live at `https://YOUR-USERNAME.github.io/case-flow-app/`.

## Install on your phone
- Android (Chrome): open the link > menu > Install app.
- iPhone (Safari): open the link > Share > Add to Home Screen.

## Completion indicator
- The note screen shows a live "x of 9" bar and tappable section chips that tick off as you fill them in (tap a chip to jump to that section).
- Notes show an amber draft count (e.g. 4/9) until all nine are filled, then a green Complete badge. The home screen counts draft notes.

## Word and email
- Save as Word creates a .docx in your Downloads, formatted like your template.
- Send to my email opens your phone's share sheet with the Word file attached. Pick Gmail and paste your address (the app copies it for you). Add your address once in Settings.
- Say "next point" while dictating to start a new bullet.

## Notes
- Dictation uses the browser's speech recognition (best in Chrome on Android). Say each heading followed by "colon", then tap Sort into sections.
- Reminders alert while the app is open. For alarms when it's closed, tap Calendar on a reminder to add it to your phone's calendar.
- Export a backup from Settings regularly. Clearing browser data deletes everything.
- After you update files, reopen the app twice to pick up the new version.
