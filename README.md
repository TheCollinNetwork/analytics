# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Getting started

These instructions help collaborators get a reproducible development environment for this repo.

- Clone the repository:

```bash
git clone git@github.com:<OWNER>/twitter-engagement-optimizer.git
cd twitter-engagement-optimizer
```

- Install dependencies (preferred for CI/reproducibility):

```bash
npm ci
```

- Run the app in development (Vite):

```bash
npm run dev
```

- Build for production:

```bash
npm run build
```

Notes:
- We commit `package-lock.json` to ensure consistent installs across machines. If you use `yarn` or `pnpm`, that is fine but follow project conventions.
- If a collaborator cannot see code changes, confirm they have fetched the right branch and that you've pushed your commits:

```bash
git fetch --all
git checkout <branch-name>
git pull --rebase origin <branch-name>
```

If you want me to open a branch and create a PR with these repo files and edits, tell me and I'll push the branch and create the PR.
