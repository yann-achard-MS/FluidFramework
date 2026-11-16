---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Make experimental detached-root codecs removable from application bundles

The alpha `SharedTreeOptions.enableDetachedRootEditing` option now accepts the imported `DetachedRootEditing` capability instead of `true`.
This lets production bundlers remove the experimental codecs when the capability is unused.
Omitting the option or setting it to `false` keeps detached-root support disabled.

To enable the feature, update your configuration:

```typescript
import { configuredSharedTreeAlpha, DetachedRootEditing } from "@fluidframework/tree/alpha";

const SharedTree = configuredSharedTreeAlpha({
	enableDetachedRootEditing: DetachedRootEditing,
});
```

Clients without the capability now reject experimental detached-root messages and summaries on read.
Configure the capability on every client that loads these documents or collaborates with experimental writers, even if the client does not edit detached roots itself.
Read support for released formats is unchanged.
Detached-root editing remains experimental and must not be used in production.
