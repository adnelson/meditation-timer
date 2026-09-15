# Meditation Timer

A basic React + TypeScript app built with Vite and Tailwind CSS.

## Setup

Use Node.js 24 LTS. Yarn 4.18.0 is pinned in `package.json` and managed by Corepack.

```sh
corepack enable
yarn install
yarn dev
```

Open the local URL printed by Vite.

## Commands

- `yarn dev` starts the development server.
- `yarn build` checks TypeScript and builds the app into `dist/`.
- `yarn lint` runs Oxlint.
- `yarn preview` serves the production build locally.

## Project structure

- `src/App.tsx`: starter screen.
- `src/index.css`: Tailwind CSS entry point.
- `vite.config.ts`: React and Tailwind Vite plugins.

Yarn uses `node_modules` for editor and tool compatibility. Commit `yarn.lock`
to keep dependency installs reproducible.
