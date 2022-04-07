/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-empty-interface */

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
		src: TreePath;
		dst: TreePath;
	}

	export interface HasOpId {
		/**
		 * The sequential ID assigned to the change within the change frame.
		 */
		op: OpId;
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
		type: "MoveIn";
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
		mods?: RangeMods<MoveOut, false>;
	}

	export interface DeleteSlice extends IsSlice, HasOpId, HasLength {
		type: "DeleteSlice";
		mods?: RangeMods<MoveOut, false>;
	}

	export interface MoveOutSet extends HasOpId, HasLength {
		type: "MoveOutSet";
		mods?: RangeMods<MoveOut | Delete, false>;
	}

	export interface MoveOutSlice extends IsSlice, HasOpId, HasLength {
		type: "MoveOutSlice";
		mods?: RangeMods<MoveOut | Delete, false>;
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
		side?: Sibling;
		/**
		 * Omit if not in peer change.
		 * Omit if `Tiebreak.LastToFirst` for terseness.
		 */
		tiebreak?: Tiebreak;
		/**
		 * Omit if not in peer change.
		 * Omit if performed with a parent-based place anchor.
		 * Omit if `Commutativity.Full`.
		 */
		commute?: Commutativity;
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
		   * Omit if not in peer change.
		   * Omit if `Tiebreak.LastToFirst` for terseness.
		   */
		tiebreak?: Tiebreak;
		/**
		   * Omit if no drill-down.
		   */
		drill?: DrillDepth;
	}

	/**
	 * The contents of a node to be created
	 */
	export interface ProtoNode {
		id: string;
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
	// Use "interface" instead "type" to avoid TSC error
	export interface Modify<TInner = Mark, AllowSetValue extends boolean = true> extends
		Original.Modify<TInner, AllowSetValue> { }
	export type SetValue = Original.SetValue;
	export type MoveEntry = Original.MoveEntry;
	export type ProtoNode = Original.ProtoNode;
	export type HasOpId = Original.HasOpId;
	export type IsPlace = Original.IsPlace;
	export type IsSlice = Original.IsSlice;

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

	export interface HasSeqNumber {
		/**
		 * Included in a mark to indicate the transaction it was part of.
		 * This number is assigned by the Fluid service.
		 */
		seq: SeqNumber;
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

	export interface ChangeFrame {
		moves?: MoveEntry[];
		priorMoves?: { [key: number]: MoveEntry[] };
		marks: TraitMarks;
	}

	export type TraitMark = Offset | Mark;
	export type TraitMarks = TraitMark[];
	export type ModsTrail = (Offset | ModsMark)[];

	export type ModsMark =
		| RevertValue
		| SetValue
		| Modify;
	export type AttachMark =
		| Insert
		| MoveIn;
	export type DetachMark =
		| MoveOut
		| Delete;
	export type SegmentMark =
		| AttachMark
		| DetachMark;
	export type ObjMark =
		| ModsMark
		| SegmentMark
		| Return
		| Revive;

	export type Mark =
		| ObjMark;

	export type RangeMods<
		TMods,
		AllowSetValue extends boolean = true
		> = (Offset | TMods | Modify<TMods, AllowSetValue>)[];

	export interface Insert extends IsPlace, HasOpId {
		type: "Insert";
		content: ProtoNode[];
		mods?: RangeMods<Original.Mark>;
	}

	export interface MoveIn extends IsPlace, HasOpId, HasLength {
		type: "MoveIn";
		range: RangeType;
		mods?: RangeMods<Mark>;
	}

	export type MoveOut = MoveOutSet | MoveOutSlice;
	export type Delete = DeleteSet | DeleteSlice;

	export interface DeleteSet extends HasOpId, HasLength {
		type: "DeleteSet";
		mods?: RangeMods<MoveOut, false>;
	}

	export interface DeleteSlice extends IsSlice, HasOpId, HasLength {
		type: "DeleteSlice";
		mods?: RangeMods<MoveOut, false>;
	}

	export interface MoveOutSet extends HasOpId, HasLength {
		type: "MoveOutSet";
		mods?: RangeMods<MoveOut | Delete, false>;
	}

	export interface MoveOutSlice extends IsSlice, HasOpId, HasLength {
		type: "MoveOutSlice";
		mods?: RangeMods<MoveOut | Delete, false>;
	}

	// -- Prior Changes ---

	export interface PriorInsert extends IsPlace, HasLength, HasSeqNumber, HasOpId {
		type: "PriorInsert";
		// The mods may be needed for drilldown-based operations
		mods?: RangeMods<Mark, false>;
	}

	export interface PriorMoveIn extends IsPlace, HasSeqNumber, HasOpId, HasLength {
		type: "PriorMoveIn";
		range: RangeType;
		mods?: RangeMods<Mark>;
	}

	export type PriorMoveOut = PriorMoveOutSet | PriorMoveOutSlice;
	export type PriorDelete = PriorDeleteSet | PriorDeleteSlice;

	export interface PriorDeleteSet extends HasSeqNumber, HasOpId, HasLength {
		type: "PriorDeleteSet";
		mods?: RangeMods<PriorMoveOut | MoveOut, false>;
	}

	export interface PriorDeleteSlice extends HasSeqNumber, HasOpId, HasLength {
		type: "PriorDeleteSlice";
		mods?: RangeMods<PriorMoveOut | MoveOut, false>;
	}

	export interface PriorMoveOutSet extends HasOpId, HasSeqNumber, HasLength {
		type: "PriorMoveOutSet";
		mods?: RangeMods<PriorMoveOut | MoveOut | PriorDelete | Delete, false>;
	}

	export interface PriorMoveOutSlice extends HasSeqNumber, HasOpId, HasLength {
		type: "PriorMoveOutSlice";
		mods?: RangeMods<PriorMoveOut | MoveOut | PriorDelete | Delete, false>;
	}

	// -- Inverse Changes ---

	export interface Revive extends HasSeqNumber, HasLength, HasOpId {
		type: "Revive";
		range: RangeType;
		mods?: RangeMods<Return>;
	}

	export interface Return extends HasSeqNumber, HasLength, HasOpId {
		type: "Return";
		range: RangeType;
		mods?: RangeMods<Return | Revive>;
	}

	export interface RevertValue extends HasSeqNumber {
		type: "RevertValue";
	}
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
	Set,
	Slice,
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
 * OpIds are scoped to a single frame, so referring to OpIds across frame would require
 * qualifying them by frame number (and potentially sequence/commit number).
 *
 * The temporal ordering is leveraged to resolve which node a given segment is anchored to:
 * A segment is anchored to the first node, when scanning in the direction indicated by the `side`
 * field, that was either inserted by an operation whose OpId is lower, or left untouched (i.e.
 * represented by an offset), or the end of the trait, whichever is encountered first.
 */
export type OpId = number;

export type Offset = number;
export type Index = number;
export type SeqNumber = number;
export type Value = number | string | boolean;
export type NodeId = string;
export type ClientId = number;
export type TraitLabel = string;
export enum Tiebreak { LastToFirst, FirstToLast }
export enum Commutativity { Full, MoveOnly, DeleteOnly, None }
