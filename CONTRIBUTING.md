# Contributing

## Development

This repo uses pnpm workspaces. Tooling dependencies live in the packages that use them; the root package only orchestrates workspace scripts.

```shell
pnpm install
pnpm run check
pnpm run build
```

Useful workspace commands:

- `pnpm --filter @beff/diy-cli run test`: Run the analyzer test suite.
