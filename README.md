# TeachMe


sql.js is a WASM build of SQLite — no native module, so no C++ toolchain needed.

## Setup

```bash
# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

## Development

Start both servers:

```bash
npm run dev
```

Or start individually:

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:3000

## Linting & Formatting

```bash
cd backend && npm run lint && npm run format
cd frontend && npm run lint && npm run format
```

## Tests

```bash
cd backend && npm test
```

## Build

```bash
cd backend && npm run build
cd frontend && npm run build
```
