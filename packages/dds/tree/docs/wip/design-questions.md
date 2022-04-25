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
The annoying thing about representing affixes as marks is that it makes set-like ranges a little weird: they should only cover nodes but they would extend over the intermediary affixes as well. Perhaps there's a way to represent that as "cover the next N nodes" (implicitly excluding any affixes) but mixing that with slice ranges doesn't seem so great... unless it is: if we separate coverage of nodes/filled cells from coverages of affixes then it gives us a way to cleanly express the fact that some nodes are not affected by a slice range while the affixes around them are. This gives a unifying view of set and slice ranges: slice is the same as set except that it impacts affixes and doesn't follow the nodes around as they move.

## Should a segment be annotated only with the prior that mutes it, or all priors that could mute it?

**=> All priors that could mutate it**

There may be two options when it comes to representing muted segments. Either have the segment include a prior for the one change that is muting the segment, or include information about all the priors that would mute the segment (including the one that does). Is there a benefit to the latter? If 5 deletes are targeting the same node, and each of the later four only have priors that represent the first one, then they might each think they're now first in line for deleting the node if they get rebased over the undo of the first deleted. That's a problem.

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

## Current POR

Use segments for everything (no pairs of bound marks).

Maintain a hierarchy by splitting segments up as needed and nesting them. The nesting will be from most recent (on the outside) to most prior (on the inside). This ordering is like function application (latter calls on the outside). This ordering should reduce the amount of splitting because a new range cannot be contained by an older one, whereas the reverse can be true. Attach operations are included in the inner-most range they fall within.

Use frames.

Assign a monotonically increasing ID to each op (to be used in the move table in the case of move ops).

The move table is more like a sorted list one could binary search within.

Splitting an op does not mint a new ID. new IDs are never minted by rebase/postbase/invert.

Anchoring is expressed with a side (`prev`/`next`). Which node is targeted as the anchor point is determined based on op IDs.

## Other Notes

Interesting concept: we can count the number of times something is deleted, which would allow us to know that an item is still deleted even after one of the deletes has been undone. Doing this would mean that if N participants try to delete the same node then all N need to undo for the node to be brought back to life.

Avoid data races against the computer because it leads to user confusion. In other words: we don't want merge outcomes to be different if the Fluid service is a little faster or a little slower.

We may want different behavior for out of line merges and real-time merges. This can be modeled as having one merge algorithm with an injected policy. The injected policy can be different for out of line merges and real-time merges.

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