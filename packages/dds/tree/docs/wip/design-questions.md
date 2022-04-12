# Design Questions

This document is currently used to keep track of key questions pertaining to the design of the core TreeDDS formats and algorithms.
All design decisions included here are subject to change.
This document may eventually become stable documentation.

## ## Must all commits be atomic transactions?

Another way to phrase this question is: should we allow for some changes of a changeset to apply despite some of them being dropped?

Note that in such a changset constraints (implicit like explicit ones) have no effects. This also means we'd never leverage hierarchical edits.

The feature seems desirable in the sense that there may be value in some of the changes applying as opposed to none.

Note that simply using one change per transaction is not the same as non-atomic tranctions: transactions define revision points. Splitting a transaction into many one-change transactions (so that each may fail independently) would introduce more revisions. This is undesirable for mainly for performance reasons: we wouldn't want applications that perform O(revisions) work to be affected by this practice. Note howerver that if an application uses non-atomic transactions then it is in principle acceptant of the fact that the document could end up in any of the states along this trail of one-change transactions.

This does bring challenges when it comes to schema compliance though: if some but not all edits are dropped then we cannot guarantee that the resulting state will be schema compliant. This is problematic for schema on write systems.

An alternative may be to adopt a set of change primitives that guanrantee the continuity of schema compliance. For example, we would need a replace operation to change the contents of a non-optional unary field. This can get a little cumbersome when trying to cover all cases. For example rotating several nodes. That said, such complex needs should be rare and would have the option of falling back to transactions to ensure schema compliance.

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

**=> Yes?**

Effectively, the question boils down to whether we allow this kind of structure: `[(])`.

<u>Challenge #1</u>: multiple intents may apply to the same region of a trait.

For example, in a trait [A, B, C, D], nodes A, B, C may be deleted by one user while the nodes B, C, D may be moved by another.

As long as these edits exist in different frames, and as long as we don't squash across frames (which we do want to do eventually), we can represent the two intents separately.

The problem is that as one edit gets rebased over the other, the effect of the earlier edit must be represented in the prior edit.
This effect is represented in the form prior bounds, which cause the non-hierarchical structure.

One thing we could try would be to produce a hierarchy `[A ]{B C}(D)` instead of `[A (B C] D)`, where `{B C}` would include information about both the deletion and the move.

<u>Challenge #2</u>: while the same nodes may be covered by two ranges, the bound placement around the nodes might differ between ranges.

For example, a range from `after A to after C` covers the same nodes as `before B to before D`, but representing them both as single range would be impractical.

Here again we may be able to construct 3 ranges: `after A to before B`, `before B to after C`, `after C to before D`.

An alternative would be to represent ranges as segments and have those nest when appropriate. A question that comes up when we do that is: which segment should be the outer one and which segment should be the inner one?

## What leads to marks being split?

There are two kinds of marks to consider for this question: segments and bounds.

<u>For segments:</u>

Within a change frame's original creation several splits can occur:

- Insertion/move-in segments can be split when an insertion/move-in is performed in the middle of it.

- Insertion/move-in segments can be split when an deletion/move-out is performed in the middle of it.

This is not a problem since we can mint new IDs for the ops (as if both halves had been separate from the start).

More concerning are the splits that occur at rebase time:

* Deletion segments can be split when a prior insertion need to be represented in the middle of it.

This is more concerning because it forces us to either mint new IDs for the segment parts, or tolerate that the same ID be used by each part of the original segment, thereby dropping the "one segment => one ID" rule. Note that we'd still maintain the "one change => one ID" rule, which is perhaps the only important part.

<u>For bounds:</u> 

Splitting bounds means that the pair of bounds ends up repeated: `[A, B]` becomes `[A], stuff, [B]`.

Prior detach ranges need to be split when a prior insertion needs to be represented within it:

```typescript
const e1 = [
    { type: "Delete", op:-1 , length: 4 },
];

const e2 = [
    1,
    { type: "Insert", id: 0, content: [{ id: "X" }] },
];

const e3 = [
    2,
    { type: "Insert", id: 0, content: [{ id: "Y" }] },
];


const e3p = [
    { type: "PriorSetDetachStart", seq: 1, op: -1 },
    1, // Tombstone
    { type: "PriorRangeEnd", seq: 1, op: -1 },
    1, // Normal offset forces splitting of the bounds
    { type: "PriorSetDetachStart", seq: 1, op: -1 },
    1, // Tombstone
    { type: "Insert", id: 0, content: [{ id: "Y" }] },
    2, // Tombstones
    { type: "PriorRangeEnd", seq: 1, op: -1 },
];
```

The above could be avoided if the offset were instead represented as a birthstone. The problem with birthstones is that they require additional data (seq#, maybe op#). That said, in this case specifically, the birthstone would be better since we'd avoid repeating the data for the bounds.

We could potentially use birthstones only within detach ranges (and use offsets outside of them).

Another situation that leads to bounds being split is the need to maintain hierarchical structure among bounds. (See above)

## Can we do away with mark pairs to represent range bounds?

The main challenge is to be able to represent the anchor information accurately. Several marks may be competing for anchorage at the same node or trait extremity. Those competing anchors' order needs to be represented somehow. Bounds are used so that each anchor point is able to enter in a race of its own.

It's easy to see how several inserts might compete for anchorage at the same node. A range operation may be thrown in the mix, so it would have to complete with the inserts as well. It's less easy to see how multiple range operations might come to complete. The way for that to happen seems to be when a range overlaps with a prior range.

If a range bound is anchored internally, how do we know whether the range was anchored relative to inserted content within it or not? It seems that when an insertion exists within a range next to one of its bounds, and that range bound is anchored internally, then we know the range was anchored relative the the inserted nodes, because the only way for the inserted content to be within the range is for the range operation to have occurred after the insertion. If there are multiple competing insertions, the bound must be adjacent to the one that is relevant. This is because no content can be inserted within a range (aside from prior insertions, which we can tell the range bound can't be anchored to).

For example, a slice move-in could be the target of a slice delete, in which case the range bound would appear adjacent to the last node to be included.

The above may no longer hold once we start squashing frames together.

If a range bound is anchored externally then it may be competing with several insertion bounds. Not only that but the node to which the bound is anchored might then be covered by some other range operation. If all insert operations had Ids then it might be possible for the bound to list the ID of the insertion which includes the node that the bound is anchored to (or list no such ID in the case the bound was attached to prior nodes).

Prior operations don't complicate things too much because we know their bounds can't be anchored to content being inserted.

So it looks like we could do away with bounds:

* When a range bound is anchored internally, we know the closest (non-prior-insertion) node within the range is the node that the bound was anchored to.

* When a range bound is anchored externally, either...
  
  * it is anchored to content inserted in the same change, in which case it needs to list the op# for the insertion
  
  * it is anchored to content present before the change, in which case it must not list an op# for that bound

Note that if all operations were given monotonically increasing op #s over time, then we wouldn't need the externally anchored range to list the op# for an insertion. We would be able to tell that the range is anchored to the node within the first insertion whose op# is lower than that of the range if such an insertion is encountered before a offset, and the first node represented by the offset otherwise.

## Could we assign monotonically increasing op IDs to all insert/move-in operations in a change frame?

Motivation: It would remove the need for race structures and would remove the need for range bounds to list which insertion they're externally anchored to (if any). See "do away with mark pairs" for more details.

The main challenge comes from the fact that we have no interest in representing inserts and deletes in the move table. We could put the inserted content in the move table but there doesn't seem to be a motivation to do that.

One solution would be to separate the domain of move #s from the domain of insertion #s. The sad thing about that, is the fact that moves will effectively end up with  two #s: one for the move, one for the insert.

A better solution is to have all ops use the same ID space but make the move table sparse. This may be represented as a map in the over-the-wire format (or something that uses offsets to take advantage of the fact that the IDs are sorted) but will likely be a sorted list in main memory so we can binary search our way through it.

## Must the user explicitly undo to get undo semantics?

**=> No**

With Return+MoveOut being the only way to undo a MoveOut+MoveIn, one might bemoan the fact that a user might move some content from one place to another then move it back without realizing that they're not undoing the first move.

The way we can reconcile the expectations of the user (i.e., moving the content back cancels out the previous move) with the need to differentiate between Return and MoveIn, is to have the client code (either the application or some convenience layer we offer) detect when an operation could be construed as an undo intention and produce the a Return segment instead.

Note: the same consideration applies to Revive vs. Insert.

## Should we use PriorInsert segments or offsets?

**=> Only when needed**

This comes up in e3p of scenario B: we need to represent the fact that e2 inserted content within the range covered by e1. If we didn't use a prior inserted (and just used an offset instead) then we'd be depicting a situation where the inserted content is also being deleted, which is not the case.

PriorInsert segments seem to be needed when a prior insert both...

1. falls within a range

2. should not be considered part of the range. There can be several reasons for that:
   
   1. The range is not a slice
   
   2. The slice range has `includePriorInsertions` set to `false` and the insertion is prior (as determined by the seq ID).
   
   3. The slice range has `includePosteriorInsertions` set to `false` and the insertion is posterior (as determined by the seq ID).
   
   4. The insertion is not commutative with respect to the slice range.

It's not clear whether there are other situations were they are needed.

## Where should attach segments be included in the presence of ranges?

Since ranges make it so that each (existing) anchor point is only represented in one place, we are forced to include attach segments within the range that includes their anchor point.

The alternative would be to split the range, but that is undesirable at least for slice ranges on the grounds that the range does apply to the new anchor points introduced by the insertion.

We could treat set and slice ranges differently by splitting set ranges but not slice ones. This may turn out to be palatable in the long run but for now, it seems preferable not to split ranges at all:

1. It makes the treatment of ranges more uniform

2. It makes the format terser

## Should the output of postbase include priors (posteriors?)?

This comes up in scenario G.

## Current POR

Use segments for everything (no pairs of bound marks).

Maintain a hierarchy by splitting segments up as needed and nesting them. The nesting will be from most recent (on the outside) to most prior (on the inside). This ordering is like function application (latter calls on the outside). This ordering should reduce the amount of splitting because a new range cannot be contained by an older one, whereas the reverse can be true. Attach operations are included in the inner-most range they fall within.

Use frames.

Assign a monotonically increasing ID to each op (to be used in the move table in the case of move ops).

The move table is more like a map or a sorted list one could binary search within.

Splitting an op does not mint a new ID. new IDs are never minted by rebase/postbase/invert.

Anchoring is expressed with a side (`prev`/`next`). Which node is targeted as the anchor point is determined based on op IDs.