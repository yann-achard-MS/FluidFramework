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

type ChangeFrame = Modify | TraitMarks;

interface Modify {
	[value]?: Value | [Value, DrillDepth];
	[key: TraitLabel]: TraitMarks;
}

/**
 * Using offsets instead of indices to reduce the amount of updating needed.
 */
type TraitMarks = (Offset | Mark)[];

type Mark = Modify | Insert | Delete | MoveIn | MoveOut | SliceBound | SegmentRace;
type RelativeMark = Insert | MoveIn | SliceBound | SegmentRace;

type SegmentRace = RelativeMark[];

interface Segment extends HasMods {
	/**
	 * 1 when omitted.
	 */
	length?: number;
	/**
	 * Omit if within peer transaction.
	 */
	seq?: SeqNumber;
	/**
	 * An ID that uniquely identifies the operation within the transaction/seq#.
	 * Omit if 0.
	 */
	id?: ChangeId;
}

interface HasMods {
	/**
	 * Always interpreted after `MoveIn.seq` and before `MoveOut.seq`.
	 * The offset approach keeps numbers smaller and lets us split and join segments without updating the numbers.
	 * Option 1:
	 */
	mods?: Modify | (Offset | Modify)[];
	/**
	 * Option 2:
	 * The index approach lets us binary search faster within a long segment.
	 */
	mods2?: [Index, Modify][];
	/**
	 * Option 3:
	 * The index approach lets us lookup faster within a long segment.
	 */
	mods3?: { [key: Index]: Modify };
}

interface Attach extends Segment {
	/**
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
	detach?: Delete | MoveOut;
}

interface Insert extends Attach {
	type?: 'Insert';
	content: ProtoNode[];
}

interface MoveIn extends Attach {
	type?: 'MoveIn';
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
interface Detach extends Segment {}

/**
 * Used for set-like ranges and atomic ranges.
 */
interface Delete extends Detach {
	type?: 'Delete';
}

/**
 * Used for set-like ranges and atomic ranges.
 */
interface MoveOut extends Detach, HasDst {
	type?: 'MoveOut';
}

interface HasDst {
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
interface SliceStart {
	type?: 'Start';
	/**
	 * An ID that uniquely identifies the detach operation within the transaction/seq#.
	 * The matching SliceEnd (and MoveIn segment in the case of a move) will bear the same ID.
	 * Omit if 0.
	 */
	id?: ChangeId;
	/**
	 * Omit if within peer transaction.
	 */
	seq?: SeqNumber;
	/**
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
	type?: 'End';
	/**
	 * Omit if within peer transaction.
	 */
	seq?: SeqNumber;
	/**
	 * An ID that uniquely identifies the detach operation within the transaction/seq#.
	 * The matching SliceStart (and MoveIn segment in the case of a move) will bear the same ID.
	 * Omit if 0.
	 */
	id?: ChangeId;
	/**
	 * Omit if 'Sibling.Prev' for terseness.
	 */
	side?: Sibling.Next;
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
enum TraitLabels { Initial, Any }
enum TraitParents { Initial, Any }
enum NodeStatuses { Alive, Deleted, Any }
enum MoveGranularity { IntraEdit, InterEdit, Any }

//---- EXAMPLES ---

namespace ScenarioA {
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

	const t_u1: ChangeFrame = {
		'foo': [
			1, // Skip A
			{ type: 'Delete', length: 2 }
		]
	};

	const t_u2: ChangeFrame = {
		'foo': [
			1, // Skip A
			{ type: 'Start', side: Sibling.Next, dstPath: 'bar.0' },
			3, // Skip B C D
			{ type: 'End' },
		],
		'bar': [
			{ type: 'MoveIn', srcPath: 'foo.1', length: 3 }
		]
	};

	const t_u3: ChangeFrame = {
		'foo': [
			2, // Skip A B
			{ type: 'Insert', content: [{ id: 'X' }], moveRules: SimpleMovementRules.CommutativeMove }
		]
	};

	const w_u1u2: ChangeFrame = {
		'foo': [
			1, // Skip A
			{ type: 'Start', seq: 2, side: Sibling.Next, dstPath: 'bar.0' },
			{ type: 'Delete', seq: 1, length: 2 },
			1, // Skip D
			{ type: 'End' },
		],
		'bar': [
			{ type: 'MoveIn', seq: 2, srcPath: 'foo.1', length: 3 }
		]
	};

	const w_all: ChangeFrame = {
		'foo': [
			1, // Skip A
			{ type: 'Start', seq: 2, side: Sibling.Next, dstPath: 'bar.0' },
			{ type: 'Delete', seq: 1, length: 2 },
			1, // Skip D
			{ type: 'End' },
		],
		'bar': [
			{ type: 'MoveIn', seq: 2, srcPath: 'foo.1', length: 1 }, // B
			{ type: 'Insert', seq: 3, content: [{ id: 'X' }] },
			{ type: 'MoveIn', seq: 2, srcPath: 'foo.1', length: 2, srcOffset: 1 }, // C D
		]
	};
}

namespace ScenarioA2 {
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

	const t_u1: ChangeFrame = {
		'foo': [
			1, // Skip A
			{ type: 'Delete', length: 2 }
		]
	};

	const t_u2: ChangeFrame = {
		'foo': [
			2, // Skip A B
			{ type: 'Start', side: Sibling.Next, dstPath: 'bar.0' },
			2, // Skip C D
			{ type: 'End' },
		],
		'bar': [
			{ type: 'MoveIn', srcPath: 'foo.1', length: 2 }
		]
	};

	const t_u3: ChangeFrame = {
		'foo': [
			3, // Skip A B C
			{ type: 'Insert', content: [{ id: 'X' }], moveRules: SimpleMovementRules.CommutativeMove }
		]
	};

	const w_u1u2: ChangeFrame = {
		'foo': [
			2, // Skip A
			{ type: 'Delete', seq: 1 },
			{ type: 'Start', seq: 2, side: Sibling.Next, dstPath: 'bar.0' },
			{ type: 'Delete', seq: 1 },
			1, // Skip D
			{ type: 'End' },
		],
		'bar': [
			{ type: 'MoveIn', seq: 2, srcPath: 'foo.1', length: 3 }
		]
	};

	const w_all: ChangeFrame = {
		'foo': [
			1, // Skip A
			{ type: 'Delete', seq: 1 },
			{ type: 'Start', seq: 2, side: Sibling.Next, dstPath: 'bar.0' },
			{ type: 'Delete', seq: 1 },
			1, // Skip D
			{ type: 'End' },
		],
		'bar': [
			{ type: 'MoveIn', seq: 2, srcPath: 'foo.1', length: 2 }, // B C
			{ type: 'Insert', seq: 3, content: [{ id: 'X' }] },
			{ type: 'MoveIn', seq: 2, srcPath: 'foo.1', srcOffset: 2 }, // D
		]
	};
}

namespace ScenarioB {
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

	const t_u1: ChangeFrame = {
		'_': [
			{ // Modify P
				'foo': [
					{ type: 'MoveOut', dstPath: '^bar.0' }
				],
				'bar': [
					{
						type: 'MoveIn',
						srcPath: '^foo.0',
						detach: {
							type: 'MoveOut',
							id: 1,
							dstPath: '_.1.baz.0',
						}
					}
				]
			},
			{ // Modify Q
				'baz': [
					{
						type: 'MoveIn',
						id: 1,
						srcPath: '^bar.0',
					}
				]
			},
		],
	};

	const t_u2: ChangeFrame = {
		'_': [
			{ // Modify P
				'foo': [
					1, // Skip A
					[ // Race for "After A"
						{ type: 'Insert', content: [{ id: 'Y' }], id: 1, moveRules: SimpleMovementRules.AlwaysMove },
						{ type: 'Insert', content: [{ id: 'X' }], moveRules: { traitParent: TraitParents.Initial } },
					]
				]
			}
		]
	};

	const w_u1: ChangeFrame = {
		'_': [
			{ // Modify P
				'foo': [
					{ type: 'MoveOut', seq: 1, dstPath: '^bar.0' }
				],
				'bar': [
					{
						type: 'MoveIn',
						seq: 1,
						srcPath: '^foo.0',
						detach: {
							type: 'MoveOut',
							seq: 1,
							id: 1,
							dstPath: '_.1.baz.0',
						}
					}
				]
			},
			{ // Modify Q
				'baz': [
					{
						type: 'MoveIn',
						seq: 1,
						id: 1,
						srcPath: '^bar.0',
					}
				]
			},
		],
	};

	const w_all: ChangeFrame = {
		'_': [
			{ // Modify P
				'foo': [
					{ type: 'MoveOut', seq: 1, dstPath: '^bar.0' }
				],
				'bar': [
					{
						type: 'MoveIn',
						seq: 1,
						srcPath: '^foo.0',
						detach: {
							type: 'MoveOut',
							seq: 1,
							id: 1,
							dstPath: '_.1.baz.0',
						}
					},
					{ type: 'Insert', seq: 2, id: 1, content: [{ id: 'Y' }] },
				]
			},
			{ // Modify Q
				'baz': [
					{
						type: 'MoveIn',
						seq: 1,
						id: 1,
						srcPath: '^bar.0',
					},
					{ type: 'Insert', seq: 2, id: 1, content: [{ id: 'Y' }] },
				]
			},
		],
	};
}

namespace ScenarioC {
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

	const t_u1_1: ChangeFrame = {
		'foo': [
			1, // Skip A
			{ type: 'Insert', content: [{ id: 'B' }] }
		]
	};

	const t_u1_2: ChangeFrame = {
		'foo': [
			1, // Skip A
			{ type: 'MoveOut', dstPath: 'bar.0' }
		],
		'bar:': [
			{ type: 'MoveIn', srcPath: 'foo.1' }
		]
	};

	const t_u2: ChangeFrame = {
		'foo': [
			2, // Skip A B
			{ type: 'Insert', content: [{ id: 'X' }], moveRules: SimpleMovementRules.NeverMove }
		]
	};

	const w_u1: ChangeFrame = {
		'foo': [
			1, // Skip A
			{
				type: 'Insert',
				seq: 1,
				content: [{ id: 'B' }],
				detach: { type: 'MoveOut', seq: 2, dstPath: 'bar.0' }
			},
			{ type: 'Insert', seq: 3, content: [{ id: 'X' }] }
		],
		'bar:': [
			{ type: 'MoveIn', seq: 2, srcPath: 'foo.1' }
		]
	}

	const w_all: ChangeFrame = {
		'foo': [
			1, // Skip A
			{
				type: 'Insert',
				seq: 1,
				content: [{ id: 'B' }],
				detach: { type: 'MoveOut', seq: 2, dstPath: 'bar.0' }
			}
			
		],
		'bar:': [
			{ type: 'MoveIn', seq: 2, srcPath: 'foo.1' }
		]
	}
}

namespace ScenarioD {
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
	It is not sufficient to represent insertions of content that is subsequently moved as insertions in their final location.
	Note: this scenario motivates this being is true within commits but not across commits.
	*/

	const t_u1: ChangeFrame = {
		'foo': [
			1, // Skip A
			{ type: 'MoveOut', dstPath: 'bar.0' }
		],
		'bar': [
			{ type: 'MoveIn', srcPath: 'foo.1' }
		],
	};

	const t_u2: ChangeFrame = {
		'foo': [
			{ type: 'Start', id: 1, dstPath: 'baz' },
			2, // Skip A B
			{ type: 'Insert', content: [{ id: 'X' }], moveRules: SimpleMovementRules.AlwaysMove },
			1, // Skip C
			{ type: 'End', id: 1 }
		],
		'baz': [
			{ type: 'MoveIn', id: 1, length: 4, srcPath: 'foo.0' }
		]
	};

	const w_u1: ChangeFrame = {
		'foo': [
			1, // Skip A
			{ type: 'MoveOut', seq: 1, dstPath: 'bar.0' }
		],
		'bar': [
			{ type: 'MoveIn', seq: 1, srcPath: 'foo.1' }
		],
	};

	const w_all: ChangeFrame = {
		'foo': [
			{ type: 'Start', seq: 2, id: 1, dstPath: 'baz' },
			1, // Skip A
			{ type: 'MoveOut', seq: 1, dstPath: 'bar.0' },
			1, // Skip C
			{ type: 'End', seq: 2, id: 1 }
		],
		'bar': [
			{ type: 'MoveIn', seq: 1, srcPath: 'foo.1' },
			{ type: 'Insert', seq: 2, content: [{ id: 'X' }] },
		],
		'baz': [
			{ type: 'MoveIn', seq: 2, id: 1, length: 3, srcPath: 'foo.0' } // length needed updating 4->3
		]
	};
}

namespace ScenarioE {
	/*
	In trait foo [A B C]:
	  User 1: move B to some other trait bar
	  User 2 in one commit:
	    insert X after B (with always-move semantics)
	    delete slice-like range [A B X C]

	B should be inserted to into the bar trait (as opposed to ending up deleted).

	Takeaways:
	We need to preserve the layering of deletions over moves.
	It is not sufficient to represent deletions of content that was previously moved as deletions in their original location.
	*/

	const t_u1: ChangeFrame = {
		'foo': [
			1, // Skip A
			{ type: 'MoveOut', dstPath: 'bar.0' }
		],
		'bar': [
			{ type: 'MoveIn', srcPath: 'foo.1' }
		]
	};

	const t_u2: ChangeFrame = {
		'foo': [
			{ type: 'Start', id: 1 },
			2, // Skip A B
			{ type: 'Insert', content: [{ id: 'X' }] },
			1, // Skip C
			{ type: 'End', id: 1 }
		]
	};

	const w_u1: ChangeFrame = {
		'foo': [
			1, // Skip A
			{ type: 'MoveOut', seq: 1, dstPath: 'bar.0' }
		],
		'bar': [
			{ type: 'MoveIn', seq: 1, srcPath: 'foo.1' }
		]
	};

	const w_all: ChangeFrame = {
		'foo': [
			{ type: 'Start', seq: 2, id: 1 },
			1, // Skip A
			{ type: 'MoveOut', seq: 1, dstPath: 'bar.0' },
			1, // Skip C
			{ type: 'End', seq: 2, id: 1 }
		],
		'bar': [
			{ type: 'MoveIn', seq: 1, srcPath: 'foo.1' },
			{ type: 'Insert', seq: 2, content: [{ id: 'X' }] },
		]
	};
}

namespace Swaps {
	// Swap the first nodes of traits foo and bar using set-like ranges
	const e1: ChangeFrame = {
		'foo': [
			{ type: 'MoveOut', dstPath: 'bar.0' },
			{ type: 'MoveIn', id: 1, srcPath: 'bar.0' }
		],
		'bar': [
			{ type: 'MoveIn', srcPath: 'foo.0' },
			{ type: 'MoveOut', id:1, dstPath: 'foo.0' }
		]
	};

	// Swap the first nodes of traits foo and bar and back again using set-like ranges
	const e2: ChangeFrame = {
		'foo': [
			{ type: 'MoveOut', dstPath: 'bar.0' },
			{
				type: 'MoveIn',
				id: 1,
				srcPath: 'bar.0',
				detach: {
					type: 'MoveOut',
					id: 2,
					dstPath: 'bar.0'
				}
			},
			{ type: 'MoveIn', id: 3, srcPath: 'bar.0' },
		],
		'bar': [
			{
				type: 'MoveIn',
				srcPath: 'foo.0',
				detach: {
					type: 'MoveOut',
					id: 3,
					dstPath: 'foo.0'
				}
			},
			{ type: 'MoveOut', id:1, dstPath: 'foo.0' },
			{ type: 'MoveIn', id: 2, srcPath: 'foo.0' },
		]
	};

	// Swap parent/child:
	// From: A{ foo: B{ bar: C{ baz: D } } }
	// To:   A{ foo: C{ bar: B{ baz: D } } }
	const e3: ChangeFrame = {
		'foo': [
			{
				type: 'MoveOut', // B,
				id: 2,
				dstPath: 'foo.0.bar.0',
				mods: { // Modify B
					'bar:': [
						{
							type: 'MoveOut', // C
							id: 1,
							dstPath: 'foo.0',
							mods: { // Modify C
								'baz': [
									{
										type: 'MoveOut', // D
										dstPath: 'foo.0.bar.0.baz.0' // Omit path if the same as the current path?
									},
								],
							}
						},
					],
				},
			},
			{
				type: 'MoveIn', // C
				id: 1,
				srcPath: 'foo.0.bar.0',
				mods: { // Modify C
					'bar': [
						{
							type: 'MoveIn', // B
							id: 2,
							srcPath: 'foo.0',
							mods: { // Modify B
								'baz': [
									{
										type: 'MoveIn', // D
										srcPath: 'foo.0.bar.0.baz.0', // Omit path if the same as the current path?
									},
								]
							},
						}
					]
				}
			}
		]
	};
}