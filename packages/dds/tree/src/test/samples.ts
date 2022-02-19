/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Commutativity, Original, Rebased, Sibling } from "../format";

export namespace SwapCousins {
	// Swap the first nodes of traits foo and bar using set-like ranges
	export const e1: Original.ChangeFrame = {
		moves: [
			{ src: "bar.0", dst: "foo.0" },
			{ src: "foo.0", dst: "bar.0" },
		],
		marks: [{
			modify: {
				foo: [
					{ type: "MoveOut" },
					{ type: "MoveIn" },
				],
				bar: [
					{ type: "MoveIn" },
					{ type: "MoveOut" },
				],
			},
		}],
	};
}

export namespace SwapParentChild {
	// Swap parent/child:
	// From: R{ foo: B{ bar: C{ baz: D } } }
	// To:   R{ foo: C{ bar: B{ baz: D } } }
	export const e1: Original.ChangeFrame = {
		moves: [
			{ src: "foo.0", dst: "foo.0.bar.0" }, // B
			{ src: "foo.0.bar.0", dst: "foo.0" }, // C
			{ src: "foo.0.bar.0.baz.0", dst: "foo.0.bar.0.baz.0" }, // D
		],
		marks: [{
			modify: {
				foo: [
					{
						type: "MoveOut", // B,
						moveId: 0,
						mods: [{ // Modify B
							modify: {
								bar: [
									{
										type: "MoveOut", // C
										moveId: 1,
										mods: [{ // Modify C
											modify: {
												baz: [
													{
														type: "MoveOut", // D
														moveId: 2,
													},
												],
											},
										}],
									},
								],
							},
						}],
					},
					{
						type: "MoveIn", // C
						moveId: 1,
						mods: [{ // Modify C
							modify: {
								bar: [
									{
										type: "MoveIn", // B
										moveId: 0,
										mods: [{ // Modify B
											modify: {
												baz: [
													{
														type: "MoveIn", // D
														moveId: 2,
													},
												],
											},
										}],
									},
								],
							},
						}],
					},
				],
			},
		}],
	};
}

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

	export const e1: Original.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Delete", length: 2 },
			],
		},
	};

	export const e2: Original.ChangeFrame = {
		moves: [{src: "foo.1", dst: "bar.0"}],
		marks: [{
			modify: {
				foo: [
					1, // Skip A
					{ type: "MoveOutStart", side: Sibling.Next },
					3, // Skip B C D
					{ type: "End" },
				],
				bar: [
					{ type: "MoveIn", length: 3 },
				],
			},
		}],
	};

	export const e3: Original.Modify = {
		modify: {
			foo: [
				2, // Skip A B
				{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.Full },
			],
		},
	};

	export const e2_r_e1: Rebased.ChangeFrame = {
		moves: [{src: "foo.1", dst: "bar.0"}],
		marks: [{
			modify: {
				foo: [
					1, // Skip A
					{ type: "MoveOutStart", side: Sibling.Next },
					{ type: "Detach", seq: 1, length: 2 }, // Delete B C
					1, // Skip D
					{ type: "End" },
				],
				bar: [
					{ type: "MoveIn", content: [1] },
				],
			},
		}],
	};

	export const e3_r_e1: Rebased.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Detach", seq: 1 }, // Delete of B
				{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.Full },
				{ type: "Detach", seq: 1 }, // Delete of C
			],
		},
	};

	export const e3re1_r_e2re1: Rebased.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Detach", seq: 1, length: 2 }, // Delete of B C (from e1)
				{ type: "Detach", seq: 2 }, // MoveOut D (from e2)
			],
			bar: [
				{
					type: "PriorMoveIn",
					seq: 2,
					content: [
						{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.Full },
						1, // MoveIn D (from u2)
					],
				},
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

	export const e1: Original.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Delete", length: 2 },
			],
		},
	};

	export const e2: Original.ChangeFrame = {
		moves: [{src: "foo.2", dst: "bar.0"}],
		marks: [{
			modify: {
				foo: [
					2, // Skip A B
					{ type: "MoveOutStart", side: Sibling.Next },
					2, // Skip C D
					{ type: "End" },
				],
				bar: [
					{ type: "MoveIn", length: 2 },
				],
			},
		}],
	};

	export const e3: Original.Modify = {
		modify: {
			foo: [
				3, // Skip A B C
				{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
			],
		},
	};

	export const e2_r_e1: Rebased.ChangeFrame = {
		moves: [{src: "foo.1", dst: "bar.0"}],
		marks: [{
			modify: {
				foo: [
					1, // Skip A
					{ type: "Detach", seq: 1 }, // B
					{ type: "MoveOutStart", side: Sibling.Next },
					{ type: "Detach", seq: 1 }, // C
					1, // Skip D
					{ type: "End" },
				],
				bar: [
					{ type: "MoveIn", content: [1] },
				],
			},
		}],
	};

	export const e3_r_e1: Rebased.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Detach", seq: 1, length: 2 }, // B C
				{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
			],
		},
	};

	export const e3re1_r_e2re1: Rebased.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Detach", seq: 1, length: 2 }, // B C
				{ type: "Detach", seq: 2 }, // D
			],
			bar: [
				{
					type: "PriorMoveIn",
					seq: 2,
					content: [
						{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
						1, // D
					],
				},
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

	export const e1: Original.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Insert", content: [{ id: "B" }] },
			],
		},
	};

	export const e2: Original.ChangeFrame = {
		moves: [{ src: "foo.1", dst: "bar.0" }],
		marks: [{
			modify: {
				foo: [
					1, // Skip A
					{ type: "MoveOut" },
				],
				bar: [
					{ type: "MoveIn" },
				],
			},
		}],
	};

	export const e3: Original.Modify = {
		modify: {
			foo: [
				2, // Skip A B
				{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.None },
			],
		},
	};

	export const e3_r_e2: Rebased.Modify = {
		modify: {
			foo: [
				2, // Skip A
				{ type: "Detach", seq: 2 }, // B
				{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.None },
			],
			bar: [
				{ type: "PriorMoveIn", seq: 2, content: [1] },
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
	    insert X after B (with commutative move semantics)
	    move slice-like range [A B X C] to some other trait baz

	X should be inserted to into the bar trait (as opposed to ending up in the baz trait).

	Takeaways:
	We need to preserve the layering of moves over insertions.
	It is not sufficient to represent insertions of content that is subsequently moved as insertions in
	their final location.
	Note: this scenario motivates this being is true within commits but not across commits.
	*/

	export const e1: Original.ChangeFrame = {
		moves: [{ src: "foo.1", dst: "bar.0" }],
		marks: [{
			modify: {
				foo: [
					1, // Skip A
					{ type: "MoveOutStart" },
					1, // Skip B
					{ type: "End", side: Sibling.Next },
				],
				bar: [
					{ type: "MoveIn" },
				],
			},
		}],
	};

	export const e2: Original.ChangeFrame = {
		moves: [{ src: "foo.0", dst: "baz.0" }],
		marks: [{
			modify: {
				foo: [
					{ type: "MoveOutStart" },
					2, // Skip A B
					{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
					1, // Skip C
					{ type: "End" },
				],
				baz: [
					{ type: "MoveIn", length: 4 },
				],
			},
		}],
	};

	export const e2_r_e1: Rebased.ChangeFrame = {
		moves: [{ src: "foo.0", dst: "baz.0" }],
		marks: [{
			modify: {
				foo: [
					{ type: "MoveOutStart" },
					1, // Skip A
					{ type: "Detach", seq: 1 }, // B
					1, // Skip C
					{ type: "End" },
				],
				bar: [
					{
						type: "PriorMoveIn",
						seq: 1,
						content: [
							1, // B
							{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
						],
					},
				],
				baz: [
					{ type: "MoveIn", content: [2] }, // A C
				],
			},
		}],
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

	export const e1: Original.ChangeFrame = {
		moves: [{ src: "foo.1", dst: "bar.0" }],
		marks: [{
			modify: {
				foo: [
					1, // Skip A
					{ type: "MoveOutStart" },
					1, // Skip B
					{ type: "End", side: Sibling.Next },
				],
				bar: [
					{ type: "MoveIn" }, // B
				],
			},
		}],
	};

	export const e2: Original.Modify = {
		modify: {
			foo: [
				{ type: "DeleteStart" },
				2, // Skip A B
				{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
				1, // Skip C
				{ type: "End" },
			],
		},
	};

	export const e2_r_e1: Rebased.Modify = {
		modify: {
			foo: [
				{ type: "DeleteStart" },
				1, // Skip A
				{ type: "Detach", seq: 1 },
				1, // Skip C
				{ type: "End" },
			],
			bar: [
				{
					type: "PriorMoveIn",
					seq: 1,
					content: [
						1, // B
						{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
					],
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

	export const e1: Original.Modify = {
		modify: {
			foo: [
				{ type: "Insert", content: [{ id: "r" }] },
			],
		},
	};

	export const e2: Original.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Insert", content: [{ id: "x" }, { id: "z" }] },
			],
		},
	};

	export const e3: Original.Modify = {
		modify: {
			foo: [
				2, // Skip A x
				{ type: "Insert", content: [{ id: "y" }] },
			],
		},
	};

	export const e2inv: Original.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Delete", length: 2 },
			],
		},
	};

	export const e2_r_e1: Rebased.Modify = {
		modify: {
			foo: [
				{ type: "PriorInsert", seq: 1 }, // r
				1, // Skip A
				{ type: "Insert", content: [{ id: "x" }, { id: "z" }] },
			],
		},
	};

	export const e3_r_e2inv: Rebased.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Detach", seq: -2 }, // x
				{ type: "Insert", content: [{ id: "y" }] },
				{ type: "Detach", seq: -2 }, // z
			],
		},
	};
	export const e3_r_e2inv_e1: Rebased.Modify = {
		modify: {
			foo: [
				2, // Skip r, A
				{ type: "Detach", seq: -2 }, // x
				{ type: "Insert", content: [{ id: "y" }] },
				{ type: "Detach", seq: -2 }, // z
			],
		},
	};
	export const e3_r_e2inv_e1_e2re1: Rebased.Modify = {
		modify: {
			foo: [
				3, // Skip r, A, x
				{ type: "Insert", content: [{ id: "y" }] },
			],
		},
	};

	// We need to first rebase e3 over e1 because it's possible e1 affects e3 in
	// ways that the scaffold of e1 in e2_r_e1 does not specify.
	// For example e1 could be making a slice-move that e3's insert falls into.
	export const e3_r_e1: Rebased.Modify = {
		modify: {
			foo: [
				{ type: "PriorInsert", seq: 1 }, // r
				2, // Skip A x
				{ type: "Insert", content: [{ id: "y" }] },
			],
		},
	};

	export const e3re1_r_e2re1: Rebased.Modify = {
		modify: {
			foo: [
				{ type: "PriorInsert", seq: 1 }, // r
				1, // Skip A
				{ type: "PriorInsert", seq: 2 }, // x
				{ type: "Insert", content: [{ id: "y" }] },
				{ type: "PriorInsert", seq: 2 }, // z
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
	When inserting in a slice-range that is moved and not adopting (i.e., not commuting with) the move, it is
	necessary to go look at the destination for any prior non-concurrent segments in order to correctly interpret
	the offset of the index.
	*/

	export const e1: Original.ChangeFrame = {
		moves: [{ src: "foo.0", dst: "bar.0" }],
		marks: [{
			modify: {
				foo: [
					{ type: "MoveOutStart" },
					2, // Skip A B
					{ type: "End", side: Sibling.Next },
				],
				bar: [
					{ type: "MoveIn", length: 2 },
				],
			},
		}],
	};

	export const e2: Original.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
			],
		},
	};

	export const e3: Original.Modify = {
		modify: {
			foo: [
				2, // Skip A X
				{ type: "Insert", content: [{ id: "Y" }], commute: Commutativity.None },
			],
		},
	};

	export const e2_r_e1: Rebased.Modify = {
		modify: {
			foo: [
				{ type: "Detach", seq: 1, length: 2 }, // A B
			],
			bar: [
				{
					type: "PriorMoveIn",
					seq: 1,
					content: [
						1, // A
						{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
						1, // B
					],
				},
			],
		},
	};

	export const e3_r_e1: Rebased.Modify = {
		modify: {
			foo: [
				{ type: "Detach", seq: 1 }, // A
				1, // X <- at this stage we do not know what has happened to the previous insert
				{ type: "Insert", content: [{ id: "Y" }], commute: Commutativity.None },
				{ type: "Detach", seq: 1 }, // B
			],
			bar: [
				{ type: "PriorMoveIn", seq: 1, content: [2] },
			],
		},
	};

	// Temp is needed to allow multiple inserts like Y to be relatively ordered.
	// For example if instead of inserting X e2 had inserted VXZ, then a branch bY had been created
	// on which an e3 had inserted Y between X and Z, and a branch bW had been created on which
	// an e4 had inserted W between V and X (making [AVWXYZB] locally)
	// then the outcome should be that [WY] is left in trait foo, not [YW]. In order to make
	// that happen we need to know where relative to the content introduced by e2 the insertions
	// by e3 and e4 were made.
	export const e3re1_r_e2re1: Rebased.Modify = {
		modify: {
			foo: [
				{ type: "Detach", seq: 1 }, // A
				{ type: "Temp", seq: 2 }, // X <- needed to support local branching
				{ type: "Insert", content: [{ id: "Y" }], commute: Commutativity.None },
				{ type: "Detach", seq: 1 }, // B
			],
			bar: [
				{
					type: "PriorMoveIn",
					seq: 1,
					content: [
						1, // A
						{ type: "PriorInsert", seq: 2 }, // X
						1, // B
					],
				},
			],
		},
	};
}
