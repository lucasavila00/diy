# diy

DIY dependency-injection primitives and analyzer packages.

## Packages

- `@q/diy`: tiny typed capability container.
- `@q/diy-analyzer`: TypeScript analyzer for DIY usage rules.

## Development

This repo uses pnpm workspaces. Tooling dependencies live in the packages that use them; the root package only orchestrates workspace scripts.

```sh
pnpm install
pnpm run check
```
