/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-empty-interface */

/**
 * Edit constructed by clients and broadcast by Alfred.
 */
export interface Transaction {
	seq: SeqNumber;
	ref: SeqNumber;
	frames: (ConstraintFrame | ChangeFrame)[];
	// revivals?: Map<NodeId, Revival[]>;
	// clipboard?: Map<NodeId, ClipboardEntry>;
}

/**
 * Changeset used to rebasing peer edits.
 */
export interface ChangeSet {
	changes: ChangeFrame;
	// revivals?: Map<NodeId, Revival[]>;
	// clipboard?: Map<NodeId, ClipboardEntry>;
}

export type ConstraintFrame =
 | ConstrainedRange
 | ConstrainedTraitSet
 | [ConstrainedRange, ConstrainedTraitSet]
 | [ConstrainedTraitSet, ConstrainedRange];

export interface ConstrainedTraitSet {
	type: "ConstrainedTraitSet";
	traits: { [key: string]: ConstraintSequence };
}

// Option 1: like segments but constraints are not mutually exclusive
// Simpler structure, O(1) fixup aside from splicing some constraints in, smaller integers for close-by constraints
export type ConstraintSequence = (Offset | ConstrainedRange | ConstrainedTraitSet)[];
// Option 2: indexed list
// More nested, O(1) fixup aside from splicing some entries in
// Maybe better if trying to look at a constraint for a specific region of the trait (can binary search the ordered
// list and overlap test)
// Closer to PSet format
export type ConstraintSequence2 = [Index, ConstrainedRange | ConstrainedTraitSet][];

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
}

export interface LocalTypes {
	Modify: Modify;
	SetValue: SetValue;
	SetValueMark: SetValueMark;
	Insert: Insert;
	Delete: Delete;
	MoveIn: MoveIn;
	MoveOut: MoveOut;
	ProtoNode: ProtoNode;
	MoveOutStart: MoveOutStart;
	DeleteStart: DeleteStart;
	SliceEnd: SliceEnd;
}

export type PeerSetValue = SetValue & HasSeqValue;
export type PeerSetValueMark = SetValueMark & HasSeqValue;
export type PeerModify = Modify<PeerTypes>;
export type PeerInsert = Insert<PeerTypes> & HasSeqValue;
export type PeerDelete = Delete<PeerTypes> & HasSeqValue;
export type PeerMoveIn = MoveIn<PeerTypes> & HasSeqValue;
export type PeerMoveOut = MoveOut<PeerTypes> & HasSeqValue;
export type PeerProtoNode = ProtoNode<PeerTypes>;

export interface PeerTypes {
	Modify: PeerModify;
	SetValue: PeerSetValue;
	SetValueMark: PeerSetValueMark;
	Insert: PeerInsert;
	Delete: PeerDelete;
	MoveIn: PeerMoveIn;
	MoveOut: PeerMoveOut;
	ProtoNode: PeerProtoNode;
	MoveOutStart: PeerMoveOutStart;
	DeleteStart: PeerDeleteStart;
	SliceEnd: PeerSliceEnd;
}
export type TypeSet = LocalTypes | PeerTypes;

export type ModifyType<T extends TypeSet> = T["Modify"];
export type SetValueType<T extends TypeSet> = T["SetValue"];
export type SetValueMarkType<T extends TypeSet> = T["SetValueMark"];
export type InsertType<T extends TypeSet> = T["Insert"];
export type DeleteType<T extends TypeSet> = T["Delete"];
export type MoveInType<T extends TypeSet> = T["MoveIn"];
export type MoveOutType<T extends TypeSet> = T["MoveOut"];
export type ProtoNodeType<T extends TypeSet> = T["ProtoNode"];
export type MoveOutStartType<T extends TypeSet> = T["MoveOutStart"];
export type DeleteStartType<T extends TypeSet> = T["DeleteStart"];
export type SliceEndType<T extends TypeSet> = T["SliceEnd"];
export type SliceStartType<T extends TypeSet> = MoveOutStartType<T> | DeleteStartType<T>;
export type SliceBoundType<T extends TypeSet> = SliceStartType<T> | SliceEndType<T>;

export type ChangeFrame<T extends TypeSet = LocalTypes> = ModifyType<T> | TraitMarks<T>;
export type PeerChangeFrame = ChangeFrame<PeerTypes>;

// export interface Modify<T extends TypeSet = LocalTypes> {
// 	type: "Modify";
// 	[setValue]?: SetValueType<T>;
// 	[key: string]: TraitMarks<T> | ModifyType<T>;
// }

export interface Modify<T extends TypeSet = LocalTypes> {
	type?: never;
	setValue?: SetValueType<T>;
	modify?: { [key: string]: TraitMarks<T> | ModifyType<T> };
}

export interface SetValue {
	value: Value | [Value, DrillDepth];
}

export interface SetValueMark extends SetValue {
	type: "SetValue";
}

/**
 * Using offsets instead of indices to reduce the amount of updating needed.
 */
export type TraitMarks<T extends TypeSet = LocalTypes> = (Offset | Mark<T>)[];
export type PeerTraitMarks = TraitMarks<PeerTypes>;
export type Race<T extends TypeSet = LocalTypes> = TraitMarks<T>[];
export type PeerRace = Race<PeerTypes>;
export type ModsMark<T extends TypeSet = LocalTypes> =
	| SetValueMarkType<T>
	| ModifyType<T>;
export type AttachMark<T extends TypeSet = LocalTypes> =
	| InsertType<T>
	| MoveInType<T>;
export type DetachMark<T extends TypeSet = LocalTypes> =
	| MoveOutType<T>
	| DeleteType<T>;
export type SegmentMark<T extends TypeSet = LocalTypes> =
	| AttachMark<T>
	| DetachMark<T>;
export type ObjMark<T extends TypeSet = LocalTypes> =
	| ModsMark<T>
	| SegmentMark<T>
	| SliceBoundType<T>;
export type PeerObjMark = ObjMark<PeerTypes>;
export type Mark<T extends TypeSet = LocalTypes> = ObjMark<T> | Race<T>;
export type PeerMark = Mark<PeerTypes>;

export type Mods<T extends TypeSet = LocalTypes> =
	| ModifyType<T>
	| SetValueMarkType<T>
	| (Offset | ModifyType<T> | SetValueMarkType<T>)[];

export interface HasMods<T extends TypeSet = LocalTypes> {
	/**
	 * Always interpreted after `MoveIn.seq` and before `MoveOut.seq`.
	 * The offset approach keeps numbers smaller and lets us split and join segments without updating the numbers.
	 * Option 1:
	 */
	mods?: Mods<T>;
	/**
	 * Option 2:
	 * The index approach lets us binary search faster within a long segment.
	 */
	mods2?: [Index, ModifyType<T> | SetValueMarkType<T>][];
	/**
	 * Option 3:
	 * The index approach lets us lookup faster within a long segment.
	 */
	mods3?: { [key: number]: ModifyType<T> | SetValueMarkType<T> };
}

export interface Segment<T extends TypeSet = LocalTypes> extends HasMods<T> {
	/**
	 * 1 when omitted.
	 */
	length?: number;
	/**
	 * An ID that uniquely identifies the operation within the transaction/seq#.
	 * Omit if 0.
	 */
	id?: ChangeId;
}

export interface Attach<T extends TypeSet = LocalTypes> extends Segment<T> {
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
	 * Omit if not in peer change.
	 * Omit if performed with a parent-based place anchor.
	 * Omit if SimpleMovementRules.NeverMove.
	 */
	moveRules?: MovementRules;
	/**
	 * Omit if no drill-down.
	 */
	drill?: DrillDepth;
	/**
	 * Omit if the attached range is not subsequently detached.
	 */
	detach?: PostAttachDetach<T>;
}

export type PostAttachDetach<T extends TypeSet = LocalTypes> = (DeleteType<T> | MoveOutType<T>) & {
	length?: undefined;
	mods?: undefined;
	mods2?: undefined;
	mods3?: undefined;
};

export interface Insert<T extends TypeSet = LocalTypes> extends Attach<T> {
	type: "Insert";
	content: ProtoNodeType<T>[];
}

export interface MoveIn<T extends TypeSet = LocalTypes> extends Attach<T> {
	type: "MoveIn";
	/**
	 * The original location of the first moved node as per the edits known to the clients at the time.
	 * Note that there could be multiple MoveOut segments there. Use `srcId` to differentiate.
	 */
	srcPath: TreePath;
	/**
	 * In case the source is less segmented than the MoveIn, start at this offset in the source.
	 * This avoids having the split the source segment whenever we split the MoveIn segment.
	 */
	srcOffset?: number;
}

/**
 * Used for Delete and MoveOut of set-like ranges and atomic ranges.
 */
export interface Detach<T extends TypeSet = LocalTypes> extends Segment<T> {}

/**
 * Used for set-like ranges and atomic ranges.
 */
export interface Delete<T extends TypeSet = LocalTypes> extends Detach<T> {
	type: "Delete";
}

/**
 * Used for set-like ranges and atomic ranges.
 */
export interface MoveOut<T extends TypeSet = LocalTypes> extends Detach<T>, HasDst {
	type: "MoveOut";
}

export interface HasDst {
	/**
	 * The target location of the first moved node as per the edits known to the clients at the time.
	 * Note that there could be multiple MoveIn segments there. Use `dstId` to differentiate.
	 */
	dstPath: TreePath;
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
export interface SliceStart {
	/**
	 * An ID that uniquely identifies the detach operation within the transaction/seq#.
	 * The matching SliceEnd (and MoveIn segment in the case of a move) will bear the same ID.
	 * Omit if 0.
	 */
	id?: ChangeId;
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

export interface MoveOutStart extends SliceStart, HasDst {
	type: "MoveOutStart";
}
export interface DeleteStart extends SliceStart {
	type: "DeleteStart";
}

export interface SliceEnd {
	type: "End";
	/**
	 * An ID that uniquely identifies the detach operation within the transaction/seq#.
	 * The matching SliceStart (and MoveIn segment in the case of a move) will bear the same ID.
	 * Omit if 0.
	 */
	id?: ChangeId;
	/**
	 * Omit if `Sibling.Prev` for terseness.
	 */
	side?: Sibling.Next;
}

export type SliceBound = MoveOutStart | DeleteStart | SliceEnd;

export type PeerSliceStart = SliceStart & HasSeqValue;
export type PeerMoveOutStart = MoveOutStart & HasSeqValue;
export type PeerDeleteStart = DeleteStart & HasSeqValue;
export type PeerSliceEnd = SliceEnd & HasSeqValue;
export type PeerSliceBound = PeerMoveOutStart | PeerDeleteStart | PeerSliceEnd;

export interface HasSeqValue {
	seq: SeqNumber;
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

/**
 * The contents of a node to be created
 */
 export interface ProtoNode<T extends TypeSet = LocalTypes> {
	id: string;
	type?: string;
	value?: Value;
	traits?: ProtoTraits<T>;
}

/**
 * The traits of a node to be created
 */
export interface ProtoTraits<T extends TypeSet = LocalTypes> {
	[key: string]: ProtoTrait<T>;
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
export type ProtoTrait<T extends TypeSet = LocalTypes> = (ProtoNodeType<T> | Mark<T>)[];

export type Offset = number;
export type Index = number;
export type SeqNumber = number;
export type ChangeId = number;
export type Value = number | string | boolean;
export type NodeId = string;
export type TraitLabel = string;
export enum Tiebreak { LastToFirst, FirstToLast }
export type MovementRules = SimpleMovementRules | CustomMovementRules;
export enum SimpleMovementRules { NeverMove, CommutativeMove, AlwaysMove }
export interface CustomMovementRules {
	/**
	 * Omit if Any.
	 */
	traitLabel?: TraitLabels;
	/**
	 * Omit if Any.
	 */
	traitParent?: TraitParents;
	/**
	 * Omit if Any.
	 */
	siblingStatus?: NodeStatuses;
	/**
	 * Omit if Any.
	 */
	granularity?: MoveGranularity;
	/**
	 * Omit if true.
	 */
	commutative?: false;
}
export enum TraitLabels { Initial, Any }
export enum TraitParents { Initial, Any }
export enum NodeStatuses { Alive, Deleted, Any }
export enum MoveGranularity { IntraEdit, InterEdit, Any }
