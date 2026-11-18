# Contributing

## Development

This repo uses pnpm workspaces. Tooling dependencies live in the packages that use them; the root package only orchestrates workspace scripts.

```shell
pnpm install
pnpm run all
```

## Publishing to npm

Creating a GitHub release runs `.github/workflows/publish.yml` to build and publish `@beff/diy` and
`@beff/diy-cli`. Both package versions must be unpublished on npm before creating the release.

The workflow uses [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) with GitHub Actions
OIDC. Node 24 supplies a compatible npm CLI (11.5.1 or later). pnpm packs the packages to resolve
`workspace:` dependencies, then npm publishes the tarballs without an npm token. npm automatically adds
provenance for public packages published from this public repository.

Before the first release with this workflow, configure a GitHub Actions trusted publisher in the npm
Settings page for **each** package (`@beff/diy` and `@beff/diy-cli`):

| Field                | Value               |
| -------------------- | ------------------- |
| Organization or user | `lucasavila00`      |
| Repository           | `diy`               |
| Workflow filename    | `publish.yml`       |
| Environment name     | Leave blank         |
| Allowed actions      | Allow `npm publish` |

These values are case-sensitive. Complete the first successful publish within two days of creating the
trusted publisher, or recreate the expired configuration before releasing.

After a successful release confirms OIDC works for both packages, select **Require two-factor
authentication and disallow tokens** under each package's npm Publishing access settings. Revoke the old
npm automation token and delete the repository's `NPM_TOKEN` Actions secret if nothing else uses it.
