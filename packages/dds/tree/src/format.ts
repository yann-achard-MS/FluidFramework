/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODOs:
// Clipboard
// Rework constraint scheme

export type If<Bool, T1, T2 = never> = Bool extends true ? T1 : T2;

/**
 * Edit originally constructed by clients.
 * Note that a client can maintain a local branch of edits that are not committed.
 * When that's the case those edits will start as Original edits but may become
 * rebased in response to changes on the main branch.
 */
export namespace Original {
	/**
	 * Edit constructed by clients and broadcast by Alfred.
	 */
	export interface Transaction {
		client: ClientId;
		ref: SeqNumber;
		frames: TransactionFrame[];
	}

	export type TransactionFrame = ConstraintFrame | ChangeFrame;

	export type ConstraintFrame = ConstraintSequence;

	export interface ConstrainedTraitSet {
		type: "ConstrainedTraitSet";
		traits: { [key: string]: ConstraintSequence };
	}

	export type ConstraintSequence = (Offset | ConstrainedRange | ConstrainedTraitSet)[];

	export interface ConstrainedRange {
		type: "ConstrainedRange";
		length?: number;
		/**
		 * Could this just be `true` since we know the starting parent?
		 * Only if we know the constraint was satisfied originally.
		 */
		targetParent?: NodeId;
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
		nested?: (Offset | ConstrainedTraitSet)[];
	}

	export interface MoveEntry {
		id: OpId;
		src: TreePath;
		dst: TreePath;
		hops?: TreePath[];
	}

	export interface HasOpId {
		/**
		 * The sequential ID assigned to the change within the change frame.
		 */
		id: OpId;
	}

	export interface ChangeFrame {
		moves?: MoveEntry[];
		marks: TraitMarks;
	}

	export interface SetValue {
		type: "SetValue";
		value: Value | [Value, DrillDepth];
	}

	export interface Modify<TInner = Mark, AllowSetValue extends boolean = true> {
		type?: "Modify";
		/**
		 * We need this setValue (in addition to the SetValue mark because non-leaf nodes can have values)
		 */
		value?: If<AllowSetValue, Value | [Value, DrillDepth] | { seq: SeqNumber }>;
		modify?: { [key: string]: (Offset | TInner | Modify<TInner, AllowSetValue>)[] };
	}

	export type RangeMods<
		TMods,
		AllowSetValue extends boolean = true
		> = (Offset | TMods | Modify<TMods, AllowSetValue>)[];

	export type TraitMarks = (Offset | Mark)[];

	export type ModsMark =
		| SetValue
		| Modify;
	export type AttachMark =
		| Insert
		| MoveIn;
	export type SegmentMark =
		| AttachMark
		| DetachMark;
	export type ObjMark =
		| ModsMark
		| SegmentMark;

	export type Mark =
		| ObjMark;

	export interface Insert extends IsPlace, HasOpId {
		type: "Insert";
		content: ProtoNode[];
		mods?: RangeMods<Mark>;
	}

	export interface MoveIn extends IsPlace, HasOpId, HasLength {
		type: "Move";
		range: RangeType;
		mods?: RangeMods<Mark>;
	}

	/**
	 * An operation on a (possibly empty) range of nodes.
	 *
	 * While multiple slices can coexist over a given region of a trait, a new slice can only relate to an old
	 * (i.e., pre-existing one) with one of the following Allen's interval relationships:
	 * - old > new (before)
	 * - old < new (after)
	 * - old m new (meets)
	 * - old mi new (is met by)
	 * - old s new (start of)
	 * - old d new (during)
	 * - old f new (finish of)
	 * - old = new (same)
	 * Note that `old o new` (overlap) is not included. This is because one cannot anchor the extremity of
	 * a slice to a node that have already been detached.
	 */
	export type DetachMark = Delete | MoveOut;

	/**
	 * Deleting a slice or set has the following effects on existing marks:
	 *
	 * Preserved:
	 * - MoveOutSet
	 * - MoveOutSlice
	 * - MoveIn slice:
	 *   The MoveIn is preserved to act as landing strip for any attach operations that commute with the move but not
	 *   the deletion. The mods of the MoveIn are purged from any operations except MoveOut segments.
	 * Not Preserved:
	 * - SetValue:
	 *   Replaced by an offset of 1.
	 * - Insert:
	 *   The insertion is removed. Any MoveIn segments under the insertion have their MoveOutSet/Slice replaced by
	 *   a DeleteSet/Slice.
	 * - MoveIn set:
	 *   The MoveIn is deleted. The matching MoveOutSet is replaced by a DeleteSet.
	 * - DeleteSet/DeleteSlice:
	 *   Replaced by an offset.
	 *
	 * The effect on a Modify is more complex:
	 *   The `setValue` field is cleared.
	 *   Descendants are affected thusly:
	 *     Preserved:
	 *     - MoveOutSet
	 *     - MoveOutSlice
	 *     Not Preserved:
	 *     - setValue (within a Modify): removed
	 *     - SetValue: replaced by an offset of 1
	 *     - Insert: removed
	 *     - MoveIn set: removed, the corresponding MoveOutSet becomes a DeleteSet
	 *     - MoveIn slice: removed, the corresponding MoveOutSlice becomes a DeleteSlice
	 *     - DeleteSet: replaced by an offset
	 *     - DeleteSlice: replaced by an offset
	 * If a modify would otherwise be left empty, it is replaced by an offset of 1.
	 */
	export type Delete = DeleteSet | DeleteSlice;

	/**
	 * Moving out a slice or set has the following effects on existing marks:
	 *
	 * Preserved:
	 * - DeleteSet
	 * - DeleteSlice
	 * - MoveOutSet
	 * - MoveOutSlice
	 *
	 * Not Preserved:
	 * - SetValue:
	 *   The SetValue is moved to the target location of the move.
	 * - Insert:
	 *   The Insert is moved to the target location of the move.
	 * - MoveIn set:
	 *   The MoveIn is moved to the target location of the move and its MoveOut is updated.
	 * - MoveIn slice:
	 *   The MoveIn is moved to the target location of the move and its MoveOutStart is updated.
	 *
	 * The effect on a Modify is more complex:
	 *   The `setValue` field is transplanted to a new Modify a the target location.
	 *   Descendants are affected thusly:
	 *     Preserved:
	 *     - MoveOutSet
	 *     - MoveOutSlice
	 *     - DeleteSet
	 *     - DeleteSlice
	 *     - Modify:
	 *     Not Preserved:
	 *     - setValue: transplanted to the target location of the move.
	 *     - SetValue: replaced by an offset of 1 and transplanted to the target location of the move.
	 *     - Insert: transplanted to the target location of the move.
	 *     - MoveIn set: transplanted to the target location of the move. The corresponding move
	 *       destination is updated.
	 *     - MoveIn slice: transplanted to transplanted to the target location of the move. The
	 *       corresponding move destination is updated.
	 * If a modify would otherwise be left empty, it is replaced by an offset of 1.
	 */
	export type MoveOut = MoveOutSet | MoveOutSlice;

	export interface DeleteSet extends HasOpId, HasLength {
		type: "DeleteSet";
		mods?: RangeMods<Mark>;
		// mods?: RangeMods<MoveOut, false>;
	}

	export interface DeleteSlice extends IsSlice, HasOpId, HasLength {
		type: "DeleteSlice";
		mods?: RangeMods<Mark>;
		// mods?: RangeMods<MoveOut, false>;
	}

	export interface MoveOutSet extends HasOpId, HasLength {
		type: "MoveOutSet";
		mods?: RangeMods<Mark>;
		// mods?: RangeMods<MoveOut | Delete, false>;
	}

	export interface MoveOutSlice extends IsSlice, HasOpId, HasLength {
		type: "MoveOutSlice";
		mods?: RangeMods<Mark>;
		// mods?: RangeMods<MoveOut | Delete, false>;
	}

	// -- Inverse Changes ---

	export interface Revive extends HasLength, HasOpId {
		type: "Revive";
		range: RangeType;
		priorSeq: SeqNumber;
		priorId: OpId;
		mods?: RangeMods<Mark>;
		// mods?: RangeMods<Return>;
	}

	export interface Return extends HasLength, HasOpId {
		type: "Return";
		range: RangeType;
		priorSeq: SeqNumber;
		priorId: OpId;
		mods?: RangeMods<Mark>;
		// mods?: RangeMods<Return | Revive>;
	}

	export interface RevertValue extends HasSeqNumber {
		type: "RevertValue";
	}

	export interface IsPlace {
		/**
		 * Whether the attach operation was performed relative to the previous sibling or the next.
		 * If no sibling exists on the indicated side then the insert was relative to the trait extremity.
		 *
		 * In a change that is being rebased, we need to know this in order to tell if this insertion should
		 * go before or after another pre-existing insertion at the same index.
		 * In a change that is being rebased over, we need to know this in order to tell if a new insertion
		 * at the same index should go before or after this one.
		 * Omit if `Sibling.Prev` for terseness.
		 */
		side?: Sibling.Next;
		/**
		 * Omit if `Tiebreak.Right` for terseness.
		 */
		tiebreak?: Tiebreak;
		/**
		 * Omit if not in peer change.
		 * Omit if performed with a parent-based place anchor.
		 * Omit if `Effects.All`.
		 */
		commute?: Effects;
		/**
		 * Omit if no drill-down.
		 */
		drill?: DrillDepth;
	}

	export interface IsSlice {
		/**
		 * Omit if `Sibling.Prev` for terseness.
		 */
		startSide?: Sibling.Next;
		/**
		 * Omit if `Sibling.Next` for terseness.
		 */
		endsSide?: Sibling.Prev;
		/**
		 * When `true`, if a concurrent insertion that is sequenced before the range operation falls
		 * within the bounds of the range, then the inserted content will *not* be included in the
		 * range and therefore will *not* be affected by the operation performed on the range.
		 *
		 * Defaults to false.
		 */
		excludePriorInsertions?: true;
		/**
		 * When `true`, if a concurrent insertion that are sequenced after the range operation falls
		 * within the bounds of the range, then the inserted content will be included in the range and
		 * therefore will be affected by the operation performed on the range, unless that insertion
		 * stipulates that it is not commutative with respect to the range operation.
		 *
		 * Defaults to false.
		 */
		includePosteriorInsertions?: true;
		/**
		 * Omit if `Tiebreak.LastToFirst` for terseness.
		 */
		startTiebreak?: Tiebreak;
		/**
		 * Omit if `Tiebreak.LastToFirst` for terseness.
		 */
		endTiebreak?: Tiebreak;
		/**
		 * Omit if no drill-down.
		 */
		drill?: DrillDepth;
	}

	/**
	 * The contents of a node to be created
	 */
	export interface ProtoNode {
		id?: string;
		type?: string;
		value?: Value;
		traits?: ProtoTraits;
	}

	/**
	 * The traits of a node to be created
	 */
	export interface ProtoTraits {
		[key: string]: ProtoTrait;
	}

	export type ProtoTrait = ProtoNode[];
}

/**
 * Edit that has been rebased and therefore includes scaffolding information
 * for the edits over which it was rebased.
 */
export namespace Rebased {
	export type MoveEntry = Original.MoveEntry;
	export type ProtoNode = Original.ProtoNode;
	export type HasOpId = Original.HasOpId;

	export interface Transaction {
		/**
		 * The reference sequence number of the transaction that this transaction was originally
		 * issued after.
		 */
		ref: SeqNumber;
		/**
		 * The reference sequence number of the transaction that this transaction has been
		 * rebased over.
		 * Omit when equal to `ref`.
		 */
		newRef?: SeqNumber;
		frames: TransactionFrame[];
	}

	export type TransactionFrame = ChangeFrame;

	export interface ChangeFrame {
		moves?: MoveEntry[];
		marks: TraitMarks;
	}

	export interface PriorMoveEntry extends MoveEntry {
		seq: SeqNumber;
	}

	export interface TraitMarks {
		/**
		 * Lists the additional (now deleted/detached) nodes and that must be taken into account in order to represent
		 * the changes made to this trait. Without them, describing the changes would be like drawing on an incomplete
		 * canvas.
		 *
		 * Note that all tombstones introduced by concurrent changes are represented here. This includes tombstones
		 * that are not directly relevant to the description of the changes made to the trait. This is necessary to
		 * ensure that later changes that are concurrent to this change always know how the tombstones they carry
		 * ought to be ordered relative to the tombstones in this change.
		 */
		tombs?: OffsetList<Tombstones, NodeCount>;

		/**
		 * Operations that attach content in a gap.
		 * The order of attach segments in each `Attach[]` reflects the intended order of the content in the trait.
		 *
		 * Offsets represent gaps between any two of the following:
		 * - the start of the field
		 * - the end of the field
		 * - nodes that are present in the input context
		 * - nodes that are represented by tombstones
		 */
		attach?: OffsetList<Attach[], GapCount>;

		/**
		 * Operations that may affect concurrently attached content.
		 * These operation effectively target content that does not yet exist but may come to exist
		 * as a result of concurrent changes.
		 *
		 * Offsets represent gaps between any two of the following:
		 * - the start of the field
		 * - the end of the field
		 * - nodes that are present in the input context
		 * - nodes that are represented by tombstones
		 */
		gaps?: OffsetList<OpenGapEffects | ClosedGapEffects, GapCount>;

		/**
		 * Operations that affect nodes (or locations where a node used to be).
		 *
		 * Offsets represent both nodes that are present in the input context and nodes that were
		 * concurrently detached.
		 */
		nodes?: OffsetList<Detach | Reattach, NodeCount>;

		/**
		 * Represents the changes made to the subtree of each node that was concurrently detached.
		 * This is needed to represent changes to a subtree that was concurrently deleted.
		 *
		 * Offsets represent both nodes that are present in the input context and nodes that were
		 * concurrently detached.
		 */
		modifyDel?: OffsetList<Modify, NodeCount>;

		/**
		 * Represents the changes made to the subtree of each node present in the input context.
		 *
		 * Offsets represent nodes that are present in the input context. The `src` path for move
		 * entries uses indices that are in sync with the contents of this list.
		 */
		modifyOld?: OffsetList<Modify, NodeCount>;

		/**
		 * Represents the changes made to the subtree of each node present in the output context.
		 * This is needed to represent changes to a subtree that was added by this changeset.
		 *
		 * Offsets represent both nodes that are present in the input context and nodes that were
		 * added by this change. The `dst` path for move entries uses indices that are in sync with
		 * the contents of this list.
		 */
		modifyNew?: OffsetList<Modify, NodeCount>;
	}

	export type OffsetList<TContent, TOffset> = (TOffset | TContent)[];

	export interface Modify {
		[key: string]: TraitMarks;
	}

	export interface IsPlace {
		/**
		 * Describes which kinds of concurrent slice operations should affect the target place.
		 *
		 * The tuple allows this choice to be different for concurrent slices that are sequenced
		 * either before (`heed[0]`) or after (`heed[1]`). For example, multiple concurrent updates
		 * of a sequence with last-write-wins semantics would use a slice-delete over the whole
		 * sequence, and an insert with the `heed` value `[Effects.None, Effects.All]`.
		 *
		 * When the value for prior and ulterior concurrent slices is the same, that value can be
		 * used directly instead of the corresponding tuple.
		 *
		 * Omit if `Effects.All` for terseness.
		 */
		heed?: Effects | [Effects, Effects];

		/**
		 * Omit if `Tiebreak.Right` for terseness.
		 */
		tiebreak?: Tiebreak;

		/**
		 * Indicates a prior concurrent slice-move that the target place was affected by.
		 */
		src?: PriorOp;

		/**
		 * Indicates a prior concurrent slice-delete that the target place was affected by.
		 */
		scorch?: PriorOp;
	}

	export interface IsGapEffect {
		/**
		 * When `true`, if a concurrent insertion that is sequenced before the range operation falls
		 * within the bounds of the range, then the inserted content will *not* be included in the
		 * range and therefore will *not* be affected by the operation performed on the range.
		 *
		 * Defaults to false.
		 */
		excludePriorInsertions?: true;
		/**
		 * When `true`, if a concurrent insertion that is sequenced after the range operation falls
		 * within the bounds of the range, then the inserted content will be included in the range and
		 * therefore will be affected by the operation performed on the range, unless that insertion
		 * stipulates that it is not commutative with respect to the range operation.
		 *
		 * Defaults to false.
		 */
		includePosteriorInsertions?: true;
	}

	export interface Insert extends HasOpId, IsPlace {
		type: "Insert";
		content: ProtoNode[];
	}

	export interface Bounce extends HasOpId, IsPlace {
		type: "Bounce";
	}

	export interface MoveIn extends HasOpId, IsPlace {
		type: "Move";
		/**
		 * The actual number of nodes being moved-in. This count excludes nodes that were concurrently deleted.
		 */
		count: NodeCount;
	}

	export type Attach = Insert | MoveIn | Bounce;

	export interface OpenGapEffects {
		count: GapCount;
		/**
		 * Stack of effects applying to the gaps.
		 */
		stack: (Scorch | Forward)[];
	}

	export interface ClosedGapEffects {
		count: GapCount;
		stack: (Heal | Unforward)[];
	}

	export interface Scorch extends HasOpId, IsGapEffect {
		type: "Scorch";
	}

	export interface Heal extends HasOpId, IsGapEffect {
		type: "Heal";
	}

	export interface Forward extends HasOpId, IsGapEffect {
		type: "Forward";
	}

	export interface Unforward extends HasOpId, IsGapEffect {
		type: "Unforward";
	}

	export interface Detach extends HasOpId {
		type: "Delete" | "Move";
		count: NodeCount;
	}

	export interface Reattach extends HasOpId {
		type: "Revive" | "Return";
		count: NodeCount;
	}

	/**
	 * Represents a consecutive run of detached nodes.
	 *
	 * Note that in some situations a tombstone is created for the purpose of representing a gap
	 * even though no node has been detached.
	 * This can happen when a slice-move applied to a gap but not the nodes on both sides of the
	 * gap, or when a slice-move is applied to the gap that represents the start (or end) of a
	 * field.
	 */
	export interface Tombstones extends PriorOp {
		count: NodeCount;
	}

	export interface PriorOp {
		seq: PriorSeq;
		id: OpId;
	}

	/**
	 * The sequence number of the edit that caused the nodes to be detached.
	 *
	 * When the nodes were detached as the result of learning of a prior concurrent change
	 * that preceded a prior change that the current change depends on, a pair of sequence
	 * numbers is used instead were `seq[0]` is the earlier change whose effect on `seq[1]`
	 * these tombstones represent. This can be read as "tombstones from the effect of `seq[0]`
	 * on `seq[1]`".
	 */
	export type PriorSeq = SeqNumber | [SeqNumber, SeqNumber];
}

export namespace Sequenced {
	export interface Transaction extends Rebased.Transaction {
		seq: SeqNumber;
	}
}

export interface HasLength {
	/**
	 * Omit if 1.
	 */
	length?: number;
}

/**
 * Either
 *  * A positive integer that represents how much higher in the document hierarchy the drilldown started (0 = no
 *    drilling involved).
 *  * A pair whose elements describe
 *    * The list of tree addresses of reference nodes that were drilled through (ordered from last to first)
 *    * A positive integer that represents how higher above the last reference node the drilldown started
 */
export type DrillDepth = number | [TreePath[], number];

export interface TreeChildPath {
	[label: string]: TreeRootPath;
}

export type TreeRootPath = number | { [label: number]: TreeChildPath; };

/** A structure that represents a path from the root to a particular node. */
export type TreePath = TreeChildPath | TreeRootPath;

export enum RangeType {
	Set = "Set",
	Slice = "Slice",
}
/**
 * The relative location of the sibling based on which a segment or segment boundary is defined.
 */
export enum Sibling {
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
 * A monotonically increasing positive integer assigned to each segment.
 * The first segment is assigned OpId 0. The next one is assigned OpID 1, and so on.
 * These IDs define total a temporal ordering over all the changes within a change frame.
 * OpIds are scoped to a single frame, so referring to OpIds across frames would require
 * qualifying them by frame number (and potentially sequence/commit number).
 *
 * The temporal ordering is leveraged in the `Original` format to resolve which node a given segment is anchored to:
 * A segment is anchored to the first node, when scanning in the direction indicated by the `side`
 * field, that was either inserted by an operation whose OpId is lower, or left untouched (i.e.
 * represented by an offset), or the end of the trait, whichever is encountered first.
 *
 * The temporal ordering is leveraged in the `Rebased` format to resolve tie-breaking issues when an insert that
 * commuted with a slice-move needs to decide its insertion place relative to another such insertion that commuted with
 * a different slice-move from the same transaction as the other slice-move. (See scenario N)
 *
 * The uniqueness of IDs is leveraged in either format to
 * 1. uniquely identify tombstones so that two changes can tell whether they carry tombstones for the same nodes or
 * for different nodes.
 * 2. uniquely identify the matching move-out for a move-in and vice-versa.
 */
export type OpId = number;

export interface HasSeqNumber {
	/**
	 * Included in a mark to indicate the transaction it was part of.
	 * This number is assigned by the Fluid service.
	 */
	seq: SeqNumber;
}

export type NodeCount = number;
export type GapCount = number;
export type Offset = number;
export type SeqNumber = number;
export type Value = number | string | boolean;
export type NodeId = string;
export type ClientId = number;
export type TraitLabel = string;
export enum Tiebreak { Left, Right }
export enum Effects {
	All = "All",
	Move = "Move",
	Delete = "Delete",
	None = "None",
}
