# Contributing to n8n-nodes-mitrachat

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Development Setup

1. Fork and clone the repository:
```bash
git clone https://github.com/mitrachat/n8n-nodes-mitrachat.git
cd n8n-nodes-mitrachat
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Making Changes

1. Create a new branch for your feature or bug fix:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and ensure they follow the existing code style

3. Run linting:
```bash
npm run lint
```

4. Build to verify no TypeScript errors:
```bash
npm run build
```

## Submitting Changes

1. Push your branch to your fork
2. Create a Pull Request with a clear description of the changes
3. Reference any related issues

## Commit Message Guidelines

We follow conventional commits:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Build/tooling changes

## Code of Conduct

Be respectful and constructive in all interactions.

## Questions?

Open an issue for discussion before making significant changes.
