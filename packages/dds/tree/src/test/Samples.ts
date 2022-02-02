/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeFrame, SimpleMovementRules, PeerChangeFrame, TraitParents, Sibling } from "../Format";

export namespace ScenarioA1 {
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
				{ type: "Insert", content: [{ id: "X" }], moveRules: SimpleMovementRules.CommutativeMove },
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
				{ type: "Insert", content: [{ id: "X" }], moveRules: SimpleMovementRules.CommutativeMove },
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
		modify: {
			trait: [
				{ // Modify P
				modify: {
					foo: [
							{ type: "MoveOut", dstPath: "^bar.0" },
						],
						bar: [
							{
								type: "MoveIn",
								srcPath: "^foo.0",
								detach: {
									type: "MoveOut",
									id: 1,
									dstPath: "_.1.baz.0",
								},
							},
						],
					},
				},
				{ // Modify Q
					modify: {
						baz: [
							{
								type: "MoveIn",
								id: 1,
								srcPath: "^bar.0",
							},
						],
					},
				},
			],
		},
	};

	export const t_u2: ChangeFrame = {
		modify: {
			trait: [
				{ // Modify P
					modify: {
						foo: [
							1, // Skip A
							[ // Race for "After A"
								[{
									type: "Insert",
									content: [{ id: "Y" }],
									id: 1,
									moveRules: SimpleMovementRules.AlwaysMove,
								}],
								[{
									type: "Insert",
									content: [{ id: "X" }],
									moveRules: { traitParent: TraitParents.Initial },
								}],
							],
						],
					},
				},
			],
		},
	};

	export const w_u1: PeerChangeFrame = {
		modify: {
			trait: [
				{ // Modify P
					modify: {
						foo: [
							{ type: "MoveOut", seq: 1, dstPath: "^bar.0" },
						],
						bar: [
							{
								type: "MoveIn",
								seq: 1,
								srcPath: "^foo.0",
								detach: {
									type: "MoveOut",
									seq: 1,
									id: 1,
									dstPath: "_.1.baz.0",
								},
							},
						],
					},
				},
				{ // Modify Q
					modify: {
						baz: [
									{
								type: "MoveIn",
								seq: 1,
								id: 1,
								srcPath: "^bar.0",
							},
						],
					},
				},
			],
		},
	};

	export const w_all: PeerChangeFrame = {
		modify: {
			trait: [
				{ // Modify P
					modify: {
						foo: [
							{ type: "MoveOut", seq: 1, dstPath: "^bar.0" },
						],
						bar: [
							{
								type: "MoveIn",
								seq: 1,
								srcPath: "^foo.0",
								detach: {
									type: "MoveOut",
									seq: 1,
									id: 1,
									dstPath: "_.1.baz.0",
								},
							},
							{ type: "Insert", seq: 2, id: 1, content: [{ id: "X" }] },
						],
					},
				},
				{ // Modify Q
					modify: {
						baz: [
							{
								type: "MoveIn",
								seq: 1,
								id: 1,
								srcPath: "^bar.0",
							},
							{ type: "Insert", seq: 2, id: 1, content: [{ id: "Y" }] },
						],
					},
				},
			],
		},
	};

	export const w_u2: PeerChangeFrame = {
		modify: {
			trait: [
				{ // Modify P
					modify: {
						bar: [
							{ type: "Insert", seq: 2, id: 1, content: [{ id: "X" }] },
						],
					},
				},
				{ // Modify Q
					modify: {
						baz: [
							1, // A
							{ type: "Insert", seq: 2, id: 1, content: [{ id: "Y" }] },
						],
					},
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
				{ type: "Insert", content: [{ id: "X" }], moveRules: SimpleMovementRules.NeverMove },
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
				{ type: "MoveOutStart", id: 1, dstPath: "baz" },
				2, // Skip A B
				{ type: "Insert", content: [{ id: "X" }], moveRules: SimpleMovementRules.AlwaysMove },
				1, // Skip C
				{ type: "End", id: 1 },
			],
			baz: [
				{ type: "MoveIn", id: 1, length: 4, srcPath: "foo.0" },
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
				{ type: "MoveOutStart", seq: 2, id: 1, dstPath: "baz" },
				1, // Skip A
				{ type: "MoveOut", seq: 1, dstPath: "bar.0" },
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
				{ type: "DeleteStart", id: 1 },
				2, // Skip A B
				{ type: "Insert", content: [{ id: "X" }] },
				1, // Skip C
				{ type: "End", id: 1 },
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
}

export namespace Swaps {
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

	// Swap parent/child:
	// From: A{ foo: B{ bar: C{ baz: D } } }
	// To:   A{ foo: C{ bar: B{ baz: D } } }
	export const e3: ChangeFrame = {
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
}
