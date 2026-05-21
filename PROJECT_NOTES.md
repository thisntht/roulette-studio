# Roulette Studio Notes

## Links
- Repository: https://github.com/roulette-studio-app/roulette-studio
- App: https://roulette-studio-app.github.io/roulette-studio/
- Firebase project: roulette-studio-app

## Stack
- Static HTML/CSS/JavaScript
- Firebase Authentication with Google login
- Cloud Firestore for synced personal and shared roulette data
- GitHub Pages for hosting

## Main Files
- `index.html`: page structure and dialogs
- `app.js`: roulette logic, Firebase sync, sharing, project state
- `styles.css`: desktop/mobile layout and visual styling
- `firebase-config.js`: Firebase client config
- `firestore.rules`: Firestore security rules

## Deploy
Push commits to the `main` branch.
GitHub Pages deploys from `main` and the repository root.

Useful commands:

```powershell
git status
git add app.js index.html styles.css
git commit -m "Describe change"
git push origin main
```

On this PC, Git is bundled with GitHub Desktop:

```text
C:\Users\SIT\AppData\Local\GitHubDesktop\app-3.5.8\resources\app\git\cmd\git.exe
```

## App Behavior Notes
- Users log in with Google.
- Personal projects sync to Firestore under `users/{uid}/workspaces/default`.
- Shared roulettes sync under `sharedWorkspaces/{shareId}`.
- The UI exposes only share links, not share IDs.
- A share link contains the internal `share` query parameter needed to join.
- Existing local browser cache can delay visible changes after deploy.

## Current Product Direction
- Mobile-first usability matters.
- Keep the interface simple, white, light, and close to the current Codex/ChatGPT-style minimal feel.
- Avoid making backup/restore or technical sync controls prominent.
- Prefer direct icon controls for share/delete/more/reset.
