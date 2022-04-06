# Design Questions

This document is currently used to keep track of key questions pertaining to the design of the core TreeDDS formats and algorithms.
All design decisions included here are subject to change.
This document may eventually become stable documentation.

## When can we squash overlapping (set/slice) range deletions into a single range deletion?

**=> Rebasable state: No**

**=> Base state: Questionable**

**=> State catch-up: Yes**

Example scenario:

- Starting state: [A B C D]

- e1: `delete [A B C]` (concurrent with e2)

- e2: `delete [B C D]` (concurrent with e1)

The question is: can we represent both edits with a single `delete [A B C D]`?

We cannot squash these into a single deletion when the edit information is meant to be rebased because we need to be able to drop one edit without dropping the other. If we merge the two ranges into a single one then we cannot recover which part of the deletion was (solely) done by the edit that is being dropped.

It seems questionable to squash these into a single deletion when the edit information is meant to be rebased over:

1. It's not clear what commit number a tombstone for this deletion should include.

2. If some edit f were rebased over such a unified deletion, thereby producing and edit f' that included a tombstone for the unified deletion, it's not clear how f' would be rebased over other edits that contained tombstones for only one of the two deletions.

The following branch diagram gives an example of how #2 can come about:
```
          /-g----\
e0----e1----e3----g'-----f''
    \          \-----f'-/
     \------------f-/
```

Note that this doesn't meant there couldn't be some representation that preserves all the information about both ranges while acknowledging/leveraging the overlap in some way.

## Rebase: can we elide intentions that become no-ops?

**=> Rebasable state: No**

**=> Base state: Probably?**

**=> State catch-up: Yes**

Example:
* Starting state [A, B, C]
* e1 by user 1: delete [A B C] <- sequenced first
* e2 by user 2: delete [B]  <- sequenced second

When e2 is rebased over e1, it's tempting to drop e2's intention of deleting B because e1 got to it first.

This intention should not be dropped because it's possible that the branch on which e1 and e2 are will be merged into some other branch were e1 no longer applied (because its constraints are violated).
If that were to happen, we still want B to be deleted (assuming there's no reason e2 shouldn't apply).
For B to be deleted it is necessary that e2' (the output of rebasing e2 over e1) still contains the deletion intent.

## Can we enforce that range bounds from a hierarchy?

Effectively, the question boils down to whether we allow this kind of structure: `[(])`.

Challenge #1: multiple intents may apply to the same region of a trait.

For example, in a trait [A, B, C, D], nodes A, B, C may be deleted by one user while the nodes B, C, D may be moved by another.

As long as these edits exist in different frames, and as long as we don't squash across frames (which we do want to do eventually), we can represent the two intents separately.

The problem is that as one edit gets rebased over the other, the effect of the earlier edit must be represented in the prior edit.
This effect is represented in the form prior bounds, which cause the non-hierarchical structure.

One thing we could try would be to produce a hierarchy `[A ]{B C}(D)` instead of `[A (B C] D)`, where `{B C}` would include information about both the deletion and the move.

Challenge #2: while the same nodes may be covered by two ranges, the bound placement around the nodes might differ between ranges.

For example, a range from "after A to after C" covers the same nodes as "before B to before D", but representing them both as single range would be impractical.