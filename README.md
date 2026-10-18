# ScratchCode pour ordinateur

ScratchCode, c'est Scratch 3 où chaque bloc s'écrit en une ligne de code, avec l'autocomplétion.
Cette version pour ordinateur marche **hors ligne et sans compte**.

## Télécharger

Va dans [**Releases**](https://github.com/haydarcreator/scratchcode-desktop/releases/latest) et prends le fichier pour ton système :

| Système | Fichier | Installation |
|---|---|---|
| Windows 10 / 11 | `ScratchCode-Setup-x.y.z.exe` | Double-clique et suis l'installateur. Si Windows affiche « Windows a protégé votre ordinateur », clique sur **Informations complémentaires** puis **Exécuter quand même**. |
| macOS (Intel et Apple Silicon) | `ScratchCode-x.y.z-arm64.dmg` (Mac M1/M2/M3/M4) ou `-x64.dmg` (Mac Intel) | Ouvre le .dmg et glisse ScratchCode dans Applications. La première fois : clic droit sur l'appli → **Ouvrir** → **Ouvrir**. |
| Linux | `ScratchCode-x.y.z-x86_64.AppImage`, `.deb` ou `.tar.gz` | AppImage : `chmod +x` puis double-clic. Debian/Ubuntu : `sudo apt install ./ScratchCode-x.y.z-amd64.deb`. |

Version en ligne : https://scratchcode.web.app · Appli Android : Google Play

## Construire

Les installateurs sont fabriqués par GitHub Actions (`.github/workflows/build.yml`) à chaque tag `v*`.
En local : `npm ci` puis `npm run dist:win`, `npm run dist:mac` ou `npm run dist:linux`.
Le dossier `app/` contient l'éditeur web déjà construit.

Scratch est une marque de la Scratch Foundation ; ScratchCode n'y est pas affilié.
Le personnage Scratch Cat est sous licence CC BY-SA 2.0. Les images des extensions viennent de scratch-gui (BSD-3).
