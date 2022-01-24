/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Peer edit constructed by clients and broadcast by Alfred.
 */
interface Transaction {
	frames: (ConstraintFrame | ChangeFrame)[];
	//revivals?: Map<NodeId, Revival[]>;
	//clipboard?: Map<NodeId, ClipboardEntry>;
}

/**
 * Changeset used to rebasing peer edits.
 */
interface ChangeSet {
	changes: ChangeFrame;
	//revivals?: Map<NodeId, Revival[]>;
	//clipboard?: Map<NodeId, ClipboardEntry>;
}


type ConstraintFrame =
 | ConstrainedRange
 | ConstrainedTraitSet
 | [ConstrainedRange, ConstrainedTraitSet]
 | [ConstrainedTraitSet, ConstrainedRange];

interface ConstrainedTraitSet {
	[key: TraitLabel]: ConstraintSequence;
}

// Option 1: like segments but constraints are not mutually exclusive
// Simpler structure, O(1) fixup aside from splicing some constraints in, smaller integers for close-by constraints
type ConstraintSequence = (Offset | ConstrainedRange | ConstrainedTraitSet)[];
// Option 2: indexed list
// More nested, O(1) fixup aside from splicing some entries in
// Maybe better if trying to look at a constraint for a specific region of the trait (can binary search the ordered list and overlap test)
// Closer to PSet format
type ConstraintSequence2 = [Index, ConstrainedRange | ConstrainedTraitSet][];

interface ConstrainedRange {
	length?: number;
	targetParent?: NodeId; // Could this just be `true` since we know the starting parent? Only if we know the constraint was satisfied originally.
	targetLabel?: TraitLabel; // Same
	targetLength?: number; // Same
	/**
	 * Number of tree layers for which no structural changes can be made.
	 * Defaults to 0: no locking.
	 */
	structureLock?: number;
	/**
	 * Number of tree layers for which no value changes can be made.
	 * Defaults to 0: no locking.
	 */
	valueLock?: number;
}

type ChangeFrame = Subtree | TraitMarks;

interface Subtree {
	[value]?: Value | [Value, DrillDepth];
	[key: TraitLabel]: TraitMarks;
}

/**
 * Using offsets instead of indices to reduce the amount of updating needed.
 */
type TraitMarks = (Offset | Mark)[];

type Mark = Subtree | Segment | SliceBound | SegmentRace;
type RelativeMark = MoveIn | SliceBound | SegmentRace;

interface SegmentRace {
	/**
	 * Omit if 'prev' for terseness.
	 */
	side?: 'prev' | 'next';
	marks: RelativeMark[];
}

interface Segment {
	/**
	 * 1 when omitted.
	 */
	length?: number;
	/**
	 * Omit if within peer transaction.
	 */
	seq?: SeqNumber;
	/**
	 * Always interpreted after `MoveIn.seq` and before `MoveOut.seq`.
	 * The offset approach keeps numbers smaller and lets us split and join segments without updating the numbers.
	 * Option 1:
	 */
	mods1?: (Offset | Subtree)[];
	/**
	 * Option 2:
	 * The index approach lets us binary search faster within a long segment.
	 */
	mods2?: [Index, Subtree][];
	/**
	 * Option 3:
	 * The index approach lets us lookup faster within a long segment.
	 */
	mods3?: { [key: Index]: Subtree };
}

interface Attach extends Segment {
	/**
	 * Omit if directly within a SegmentRace.
	 * Omit if 'Sibling.Prev' for terseness.
	 */
	side?: Sibling.Next;
	/**
	 * Omit if not in peer change.
	 * Omit if 'Tiebreak.LastToFirst' for terseness.
	 */
	tiebreak?: Tiebreak.FirstToLast;
	/**
	 * Omit if not in peer change.
	 * Omit if SimpleMovementRules.NeverMove.
	 */
	moveRules?: MovementRules;
	/**
	 * Omit if no drill-down.
	 */
	drill?: DrillDepth;
}

interface Insert extends Attach {
	content: ProtoNode[];
}

interface MoveIn extends Attach {
	/**
	 * The original location of the first moved node as per the edits known to the clients at the time.
	 * Note that there could be multiple MoveOut segments there. Use `srcId` to differentiate.
	 */
	srcPath: TreePath;
	/**
	 * An ID that uniquely identifies the move operation within the transaction/seq#.
	 * The matching MoveOut segment will bear the same ID.
	 */
	srcId: ChangeId;
	/**
	 * In case the source is less segmented than the MoveIn, start at this offset in the source.
	 * This avoids having the split the source segment whenever we split the MoveIn segment.
	 */
	srcOffset?: number;
}

/**
 * Used for Delete and MoveOut of set-like ranges and atomic ranges.
 */
interface Detach extends Segment {
	/**
	 * Omit if the detached range existed at that location before the transaction or changeset.
	 */
	attach?: Insert | MoveIn;
}

/**
 * Used for set-like ranges and atomic ranges.
 */
interface Delete extends Detach {}

/**
 * Used for set-like ranges and atomic ranges.
 */
interface MoveOut extends Detach, HasDst {}

interface HasDst {
	/**
	 * The target location of the first moved node as per the edits known to the clients at the time.
	 * Note that there could be multiple MoveIn segments there. Use `dstId` to differentiate.
	 */
	dstPath: TreePath;
	/**
	 * An ID that uniquely identifies the move operation within the transaction/seq#.
	 * The matching MoveIn segment will bear the same ID.
	 */
	dstId: ChangeId;
	/**
	 * In case the destination is less segmented than the MoveOut, start at this offset in the destination.
	 * This avoids having the split the destination segment whenever we split the MoveOut segment.
	 */
	dstOffset?: number;
}

/**
 * We need a pair of bounds to help capture what each bound was relative to: each bound needs to be able to enter a
 * race independently of the other.
 * 
 * In peer edits, the content within the bounds...
 *  - includes all operations made prior to the detach of this slice
 *  - cannot grow
 * 
 * In the collab window, the content within the bound...
 *  - includes all operations made prior to the detach of this slice
 *  - includes attaches (and potential subsequent detaches) made by transactions that were concurrent to the slice.
 *  - can grow
 */
interface SliceStart {
	/**
	 * An ID that uniquely identifies the detach operation within the transaction/seq#.
	 * The matching SliceEnd and MoveIn segment (in the case of a move) will bear the same ID.
	 */
	id: ChangeId;
	/**
	 * Omit if within peer transaction.
	 */
	seq?: SeqNumber;
	/**
	 * Omit if directly within a SegmentRace.
	 * Omit if 'Sibling.Prev' for terseness.
	 */
	side?: Sibling.Next;
	/**
	 * Omit if not in peer change.
	 * Omit if 'Tiebreak.LastToFirst' for terseness.
	 */
	tiebreak?: Tiebreak.FirstToLast;
	/**
	 * Omit if no drill-down.
	 */
	drill?: DrillDepth;
}

interface MoveOutSliceStart extends SliceStart, HasDst {}
interface DeleteSliceStart extends SliceStart {}

interface SliceEnd {
	/**
	 * An ID that uniquely identifies the detach operation within the transaction/seq#.
	 * The matching SliceStart and MoveIn segment (in the case of a move) will bear the same ID.
	 */
	id: ChangeId;
}

type SliceBound = MoveOutSliceStart | DeleteSliceStart | SliceEnd;

/**
 * Either
 *  * A positive integer that represents how much higher in the document hierarchy the drilldown started (0 = no
 *    drilling involved).
 *  * A pair whose elements describe
 *    * The list of tree addresses of reference nodes that were drilled through (ordered from last to first)
 *    * A positive integer that represents how higher above the last reference node the drilldown started
 */
type DrillDepth = number | [TreePath[], number];

/** A string that represents a path from the root to a particular node. */
type TreePath = string;

/**
 * The relative location of the sibling based on which a segment or segment boundary is defined.
 */
enum Sibling {
	/**
	 * Used for, e.g., insertion after a given node.
	 */
	Prev,
	/**
	 * Used for, e.g., insertion before a given node.
	 */
	Next,
}

/**
 * The contents of a node to be created
 */
 interface ProtoNode {
	id: string;
	type?: string;
	value?: Value;
	traits?: ProtoTraits;
}

/**
 * The traits of a node to be created
 */
 interface ProtoTraits {
	[key: TraitLabel]: ProtoTrait;
}

/**
 * A trait within a node to be created.
 * May include change segments if the trait was edited after creation.
 * 
 * Modify segments are now allowed here. Instead, modifications are reflected as follows:
 * - values are updated in place
 * - deleted nodes are replaced by a Delete segment in the relevant ProtoTrait
 * - other modifications (Insert, MoveIn, MoveOut) are represented by adding a segment in the relevant ProtoTrait.
 */
type ProtoTrait = (ProtoNode | Mark)[];

type Offset = number;
type Index = number;
type CreateIndex = number;
type SeqNumber = number;
type ChangeId = number;
const value = Symbol();
type Value = number | string | boolean;
type NodeId = string;
type TraitLabel = string;
enum Tiebreak { LastToFirst, FirstToLast }
type MovementRules = SimpleMovementRules | CustomMovementRules
enum SimpleMovementRules { NeverMove, CommutativeMove, AlwaysMove }
interface CustomMovementRules {
	traitLabel: TraitLabels;
	traitParent: TraitParents;
	siblingStatus: NodeStatuses;
	granularity: MoveGranularity;
	commutative: boolean;
}
enum TraitLabels { Initial, Any }
enum TraitParents { Initial, Any }
enum NodeStatuses { Alive, Deleted, Any }
enum MoveGranularity { IntraEdit, InterEdit, Any }
