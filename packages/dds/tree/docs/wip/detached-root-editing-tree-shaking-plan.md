# Plan: Make detached-root editing codecs tree-shakable

Status: Draft for design review; this document does not change the API or implementation.

## Goal

Change `SharedTreeOptions.enableDetachedRootEditing` from a boolean flag to an explicit, imported capability.
When an application does not import and use that capability, a production ECMAScript module (ESM) bundle must exclude both:

- `makeModularChangeCodecV3` from [modularChangeCodecV3.ts](../../src/feature-libraries/modular-schema/modularChangeCodecV3.ts).
- `makeOptionalFieldCodec` from [optionalFieldCodecV3.ts](../../src/feature-libraries/optional-field/optionalFieldCodecV3.ts).

Keep the existing released formats, their wire representations, and their read support unchanged.
Keep codec construction and processing synchronous.
Do not redesign detached-root editing, shared branches, or the general codec system as part of this work.

## Current retention paths

The flag in [sharedTree.ts](../../src/shared-tree/sharedTree.ts) defaults to `false`.
In [treeFactory.ts](../../src/treeFactory.ts), it selects experimental message and edit-manager write versions.
It does not control which codecs are available for reading or which implementations are imported.

There are two independent paths that retain the target implementations:

1. `SharedTreeKernel` constructs `SharedTreeChangeFamily` in [sharedTree.ts](../../src/shared-tree/sharedTree.ts).
   [sharedTreeChangeFamily.ts](../../src/shared-tree/sharedTreeChangeFamily.ts) passes the complete `fieldKindConfigurations` map to `makeModularChangeCodecFamily`.
   That map includes `vDetachedRoots` in [defaultFieldKinds.ts](../../src/feature-libraries/default-schema/defaultFieldKinds.ts).
   [modularChangeCodecs.ts](../../src/feature-libraries/modular-schema/modularChangeCodecs.ts) statically imports and calls `makeModularChangeCodecV3` for that version.
2. The normal optional-field handler references `makeOptionalFieldCodecFamily`.
   [optionalFieldCodecs.ts](../../src/feature-libraries/optional-field/optionalFieldCodecs.ts) imports and constructs both version 2 and version 3 codecs, including when a caller resolves only version 2.
   Required fields share this handler through [requiredField.ts](../../src/feature-libraries/optional-field/requiredField.ts).
   Removing only the modular registration does not remove this second path.

There are also eager consumers of these registrations:

- [sharedTreeChangeCodecs.ts](../../src/shared-tree/sharedTreeChangeCodecs.ts) iterates every change-format dependency and immediately resolves its modular codec.
- [messageCodecs.ts](../../src/shared-tree-core/messageCodecs.ts) and [editManagerCodecs.ts](../../src/shared-tree-core/editManagerCodecs.ts) register the experimental envelope versions unconditionally.
- `VersionDispatchingCodecBuilder.applyOptions` in [codec.ts](../../src/codec/versioned/codec.ts) constructs every registered codec, for both full codecs and decoder-only codecs.
  The envelope factories immediately resolve their dependent change codecs.

A runtime boolean, a filtered map that still contains implementation references elsewhere, or lazy factory invocation alone is not a tree-shaking boundary.
The default runtime dependency graph must have no live reference to the experimental implementations.

## Proposed API

Use the existing provider pattern in [forestType.ts](../../src/shared-tree/forestType.ts) and [forestTypeOptimized.ts](../../src/shared-tree/forestTypeOptimized.ts) as the model.
Names below are proposed and need API review:

- Add an opaque alpha type, `DetachedRootEditingSupport`, backed by an internal codec-provider contract.
  Keep implementation-specific codec types out of the customer-facing declaration.
- Export an alpha value, `DetachedRootEditing`, from a separate implementation module.
  The value supplies the experimental codec factory; it must not be a marker that the default code maps back to an imported implementation.
- Change the option to `enableDetachedRootEditing?: false | DetachedRootEditingSupport`.
  Omission and `false` keep the existing disabled behavior and default.
  Enabling changes from `enableDetachedRootEditing: true` to `enableDetachedRootEditing: DetachedRootEditing`, with an explicit named import of `DetachedRootEditing`.
- Keep `enableSharedBranches` mutually exclusive with an enabled detached-root provider.
  Update the check and error text in `resolveFormatOptions` to use the new option shape.
- Reject legacy runtime `true` values with a useful migration error rather than interpreting them as a provider.
  Do not keep a `true` fallback that imports the codecs, because it would restore the retention path.

The default modules may use type-only imports of the provider contract.
They must not import the provider value to compare identities, construct defaults, or validate the option.
Expose the provider with a named re-export; do not require a new package subpath unless bundle tests show that the existing export path cannot be made safe.

## Compatibility contract

The current default client can decode the experimental `detached-roots|v0.1` format even when the flag is off.
Excluding the implementation necessarily removes that ability from a bundle that has no provider.
Rejecting this format on read when detached-root support is disabled is approved.

The implementation must follow this contract:

| Configuration | Released formats | Experimental detached-root format |
| --- | --- | --- |
| Option omitted or `false` | Existing read and write behavior | Reject on read; reject write overrides |
| Provider supplied | Retain read support | Enable reading and select the existing experimental write formats |

Do not silently remove read support for any released format.
Applications that load experimental documents or collaborate with experimental writers must configure the provider, even if they do not plan to edit detached roots themselves.

Keep the existing experimental format identifiers and dependency mappings unchanged.
Do not reinterpret an experimental document as a released format, discard its changes, or silently fall back to another write version.
Provider-free clients must still construct successfully; they should fail only when asked to read or explicitly write an unavailable experimental format.

## Implementation steps

### 1. Isolate the implementation in the provider

Create the provider contract and its separate implementation module.
The implementation must own the live references to both target codec factories and the field configuration needed by `vDetachedRoots`.
Its internal factory should accept the same revision-tag codec, field-batch codec, validation options, and compression strategy used by the normal modular codec factory.
It should construct the experimental modular codec with optional and required field codec version 3, sequence field codec version 3, and the unchanged no-change codecs.
Do not initialize codecs through global registration or module-import side effects.

### 2. Remove version 3 from the default optional-field codec family

In [optionalFieldCodecs.ts](../../src/feature-libraries/optional-field/optionalFieldCodecs.ts), remove the version 3 import and registration from the default family.
Keep optional-field version 2 in the default optional and required handlers.

Allow the provider to supply the version 3 codec for both optional and required fields without changing the global field-kind objects.
One narrow approach is to add an optional codec-family factory override to `FieldKindConfigurationEntry` in [fieldKindConfiguration.ts](../../src/feature-libraries/modular-schema/fieldKindConfiguration.ts).
Update `getFieldChangesetCodecs` in [modularChangeCodecV1.ts](../../src/feature-libraries/modular-schema/modularChangeCodecV1.ts) to use that override when supplied and otherwise use `kind.changeHandler.codecsFactory`.
The provider's experimental configuration supplies a version-3-only optional codec family for both field kinds.
Preserve schema compilation and validation for the override path.

This keeps schema policy, editors, identifiers, and rebasers shared, without making the default handler reference the experimental family.
Do not remove sequence codec version 3: released modular formats `v4` and `v5` already use it.

### 3. Inject the experimental modular codec rather than selecting it in a default switch

Remove the `makeModularChangeCodecV3` value import and built-in construction branch from [modularChangeCodecs.ts](../../src/feature-libraries/modular-schema/modularChangeCodecs.ts).
Keep normal modular versions `v3`, `v4`, and `v5` built by the current released implementations.
Remove the experimental field configuration from the default construction map in [defaultFieldKinds.ts](../../src/feature-libraries/default-schema/defaultFieldKinds.ts).
Inject the provider-created experimental codec as an additional family entry when the capability is present.
Reject duplicate format registrations.

Keep format identifiers and diagnostic dependency metadata available without importing codec implementations.
If `getCodecTreeForModularChangeFormat` still needs the experimental configuration, split its lightweight dependency metadata from runtime codec registration rather than retaining a provider factory in a default map.

### 4. Thread the capability through construction and make registration consistent

Pass the capability from resolved `SharedTreeOptionsInternal`, through `SharedTreeKernel`, into `SharedTreeChangeFamily`.
Only invoke its internal factory when a provider was supplied.
Use a fresh per-instance registry; enabling one tree must not change codecs available to another tree.
Preserve the current experimental write-version overrides when enabled.

Update the downstream eager registration layers together:

1. In `makeSharedTreeChangeCodecFamily`, register the experimental change codec only if the modular family supplies it.
   Use `ICodecFamily.getSupportedFormats()` to determine availability before resolving it.
   Missing released dependencies must remain errors, not be silently filtered out.
2. Let the message and edit-manager builders omit their experimental envelope entry when the corresponding change codec is unavailable.
   Pass supported change-format information from their construction sites in [sharedTreeCore.ts](../../src/shared-tree-core/sharedTreeCore.ts), or add an equivalent explicit builder input.
   Select the registry before `VersionDispatchingCodecBuilder.applyOptions` runs.
   Do not rely on a guard around later encoding or decoding to prevent eager resolution errors.
3. Keep the existing mappings in `changeFormatVersionForMessage`, `changeFormatVersionForEditManager`, and `dependenciesForChangeFormat` as lightweight metadata.
   Keep shared-branch and released envelope registrations unchanged.
4. Ensure explicit experimental `writeVersionOverrides` cannot bypass the missing capability, including when `allowPossiblyIncompatibleWriteVersionOverrides` is enabled.
   Use the version-dispatching codec's unsupported-version handling where suitable, and add feature-specific guidance if needed.

Avoid broad changes to how all codecs are loaded or how unknown released formats are handled.

### 5. Update exports, callers, and API artifacts

- Export the opaque type and provider value through the source barrels that feed the alpha API.
  Verify that any barrel re-exports do not cause the implementation to be retained in default bundles.
- Update the option documentation to explain the explicit import, read-support requirement, experimental status, and shared-branch incompatibility.
- Migrate any examples, tests, and internal callers that use `true` or directly assume the experimental codec is in a default family.
  Codec tests that need all formats must explicitly construct or inject the provider.
- Generate entrypoint sources and API reports using the package scripts; do not hand-edit generated files.
  Include the `fluid-framework` alpha aggregator exports and reports if this API is exposed there.
- Follow the repository API-change and changeset guidance during implementation.
  Classify the boolean-to-provider change as an intentional alpha API migration, and document the experimental read-support change.

## Validation plan

### Functional and compatibility tests

- Test omitted, `false`, provider-supplied, and legacy runtime `true` options in [treeFactory.spec.ts](../../src/test/treeFactory.spec.ts).
  Verify default write versions and enabled overrides, and both forms of the shared-branch conflict check.
- Construct both enabled and disabled kernels successfully, including in the same process, in both creation orders.
- Verify supported-format sets at the modular, SharedTree change, message, and edit-manager layers.
  Verify that a missing released codec remains a construction error.
- Round-trip all released formats without the provider, including optional and required field changes.
- With the provider, round-trip experimental optional and required changes and detached-root changes through messages and summaries.
  Reuse existing encoded fixtures to prove that the refactor does not change wire data.
- Without the provider, test useful rejection of experimental messages, summary data, and explicit experimental write overrides.
- Run existing codec, schema-validation, and codec-tree tests, including [sharedTreeChangeCodec.spec.ts](../../src/test/shared-tree/sharedTreeChangeCodec.spec.ts) and [sharedTreeCodecTree.spec.ts](../../src/test/shared-tree/sharedTreeCodecTree.spec.ts).
  Keep coverage for decoder-only construction, which also evaluates the registry.

### Production bundle tests

Extend the emitted-package probes in [webpack.config.cjs](../../../../../examples/utils/bundle-size-tests/webpack.config.cjs) and the testing pattern in [forestProviderBundles.spec.ts](../../../../../examples/utils/bundle-size-tests/src/test/forestProviderBundles.spec.ts).
Build the package first and bundle its emitted ESM artifacts in production mode, not TypeScript source aliases.

Add separate reachable entrypoints for:

1. Default `SharedTree` use without a capability import.
2. `configuredSharedTreeAlpha` with the option omitted or `false`.
3. `configuredSharedTreeAlpha` with the provider supplied.
4. A provider import that is unused and therefore removable.

Assert per-entrypoint emitted-module membership, including nested/concatenated modules:

- The first, second, and fourth cases exclude both target implementation modules.
- The enabled case includes both modules and retains a usable configured factory.
- All cases use emitted package modules rather than source aliases.

Keep entrypoints independent so an enabled probe cannot pull code into a disabled probe through a shared chunk.
Do not use minified function-name searches as the correctness test.
Record before-and-after parsed and compressed bundle sizes as supporting evidence, not as the only assertion.
Check the normal alpha import path and, if exported there, the `fluid-framework` alpha aggregator path.
No custom application build-time flag or asynchronous import should be necessary.

## Completion criteria

- No default runtime registration or handler retains either experimental codec implementation.
- Production bundle tests prove exclusion without the provider and inclusion when supplied.
- Default constructors still succeed after experimental registrations are removed at every layer.
- Released formats and existing experimental wire representations remain unchanged.
- Tests enforce the approved contract: reject experimental detached-root formats on read when support is disabled, and decode them when the provider is supplied.
- Generated API artifacts and caller migrations are complete, with no global-registration side effects.

## Alternatives not selected

- **Keep the boolean and filter runtime maps:** does not remove static references in codec factories and default handlers.
- **Make codec factories lazy:** may reduce initialization work, but still retains reachable implementations.
- **Always retain experimental decoders:** incompatible with excluding these combined encoder/decoder implementations.
- **Use dynamic imports:** changes synchronous construction and processing, and requires a separate loading/error contract.
- **Add a second minimal SharedTree entrypoint:** increases API and maintenance cost when an explicit provider can isolate the implementation within existing entrypoints.