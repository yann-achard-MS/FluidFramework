/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "assert";
import {
	ChangeFrame,
	ConstrainedRange,
	ConstraintFrame,
	Delete,
	MovementRules,
	Offset,
	PeerChangeFrame,
	RebasedChangeFrame,
	RebasedTransaction,
	Sibling,
	Transaction,
	TransactionFrame,
} from "../format";
import { clone, isChangeFrame, isConstraintFrame } from "../Utils";

export namespace ScenarioA1 {
	/**
	Scenario A
	In a trait foo that contains the nodes [A B C D], three users concurrently attempt the following operations (ordered
	here from first sequenced to last sequenced):
	  User 1: delete B C
	  User 2: move slice-like range B C D to some other trait bar
	  User 3: insert X after B (commutative)

	X should end up in trait bar. In order for that to be possible, we need to preserve
	the fact that the move operation performed by user 2 was targeted not only at node D but also at nodes B and C. We
	also need to preserve the fact that the insertion of X was made with respect to B. This is challenging because the
	third edit will be rebased over the deletion of B C. This last point also holds for insertions of detached content
	(i.e., `MoveIn`)

	Takeaways:
	We need to preserve the layering of moves over deletions.
	We need to know which move operations apply to which nodes, even when they are deleted.
	We need to know which node a given insertion or move-in was relative to.
	*/

	export const t_u1: ChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Delete", length: 2 },
			],
		},
	};

	export const t_u2: ChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "MoveOutStart", side: Sibling.Next, dstPath: "bar.0" },
				3, // Skip B C D
				{ type: "End" },
			],
			bar: [
				{ type: "MoveIn", srcPath: "foo.1", length: 3 },
			],
		},
	};

	export const t_u3: ChangeFrame = {
		modify: {
			foo: [
				2, // Skip A B
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.CommutativeMove },
			],
		},
	};

	export const t_u2_r_u1: RebasedChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "MoveOutStart", side: Sibling.Next, dstPath: "bar.0" },
				{ type: "Detach", seq: 1, length: 2 },
				1, // Skip D
				{ type: "End" },
			],
			bar: [
				{ type: "MoveIn", srcPath: "foo.1", length: 1 },
			],
		},
	};

	export const t_u3_r_u1: RebasedChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Detach", seq: 1 },
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.CommutativeMove },
			],
		},
	};

	export const t_u3_r_u1u2: RebasedChangeFrame = {
		modify: {
			bar: [
				{ type: "Attach", seq: 2 }, // D
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.CommutativeMove },
			],
		},
	};

	export const w_u1u2: PeerChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "MoveOutStart", seq: 2, side: Sibling.Next, dstPath: "bar.0" },
				{ type: "Delete", seq: 1, length: 2 },
				1, // Skip D
				{ type: "End", seq: 2 },
			],
			bar: [
				{ type: "MoveIn", seq: 2, srcPath: "foo.1", length: 3 },
			],
		},
	};

	export const w_all: PeerChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "MoveOutStart", seq: 2, side: Sibling.Next, dstPath: "bar.0" },
				{ type: "Delete", seq: 1, length: 2 },
				1, // Skip D
				{ type: "End", seq: 2 },
			],
			bar: [
				{ type: "MoveIn", seq: 2, srcPath: "foo.1", length: 1 }, // B
				{ type: "Insert", seq: 3, content: [{ id: "X" }] },
				{ type: "MoveIn", seq: 2, srcPath: "foo.1", length: 2, srcOffset: 1 }, // C D
			],
		},
	};

	export const w_u2u3: PeerChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "MoveOutStart", seq: 2, side: Sibling.Next, dstPath: "bar.0" },
				1, // Skip D
				{ type: "End", seq: 2 },
			],
			bar: [
				{ type: "MoveIn", seq: 2, srcPath: "foo.1", length: 1 }, // B
				{ type: "Insert", seq: 3, content: [{ id: "X" }] },
				{ type: "MoveIn", seq: 2, srcPath: "foo.1", length: 2, srcOffset: 1 }, // C D
			],
		},
	};

	export const w_u3: PeerChangeFrame = {
		modify: {
			bar: [
				1, // B
				{ type: "Insert", seq: 3, content: [{ id: "X" }] },
			],
		},
	};
}

export namespace ScenarioA2 {
	/**
	Scenario A2 (same as A but with the slice starting at C)
	In a trait foo that contains the nodes [A B C D], three users concurrently attempt the following operations (ordered
	here from first sequenced to last sequenced):
	  User 1: delete B C
	  User 2: move slice-like range C D to some other trait bar
	  User 3: insert X after C (commutative)

	X should end up in trait bar. In order for that to be possible, we need to preserve
	the fact that the move operation performed by user 2 was targeted not only at node D but also at nodes B and C. We
	also need to preserve the fact that the insertion of X was made with respect to B. This is challenging because the
	third edit will be rebased over the deletion of B C. This last point also holds for insertions of detached content
	(i.e., `MoveIn`)

	Takeaways:
	We need to preserve the layering of moves over deletions.
	We need to know which move operations apply to which nodes, even when they are deleted.
	We need to know which node a given insertion or move-in was relative to.
	*/

	export const t_u1: ChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Delete", length: 2 },
			],
		},
	};

	export const t_u2: ChangeFrame = {
		modify: {
			foo: [
				2, // Skip A B
				{ type: "MoveOutStart", side: Sibling.Next, dstPath: "bar.0" },
				2, // Skip C D
				{ type: "End" },
			],
			bar: [
				{ type: "MoveIn", srcPath: "foo.2", length: 2 },
			],
		},
	};

	export const t_u3: ChangeFrame = {
		modify: {
			foo: [
				3, // Skip A B C
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.CommutativeMove },
			],
		},
	};

	export const t_u2_r_u1: RebasedChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Detach", seq: 1 }, // B
				{ type: "MoveOutStart", side: Sibling.Next, dstPath: "bar.0" },
				{ type: "Detach", seq: 1 }, // C
				1, // Skip D
				{ type: "End" },
			],
			bar: [
				{ type: "MoveIn", srcPath: "foo.2", length: 2 },
			],
		},
	};

	export const t_u3_r_u1: RebasedChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Detach", seq: 1, length: 2 }, // B C
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.CommutativeMove },
			],
		},
	};

	export const t_u3_r_u1u2: RebasedChangeFrame = {
		modify: {
			bar: [
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.CommutativeMove },
			],
		},
	};

	export const w_u1u2: PeerChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Delete", seq: 1 },
				{ type: "MoveOutStart", seq: 2, side: Sibling.Next, dstPath: "bar.0" },
				{ type: "Delete", seq: 1 },
				1, // Skip D
				{ type: "End", seq: 2 },
			],
			bar: [
				{ type: "MoveIn", seq: 2, srcPath: "foo.2", length: 3 },
			],
		},
	};

	export const w_all: PeerChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Delete", seq: 1 }, // B
				{ type: "MoveOutStart", seq: 2, side: Sibling.Next, dstPath: "bar.0" },
				{ type: "Delete", seq: 1 }, // C
				1, // Skip D
				{ type: "End", seq: 2 },
			],
			bar: [
				{ type: "MoveIn", seq: 2, srcPath: "foo.1" }, // C
				{ type: "Insert", seq: 3, content: [{ id: "X" }] },
				{ type: "MoveIn", seq: 2, srcPath: "foo.1", srcOffset: 1 }, // D
			],
		},
	};

	export const w_u2u3: PeerChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "MoveOutStart", seq: 2, side: Sibling.Next, dstPath: "bar.0" },
				1, // Skip D
				{ type: "End", seq: 2 },
			],
			bar: [
				{ type: "MoveIn", seq: 2, srcPath: "foo.1" }, // C
				{ type: "Insert", seq: 3, content: [{ id: "X" }] },
				{ type: "MoveIn", seq: 2, srcPath: "foo.1", srcOffset: 1 }, // D
			],
		},
	};

	export const w_u3: PeerChangeFrame = {
		modify: {
			bar: [
				1, // C
				{ type: "Insert", seq: 3, content: [{ id: "X" }] },
			],
		},
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

	export const t_u1e1: ChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Insert", content: [{ id: "B" }] },
			],
		},
	};

	export const t_u1e2: ChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "MoveOut", dstPath: "bar.0" },
			],
			bar: [
				{ type: "MoveIn", srcPath: "foo.1" },
			],
		},
	};

	export const t_u2: ChangeFrame = {
		modify: {
			foo: [
				2, // Skip A B
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.NeverMove },
			],
		},
	};

	export const t_u2_r_u1e2: RebasedChangeFrame = {
		modify: {
			foo: [
				2, // Skip A
				{ type: "Detach", seq: 1 },
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.NeverMove },
			],
		},
	};

	export const w_u1: PeerChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{
					type: "Insert",
					seq: 1,
					content: [{ id: "B" }],
					detach: { type: "MoveOut", seq: 2, dstPath: "bar.0" },
				},
			],
			bar: [
				{ type: "MoveIn", seq: 2, srcPath: "foo.1" },
			],
		},
	};

	export const w_all: PeerChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{
					type: "Insert",
					seq: 1,
					content: [{ id: "B" }],
					detach: { type: "MoveOut", seq: 2, dstPath: "bar.0" },
				},
				{ type: "Insert", seq: 3, content: [{ id: "X" }] },
			],
			bar: [
				{ type: "MoveIn", seq: 2, srcPath: "foo.1" },
			],
		},
	};

	export const w_u1e2u2: PeerChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "MoveOut", seq: 2, dstPath: "bar.0" },
				{ type: "Insert", seq: 3, content: [{ id: "X" }] },
			],
			bar: [
				{ type: "MoveIn", seq: 2, srcPath: "foo.1" },
			],
		},
	};

	export const w_u2: PeerChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Insert", seq: 3, content: [{ id: "X" }] },
			],
		},
	};
}

export namespace ScenarioD {
	/*
	Scenario D
	In trait foo [A B C]:
	  User 1: move slice range [B_] to some other trait bar
	  User 2:
	    insert X after B (with commutative semantics)
	    move slice-like range [A B X C] to some other trait baz

	X should be inserted to into the bar trait (as opposed to ending up in the baz trait).

	Takeaways:
	We need to preserve the layering of moves over insertions.
	It is not sufficient to represent insertions of content that is subsequently moved as insertions in
	their final location.
	Note: this scenario motivates this being is true within commits but not across commits.
	*/

	export const t_u1: ChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "MoveOutStart", dstPath: "bar.0" },
				1, // Skip B
				{ type: "End", side: Sibling.Next },
			],
			bar: [
				{ type: "MoveIn", srcPath: "foo.1" },
			],
		},
	};

	export const t_u2: ChangeFrame = {
		modify: {
			foo: [
				{ type: "MoveOutStart", id: 1, dstPath: "baz" },
				2, // Skip A B
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.CommutativeMove },
				1, // Skip C
				{ type: "End", id: 1 },
			],
			baz: [
				{ type: "MoveIn", id: 1, length: 4, srcPath: "foo.0" },
			],
		},
	};

	export const t_u2_r_u1: RebasedChangeFrame = {
		modify: {
			foo: [
				{ type: "MoveOutStart", id: 1, dstPath: "baz" },
				1, // Skip A
				{ type: "Detach", seq: 1 },
				1, // Skip C
				{ type: "End", id: 1 },
			],
			bar: [
				{ type: "Attach", seq: 1 },
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.CommutativeMove },
			],
			baz: [
				{ type: "MoveIn", id: 1, length: 2, srcPath: "foo.0" },
			],
		},
	};

	export const w_u1: PeerChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "MoveOutStart", seq: 1, dstPath: "bar.0" },
				1, // Skip B
				{ type: "End", seq: 1, side: Sibling.Next },
			],
			bar: [
				{ type: "MoveIn", seq: 1, srcPath: "foo.1" },
			],
		},
	};

	export const w_all: PeerChangeFrame = {
		modify: {
			foo: [
				{ type: "MoveOutStart", seq: 2, id: 1, dstPath: "baz" },
				1, // Skip A
				{ type: "MoveOutStart", seq: 1, dstPath: "bar.0" },
				1, // Skip B
				{ type: "End", seq: 1 },
				1, // Skip C
				{ type: "End", seq: 2, id: 1 },
			],
			bar: [
				{ type: "MoveIn", seq: 1, srcPath: "foo.1" },
				{ type: "Insert", seq: 2, content: [{ id: "X" }] },
			],
			baz: [
				{ type: "MoveIn", seq: 2, id: 1, length: 3, srcPath: "foo.0" }, // length needed updating 4->3
			],
		},
	};

	export const w_u2: PeerChangeFrame = {
		modify: {
			foo: [
				{ type: "MoveOutStart", seq: 2, id: 1, dstPath: "baz" },
				2, // Skip A C
				{ type: "End", seq: 2, id: 1 },
			],
			bar: [
				1, // Skip B
				{ type: "Insert", seq: 2, content: [{ id: "X" }] },
			],
			baz: [
				{ type: "MoveIn", seq: 2, id: 1, length: 3, srcPath: "foo.0" },
			],
		},
	};
}

export namespace ScenarioE {
	/*
	In trait foo [A B C]:
	  User 1: move slice [B_] to some other trait bar
	  User 2 in one commit:
	    insert X after B (with commutative-move semantics)
	    delete slice-like range [A B X C]

	B should be inserted to into the bar trait (as opposed to ending up deleted).

	Takeaways:
	We need to preserve the layering of deletions over moves.
	It is not sufficient to represent deletions of content that was previously moved as deletions in
	their original location.
	*/

	export const t_u1: ChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "MoveOutStart", dstPath: "bar.0" },
				1, // Skip B
				{ type: "End", side: Sibling.Next },
			],
			bar: [
				{ type: "MoveIn", srcPath: "foo.1" },
			],
		},
	};

	export const t_u2: ChangeFrame = {
		modify: {
			foo: [
				{ type: "DeleteStart", id: 1 },
				2, // Skip A B
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.CommutativeMove },
				1, // Skip C
				{ type: "End", id: 1 },
			],
		},
	};

	export const t_u2_r_u1: RebasedChangeFrame = {
		modify: {
			foo: [
				{ type: "DeleteStart", id: 1 },
				1, // Skip A
				{ type: "Detach", seq: 1 },
				1, // Skip C
				{ type: "End", id: 1 },
			],
			bar: [
				{ type: "Attach", seq: 1 },
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.CommutativeMove },
			],
		},
	};

	export const w_u1: PeerChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "MoveOut", seq: 1, dstPath: "bar.0" },
			],
			bar: [
				{ type: "MoveIn", seq: 1, srcPath: "foo.1" },
			],
		},
	};

	export const w_all: PeerChangeFrame = {
		modify: {
			foo: [
				{ type: "DeleteStart", seq: 2, id: 1 },
				1, // Skip A
				{ type: "MoveOut", seq: 1, dstPath: "bar.0" },
				1, // Skip C
				{ type: "End", seq: 2, id: 1 },
			],
			bar: [
				{ type: "MoveIn", seq: 1, srcPath: "foo.1" },
				{ type: "Insert", seq: 2, content: [{ id: "X" }] },
			],
		},
	};

	export const w_u2: PeerChangeFrame = {
		modify: {
			foo: [
				{ type: "DeleteStart", seq: 2, id: 1 },
				2, // Skip A C
				{ type: "End", seq: 2, id: 1 },
			],
			bar: [
				1, // Skip B
				{ type: "Insert", seq: 2, content: [{ id: "X" }] },
			],
		},
	};
}

export namespace SwapCousins {
	// Swap the first nodes of traits foo and bar using set-like ranges
	export const e1: ChangeFrame = {
		modify: {
			foo: [
				{ type: "MoveOut", dstPath: "bar.0" },
				{ type: "MoveIn", id: 1, srcPath: "bar.0" },
			],
			bar: [
				{ type: "MoveIn", srcPath: "foo.0" },
				{ type: "MoveOut", id:1, dstPath: "foo.0" },
			],
		},
	};

	export const w1: PeerChangeFrame = {
		modify: {
			foo: [
				{ type: "MoveOut", seq: 1, dstPath: "bar.0" },
				{ type: "MoveIn", seq: 1, id: 1, srcPath: "bar.0" },
			],
			bar: [
				{ type: "MoveIn", seq: 1, srcPath: "foo.0" },
				{ type: "MoveOut", seq: 1, id:1, dstPath: "foo.0" },
			],
		},
	};

	// Swap the first nodes of traits foo and bar and back again using set-like ranges
	export const e2: ChangeFrame = {
		modify: {
			foo: [
				{ type: "MoveOut", dstPath: "bar.0" },
				{
					type: "MoveIn",
					id: 1,
					srcPath: "bar.0",
					detach: {
						type: "MoveOut",
						id: 2,
						dstPath: "bar.0",
					},
				},
				{ type: "MoveIn", id: 3, srcPath: "bar.0" },
			],
			bar: [
				{
					type: "MoveIn",
					srcPath: "foo.0",
					detach: {
						type: "MoveOut",
						id: 3,
						dstPath: "foo.0",
					},
				},
				{ type: "MoveOut", id:1, dstPath: "foo.0" },
				{ type: "MoveIn", id: 2, srcPath: "foo.0" },
			],
		},
	};

	export const w2: PeerChangeFrame = {
		modify: {
			foo: [
				{ type: "MoveOut", seq: 1, dstPath: "bar.0" },
				{
					type: "MoveIn",
					seq: 1,
					id: 1,
					srcPath: "bar.0",
					detach: {
						type: "MoveOut",
						seq: 1,
						id: 2,
						dstPath: "bar.0",
					},
				},
				{ type: "MoveIn", seq: 1, id: 3, srcPath: "bar.0" },
			],
			bar: [
				{
					type: "MoveIn",
					seq: 1,
					srcPath: "foo.0",
					detach: {
						type: "MoveOut",
						seq: 1,
						id: 3,
						dstPath: "foo.0",
					},
				},
				{ type: "MoveOut", seq: 1, id:1, dstPath: "foo.0" },
				{ type: "MoveIn", seq: 1, id: 2, srcPath: "foo.0" },
			],
		},
	};
}

export namespace SwapParentChild {
	// Swap parent/child:
	// From: A{ foo: B{ bar: C{ baz: D } } }
	// To:   A{ foo: C{ bar: B{ baz: D } } }
	export const e1: ChangeFrame = {
		modify: {
			foo: [
				{
					type: "MoveOut", // B,
					id: 2,
					dstPath: "foo.0.bar.0",
					mods: { // Modify B
						modify: {
							bar: [
								{
									type: "MoveOut", // C
									id: 1,
									dstPath: "foo.0",
									mods: { // Modify C
										modify: {
											baz: [
												{
													type: "MoveOut", // D
													// Omit path if the same as the current path?
													dstPath: "foo.0.bar.0.baz.0",
												},
											],
										},
									},
								},
							],
						},
					},
				},
				{
					type: "MoveIn", // C
					id: 1,
					srcPath: "foo.0.bar.0",
					mods: { // Modify C
						modify: {
							bar: [
								{
									type: "MoveIn", // B
									id: 2,
									srcPath: "foo.0",
									mods: { // Modify B
										modify: {
											baz: [
												{
													type: "MoveIn", // D
													// Omit path if the same as the current path?
													srcPath: "foo.0.bar.0.baz.0",
												},
											],
										},
									},
								},
							],
						},
					},
				},
			],
		},
	};

	export const w1: PeerChangeFrame = {
		modify: {
			foo: [
				{
					type: "MoveOut", // B
					seq: 1,
					id: 2,
					dstPath: "foo.0.bar.0",
					mods: { // Modify B
						modify: {
							bar: [
								{
									type: "MoveOut", // C
									seq: 1,
									id: 1,
									dstPath: "foo.0",
									mods: { // Modify C
										modify: {
											baz: [
												{
													type: "MoveOut", // D
													seq: 1,
													// Omit path if the same as the current path?
													dstPath: "foo.0.bar.0.baz.0",
												},
											],
										},
									},
								},
							],
						},
					},
				},
				{
					type: "MoveIn", // C
					seq: 1,
					id: 1,
					srcPath: "foo.0.bar.0",
					mods: { // Modify C
						modify: {
							bar: [
								{
									type: "MoveIn", // B
									seq: 1,
									id: 2,
									srcPath: "foo.0",
									mods: { // Modify B
										modify: {
											baz: [
												{
													type: "MoveIn", // D
													seq: 1,
													// Omit path if the same as the current path?
													srcPath: "foo.0.bar.0.baz.0",
												},
											],
										},
									},
								},
							],
						},
					},
				},
			],
		},
	};
}

export namespace ScenarioF {
	/*
	starting state: 'AB' (known to both client 1 and client 2)
	  Edit #1 by client 1: insert 'r' at index 0 (local state: 'rAB')
	  Edit #2 by client 2: insert 'xz' at index 1 (local state: 'AxzB')
	  Edit #3 by client 2: insert 'y' at index 2 (local state: 'AxyzB')

	Expected outcome: 'rAxyzB'
	*/

	export const t_u1: ChangeFrame = {
		modify: {
			foo: [
				{ type: "Insert", content: [{ id: "r" }] },
			],
		},
	};

	export const t_u2e1: ChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Insert", content: [{ id: "x" }, { id: "z" }] },
			],
		},
	};

	export const t_u2e2: ChangeFrame = {
		modify: {
			foo: [
				2, // Skip A x
				{ type: "Insert", content: [{ id: "y" }] },
			],
		},
	};

	export const t_u2e1_r_u1: RebasedChangeFrame = {
		modify: {
			foo: [
				{ type: "Attach", seq: 1 }, // r
				1, // Skip A
				{ type: "Insert", content: [{ id: "x" }, { id: "z" }] },
			],
		},
	};

	export const t_u2e2_r_u1: RebasedChangeFrame = {
		modify: {
			foo: [
				{ type: "Attach", seq: 1 }, // r
				2, // Skip A x
				{ type: "Insert", content: [{ id: "y" }] },
			],
		},
	};

	export const t_u2e2_r_u1u2e1: RebasedChangeFrame = {
		modify: {
			foo: [
				{ type: "Attach", seq: 1 }, // r
				1, // Skip A
				{ type: "Attach", seq: 2 }, // x
				{ type: "Insert", content: [{ id: "y" }] },
				{ type: "Attach", seq: 2 }, // z
			],
		},
	};
}

export namespace ScenarioG {
	/*
	In trait foo [A B]:
	  User 1: move slice [A B] to some other trait bar
	  User 2: insert X after A (with commutative-move semantics)
	  User 2: insert Y after X (with never-move semantics)

	X should be inserted to into the bar trait.
	Y should be inserted to into the foo trait.

	Takeaways:
	When inserting in a slice-range that is moved and not adopting it (i.e., not commuting with the move), it is
	necessary to go look at the destination for any prior non-concurrent segments in order to correctly interpret
	the offset of the index.
	*/

	export const t_u1: ChangeFrame = {
		modify: {
			foo: [
				{ type: "MoveOutStart", dstPath: "bar.0" },
				2, // Skip A B
				{ type: "End", side: Sibling.Next },
			],
			bar: [
				{ type: "MoveIn", length: 2, srcPath: "foo.1" },
			],
		},
	};

	export const t_u2e1: ChangeFrame = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.CommutativeMove },
			],
		},
	};

	export const t_u2e2: ChangeFrame = {
		modify: {
			foo: [
				2, // Skip A X
				{ type: "Insert", content: [{ id: "Y" }], moveRules: MovementRules.NeverMove },
			],
		},
	};

	export const t_u2e1_r_u1: RebasedChangeFrame = {
		modify: {
			bar: [
				{ type: "Attach", seq: 1 }, // A
				{ type: "Insert", content: [{ id: "X" }], moveRules: MovementRules.CommutativeMove },
			],
		},
	};

	export const t_u2e2_r_u1: RebasedChangeFrame = {
		modify: {
			foo: [
				{ type: "Detach", seq: 1 }, // A
				1, // X <- at this stage we do not know what has happened to the previous insert
				{ type: "Insert", content: [{ id: "Y" }], moveRules: MovementRules.NeverMove },
			],
		},
	};

	export const t_u2e2_r_u1u2e2: RebasedChangeFrame = {
		modify: {
			foo: [
				{ type: "Detach", seq: 1 }, // A
				{ type: "Temp", seq: 2 }, // X <- now we do
				{ type: "Insert", content: [{ id: "Y" }], moveRules: MovementRules.NeverMove },
			],
		},
	};
}

export namespace TodoApp {
	/*
	Operations by User 1 (rebased branch):
		O1a Delete all finished tasks: [delete task1, task3, task5]
		O1b Change color of all tasks to green: [set task2.color=green, task4.color=green]
	Operation by User 2 (base branch):
		O2a Remove finished flag on task 5: [set task5.finished = false]

	If O1a is rebased with respect to O2a, the delete for task 5 would be removed (either because the delete all
	finished tasks command is fully re-executed, or because the rebase  handler knows, that if this flag changes on an
	entry it has to be added / removed from the deletion set), giving the changeset O1a’ = [delete task1, task3]. If we
	now compute the squashed changes for
	(O1a-1 ∘ O2a ∘ O1a’ = [insert task1, task3, task5] ∘ [set task5.finished = false] ∘ [delete task1, task3])
	the net result of this will be [insert task5(with finished = false)]. This is now the correct changeset that
	describes the changes between the state before O1b and behind O1a’. When the change for O2b was generated, task5
	did not exist and thus it was not taken into account in the creation of this command. To correctly handle the
	conflict, the conflict handler needs to know that task5 got created (relative to its state).
	*/

	export enum Match {
		Number = "5606bd4d-00b8-45e1-b038-f0186820fe03",
	}

	interface MatchOutputs {
		[Match.Number]: number;
	}

	type MatchOutput<M extends Match> = MatchOutputs[M];

	type MatchSelector<T, M extends Match> = {
		readonly [K in keyof T]?: M | MatchSelector<T[K], M>;
	};

	const ms1: MatchSelector<ConstraintFrame, Match.Number> = { traits: { tasks: [{ length: Match.Number }] } };

	export function match<T, M extends Match>(data: T, selector: MatchSelector<T,M>): MatchOutput<M> {
		throw new Error("Unknown command");
	}

	/**
	 * @returns True iff the given `transaction` was emitted by this client.
	 */
	export function isLocal(transaction: RebasedTransaction): boolean {
		return false;
	}

	type DeleteAllFinishedTasksFrames = [
		{
			type: "ConstrainedTraitSet";
			traits: {
				tasks: [ConstrainedRange];
			};
		},
		{
			modify: {
				tasks: (Delete | Offset)[];
			};
		},
	];

	/**
	 * 
	 */
	const deleteAllFinishedTasks = {
		name: "DeleteAllFinishedTasks",
		deltaConflictHandler: (
			old: Transaction<DeleteAllFinishedTasksFrames>,
			interim: RebasedTransaction[],
		): TransactionFrame[] => {
			const [constraint, change] = old.frames;
			let length = constraint.traits.tasks[0].length ?? 0;
			const marks = clone(change.modify.tasks);
			for (const priorTransaction of interim) {
				if (isLocal(priorTransaction)) {
					// We can't really skip those. For example a prior slice delete could have deleted
					// tasks that were concurrently inserted. So while looking at non-local changes will tell me
					// about the concurrently inserted tasks, I need to look at prior local changes to check if
					// those new tasks got deleted or moved out.
					for (const priorChange of priorTransaction.frames) {
						const priorMarks = priorChange.modify?.
					}
				} else {
					for (const priorChange of priorTransaction.frames) {
						const priorMarks = priorChange.modify?.
					}
				}
			}
			throw new Error("Unknown command");
		},
	};

	const markAllTasksGreen = {
		name: "MarkAllTasksGreen",
		deltaConflictHandler: (old: Transaction, interim: RebasedTransaction[]): TransactionFrame[] => {},
	};

	export const o1a: Transaction<DeleteAllFinishedTasksFrames> = {
		command: deleteAllFinishedTasks.name,
		frames: [
			{
				type: "ConstrainedTraitSet",
				traits: {
					tasks: [{
						type: "ConstrainedRange",
						endSide: Sibling.Next,
						length: 5,
						structureLock: 1, // Asserts that no elements in this range have been inserted or removed
						valueLock: 2, // Asserts that no properties of the elements in this range have been changed
					}],
				},
			},
			{
				modify: {
					tasks: [
						{ type: "Delete" }, // Task 1
						1, // Task 2
						{ type: "Delete" }, // Task 3
						1, // Task 4
						{ type: "Delete" }, // Task 5
					],
				},
			},
		],
	};

	export const o1b: Transaction = {
		command: markAllTasksGreen.name,
		frames: [
			{
				type: "ConstrainedTraitSet",
				traits: {
					tasks: [{
						type: "ConstrainedRange",
						endSide: Sibling.Next,
						length: 2,
						structureLock: 1, // Asserts that no elements in this range have been inserted or removed
					}],
				},
			},
			{
				modify: {
					tasks: [
						{ modify: { color: { setValue: "green" } } }, // Task 2
						{ modify: { color: { setValue: "green" } } }, // Task 4
					],
				},
			},
		],
	};

	export const o2a: ChangeFrame = {
		modify: {
			tasks: [
				4, // Tasks 1 -> 4
				{ modify: { finished: { setValue: false } } }, // Task 5
			],
		},
	};

	export function onConflict(old: Transaction, interim: RebasedTransaction[]): TransactionFrame[] {
		switch (old.command) {
			case deleteAllFinishedTasks.name:
				return deleteAllFinishedTasks.deltaConflictHandler(
					old as Transaction<DeleteAllFinishedTasksFrames>,
					interim,
				);
			case markAllTasksGreen.name:
				return markAllTasksGreen.deltaConflictHandler(old, interim);
			default: throw new Error("Unknown command");
		}
	}

	export const o1a_mk2: ChangeFrame = {
		modify: {
			tasks: [
				{ type: "Delete" }, // Task 1
				1, // Task 2
				{ type: "Delete" }, // Task 3
			],
		},
	};
}
