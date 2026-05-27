# Mairie Port-de-Paix — poste de travail (Electron)

Application desktop (Electron + React + Vite) pour la mairie de Port-de-Paix.

## Prérequis

- Node.js LTS
- npm

Sur **macOS** : Xcode Command Line Tools (`xcode-select --install`) pour compiler l’installateur.

## Installation

```bash
git clone https://github.com/Mikelaroselouisiv/mppx.git
cd mppx
npm install
```

## Développement

```bash
npm run dev
```

## Build production

**Windows :**

```bash
npm run dist:win
```

Installateur : `release/Mairie Port-de-Paix-Setup-<version>.exe`

**macOS :**

```bash
npm run dist:mac
```

Sortie : `release/` (`.dmg` ou `.zip` selon la cible electron-builder).

## Version

Voir `package.json` (actuellement 1.2.4).
