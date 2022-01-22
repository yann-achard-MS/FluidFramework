/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

interface Transaction {
	frames: (ConstraintFrame | ChangeFrame)[];
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
	seq: SeqNumber;
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
	[value]?: Value | [Value, Drill];
	[key: TraitLabel]: TraitMarks;
}

// Option 1:
// Smaller numbers, flatter structure, can skip offsets for contiguous marks
type TraitMarks = (Offset | Mark)[];
// Option 2:
// Larger numbers, can binary search and overlap test
// There should be no need to ever update indices
type TraitMarks2 = [Index, Mark][];
// Option 3:
// Is this totally superior to option 2?
interface TraitMarks3 {
	[key: Index]: Mark[];
}

type Mark = Subtree | Segment | SliceBound | SegmentRace;
type RelativeMark = MoveIn | SliceBound | SegmentRace; // Is MoveOut really not needed here?

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
	 * Only stored in collab window
	 */
	seq: SeqNumber;
	/**
	 * Always interpreted after `MoveIn.seq` and before `MoveOut.seq`.
	 * The offset approach keeps numbers smaller and lets us split and join segments without updating the numbers.
	 * Option 1:
	 */
	mods1?: (Offset | Subtree)[];
	/**
	 * Option 2:
	 * The index approach lets us binary search faster within a segment.
	 */
	mods2?: [Index, Subtree][];
	/**
	 * Option 3:
	 * The index approach lets us lookup faster.
	 */
	mods3?: { [key: Index]: Subtree };
}

interface MoveIn extends Segment {
	/**
	 * Omit if directly within a SegmentRace.
	 * Omit if 'prev' for terseness.
	 */
	side?: Sibling.Next;
	/**
	 * Only included in peer changes.
	 */
	tiebreak?: Tiebreak.FirstToLast;
	moveRules?: MovementRules;
	src: Create | MoveOut;
	/**
	 * In case the source is less segmented than the MoveIn, start at this offset in the source.
	 * This avoids having the split the source segment whenever we split the MoveIn segment.
	 */
	srcOffset?: number;
	drill?: Drill;
}

/**
 * Used for set-like ranges and atomic ranges.
 */
interface MoveOut extends Segment {
	moveIn?: MoveIn;
	/**
	 * Omitted for deletions.
	 */
	dst?: MoveIn;
	/**
	 * In case the destination is less segmented than the MoveOut, start at this offset in the destination.
	 * This avoids having the split the destination segment whenever we split the MoveOut segment.
	 * 
	 * Omitted for deletions.
	 */
	dstOffset?: number;
}

/**
 * Do we want length info in there?
 * It seems redundant because you could just add up the lengths of the segments between both boundaries.
 */
interface Slice {
	seq: SeqNumber;
	/**
	 * Omitted for deletions.
	 */
	dst?: MoveIn;
	/**
	 * In case the destination is less segmented than the MoveOut, start at this offset in the destination.
	 * This avoids having the split the destination segment whenever we split the MoveOut segment.
	 * 
	 * Omitted for deletions.
	 */
	dstOffset?: number;
	drill?: Drill;
}

/**
 * We need a pair of bounds to help capture what each bound was relative to: each bound need to be able to enter a race
 * independently of the other.
 * 
 * In peer edits, we the contents within the bounds cannot grow. Can we leverage that to make things more terse?
 * In the collab window, the contents within the bound can grow.
 * 
 * Option 1: each slice bound refers to the slice.
 */
interface SliceBound {
	/**
	 * Omit if directly within a SegmentRace.
	 * Omit if 'prev' for terseness.
	 */
	side?: Sibling.Next;
	/**
	 * Only included in peer changes.
	 */
	tiebreak?: Tiebreak.FirstToLast;
	/**
	 * Information common to both bounds.
	 */
	slice: Slice;
}

interface Create {
	content: ProtoNode[];
}

/**
 * Either
 *  * A positive integer that represents how high in the document hierarchy the drilldown started (0 = no drill).
 *  * A pair whose elements describe
 *    * The list of tree addresses of reference nodes that were drilled through (ordered from last to first)
 *    * A positive integer that represents how high above the last reference node the drilldown started
 */
type Drill = number | [TreePath[], number];


type Offset = number;
type Index = number;
//type SeqNumber = number;