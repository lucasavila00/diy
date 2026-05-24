# Workarounds

## tsgo private call expression result types

`@typescript/native-preview` currently reports private call expressions such as
`this.#buildCapabilities()` as the callable function type when using
`checker.getTypeAtLocation(callExpression)`. The analyzer needs the call result type when
reading provider expressions passed to `Capabilities.create`, `Capabilities.extend`,
`Capabilities.merge`, and `Capabilities.override`.

Workaround: for call expression values, `packages/diy-analyzer/src/analysis/capability-types.ts`
uses the callee signature and `checker.getReturnTypeOfSignature(...)` instead of trusting
`checker.getTypeAtLocation(callExpression)`.

Remove this once `checker.getTypeAtLocation(callExpression)` returns the actual call result
for private method and private field calls. The `v8-tests/success/private-method-forwarding`
fixture should still pass with 100% coverage after removal.
