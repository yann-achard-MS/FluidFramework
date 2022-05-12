# Design Questions

This document is currently used to keep track of key questions pertaining to the design of the core TreeDDS formats and algorithms.
All design decisions included here are subject to change.
This document may eventually become stable documentation.

## ## Must all commits be atomic transactions?

Another way to phrase this question is: should we allow for some changes of a changeset to apply despite some of them being dropped?

Note that in such a changeset constraints (implicit like explicit ones) have no effects. This also means we'd never leverage hierarchical edits.

The feature seems desirable in the sense that there may be value in some of the changes applying as opposed to none.

Note that simply using one change per transaction is not the same as non-atomic transactions: transactions define revision points. Splitting a transaction into many one-change transactions (so that each may fail independently) would introduce more revisions. This is undesirable for mainly for performance reasons: we wouldn't want applications that perform O(revisions) work to be affected by this practice. Note however that if an application uses non-atomic transactions then it is in principle acceptant of the fact that the document could end up in any of the states along this trail of one-change transactions.

This does bring challenges when it comes to schema compliance though: if some but not all edits are dropped then we cannot guarantee that the resulting state will be schema compliant. This is problematic for schema on write systems.

An alternative may be to adopt a set of change primitives that guarantee the continuity of schema compliance. For example, we would need a replace operation to change the contents of a non-optional unary field. This can get a little cumbersome when trying to cover all cases. For example rotating several nodes. That said, such complex needs should be rare and would have the option of falling back to transactions to ensure schema compliance.

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

**=> Yes**

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

**=> Yes**

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

**=> PriorInsert all the time**

This comes up in e3p of scenario B: we need to represent the fact that e2 inserted content within the range covered by e1. If we didn't use a prior inserted (and just used an offset instead) then we'd be depicting a situation where the inserted content is also being deleted, which is not the case.

PriorInsert segments seem to be needed when a prior insert both...

1. falls within a range

2. should not be considered part of the range. There can be several reasons for that:
   
   1. The range is not a slice
   
   2. The slice range has `includePriorInsertions` set to `false` and the insertion is prior (as determined by the seq ID).
   
   3. The slice range has `includePosteriorInsertions` set to `false` and the insertion is posterior (as determined by the seq ID).
   
   4. The insertion is not commutative with respect to the slice range.

It's not clear whether there are other situations were they are needed.

Actually, it seems we need them more than that: if an anchor is next to a place where a prior change concurrently introduced content, then merely adding an offset will make it look as though the anchor was moored to the content added by the prior concurrent change. We could still get away with adding an offset when no anchor would be affected, but it seems simpler to just add an explicit segment all the time.

## Where should attach segments be included in the presence of ranges?

Since ranges make it so that each (existing) anchor point is only represented in one place, we are forced to include attach segments within the range that includes their anchor point.

The alternative would be to split the range, but that is undesirable at least for slice ranges on the grounds that the range does apply to the new anchor points introduced by the insertion.

We could treat set and slice ranges differently by splitting set ranges but not slice ones. This may turn out to be palatable in the long run but for now, it seems preferable not to split ranges at all:

1. It makes the treatment of ranges more uniform

2. It makes the format terser

## How should the IDs of inverted changes be ordered?

**=> In reverse from the original**

Let's consider some scenarios where changes have causal relationships:

* Flat sequence cases
  
  * Insert within insert: the inverse can just delete the outer insert
  
  * Move-in within insert: the move-out would have to happen before the delete
  
  * Insert within move-in: the inner move-out has to happen first
  
  * move-in within move-in: the inner move-out has to happen first
  
  * delete within delete: we can probably make it work in either order
  
  * delete within move-out: we can probably make it work in either order but reverse is bound to be simpler

* Hierarchical cases
  
  * swap child and parent: we're already constrained to do detached bottom-up and attaches top-down
  
  * Insert under insert: the top-level delete will take care of it all
  
  * Move-in under insert: the move-out would have to happen before the delete
  
  * there's more but the pattern seems clear

While in some cases we don't care or could deal with changes happening in the same order, there are cases where they must happen in reverse order.

It seems more straightforward to adopt reverse order for all cases.

## How do we determine reverse IDs for inverse changes?

**=> Use negative numbers for now. Keep track of the max ID later.**

Options:

1. Use negative numbers: just multiply the original IDs by -1

2. Walk the whole frame to find the highest ID and subtract original IDs from it

3. Force frames to list their highest ID and subtract original IDs from it

4. Subtract original IDs from the highest possible ID

#1 is not great because by using negative numbers we split the ID pool in 2. It's also not going to work well when we want to squash frames because we won't be able to just add the highest ID of the previous frame.

#2 is not great because it requires walking the frame twice

#3 is tolerable but it's yet more cruft in the format (and a lot of samples to update)

#4 is not great because storing the higher numbers will take extra space. It will also prevent the squashing of frames unless we keep track of the min or crawl the changeset for it.

Overall #3 seems like the best solution.

## Should the output of postbase include priors (posteriors?)?

This comes up in scenario G.

## In which cases do we need to update the length of a range segment?

**=> None but we should do it anyway**

In order for an insert followed by a delete to cancel out, we'll need to know that the number of nodes being inserted and deleted is the same. In order for a empty slice delete to be dropped we'll need to know that it is empty (and doesn't affect future inserts).

In either case we could either update the length of the segment or let the consumer delve into the mods to figure it out.

Updating the length so that it reflects prior inserts and prior deletes might help code that's trying find an anchor location in the array of marks. For example, the code that does change filtering would not have to delve into mods of the segments that lie before the ancestor nodes of the subtree being filtered to.

## Is it best to split segments or nest them?

**=> ?**

When it comes to slice-range segments, we don't have much of a choice: we need to nest because content being inserted within the range, even if it is not affected by the range, is still within an region of the trait that is affected by the range. Some other insert that is made into that insert might still need to be affected by the slice.

In all other cases, we could split. The advantages of not splitting are:

- We get to preserve the 1 segment <=> 1 ID relationship

- The format is terser because we don't have to repeat as much stuff

- No splitting makes for a more uniform system (as opposed to splitting sometimes)

The only segments that get split are priors who fall on range boundary lines.

This all makes the notion of "length" of ranges somewhat weird: does the length of a slice delete reflect how many nodes it deletes from the base or how many nodes of the base it covers? The latter seems more valuable because it lets us skip over segments quickly. 

How would we work out the number of nodes being deleted from a deletion segment whose length conveyed the number of nodes covered in the base? Number deleted = number of nodes covered in base - length of non-commutative insertions?

Maybe we need to dissociate the description of base/landscape changes from the description of the region being impacted. When a slice range is riddled with prior insertions that don't commute with it, and prior deletions, how do you represent it nicely as a prior? You need to represent how the prior action impacted the cells of the base, thereby defining what the new base is like. And you need to heed the intentions of the base change to reflect its impact on the current intentions. There is a part about settled facts ("these nodes were inserted/deleted") and a part about ongoing wishes ("commutative inserts in this region should be dropped"). The facts are about cells/nodes. The intentions are about regions delimited by anchors points.

Do you need to represent the priors of the priors so that when rebasing over their inverse you can interpret the consequences correctly? When we say "priors of the priors" we mean representing how prior edits affected prior edits. Perhaps not: if a prior slice delete is peppered with prior deletes, and we encounter (i.e. get rebased over) a revive for the most prior one, then that revive should bear priors such that it's clear it has no actual impact. Similarly, if we encounter a revive for the later prior, then that revive should bear priors such that it's clear where it does and doesn't have impact.

It's interesting to consider what kind of prior segments a revive might need to contain if it is reviving content that was deleted further back than the collab window: the position it needs to refer to is beyond what can be referred to. Does this mean it needs to become an insert? Or can peers simply understand that it is equivalent to an insert? Does this means that a user undeleting multiple elements from beyond the collab window means the content may re-appear in a different order? No, because the user would know how to position the latter revives relative to the revived content. What about when multiple users are each undeleting content from beyond the collab window? If revives are issued in reverse order of deletion then it should be fine because the revive for an older delete will have to be aware of the later deletes and therefore will be able to correctly interpret the revives that undo them. If the revives are issued in the opposite order (oldest deletion being revived first) then the revives could end up out of order unless the revive for the older deletions carry with them tombstones for the later deletes, which they should.

The case of the prior non-commutative insertion within a slice delete is still thorny because we can't split the slice. It seems like in that case there is both a fact (new cells) and a region (these cells are shielded from the deletion) but it's weird that other inserts within that region (effectively under the shield) should not be shielded in this way unless they are also non-commutative. Maybe we need to differentiate between a region for a range action, and a region for content attachment. Regions for content attachment only speak for that attachment, not nested attachments, while regions for range actions affect all cells unless their attachment says otherwise. One could say range regions have an ambient effect while attachment regions have a local effect. Perhaps this would instantly seems less weird if we didn't include same-trait segments in the mods: the subtree for the non-commutative insert would stand on its own as a whole, while other insertions would be next to it, independent. Does this mean we should split (at least) insertions?

If the guiding principle is to split when stuff is independent then we would split (when in the same trait):

* Insert/move-in within insert/move-in

* Insert/move-in within set-range

The only thing we wouldn't split would be slice ranges.

Technically we could split the slice range but that would just give us three slice range fragments. The only advantage is that it would let us assume that 1 segment = either new cells or cleared cells as opposed to a mixture of both. One danger is that is the possibility of then having anchors that manage to wedge themselves between those segments. Perhaps we can avoid that by having the segments overlap over the gap in some kind of knitting pattern. That seems to violate some basic assumptions thought. Doing this "there's more to it" flag effectively brings back range bounds.

One idea to make the splitting of segments simpler: have a bit on segments that is set when there's more to the segment. The problem with that is you'd have to detect when the remainder goes away, at which point you'd need to update the prior section of segment to become the last one. Maybe needing to know whether there's more segments for a given operation (i.e., a given ID) is not so important: we only need it for undos and maybe for move-ins, and maybe we can just rely on scanning forward to figure out if there is more.

Slice ranges feel like a genuinely different beast in two ways:

- multiple slices can cover the same region: there is some layering going on

- slices are delimited between nodes as opposed to over nodes

Maybe we can make these things less special. With set deletions, there can also be some degree of layering because of priors. Can we express slices as covering nodes, or covering cells so that we don't need to think of them as starting and ending between nodes? It seems difficult because an empty slice range between two nodes needs to be represented, and needs to admit new cells if later concurrent insertions are just right. If two users concurrently try to construct the same slice range then there are 4 ways the slice could end up: [{}], {[]}, [{]}, {[}]. Are those meaningfully different? Perhaps not: someone making an insert would only be able to target one of 4 location:

* xoo- -cc-

* -oox -cc-

* -oo- xcc-

* -oo- -ccx

The middle two are different in that they affect how other insertions would be ordered relative to that one.

The fact that the four options are not meaningfully different may be a clue that we can use a simpler representation which doesn't differentiate between them.

Note that if we consider [after A, after A]/[before A, before A] ranges then there are more options. Those ranges are not necessarily useless if the tiebreaking on them is such that they would include prior insertions/anchors. Either way, it seems like we end up with three stacks of slices: one stack that contains insertions after the left node, one stack that contains the insertions before the right node, and one stack that contains both. The intricacies of brackets within those ranges are meaningless, which should let us simplify things.

The above is a bit of a design smell: are the degrees of freedom offered by the anchor API partly meaningless? If so perhaps they should be different. Maybe it would be better to factor the API in terms of prefixes and suffixes: a range would include some nodes and some of their concurrent (prior) prefixes and suffixes. That insight could lead to a simpler format where prefixes and suffixes are given a representational length of some sort. This would help make the format more binary (where those affixes are included/covered or not) as opposed to having some ordered list of bounds. This doesn't prevent the possibility of one range partially or completely overlapping with another, but it puts all the semantics in a discrete system as opposed to a mix where slices are in a continuous system and everything else is in a discreet one.

What does this mean for the format(s)? It could mean that the side flags get refactored into a different representation. It could mean that offsets need to capture more information. It means that inserts and move-ins are now targeting those prefix and suffix locations. Note that concurrent inserts are still ordered within a given suffix or prefix based on tiebreaking flags. This could be modeled by having each affix be a pair of locations: one for content that wants to be FTL and one for content that wants to be LTF:

* Insertions targeting the LTF of an affix gets prepended to the affix

* Insertions targeting the FTL of an affix gets appended to the affix

This in turn could mean the tiebreaking flags get refactored into a different representation as well. Everything would now be speaking a language based on cells where cells, aside from defining a position for its content, also defines four discrete position: LTF prefix, FTL prefix, LTF suffix, and FTL suffix. Another key implication of this is that it's possible to split slice ranges if we need to without the risk of new anchors wedging themselves between the splits (and without having to rely on overlaps to prevent such wedging).

How do we represent marks given the above?
One option would be to make offsets count all five discreet areas per node (plus the two associated with each trait extremity). This would mean an offset for a trait containing N nodes would be equal to 5N+4. This is a little odd as figuring out the number of affected nodes by a range would be complex: you couldn't figure out if a slice of length 4 covered a node or not. That would depend on its position. Another option would be to make offsets more composite like a triplet of integers representing the number of prefixes before the first node (if any), number of nodes, and number of suffixes after the last node (if any). The disadvantage of such a representation, aside from bloat, is that a lot of triplets are invalid no matter where they occur, but also that even the valid ones can be invalid depending on where they occur.
The annoying thing about representing affixes as marks is that it makes set-like ranges a little weird: they should only cover nodes but they would extend over the intermediary affixes as well. Perhaps there's a way to represent that as "cover the next N nodes" (implicitly excluding any affixes) but mixing that with slice ranges doesn't seem so great... unless it is: if we separate coverage of nodes/filled cells from coverages of affixes then it gives us a way to cleanly express the fact that some nodes are not affected by a slice range while the affixes around them are. This gives a unifying view of set and slice ranges: slice is the same as set except that it impacts affixes and doesn't follow the nodes around as they move. This potentially points at a somewhat different use of offsets: a mark would be placed at the point where its effect starts and state how far its effect applies. It would then be followed by offsets and other marks, which may fall within the window of application of one or many prior marks. Attachment marks would not need to list a length because they're punctual. Set ranges would list a length in nodes. Slice ranges would list a length in both nodes and affixes. It's not clear if it would be best for the slice ranges to be split or not. If split, we could always ensure that they either affect both the nodes and affixes of a region or only the affixes, but we wouldn't have a weird mix of all affixes being affected and only some of the nodes being affected. This splitting would make the format more similar to what we would get if we had to purge very old priors: the slice would end up having to be split up because the prior would be outside of the collab window. Note that it's not clear at this point whether such purging will ever be necessary: having a prior insert referring to a sequence number that's now outside the collab window doesn't seem to be problematic. Note that this splitting of slice segments would only occur for non commutative prior insertions: in the case of prior deletes the (non-prior) delete segment would still technically include the already nodes as being targeted. This splitting would essentially make the slice window representable as the number of affixes covered plus a boolean indicating whether or not nodes between those should be covered. Such a format may not be ideal when several marks end up starting at the same point.

Let's recap a little:

* Attach segments target a single affix

* Set ranges target a range of nodes

* Slice ranges target a range of affixes and possibly disjoint ranges of nodes

* Only one effect can apply to a node

* Several effects can apply to an affix (even excluding priors)

* Several attach segments can target the same affix (both by current and prior segments)

* We need to represent the precedence between overlapping moves and deletes. Is it always temporal?

Maybe the format shouldn't try to avoid overlapping segments because overlaps are rare, and when they do happen, they're likely to be over single slots, which doesn't lead to splitting. This could let us avoid repeating offsets.

Also note that keeping around tombstones my not be so bad under the new cell model because the cases where there's a lot of data turnaround (e.g., a value field or the values of a map) would be using fixed-sized fields. The worst case of dynamically-sized fields would be something like a long lived "agenda" list that keeps getting updated over time.

## Should a trait be annotated only with the priors that mute its marks, or all priors over the same area?

**=> Only the prior that mutes it**

There are two options when it comes to representing muted marks. Either include tombstone information for the one prior change that is muting the marks, or include information about all the priors that would mute the marks (including the prior that does).

The fear with only including the prior that mutes the marks, is that if 3 deletes are targeting the same node, and the last one only has priors that represent the first one, then that last one would think it is now first in line for deleting the node if it were rebased over the undo of the first deletion, leading us to a situation where both the second third deletes are now claiming to delete the same node. This outcome is actually the correct one. The third edits will initially think it is first in line to perform the deletion (after being rebased over the undo of the first deletion) but will then be rebased over the second deletion, thereby introducing a new prior segment for it (which mutes the deletion).

This scenario in captured in sample scenario C.

## When annotating a segment with a prior, should we just include the node effects, or also the affix effects?

**=> Just node effects**

All the affix effects of a prior change should be applied during rebase.

## How do we support progressive rebasing?

Progressive rebasing is the ability to use the result of rebasing a change over some concurrent changes as an input into the rebasing of that change over more concurrent changes. Progressive rebasing means the following relationship holds:

`rebase(U, squash(A, B)) == rebase(rebase(U, A), B)` (associativity)

Note that the above formula is meaningfully different from this one:
`rebase(U, [A, B]) == rebase(rebase(U, A), B)`

Both capture the idea that whether you find out about the existence of B (and the need to rebase over it) at the same time as you're rebasing over A, or whether you find out about it later, should not lead to different outcomes. The second formula however, doesn't guarantee the outcome we want: in the case of some node X being deleted by two concurrent changes A and U, where B is the undo of the deletion of X by A, it would be <u>sufficient</u> for the purposes of abiding by the original formula to ensure that U's intent of deleting X were always dropped, which is not the outcome we want.

The inclusion of squash in the newer formula allows us to prevent this "cop-out", by assigning to squash some specific behavior about how it treats such [A, undo of A] cases.

Reasons in favor of supporting progressive rebasing:

- It makes for a cleaner formalism

- Makes squash and rebase fuzz-testable with respect to one another

- It allows us to delay support for squashing

- It makes it possible for clients not to rebase their local edits from scratch as more concurrent edits become known (i.e., a more efficient way to maintain local edits in a state that is coherent with incoming edits).

Challenges associated with supporting it:

* It forces rebased edits to include some way to recover all the intentions of the original edit (e.g., deleting already deleted content).

The first thing to point out when trying to meet this challenge is that we can support two formats for rebased edits: one that is further rebasable and one that is not.
The non-rebasable form can be used for catching up clients (even when they wish to rebase changes over the history) and for UI updates. This could either be modeled as having two squash algorithms (one that preserves the original intention information, and one that doesn't), or having a single squash algorithm (that preserves the original intention information) and a new "seal" operation that takes a changeset and strips that information.

When it comes to representing the original intentions there's a spectrum of options, but they tend to be variations on the following two approaches:

1. Preserve the original segment information within the rebased changesets. This would prevent a lot of the squashing we rely on in order to keep changeset sizes bounded.

2. Include a reference to the original edit, so that we can rebase it instead. This is essentially an on-demand version of "rebase the original edit over the squash of all prior concurrent edits" (i.e., not a progressive rebase) so it doesn't boast the advantage of letting clients rebase their local edits faster.

In live-collab scenarios, progressive rebasing only happens with local edits that the client want to keep the UI up to date for. Since the collab window is short, it seems unlikely that the additional data from muted segments (segments which, due to prior concurrent changes, don't have an effect) would be problematic. So preserving original segment information (option #1) would make sense.

In out of line rebase scenarios, branches can accumulate many changes and we may not want to pay the price of storing the extra information from #1, especially since merges should be less frequent. So only preserving a reference to the original version may make more sense.

There's another workflow that's interesting: live collab where we allow clients to have local edits that they don't immediately submit (but they still see other edits coming down). The local changes need to be rebased as they falls out of the collab window and there is no original edit for peers to refer to, so either the rebased change includes muted segments (which refer to changes outside the collab window) or we drop them and we're okay with the intent degradation. Note that which we choose could be governed by another (outer) collab window that is >= the usual one.

Based on the above, neither option seems categorically required, or categorically useless. It seems reasonable to start with option #1 as it allows us to more forward without squashing, and it's easier to add a "seal" operation to remove the muted segments than it is to re-implement rebasing.

## Should edits be able to describe how they want later concurrent edits to be affected by them?

The commutativity of place anchors allows the destination of an insert (or move) to specify how to react to concurrent edits that are sequenced before it. For example, an insert can be marked as commutative to signify that slice ranges should apply to it even if the slice operation was sequenced prior.

This is useful in text editing scenarios where one wants to insert text in a region of text and wants to ensure that the inserted text should be moved with the surrounding text if someone were to concurrently move the surrounding text.

In the case where the insert is sequenced before the move, we have a design choice: should the inserted content not be moved if it is marked as non-commutative?

If we choose to say that the content should not be moved, then the commutativity flag is having an effect on the slice range that is sequenced after it.

Let's look at the two options in more detail:

1. The commutativity flag on the insert is only relevant in interpreting the insert in the context of prior concurrent changes. This means that if a slice range is sequenced after an insert then the insert has no way of escaping the slice range's effect.

2. The commutativity flag on the insert is relevant for all concurrent changes. Since we can't change the past, this means the flag affects both how the insert edit is interpreted in the context of prior concurrent changes, and how later edits are interpreted. This means that an insert will either be affected by a concurrent slice range (no matter the ordering) or not affected by it (no matter the ordering).

In addition to the above we could also consider additional changes:

1. We introduce a second commutativity flag on the insert such that whether the insert is affected by a concurrent slice range can be controlled independently for slice ranges that were sequenced prior and slice ranges that were sequenced later.

2. We introduce a commutativity flag on the slice range so that it can optionally opt into affecting concurrent inserts that are sequenced after it.

3. We do both of the above. This would require a tie-breaking policy when the slice says it wants to affect concurrent inserts that are sequenced after it and the insert says it does not want to be affected by concurrent slice range sequenced before it.

It's helpful to be guided by scenarios, so here's one that advocates for the need for slice ranges to be able affect prior concurrent insertions but not latter concurrent ones: if a trait is being used as a list that users clear and re-populate, several users may wish to clear and repopulate the list. If the data model prescribes that the list contents should only come from a single user, then the application needs to have a FWW or LLW winner-takes-all behavior with respect to concurrent edits. Assuming a LWW policy is adopted, the application will need to perform a slice delete of the contents of the trait and insert the new content in a manner that embraces (i.e., commutes with) concurrent slice deletions that are sequenced after. The trouble is, if slice range operations always affected concurrent insertions that are sequenced later, then the content being inserted by the transaction that is sequenced last (the one that is supposed to "win") would end up being deleted by the slices ranges of the transactions that were sequenced before it. Note that this scenario doesn't prescribe a specific way to avoid having that happen, but it does highlight why it's not good to both have a single commutativity flag that is interpreted as meaningful for later concurrent ranges AND to not give slice ranges the option of opting out of affecting concurrent inserts that are sequenced after.

It's hard to consider all possibilities, and it would be hard for a user to think through what they should choose if given all these choices. We need to coalesce the options into overarching models or philosophies.

One philosophy is "sequencing should not matter": we expect edit authors to want the same outcome no matter the sequencing order. This would mean having a single commutativity flag on inserts (you either want to move with the region or not, no matter the sequencing) and no flags on slice ranges: you want to include all concurrently inserted nodes (node matter whether they were inserted by an edit that was sequenced before or after). This is has an appealing simplicity but it fails to provide the desired merge semantics in the scenario given above: all data would be deleted or none (except the data initially present in the trait if any) would be deleted. The "sequencing should not matter" attitude may also be more questionable in an git-like collab scenario: whether you rebase branch foo on branch bar or the reverse should not necessarily come out the same.

Another philosophy is "each edit only gets to specify how it adjusts to concurrent edits that were sequenced prior (not the ones that were sequenced later)". This would mean that a slice range, doesn't automatically include later concurrent inserts, but it does mean that a later concurrent insert could opt into embracing that prior slice move. The LWW scenario above would then be implemented with non-commutative inserts. This would also mean however, that a non-commutative insertion of text in a greater body of text could still end up being moved with that greater body of text if the move were sequenced after. This is bound to be surprising for the user performing the insert (and all the more vexing when the slice is applying a deletion instead of a move).

Can we make an argument that the blame for this scenario not working out should fall on the slice-range author because they could have used a set-like range instead?
This would be a valid line of reasoning if there are no cases where, for the same slice range, some insertion authors would want their content to be affected by it while some insertion authors would not. This is question can be rephrased as: are authors of ranges always able to tell, based on the location of the range, whether inserts that are concurrent to it should be affected by it?
The answer seems to be "no": if a range of text is deleted, then concurrent inserts that just fix typos would want to be affected by the range, while concurrent inserts that introduce new (possibly large amounts of) content would want not to be affected by it.

Perhaps another philosophy is "insert decides". This would mean that whether a slice range affects a prior insert and whether it affects a later insert, is up to each insert. This way, a non-commutative insertion of text in a greater body of text would not be moved with the greater body of text no matter the sequencing. An intuition for why this philosophy may be advisable, is that the edit/user performing an insert is has more knowledge about that content than the slice range would. A case could also be made that putting the policy on the insert allows more specific choices (since the choice is per-insert) that putting the policy on the range. It's tempting to argue that this means we're unable to choose what the policy should be per-range, but the author of a range does have say over whether they create a slice-like or a set-like range. The LWW trait scenario, under this philosophy, would be implemented by having two flags on the insert: one set to "don't commute" for prior slices and one set to "commute" for later slices.

Maybe a 2x2 table would be good to make sure all options are useful.

CP:CL: used for text insertion that should move with its surrounding region no matter the sequencing

NP:NL: used for text insertion that should not move with its surrounding region no matter the sequencing

NP:CL: used for the LLW trait scenario

CP:NL: ?

Maybe the scenario where you don't want to commute with a slice-range that occurs after you is questionable? This is based on the intuition that slice-ranges are dubious: if the domain model would ideally have had a hierarchy and the slice-range would be replaced with a set range over the parent(s), then any concurrent insertions under that/those parent(s) would be affected by the range operation.
There seems to be a flaw in this reasoning: if the domain model had had a hierarchy, the insert author would have been able to insert at either level of the hierarchy. For example, adding a letter to fix a typo in a word would be an insert at the bottom level of the hierarchy (in which case it would indeed be affected by the range), but inserting a whole new paragraph would have been made at the same level of the hierarchy (or above) as that of the range, in which case it would not be affected by the range. In the absence of hierarchy, the insert locations for letters and paragraphs end up at the same level. In essence, what the commutativity flag lets you do, is describe which layer of the ideal hierarchy your insert is targeting.

An interesting implication of the above, is that this commutativity flag is too limited to allow edit authors to replicate the merge semantics of tree hierarchies:

- The flag should be an integer describing which layer of the tree is would be targeting in the hierarchy. Essentially a depth indicator.

- Ranges should also have such a property to describe which layer they're targeting.

- To determine whether an insert is affected by a slice range we would check whether its depth is greater than that of the range.

Do we still need slice-like inclusion of concurrent content when the depth is the same? If so, do we still need a way for inserts to commute with slice ranges?
We would in fixed-sized traits at least: fixed sized traits allow the imagined hierarchy to be different in each edit: one edit may imply a hierarchy where cells 1-10 form a unit, while some other edit may imply a hierarchy where cells 5-15 form a unit.

## What should be the outcome of the insert-in-moved-move scenario?

The scenario (See `ScenarioH`):
In a trait foo that contains the nodes [A B], three users concurrently attempt the following operations (ordered here from first sequenced to last sequenced):

* User 1: slice-move all of trait foo into trait bar with a non-commutative attach

* User 2: slice-move all of trait bar into trait baz

* User 3: insert X after A in foo (commutative)

There are two, seemingly reasonable outcomes:

1. X ends up in baz

2. X ends up in bar (with A and B)

An alternative scenario that is also relevant to this question is the same as the above but with user 2's edit being sequenced before user 1's edit.

In all cases, A and B end up in bar because the move by user 2 is using a non-commutative attach.

What's at stake between options 1 and 2, is the precise semantics of commuting with a slice-move:

* Under option 1 (X is affected by both moves) when the insertion of X is forwarded to bar, it is treated as *brand new* insertion within that affix. Since the affix is affected by the bar=>baz rule and the insert is commutative, it makes sense for that insert so be forwarded again to baz.

* Under option 2 (X is only affected by the first move) when the insertion of X is forwarded to bar, it is treated as *nested* insertion within the content being moved (i.e., nodes A and B). As such, it obeys the same rules as that content, which is to say it obeys the foo=>bar move's choice of not commuting.

We find option 2 preferable for the following reasons:

* It matches the natural expectation that making the insert of X commutative means X will follow its surrounding nodes if a slice range were to move those nodes.

* The alternative (i.e., option 1) would...
  
  * cause ordering challenges in scenarios where multiple concurrent inserts (such as that of X) from were to target target the region of foo affected by the foo=>bar move: those inserts should be ordered in a manner that is consistent with their target affixes (and tie-breaking flags, and sequence ordering) but that is impossible to do if all that is know about each of them is that it targets a specific affix in bar.
  
  * force us to either:
    
    * Accept that the outcome would be different had the sequencing order of the first two edits be flipped
    
    * Or somehow store enough information in the rebase of the insertion or the rebase of the foo=>bar move to be able to figure out that X must land in baz. This is not impossible but adds complexity.

## How to represent inserts that commute with a concurrent slice move?

Move the insert mark to the destination of the move. This allows us to avoid having to represent affix effects from prior changes over which the current change was rebased. We do however have to represent the precise affix that the forwarded insert targets because we need to be able to understand how other such forwarded inserts should be ordered relative to it.

This leads to the question of how one would recover the original intention (i.e., the original insert location). This is needed when postbasing the inverse of the move over the (rebased) insert. This can be worked out based on the affix of the rebased insertion: we can tell that the affix it targets only came about as a result of the move and we can tell the insert was concurrent with the move because of the original ref seq number.

What about when the source content has been (concurrently) deleted?

We still need to describe the number of affixes being introduced by the move because we need to be able to correctly order many such commutative insertions in the deleted region of the move source.

Proposal: do not update the number of moved-in nodes. This allows the moved insert(s) to target the affixes of the moved deleted nodes. Note that this then requires readers of the move changeset to keep track of the fact that a prior delete has impacted the source region. It also requires the rebased insert to include tombstone information stating that the area they're inserting into has been deleted by the delete. This is a little strange because this leads to the inclusion (duplication) of tombstones in traits that the deletion did not target.

Scenarios A1 and A2 are examples of this complex case.

Wait: how does this work for slice moves that don't contain nodes? (See scenario J)

The assumption that affixes and nodes follow a standardized _ _ N _ _ pattern may be wrong: you could make K slices over single or pairs of affixes (without nodes) and move all of those to a single location, thereby creating an arbitrarily long sequence of affixes. 

Perhaps that pattern is not wrong because the slices all fall into a single affix. What we need is a way for either:

* the move-in to carry information about all of the nodes and affixes that it imports/maps/injects/portals into the trait. In the case of a set-move it's pure nodes. In the case of slice moves, it's both (or either).

* the inserts that end up (due to rebasing) at the destination of the move to include more information about their affix of origin

Insert only introduces nodes, which lead to more affixes in the output context. Is it fair to say that that move can introduce a mixture of both nodes and affixes? Maybe not because those affixes can't be inserted at either during the change or after it. What can happen though is that two later concurrent inserts (that commute with the move) have to be able to target the adequate affix, and they have to be relatively ordered based on their ordering in time, but also based on which affix they would have targeted in the original location.

When moving a slice with nodes, is the fact that the affixes covered by the slice match the affixes introduced by the nodes in the output context a coincidence? You can for example make your slice such that it does not include the affixes before the first node and the affixes after the last node, but those affixes will still exist in the output context.

How was this problem addressed in previous iterations of the format?
Most recently at least, the inserted content was left in its original target trait within a prior slice move segment. How would that have been able to pick up on other moves that it should chain with?

## How to represent the starting location of a slice move that does not contain any nodes?

We could have separate information for affix movement and node movement.

We could omit where in the trait the source and destination are (let the reader consume the trait marks to find out)

We could list the index of the first node that would be in the range if the range did contain nodes.

## Other Notes

Interesting concept: we can count the number of times something is deleted, which would allow us to know that an item is still deleted even after one of the deletes has been undone. Doing this would mean that if N participants try to delete the same node then all N need to undo for the node to be brought back to life.

Avoid data races against the computer because it leads to user confusion. In other words: we don't want merge outcomes to be different if the Fluid service is a little faster or a little slower.

We may want different behavior for out of line merges and real-time merges. This can be modeled as having one merge algorithm with an injected policy. The injected policy can be different for out of line merges and real-time merges.

It would be nice if the affix effects of prior changes were applied during rebase and were thereafter irrelevant. The case that makes this impossible is slice move: we want to preserve information about the original location of the insertion so that we can return the insertion in its original place had the prior move been undone. One way out of this is to say that slices never affect posterior changes: this way prior slices do not affect the current insert. But is this really what we want? We want to be able to make edits commute (so that the outcome is the same no matter which was applied first). So this means we have to give insert the ability to adopt the move destination. Perhaps we want the commutation here, but we don't want the insertion to revert to its original location when rebased over the undo. What should happen instead is that the inserted content should be moved back (to what would have been its original location) as part of the postbased undo over the rebased insert. Maybe there's a way to apply the effect and recover the original intent from the fact that the target affix for the moved insertion only came into being because of the prior move. We should be able to tell that based on the original ref number of the insert: if it is before then move then the target must have been part of the slice.

## Explaining the Format

```typescript
[
    { insert idx: 1 length: 3 },
    { insert idx: 3 length: 2 },
]

[
    [ 1, { insert length: 3 }],
    [ 3, { insert length: 2 }],
]

[
    [ 1, { insert length: 3 }                        ],
    [ 1,                      2, { insert length: 2 }],
]

[
    1, // A
    { insert: [X, Y, Z], length 3 }
    2, // B C
    { insert: [U, V], length 2 }
    // etc.
]

[
    10,
    { insert length 3 }
    2,
    { insert length 2 }
]
```