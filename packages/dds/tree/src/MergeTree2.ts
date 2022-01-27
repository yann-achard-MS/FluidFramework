/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-empty-interface */
/* eslint-disable @typescript-eslint/no-dynamic-delete */

export const type = Symbol();
export const setValue = Symbol();

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
	[type]: "ConstrainedTraitSet";
	[key: string]: ConstraintSequence;
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
	[type]: "ConstrainedRange";
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

interface LocalTypes {
	Modify: Modify;
	SetValue: SetValue;
	SetValueMark: SetValueMark;
	Insert: Insert;
	Delete: Delete;
	MoveIn: MoveIn;
	MoveOut: MoveOut;
	ProtoNode: ProtoNode;
	SliceBound: SliceBound;
}

type PeerSetValue = SetValue & HasSeqValue;
type PeerSetValueMark = SetValueMark & HasSeqValue;
type PeerModify = Modify<PeerTypes>;
type PeerInsert = Insert<PeerTypes> & HasSeqValue;
type PeerDelete = Delete<PeerTypes> & HasSeqValue;
type PeerMoveIn = MoveIn<PeerTypes> & HasSeqValue;
type PeerMoveOut = MoveOut<PeerTypes> & HasSeqValue;
type PeerProtoNode = ProtoNode<PeerTypes>;

interface PeerTypes {
	Modify: PeerModify;
	SetValue: PeerSetValue;
	SetValueMark: PeerSetValueMark;
	Insert: PeerInsert;
	Delete: PeerDelete;
	MoveIn: PeerMoveIn;
	MoveOut: PeerMoveOut;
	ProtoNode: PeerProtoNode;
	SliceBound: PeerSliceBound;
}
type TypeSet = LocalTypes | PeerTypes;

type ModifyType<T extends TypeSet> = T["Modify"];
type SetValueType<T extends TypeSet> = T["SetValue"];
type SetValueMarkType<T extends TypeSet> = T["SetValueMark"];
type InsertType<T extends TypeSet> = T["Insert"];
type DeleteType<T extends TypeSet> = T["Delete"];
type MoveInType<T extends TypeSet> = T["MoveIn"];
type MoveOutType<T extends TypeSet> = T["MoveOut"];
type ProtoNodeType<T extends TypeSet> = T["ProtoNode"];
type SliceBoundType<T extends TypeSet> = T["SliceBound"];

export type ChangeFrame<T extends TypeSet = LocalTypes> = ModifyType<T> | TraitMarks<T>;
export type PeerChangeFrame = ChangeFrame<PeerTypes>;

export interface Modify<T extends TypeSet = LocalTypes> {
	[type]: "Modify";
	[setValue]?: SetValueType<T>;
	[key: string]: TraitMarks<T> | ModifyType<T>;
}

export interface SetValue {
	value: Value | [Value, DrillDepth];
}

export interface SetValueMark extends SetValue {
	[type]: "SetValue";
}

/**
 * Using offsets instead of indices to reduce the amount of updating needed.
 */
export type TraitMarks<T extends TypeSet = LocalTypes> = (Offset | Mark<T>)[];
export type PeerTraitMarks = TraitMarks<PeerTypes>;
export type Race<T extends TypeSet = LocalTypes> = TraitMarks<T>[];
export type PeerRace = Race<PeerTypes>;
export type Mark<T extends TypeSet = LocalTypes> =
	| SetValueMarkType<T>
	| ModifyType<T>
	| InsertType<T>
	| DeleteType<T>
	| MoveInType<T>
	| MoveOutType<T>
	| SliceBoundType<T>
	| Race<T>;
export type PeerMark = Mark<PeerTypes>;

export interface HasMods<T extends TypeSet = LocalTypes> {
	/**
	 * Always interpreted after `MoveIn.seq` and before `MoveOut.seq`.
	 * The offset approach keeps numbers smaller and lets us split and join segments without updating the numbers.
	 * Option 1:
	 */
	mods?: ModifyType<T> | SetValueMarkType<T> | (Offset | ModifyType<T> | SetValueMarkType<T>)[];
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
	detach?: DeleteType<T> | MoveOutType<T>;
}

export interface Insert<T extends TypeSet = LocalTypes> extends Attach<T> {
	[type]: "Insert";
	content: ProtoNodeType<T>[];
}

export interface MoveIn<T extends TypeSet = LocalTypes> extends Attach<T> {
	[type]: "MoveIn";
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
	[type]: "Delete";
}

/**
 * Used for set-like ranges and atomic ranges.
 */
export interface MoveOut<T extends TypeSet = LocalTypes> extends Detach<T>, HasDst {
	[type]: "MoveOut";
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
	[type]: "MoveOutStart";
}
export interface DeleteStart extends SliceStart {
	[type]: "DeleteStart";
}

export interface SliceEnd {
	[type]: "End";
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

// ---- EXAMPLES ---

export namespace ScenarioA {
	/**
	Scenario A
	In a trait foo that contains the nodes [A B C D], three users concurrently attempt the following operations (ordered
	here from first sequenced to last sequenced):
	  User 1: delete B C
	  User 2: move slice-like range B C D to some other trait bar
	  User 3: insert X after B

	Depending on the movement rules specified for the insertion of X, it's possible that X should end up in trait bar
	as the outcome of rebasing user 3's edit on the prior two. In order for that to be possible, we need to preserve
	the	fact that the move operation performed by user 2 was targeted not only at node D but also at nodes B and C. We
	also need to preserve the fact that the insertion of X was made with respect to B. This is challenging because the
	third edit will be rebased over the deletion of B C. This last point also holds for insertions of detached content
	(i.e., `MoveIn`)

	Takeaways:
	We need to preserve the layering of moves over deletions.
	We need to know which move operations apply to which nodes, even when they are deleted.
	We need to know which node a given insertion or move-in was relative to.
	*/

	export const t_u1: ChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "Delete", length: 2 },
		],
	};

	export const t_u2: ChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "MoveOutStart", side: Sibling.Next, dstPath: "bar.0" },
			3, // Skip B C D
			{ [type]: "End" },
		],
		bar: [
			{ [type]: "MoveIn", srcPath: "foo.1", length: 3 },
		],
	};

	export const t_u3: ChangeFrame = {
		[type]: "Modify",
		foo: [
			2, // Skip A B
			{ [type]: "Insert", content: [{ id: "X" }], moveRules: SimpleMovementRules.CommutativeMove },
		],
	};

	export const w_u1u2: PeerChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "MoveOutStart", seq: 2, side: Sibling.Next, dstPath: "bar.0" },
			{ [type]: "Delete", seq: 1, length: 2 },
			1, // Skip D
			{ [type]: "End", seq: 2 },
		],
		bar: [
			{ [type]: "MoveIn", seq: 2, srcPath: "foo.1", length: 3 },
		],
	};

	export const w_all: PeerChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "MoveOutStart", seq: 2, side: Sibling.Next, dstPath: "bar.0" },
			{ [type]: "Delete", seq: 1, length: 2 },
			1, // Skip D
			{ [type]: "End", seq: 2 },
		],
		bar: [
			{ [type]: "MoveIn", seq: 2, srcPath: "foo.1", length: 1 }, // B
			{ [type]: "Insert", seq: 3, content: [{ id: "X" }] },
			{ [type]: "MoveIn", seq: 2, srcPath: "foo.1", length: 2, srcOffset: 1 }, // C D
		],
	};
}

export namespace ScenarioA2 {
	/**
	Scenario A2 (same as A but with the slice starting at C)
	In a trait foo that contains the nodes [A B C D], three users concurrently attempt the following operations (ordered
	here from first sequenced to last sequenced):
	  User 1: delete B C
	  User 2: move slice-like range C D to some other trait bar
	  User 3: insert X after C

	Depending on the movement rules specified for the insertion of X, it's possible that X should end up in trait bar
	as the outcome of rebasing user 3's edit on the prior two. In order for that to be possible, we need to preserve
	the	fact that the move operation performed by user 2 was targeted not only at node D but also at nodes B and C. We
	also need to preserve the fact that the insertion of X was made with respect to B. This is challenging because the
	third edit will be rebased over the deletion of B C. This last point also holds for insertions of detached content
	(i.e., `MoveIn`)

	Takeaways:
	We need to preserve the layering of moves over deletions.
	We need to know which move operations apply to which nodes, even when they are deleted.
	We need to know which node a given insertion or move-in was relative to.
	*/

	export const t_u1: ChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "Delete", length: 2 },
		],
	};

	export const t_u2: ChangeFrame = {
		[type]: "Modify",
		foo: [
			2, // Skip A B
			{ [type]: "MoveOutStart", side: Sibling.Next, dstPath: "bar.0" },
			2, // Skip C D
			{ [type]: "End" },
		],
		bar: [
			{ [type]: "MoveIn", srcPath: "foo.2", length: 2 },
		],
	};

	export const t_u3: ChangeFrame = {
		[type]: "Modify",
		foo: [
			3, // Skip A B C
			{ [type]: "Insert", content: [{ id: "X" }], moveRules: SimpleMovementRules.CommutativeMove },
		],
	};

	export const w_u1u2: PeerChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "Delete", seq: 1 },
			{ [type]: "MoveOutStart", seq: 2, side: Sibling.Next, dstPath: "bar.0" },
			{ [type]: "Delete", seq: 1 },
			1, // Skip D
			{ [type]: "End", seq: 2 },
		],
		bar: [
			{ [type]: "MoveIn", seq: 2, srcPath: "foo.2", length: 3 },
		],
	};

	export const w_all: PeerChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "Delete", seq: 1 },
			{ [type]: "MoveOutStart", seq: 2, side: Sibling.Next, dstPath: "bar.0" },
			{ [type]: "Delete", seq: 1 },
			1, // Skip D
			{ [type]: "End", seq: 2 },
		],
		bar: [
			{ [type]: "MoveIn", seq: 2, srcPath: "foo.1" }, // C
			{ [type]: "Insert", seq: 3, content: [{ id: "X" }] },
			{ [type]: "MoveIn", seq: 2, srcPath: "foo.1", srcOffset: 1 }, // D
		],
	};

	export const w_u2u3: PeerChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "MoveOutStart", seq: 2, side: Sibling.Next, dstPath: "bar.0" },
			1, // Skip D
			{ [type]: "End", seq: 2 },
		],
		bar: [
			{ [type]: "MoveIn", seq: 2, srcPath: "foo.1" }, // C
			{ [type]: "Insert", seq: 3, content: [{ id: "X" }] },
			{ [type]: "MoveIn", seq: 2, srcPath: "foo.1", srcOffset: 1 }, // D
		],
	};

	export const w_u3: PeerChangeFrame = {
		[type]: "Modify",
		bar: [
			1, // C
			{ [type]: "Insert", seq: 3, content: [{ id: "X" }] },
		],
	};
}

export namespace ScenarioB {
	/*
	Scenario B
	In a trait P.foo that contains the node [A], two users concurrently attempt the following operations (ordered here
	from first sequenced to last sequenced):
	  User 1:
	    move set-like range [A] to some other trait P.bar
	    move set-like range [A] to some other trait Q.baz
	  User 2:
	    insert X after A (same parent)
	    insert Y after A (always move)

	X should end up in trait bar.
	For that to be possible, we need to preserve the fact that A was moved to trait bar at all.

	Y to end up in trait baz.
	For that to be possible, we need to preserve the fact that A was moved to trait baz after being moved to trait bar.

	Takeaways:
	We need to preserve the layering of moves over moves.
	We can't squash sequences of moves into a single move.
	We need to preserve the relative ordering of moves.
	*/

	export const t_u1: ChangeFrame = {
		[type]: "Modify",
		trait: [
			{ // Modify P
			[type]: "Modify",
			foo: [
					{ [type]: "MoveOut", dstPath: "^bar.0" },
				],
				bar: [
					{
						[type]: "MoveIn",
						srcPath: "^foo.0",
						detach: {
							[type]: "MoveOut",
							id: 1,
							dstPath: "_.1.baz.0",
						},
					},
				],
			},
			{ // Modify Q
				[type]: "Modify",
				baz: [
					{
						[type]: "MoveIn",
						id: 1,
						srcPath: "^bar.0",
					},
				],
			},
		],
	};

	export const t_u2: ChangeFrame = {
		[type]: "Modify",
		trait: [
			{ // Modify P
				[type]: "Modify",
				foo: [
					1, // Skip A
					[ // Race for "After A"
						[{
							[type]: "Insert",
							content: [{ id: "Y" }],
							id: 1,
							moveRules: SimpleMovementRules.AlwaysMove,
						}],
						[{
							[type]: "Insert",
							content: [{ id: "X" }],
							moveRules: { traitParent: TraitParents.Initial },
						}],
					],
				],
			},
		],
	};

	export const w_u1: PeerChangeFrame = {
		[type]: "Modify",
		trait: [
			{ // Modify P
				[type]: "Modify",
				foo: [
					{ [type]: "MoveOut", seq: 1, dstPath: "^bar.0" },
				],
				bar: [
					{
						[type]: "MoveIn",
						seq: 1,
						srcPath: "^foo.0",
						detach: {
							[type]: "MoveOut",
							seq: 1,
							id: 1,
							dstPath: "_.1.baz.0",
						},
					},
				],
			},
			{ // Modify Q
				[type]: "Modify",
				baz: [
							{
						[type]: "MoveIn",
						seq: 1,
						id: 1,
						srcPath: "^bar.0",
					},
				],
			},
		],
	};

	export const w_all: PeerChangeFrame = {
		[type]: "Modify",
		trait: [
			{ // Modify P
				[type]: "Modify",
				foo: [
					{ [type]: "MoveOut", seq: 1, dstPath: "^bar.0" },
				],
				bar: [
					{
						[type]: "MoveIn",
						seq: 1,
						srcPath: "^foo.0",
						detach: {
							[type]: "MoveOut",
							seq: 1,
							id: 1,
							dstPath: "_.1.baz.0",
						},
					},
					{ [type]: "Insert", seq: 2, id: 1, content: [{ id: "Y" }] },
				],
			},
			{ // Modify Q
				[type]: "Modify",
				baz: [
					{
						[type]: "MoveIn",
						seq: 1,
						id: 1,
						srcPath: "^bar.0",
					},
					{ [type]: "Insert", seq: 2, id: 1, content: [{ id: "Y" }] },
				],
			},
		],
	};
}

export namespace ScenarioC {
	/*
	Scenario C
	  User 1: insert B after A
	  User 1: move B to some other trait bar
	  User 2: insert X after B (never move) <- done with knowledge of edit #1

	X should be inserted to into the foo trait (as opposed to following B into the bar trait).

	Takeaways:
	We need to preserve the layering of moves over insertions.
	It is not sufficient to represent insertions of content that is subsequently moved as insertions in their final
	location.
	Note: this scenario motivates this being is true across commits but not within commits.
	*/

	export const t_u1_1: ChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "Insert", content: [{ id: "B" }] },
		],
	};

	export const t_u1_2: ChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "MoveOut", dstPath: "bar.0" },
		],
		bar: [
			{ [type]: "MoveIn", srcPath: "foo.1" },
		],
	};

	export const t_u2: ChangeFrame = {
		[type]: "Modify",
		foo: [
			2, // Skip A B
			{ [type]: "Insert", content: [{ id: "X" }], moveRules: SimpleMovementRules.NeverMove },
		],
	};

	export const w_u1: PeerChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{
				[type]: "Insert",
				seq: 1,
				content: [{ id: "B" }],
				detach: { [type]: "MoveOut", seq: 2, dstPath: "bar.0" },
			},
			{ [type]: "Insert", seq: 3, content: [{ id: "X" }] },
		],
		bar: [
			{ [type]: "MoveIn", seq: 2, srcPath: "foo.1" },
		],
	};

	export const w_all: PeerChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{
				[type]: "Insert",
				seq: 1,
				content: [{ id: "B" }],
				detach: { [type]: "MoveOut", seq: 2, dstPath: "bar.0" },
			},
		],
		bar: [
			{ [type]: "MoveIn", seq: 2, srcPath: "foo.1" },
		],
	};
}

export namespace ScenarioD {
	/*
	Scenario D
	In trait foo [A B C]:
	  User 1: move B to some other trait bar
	  User 2:
	    insert X after B (with always-move semantics)
	    move slice-like range [A B X C] to some other trait baz

	X should be inserted to into the bar trait (as opposed to ending up in the baz trait).

	Takeaways:
	We need to preserve the layering of moves over insertions.
	It is not sufficient to represent insertions of content that is subsequently moved as insertions in
	their final location.
	Note: this scenario motivates this being is true within commits but not across commits.
	*/

	export const t_u1: ChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "MoveOut", dstPath: "bar.0" },
		],
		bar: [
			{ [type]: "MoveIn", srcPath: "foo.1" },
		],
	};

	export const t_u2: ChangeFrame = {
		[type]: "Modify",
		foo: [
			{ [type]: "MoveOutStart", id: 1, dstPath: "baz" },
			2, // Skip A B
			{ [type]: "Insert", content: [{ id: "X" }], moveRules: SimpleMovementRules.AlwaysMove },
			1, // Skip C
			{ [type]: "End", id: 1 },
		],
		baz: [
			{ [type]: "MoveIn", id: 1, length: 4, srcPath: "foo.0" },
		],
	};

	export const w_u1: PeerChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "MoveOut", seq: 1, dstPath: "bar.0" },
		],
		bar: [
			{ [type]: "MoveIn", seq: 1, srcPath: "foo.1" },
		],
	};

	export const w_all: PeerChangeFrame = {
		[type]: "Modify",
		foo: [
			{ [type]: "MoveOutStart", seq: 2, id: 1, dstPath: "baz" },
			1, // Skip A
			{ [type]: "MoveOut", seq: 1, dstPath: "bar.0" },
			1, // Skip C
			{ [type]: "End", seq: 2, id: 1 },
		],
		bar: [
			{ [type]: "MoveIn", seq: 1, srcPath: "foo.1" },
			{ [type]: "Insert", seq: 2, content: [{ id: "X" }] },
		],
		baz: [
			{ [type]: "MoveIn", seq: 2, id: 1, length: 3, srcPath: "foo.0" }, // length needed updating 4->3
		],
	};
}

export namespace ScenarioE {
	/*
	In trait foo [A B C]:
	  User 1: move B to some other trait bar
	  User 2 in one commit:
	    insert X after B (with always-move semantics)
	    delete slice-like range [A B X C]

	B should be inserted to into the bar trait (as opposed to ending up deleted).

	Takeaways:
	We need to preserve the layering of deletions over moves.
	It is not sufficient to represent deletions of content that was previously moved as deletions in
	their original location.
	*/

	export const t_u1: ChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "MoveOut", dstPath: "bar.0" },
		],
		bar: [
			{ [type]: "MoveIn", srcPath: "foo.1" },
		],
	};

	export const t_u2: ChangeFrame = {
		[type]: "Modify",
		foo: [
			{ [type]: "DeleteStart", id: 1 },
			2, // Skip A B
			{ [type]: "Insert", content: [{ id: "X" }] },
			1, // Skip C
			{ [type]: "End", id: 1 },
		],
	};

	export const w_u1: PeerChangeFrame = {
		[type]: "Modify",
		foo: [
			1, // Skip A
			{ [type]: "MoveOut", seq: 1, dstPath: "bar.0" },
		],
		bar: [
			{ [type]: "MoveIn", seq: 1, srcPath: "foo.1" },
		],
	};

	export const w_all: PeerChangeFrame = {
		[type]: "Modify",
		foo: [
			{ [type]: "DeleteStart", seq: 2, id: 1 },
			1, // Skip A
			{ [type]: "MoveOut", seq: 1, dstPath: "bar.0" },
			1, // Skip C
			{ [type]: "End", seq: 2, id: 1 },
		],
		bar: [
			{ [type]: "MoveIn", seq: 1, srcPath: "foo.1" },
			{ [type]: "Insert", seq: 2, content: [{ id: "X" }] },
		],
	};
}

export namespace Swaps {
	// Swap the first nodes of traits foo and bar using set-like ranges
	export const e1: ChangeFrame = {
		[type]: "Modify",
		foo: [
			{ [type]: "MoveOut", dstPath: "bar.0" },
			{ [type]: "MoveIn", id: 1, srcPath: "bar.0" },
		],
		bar: [
			{ [type]: "MoveIn", srcPath: "foo.0" },
			{ [type]: "MoveOut", id:1, dstPath: "foo.0" },
		],
	};

	// Swap the first nodes of traits foo and bar and back again using set-like ranges
	export const e2: ChangeFrame = {
		[type]: "Modify",
		foo: [
			{ [type]: "MoveOut", dstPath: "bar.0" },
			{
				[type]: "MoveIn",
				id: 1,
				srcPath: "bar.0",
				detach: {
					[type]: "MoveOut",
					id: 2,
					dstPath: "bar.0",
				},
			},
			{ [type]: "MoveIn", id: 3, srcPath: "bar.0" },
		],
		bar: [
			{
				[type]: "MoveIn",
				srcPath: "foo.0",
				detach: {
					[type]: "MoveOut",
					id: 3,
					dstPath: "foo.0",
				},
			},
			{ [type]: "MoveOut", id:1, dstPath: "foo.0" },
			{ [type]: "MoveIn", id: 2, srcPath: "foo.0" },
		],
	};

	// Swap parent/child:
	// From: A{ foo: B{ bar: C{ baz: D } } }
	// To:   A{ foo: C{ bar: B{ baz: D } } }
	export const e3: ChangeFrame = {
		[type]: "Modify",
		foo: [
			{
				[type]: "MoveOut", // B,
				id: 2,
				dstPath: "foo.0.bar.0",
				mods: { // Modify B
					[type]: "Modify",
					bar: [
						{
							[type]: "MoveOut", // C
							id: 1,
							dstPath: "foo.0",
							mods: { // Modify C
								[type]: "Modify",
								baz: [
									{
										[type]: "MoveOut", // D
										dstPath: "foo.0.bar.0.baz.0", // Omit path if the same as the current path?
									},
								],
							},
						},
					],
				},
			},
			{
				[type]: "MoveIn", // C
				id: 1,
				srcPath: "foo.0.bar.0",
				mods: { // Modify C
					[type]: "Modify",
					bar: [
						{
							[type]: "MoveIn", // B
							id: 2,
							srcPath: "foo.0",
							mods: { // Modify B
								[type]: "Modify",
								baz: [
									{
										[type]: "MoveIn", // D
										srcPath: "foo.0.bar.0.baz.0", // Omit path if the same as the current path?
									},
								],
							},
						},
					],
				},
			},
		],
	};
}

export interface CollabWindow {
	transactionWindow: Transaction[];
	tree: Node;
	changes: PeerChangeFrame;
}

export interface Node {
	id: NodeId;
	type?: string;
	value?: Value;
	traits?: Traits;
}

export interface Traits {
	[key: string]: Node[];
}

export function extendWindow(transaction: Transaction, window: CollabWindow): boolean {
	window.transactionWindow.push(transaction);
	for (const frame of transaction.frames) {
		if (isConstraintFrame(frame)) {
			if (isConstraintFrameSatisfied(frame, window) === false) {
				return false;
			}
		} else {
			if (isChangeFrame(frame)) {
				appendChangeToWindow(window, frame);
			} else {
				throw(new Error("Transaction frame is neither a constraint nor a change"));
			}
		}
	}
	return true;
}

export function shrinkWindow(window: CollabWindow, knownSeq: SeqNumber): void {
	if (window.transactionWindow.length === 0 || window.transactionWindow[0].seq > knownSeq) {
		// Nothing to remove
		return;
	}
	if (Array.isArray(window.changes)) {
		shrinkMarks(window.changes, knownSeq);
	} else {
		shrinkModify(window.changes, knownSeq);
	}
	// Cull from the queue the transaction whose seq# is lower or equal to `knownSeq`
	const cullCount = window.transactionWindow.findIndex((t: Transaction) => t.seq > knownSeq);
	if (cullCount > 0) {
		window.transactionWindow.splice(0, cullCount);
	}
}

function shrinkMarks(marks: PeerTraitMarks, knownSeq: SeqNumber): boolean {
	let idx = 0;
	while (marks[idx] !== undefined) {
		const mark = marks[idx];
		if (typeof mark === "object") {
			// SetValue | Modify | Insert | Delete | MoveIn | MoveOut | SliceBound | Race;
			if (Array.isArray(mark)) {
				const raceLength = shrinkMarksRace(mark, knownSeq);
				if (raceLength !== null) {
					heal(marks, idx, raceLength);
				}
			} else if (isModify(mark)) {
				if (shrinkModify(mark, knownSeq)) {
					heal(marks, idx);
				}
			} else if (isSetValue(mark)) {
				if (mark.seq <= knownSeq) {
					heal(marks, idx);
				}
			} else if (isBound(mark) && mark.seq <= knownSeq) {
				delete marks[idx];
			} else if (isSegment(mark)) {
				if (mark.seq <= knownSeq && isDetachSegment(mark)) {
					// It should be safe to delete a detach segment along with its nested mods because all those should
					// have occurred prior to the detach.
					delete marks[idx];
				}
				// In all other cases we need to shrink and preserve nested mods.
				if (mark.mods !== undefined) {
					if (Array.isArray(mark.mods)) {
						if (shrinkMarks(mark.mods, knownSeq)) {
							delete mark.mods;
						}
					} else if (isModify(mark.mods)) {
						if (shrinkModify(mark.mods, knownSeq)) {
							delete mark.mods;
						}
					} else {
						if (mark.mods.seq <= knownSeq) {
							delete mark.mods;
						}
					}
				}
				// The only thing left to do is replace the attach by its nested mods if has fallen out of the collab
				// window.
				if (mark.seq <= knownSeq) {
					if (mark.mods === undefined) {
						heal(marks, idx, mark.length);
					} else if (Array.isArray(mark.mods)) {
						if (isOffset(mark.mods[0]) && idx > 0 && isOffset(marks[idx - 1])) {
							(marks[idx - 1] as Offset) += mark.mods[0];
							delete mark.mods[0];
						}
						marks.splice(idx, 0, ...mark.mods);
					} else {
						// Promote the single Modify or SetValue
						marks.splice(idx, 1, mark.mods);
					}
				}
			} else {
				throw(new Error(`Unrecognized mark: ${mark}`));
			}
		}
		++idx;
	}
	return marks.length === 0 || (marks.length === 1 && isOffset(marks[0]));
}

function shrinkMarksRace(markLanes: PeerTraitMarks[], knownSeq: SeqNumber): number | null {
	let ancillary = true;
	for (const lane of markLanes) {
		ancillary ||= shrinkMarks(lane, knownSeq);
	}
	if (ancillary) {
		let offset = 0;
		for (const lane of markLanes) {
			offset += (lane[0] as Offset | undefined) ?? 0;
		}
		return offset;
	}
	return null;
}

function heal(marks: TraitMarks, index: number, length: number = 1): void {
	if (length === 0) {
		delete marks[index];
	} else {
		if (index > 0 && isOffset(marks[index - 1])) {
			(marks[index - 1] as Offset) += length;
		} else if (isOffset(marks[index + 1])) {
			(marks[index + 1] as Offset) += length;
		} else {
			// Replace the segment with an Offset of `length`
			marks.splice(index, 1, length);
		}
	}
}

export function isSetValue<T extends TypeSet>(mark: Mark<T>): mark is SetValueMarkType<T> {
	return mark[type] === "SetValue";
}
export function isModify<T extends TypeSet>(mark: Mark<T>): mark is ModifyType<T> { return mark[type] === "Modify"; }
export function isInsert<T extends TypeSet>(mark: Mark<T>): mark is InsertType<T> { return mark[type] === "Insert"; }
export function isDelete<T extends TypeSet>(mark: Mark<T>): mark is DeleteType<T> { return mark[type] === "Delete"; }
export function isMoveIn<T extends TypeSet>(mark: Mark<T>): mark is MoveInType<T> { return mark[type] === "MoveIn"; }
export function isMoveOut<T extends TypeSet>(mark: Mark<T>): mark is MoveOutType<T> { return mark[type] === "MoveOut"; }
export function isMoveOutStart<T extends TypeSet>(mark: Mark<T>): mark is MoveOutStart | PeerMoveOutStart {
	return mark[type] === "MoveOutStart";
}
export function isDeleteStart<T extends TypeSet>(mark: Mark<T>): mark is DeleteStart | PeerDeleteStart {
	return mark[type] === "DeleteStart";
}
export function isEnd<T extends TypeSet>(mark: Mark<T>): mark is SliceEnd | PeerSliceEnd {
	return mark[type] === "End";
}
export function isBound<T extends TypeSet>(mark: Mark<T>): mark is SliceBound | PeerSliceBound {
	const markType = mark[type];
	return markType === "MoveOutStart"
		|| markType === "DeleteStart"
		|| markType === "End"
	;
}
export function isOffset<T extends TypeSet>(mark: Mark<T> | Offset | undefined): mark is Offset {
	return typeof mark === "number";
}
export function isSegment<T extends TypeSet>(mark: Mark<T> | Offset):
	mark is InsertType<T> | DeleteType<T> | MoveInType<T> | MoveOutType<T> {
	const markType = mark[type];
	return markType === "Insert"
		|| markType === "Delete"
		|| markType === "MoveIn"
		|| markType === "MoveOut"
	;
 }
export function isDetachSegment<T extends TypeSet>(mark: Mark<T> | Offset): mark is DeleteType<T> | MoveOutType<T> {
	const markType = mark[type];
	return markType === "Delete"
		|| markType === "MoveOut"
	;
 }

function shrinkModify(modify: PeerModify, knownSeq: SeqNumber): boolean {
	const setValueSeq = modify[setValue]?.seq;
	if (setValueSeq !== undefined && setValueSeq <= knownSeq) {
		delete modify[setValue];
	}
	for (const [label, marksOrModify] of Object.entries(modify)) {
		// NOTE: we don't need to filter out [type] and [setValue] keys but that might change
		if (Array.isArray(marksOrModify)) {
			shrinkMarks(marksOrModify, knownSeq);
			if (marksOrModify.length === 0) {
				delete modify[label];
			}
		} else {
			if (shrinkModify(marksOrModify, knownSeq)) {
				delete modify[label];
			}
		}
	}
	return Object.entries(modify).length === 0 && modify[setValue] === undefined;
}

export function windowFromTree(tree: Node): CollabWindow {
	return {
		transactionWindow: [],
		tree,
		changes: [],
	};
}

function appendChangeToWindow(window: CollabWindow, frame: Modify | TraitMarks): void {
	throw new Error("Function not implemented.");
}

function isConstraintFrame(frame: ChangeFrame | ConstraintFrame): frame is ConstraintFrame {
	const innerObj = Array.isArray(frame) ? frame[0] : frame;
	if (innerObj === undefined) {
		// Empty change frame
		return false;
	}
	return innerObj[type] === "ConstrainedRange" || innerObj[type] === "ConstrainedTraitSet";
}

function isChangeFrame(frame: ChangeFrame | ConstraintFrame): frame is ChangeFrame {
	const innerObj = Array.isArray(frame) ? frame[0] : frame;
	if (innerObj === undefined) {
		// Empty change frame
		return true;
	}
	if (typeof innerObj === "number") {
		// The innerObj is an Offset mark
		return true;
	}
	if (Array.isArray(innerObj)) {
		// The innerObj is a race mark
		return true;
	}
	const innerType = innerObj[type];
	return innerType === "Modify"
		|| innerType === "Insert"
		|| innerType === "Delete"
		|| innerType === "MoveIn"
		|| innerType === "MoveOut"
		|| innerType === "MoveOutStart"
		|| innerType === "DeleteStart"
		|| innerType === "SetValue"
	;
}

function isConstraintFrameSatisfied(frame: ConstraintFrame, window: CollabWindow): boolean {
	throw(new Error("isConstraintFrameSatisfied not implemented"));
}
