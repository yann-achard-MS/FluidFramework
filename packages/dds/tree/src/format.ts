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

	export interface HasMoveId {
		/**
		 * The ID of the corresponding MoveIn/MoveOut/End/SliceStart.
		 * Omit if 0.
		 */
		moveId?: MoveId;
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
		setValue?: If<AllowSetValue, Value | [Value, DrillDepth]>;
		modify?: { [key: string]: (Offset | TInner)[] };
	}

	export type TraitMarks = (Offset | Mark)[];

	export type ModsMark =
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
		| SliceBound;

	export type Mark =
		| ObjMark;

	export interface HasMods {
		mods?: (Offset | ModsMark)[];
	}

	export interface Place {
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
		 * Omit if not in peer change.
		 * Omit if `Tiebreak.LastToFirst` for terseness.
		 */
		tiebreak?: Tiebreak.FirstToLast;
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

	export interface Insert extends Place, HasLength, HasMods {
		type: "Insert";
		content: ProtoNode[];
	}

	export interface MoveIn extends Place, HasMoveId {
		type: "MoveIn";
		// Technically the segment could just use HasMods and HasLength but
		// this make Original.ChangeFrame assignable to Rebased.ChangeFrame
		// which is convenient.
		contents: (Offset | ModsMark)[];
	}

	/**
	 * Used for set-like ranges and atomic ranges.
	 */
	export interface Delete extends HasLength {
		type: "Delete";
		/**
		 * Applying a Delete over existing Modify marks has the follow effects on them and their descendants:
		 * (These effects are also applied to Modify marks over which a slice-deletion is performed)
		 * - setValue: removed
		 * - SetValue: replaced by an offset of 1
		 * - Insert: removed
		 * - MoveIn from MoveOut: MoveIn is removed, the corresponding MoveOut becomes a Delete
		 * - MoveIn from MoveOutStart: MoveIn is removed, the corresponding MoveOutStart becomes a StartDelete
		 * - Delete: replaced by an offset
		 * - MoveOut: preserved as is
		 * - MoveOutStart+End: preserved as is
		 */
		mods?: (Offset | Modify<MoveOut | MoveOutStart | SliceEnd, false>)[];
	}

	/**
	 * Used for set-like ranges and atomic ranges.
	 */
	export interface MoveOut extends HasLength, HasMoveId {
		type: "MoveOut";
		/**
		 * Applying a MoveOut over existing Modify marks has the follow effects on them and their descendants:
		 * (These effects are also applied to Modify marks over which a slice-move-out is performed)
		 * - setValue: transplanted to the target location of the move.
		 * - SetValue: replaced by an offset of 1 and transplanted to the target location of the move.
		 * - Insert: transplanted to the target location of the move.
		 * - MoveIn from MoveOut: transplanted to the target location of the move. The corresponding MoveOut
		 *   is updated.
		 * - MoveIn from MoveOutStart: transplanted to transplanted to the target location of the move. The
		 *   corresponding MoveOutStart is updated.
		 * - Delete: replaced by an offset
		 * - MoveOut: preserved as is
		 * - MoveOutStart+End: preserved as is
		 */
		mods?: (Offset | Modify<MoveOut | MoveOutStart | SliceEnd, false>)[];
	}

	/**
	 * We need a pair of bounds to help capture what each bound was relative to: each bound needs to be able to enter a
	 * race independently of the other.
	 *
	 * In original edits, the content within the bounds...
	 *  - cannot grow
	 *  - does not include all of the segments that existed there prior to the slice operation (see below).
	 *
	 * While multiple slices can coexist over a given region of a trait, a new slice can only relate to an old
	 * (i.e., pre-existing one) with one of the following Allen's interval relationships:
	 * - old > new
	 * - old < new
	 * - old m new
	 * - old mi new
	 * - old s new
	 * - old d new
	 * - old f new
	 * - old = new
	 *
	 * In the case of a slice-deletion, preexisting segment over which the slice is place are affected as follows:
	 * - SetValue:
	 *   Replaced by an offset of 1.
	 * - Insert:
	 *   The insertion is removed. Any MoveIn segments under the insertion have their MoveOut replaced by a Delete or
	 *   their MoveOutStart replaced by a DeleteStart.
	 * - MoveIn from a MoveOut:
	 *   The MoveIn is deleted. The MoveOut is replaced by a Deleted.
	 * - MoveIn from a MoveOutStart:
	 *   The MoveIn is preserved to act as landing strip for any attach operations that commute with the move but not
	 *   the deletion. The mods of the MoveIn are purged from any operations except MoveOut segments.
	 * - Delete:
	 *   Replaced by an offset.
	 * - DeleteStart:
	 *   The DeleteStart and its matching End are removed.
	 * - MoveOut & StartMoveOut+End:
	 *   Those are preserved as is.
	 * - Modify:
	 *   The `setValue` field is cleared.
	 *   The nested segments in the Modify's traits are purged as described in the Delete segment documentation.
	 *   If this results in a Modify mark that had no effect then the mark can be replaced by an offset of 1.
	 * In addition to the above, any segment that keeps track of mods to its nodes also has its mods purged as
	 * described for the Modify mark above.
	 *
	 * In the case of a slice-move, preexisting segment over which the slice is place are affected as follows:
	 * - SetValue:
	 *   Replaced by an offset of 1.
	 * - Insert:
	 *   The Insert is moved to the target location of the move.
	 * - MoveIn from a MoveOut:
	 *   The MoveIn is moved to the target location of the move and its MoveOut is updated.
	 * - MoveIn from a MoveOutStart:
	 *   The MoveIn is moved to the target location of the move and its MoveOutStart is updated.
	 * - Delete & DeleteStart+End:
	 *   Those are preserved as is.
	 * - MoveOut & StartMoveOut+End:
	 *   Those are preserved as is.
	 * - Modify:
	 *   The `setValue` field is transplanted to a new Modify a the target location.
	 *   The nested segments in the Modify's traits are purged as described in the MoveOut segment documentation.
	 *   If this results in a Modify mark that had no effect then the mark can be replaced by an offset of 1.
	 * In addition to the above, any segment that keeps track of mods to its nodes also has its mods purged as
	 * described for the Modify mark above.
	 */
	export interface SliceStart extends HasMoveId {
		/**
		 * Omit if `Sibling.Prev` for terseness.
		 */
		side?: Sibling.Next;
		/**
		 * Omit if not in peer change.
		 * Omit if `Tiebreak.LastToFirst` for terseness.
		 */
		tiebreak?: Tiebreak.FirstToLast;
		/**
		 * Omit if no drill-down.
		 */
		drill?: DrillDepth;
	}

	export interface MoveOutStart extends SliceStart {
		type: "MoveOutStart";
	}

	export interface DeleteStart extends SliceStart {
		type: "DeleteStart";
	}

	export interface SliceEnd extends HasMoveId {
		type: "End";
		/**
		 * Omit if `Sibling.Prev` for terseness.
		 */
		side?: Sibling.Next;
		/**
		 * Omit if not in peer change.
		 * Omit if `Tiebreak.LastToFirst` for terseness.
		 */
		tiebreak?: Tiebreak.FirstToLast;
	}

	export type SliceBound = MoveOutStart | DeleteStart | SliceEnd;

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

	/**
	 * A trait within a node to be created.
	 * May include MoveIn segments if content that was not inserted as part of this change gets moved into
	 * the inserted subtree. That MoveIn segment may itself contain other kinds of segments.
	 *
	 * Other kinds of segments are unnecessary at this layer:
	 * - Modify & SetValue:
	 *   - for a ProtoNode the new value overwrites the original
	 *   - for a moved-in node the new value is represented by a nested Modify or SetValue mark
	 * - Insert:
	 *   - inserted ProtoNodes are added to the relevant ProtoTrait
	 * - MoveIn:
	 *   - the MoveIn segment is added to the relevant ProtoTrait and the corresponding MoveOut is updated
	 * - Delete & DeleteStart+End:
	 *   - deleted ProtoNodes are removed from the relevant ProtoTrait
	 *   - deleted moved-in nodes are deleted at their original location and the MoveIn segment is removed/truncated
	 * - MoveOut & MoveOutStart+End
	 *   - Moved out ProtoNodes are removed from the relevant ProtoTrait and a corresponding insert is created
	 *   - Moved out moved-in nodes redirected to avoid the intermediate step (the MoveIn segment is removed/truncated)
	 */
	export type ProtoTrait = (ProtoNode | MoveIn)[];
}

/**
 * Edit that has been rebased and therefore includes scaffolding information
 * for the edits over which it was rebased.
 */
export namespace Rebased {
	// Use "interface" instead "type" to avoid TSC error
	export interface Modify<TInner = Mark, AllowSetValue extends boolean = true> extends
		Original.Modify<TInner, AllowSetValue> {}
	export type SliceStart = Original.SliceStart;
	export type MoveOutStart = Original.MoveOutStart;
	export type DeleteStart = Original.DeleteStart;
	export type SliceEnd = Original.SliceEnd;
	export type SetValue = Original.SetValue;
	export type MoveEntry = Original.MoveEntry;
	export type ProtoNode = Original.ProtoNode;
	export type HasMoveId = Original.HasMoveId;
	export type Place = Original.Place;

	export interface Transaction {
		client: ClientId;
		/**
		 * The reference sequence number of the transaction that this transaction was originally
		 * issued after.
		 */
		ref: SeqNumber;
		/**
		 * The reference sequence number of the transaction that this transaction has been
		 * rebased over.
		 */
		newRef: SeqNumber;
		frames: TransactionFrame[];
	}

	export interface HasSeqNumber {
		/**
		 * Included in a mark to indicate the transaction it was part of.
		 * This number is assigned by the Fluid service.
		 */
		seq: SeqNumber;
	}

	export interface HasPriorMoveId {
		moveId: MoveId;
	}

	// export interface PriorInsert extends HasSeqNumber, HasLength {
	// 	type: "PriorInsert";
	// }

	// export interface PriorMoveIn extends HasSeqNumber {
	// 	type: "PriorMoveIn";
	// 	contents: TraitMarks;
	// }

	export interface PriorDetach extends HasSeqNumber, HasLength {
		type: "Detach";
	}

	// export interface PriorTemp extends HasSeqNumber, HasLength {
	// 	type: "Temp";
	// 	/**
	// 	 * The SeqNumber of the operation that detached the segment.
	// 	 * Omit if the same as `seq`.
	// 	 */
	// 	detachSeq?: SeqNumber;
	// }

	// export type PriorAttach = PriorInsert | PriorMoveIn;
	export type Prior = PriorDetach;// | PriorAttach | PriorTemp;

	export type TransactionFrame = ConstraintFrame | ChangeFrame;

	export type ConstraintFrame = ConstraintSequence;

	export interface ConstrainedTraitSet {
		type: "ConstrainedTraitSet";
		traits: { [key: string]: ConstraintSequence };
	}

	export type ConstraintSequence = (Offset | Prior | ConstrainedRange | ConstrainedTraitSet)[];

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
		nested?: (Offset | Prior | ConstrainedTraitSet)[];
	}

	export interface ChangeFrame {
		moves?: MoveEntry[];
		marks: TraitMarks;
	}

	export type TraitMarks = (Offset | Mark)[];

	export type ModsMark =
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
	export type SliceBound =
		| MoveOutStart
		| DeleteStart
		| SliceEnd;
	export type ObjMark =
		| ModsMark
		| SegmentMark
		| SliceBound
		| Prior;

	export type Mark =
		| ObjMark;

	export interface HasMods {
		mods?: (Offset | ModsMark)[];
	}

	export interface Insert extends Place, HasLength, HasMods {
		type: "Insert";
		content: ProtoNode[];
	}

	export interface MoveIn extends Place, HasMoveId {
		type: "MoveIn";
		content: (Offset | ModsMark)[];
	}

	/**
	 * Used for set-like ranges and atomic ranges.
	 */
	export interface Delete extends HasLength {
		type: "Delete";
		mods?: (Offset | Modify<Prior | MoveOut | MoveOutStart | SliceEnd, false>)[];
	}

	/**
	 * Used for set-like ranges and atomic ranges.
	 */
	export interface MoveOut extends HasLength, HasMoveId {
		type: "MoveOut";
		mods?: (Offset | Modify<Prior | MoveOut | MoveOutStart | SliceEnd, false>)[];
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

/** A string that represents a path from the root to a particular node. */
export type TreePath = string;

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

export type Offset = number;
export type Index = number;
export type SeqNumber = number;
export type Value = number | string | boolean;
export type NodeId = string;
export type MoveId = number | string;
export type ClientId = number;
export type TraitLabel = string;
export enum Tiebreak { LastToFirst, FirstToLast }
export enum Commutativity { Full, MoveOnly, DeleteOnly, None }
