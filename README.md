# Auto Cards

A [Next.js](https://nextjs.org/) app that turns a **meeting transcript** into **board suggestions**: new cards, updates to existing work items, and acceptance-criteria additions. You get a Kanban-style demo with local (offline) analysis and an optional **OpenRouter**-powered pass for richer results.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (20+ recommended for Next.js 15)
- npm (comes with Node)

## Setup

1. Clone the repository and enter the project folder.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Environment (optional — only needed for remote LLM analysis):

   Copy `.env.example` to `.env.local` and set your [OpenRouter](https://openrouter.ai/) API key:

   ```bash
   # Windows (cmd or PowerShell)
   copy .env.example .env.local

   # macOS / Linux
   cp .env.example .env.local
   ```

   Edit `.env.local` and set `OPENROUTER_API_KEY`. Optional variables are documented in `.env.example`.

   Without a key, the app still runs using **local** transcript analysis.

## Run locally

Development server (with Turbopack):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts:

| Command       | Description              |
| ------------- | ------------------------ |
| `npm run dev` | Development server       |
| `npm run build` | Production build       |
| `npm run start` | Start production server |
| `npm run lint`  | ESLint                   |

## Git remote (`upstream`)

This project is tracked on GitHub at **[LeoAlbu125/Auto_Card](https://github.com/LeoAlbu125/Auto_Card)**.

If you need to add the remote yourself:

```bash
git remote add upstream https://github.com/LeoAlbu125/Auto_Card.git
```

First push (after commits), if your default branch is `main`:

```bash
git push -u upstream main
```

If the GitHub repo already has commits (for example only a license) and Git rejects the push, either pull and merge with `--allow-unrelated-histories`, or coordinate a force push only if you intend to replace the remote history.

## License

The [GitHub repository](https://github.com/LeoAlbu125/Auto_Card) includes a license file (Boost Software License 1.0). Add a matching `LICENSE` locally if you keep this project in sync with that repo.
