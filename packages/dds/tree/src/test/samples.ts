/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Commutativity, Original, Rebased as R, Sibling, Sequenced as S, RangeType } from "../format";

export namespace ExampleWithCraig {
	/**
	 * State: [A B C D]
	 * U1: set-delete whole trait <-1st
	 * U2: insert X after A <-2nd
	 * U3: insert Y after B <-3rd
	 * => [X Y] not [Y X]
	 */
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: [{
				modify: {
					foo: [
						{ type: "DeleteSet", id: 0 , length: 4 },
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "Insert", id: 0, content: [{ id: "X" }] },
					],
				},
			}],
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: [{
				modify: {
					foo: [
						2, // Skip A & B
						{ type: "Insert", id: 0, content: [{ id: "Y" }] },
					],
				},
			}],
		}],
	};

	export const e2p: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		frames: [{
			marks: [{
				modify: {
					foo: [
						{
							type: "PriorDeleteSet",
							seq: 1,
							id: 0,
							length: 4,
							mods: [
								1, // A
								{ type: "Insert", id: 0, content: [{ id: "X" }] },
							],
						},
					],
				},
			}],
		}],
	};

	export const e3p: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		frames: [{
			marks: [{
				modify: {
					foo: [
						{
							type: "PriorDeleteSet",
							seq: 1,
							id: 0,
							length: 4,
							mods: [
								1, // A
								{ type: "Insert", id: 0, content: [{ id: "X" }] },
								1, // B
								{ type: "Insert", id: 0, content: [{ id: "Y" }] },
							],
						},
					],
				},
			}],
		}],
	};
}

export namespace SwapCousins {
	// Swap the first nodes of traits foo and bar using set-like ranges
	export const e1: Original.ChangeFrame = {
		moves: [
			{ id: 0, src: { foo: 0 }, dst: { bar: 0 } },
			{ id: 1, src: { bar: 0 }, dst: { foo: 0 } },
		],
		marks: [{
			modify: {
				foo: [
					{ type: "MoveOutSet", id: 0 },
					{ type: "MoveIn", id: 1, range: RangeType.Set },
				],
				bar: [
					{ type: "MoveIn", id: 0, range: RangeType.Set },
					{ type: "MoveOutSet", id: 1 },
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
			{ id: 0, src: { foo: 0 }, dst: { foo: { 0: { bar: 0 } } } }, // B
			{ id: 1, src: { foo: { 0: { bar: 0 } } }, dst: { foo: 0 } }, // C
			{ // D
				id: 2,
				src: { foo: { 0: { bar: { 0: { baz: 0 } } } } },
				dst: { foo: { 0: { bar: { 0: { baz: 0 } } } } },
			},
		],
		marks: [{
			modify: {
				foo: [
					{
						type: "MoveOutSet", // B,
						id: 0,
						mods: [{ // Modify B
							modify: {
								bar: [
									{
										type: "MoveOutSet", // C
										id: 1,
										mods: [{ // Modify C
											modify: {
												baz: [
													{
														type: "MoveOutSet", // D
														id: 2,
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
						range: RangeType.Set,
						id: 1,
						mods: [{ // Modify C
							modify: {
								bar: [
									{
										type: "MoveIn", // B
										range: RangeType.Set,
										id: 0,
										mods: [{ // Modify B
											modify: {
												baz: [
													{
														type: "MoveIn", // D
														range: RangeType.Set,
														id: 2,
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
	(i.e., `MoveIn*`)
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "DeleteSet", id:0 , length: 2 },
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{
							type: "MoveOutSlice",
							id: 0,
							length: 3,
						},
					],
					bar: [
						{ type: "MoveIn", id: 0, range: RangeType.Slice, length: 3 },
					],
				},
			}],
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: [{
				modify: {
					foo: [
						2, // Skip A B
						{ type: "Insert", id: 0, content: [{ id: "X" }], commute: Commutativity.Full },
					],
				},
			}],
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{
							type: "MoveOutSlice",
							id: 0,
							length: 3, // B, C, D
							mods: [
								{
									type: "PriorDeleteSet",
									seq: 1,
									id: 0,
									length: 2,
								},
							],
						},
					],
					bar: [
						{ type: "MoveIn", id: 0, range: RangeType.Slice, length: 3 },
					],
				},
			}],
		}],
	};

	export const e3_r_e1: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 1,
		frames: [{
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{
							type: "PriorDeleteSet",
							seq: 1,
							id: 0,
							length: 2,
							mods: [
								1, // B
								{ type: "Insert", id: 0, content: [{ id: "X" }], commute: Commutativity.Full },
							],
						},
					],
				},
			}],
		}],
	};

	export const e3p: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 2,
		frames: [{
			priorMoves: [{ seq: 2, id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{
							type: "MoveOutSlice",
							id: 0,
							length: 3, // B, C, D
							mods: [
								{
									type: "PriorDeleteSet",
									seq: 1,
									id: 0,
									length: 2,
									mods: [
										1, // B
										{ type: "Insert", id: 0, content: [{ id: "X" }], commute: Commutativity.Full },
									],
								},
							],
						},
					],
					bar: [
						{ type: "MoveIn", id: 0, range: RangeType.Slice, length: 3 },
					],
				},
			}],
		}],
	};

	export const originals = [e1, e2, e3];
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
	(i.e., `MoveIn*`)
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "DeleteSet", id: 0, length: 2 },
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			moves: [{ id: 0, src: { foo: 2 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						2, // Skip A B
						{
							type: "MoveOutSlice",
							id: 0,
							length: 2,
						},
					],
					bar: [
						{ type: "MoveIn", id: 0, range: RangeType.Slice, length: 2 },
					],
				},
			}],
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: [{
				modify: {
					foo: [
						3, // Skip A B C
						{ type: "Insert", id: 0, content: [{ id: "X" }], commute: Commutativity.Move },
					],
				},
			}],
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "PriorDeleteSet", seq: 1, id: 0 }, // B
						{
							type: "MoveOutSlice",
							id: 0,
							length: 2,
							mods: [
								{ type: "PriorDeleteSet", seq: 1, id: 0 }, // B
							],
						}, // D
					],
					bar: [
						{ type: "MoveIn", id: 0, range: RangeType.Slice, length: 2 },
					],
				},
			}],
		}],
	};
}

export namespace ScenarioD {
	/*
	Scenario D
	In trait foo [A B C]:
	  User 1: move slice range [B_] to some other trait bar
	  User 2:
	    insert X after B (with commutative move semantics)
	    move set-like range [A B X C] to some other trait baz

	X should be inserted to into the baz trait (as opposed to ending up in the bar trait).
	The commutativity of the insertion of X could still be leveraged if user 1 moved content from trait baz
	*/

	export const e1: S.Transaction = {
		seq: 1,
		ref: 0,
		frames: [{
			moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "MoveOutSlice", id: 0, startSide: Sibling.Next },
					],
					bar: [
						{ type: "MoveIn", id: 0, range: RangeType.Slice },
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		seq: 2,
		ref: 0,
		frames: [{
			moves: [{ id: 0, src: { foo: 0 }, dst: { baz: 0 } }],
			marks: [{
				modify: {
					foo: [
						{ type: "MoveOutSet", id: 0, length: 3 },
					],
					baz: [
						{
							type: "MoveIn",
							id: 0,
							range: RangeType.Set,
							length: 3,
							mods: [
								2, // A, B
								{ type: "Insert", id: 0, content: [{ id: "X" }], commute: Commutativity.Move },
							],
						},
					],
				},
			}],
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			priorMoves: [{ seq: 1, id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
			moves: [{ id: 0, src: { foo: 0 }, dst: { baz: 0 } }],
			marks: [{
				modify: {
					foo: [
						{
							type: "MoveOutSet",
							id: 0,
							length: 3,
							mods: [
								1, // A
								{ type: "PriorMoveOutSlice", seq: 1, id: 0 }, // B
							],
						},
					],
					baz: [
						{
							type: "MoveIn",
							id: 0,
							range: RangeType.Set,
							length: 3,
							mods: [
								2, // A B
								{ type: "Insert", id: 0, content: [{ id: "X" }], commute: Commutativity.Move },
							],
						},
					],
				},
			}],
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

	B should be deleted (as opposed to inserted in trait bar).
	*/

	export const e1: S.Transaction = {
		seq: 1,
		ref: 0,
		frames: [{
			moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "MoveOutSlice", id: 0, startSide: Sibling.Next }, // B
					],
					bar: [
						{ type: "MoveIn", id: 0, range: RangeType.Slice }, // B
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		seq: 2,
		ref: 0,
		frames: [{
			marks: [{
				modify: {
					foo: [
						{ type: "DeleteSlice", id: 0, length: 3 },
					],
				},
			}],
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			priorMoves: [{ seq: 1, id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						{
							type: "DeleteSlice",
							id: 0,
							length: 3,
							mods: [
								1, // A
								{ type: "PriorMoveOutSlice", seq: 1, id: 0 }, // B
							],
						},
					],
				},
			}],
		}],
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

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: [{
				modify: {
					foo: [
						{ type: "Insert", id: 0, content: [{ id: "r" }] },
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "Insert", id: 0, content: [{ id: "x" }, { id: "z" }] },
					],
				},
			}],
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: [{
				modify: {
					foo: [
						2, // Skip A x
						{ type: "Insert", id: 0, content: [{ id: "y" }] },
					],
				},
			}],
		}],
	};

	export const e3d: R.ChangeFrame = {
		marks: [{
			modify: {
				foo: [
					{ type: "Insert", id: 0, content: [{ id: "r" }] },
				],
			},
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			marks: [{
				modify: {
					foo: [
						{ type: "PriorInsert", seq: 1, id: 0 },
						1, // Skip A
						{ type: "Insert", id: 0, content: [{ id: "x" }, { id: "z" }] },
					],
				},
			}],
		}],
	};

	export const e3p: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 2,
		frames: [{
			marks: [{
				modify: {
					foo: [
						{ type: "PriorInsert", seq: 1, id: 0 },
						1, // Skip A x
						{ type: "Insert", id: 0, content: [{ id: "y" }] },
					],
				},
			}],
		}],
	};

	export const originals = [e1, e2, e3];
}

export namespace ScenarioG {
	/*
	In trait foo [A B]:
	  User 1: move slice [A B] to some other trait bar
	  User 2: insert [X Y] after A (with commutative-move semantics)
	  User 2: insert N after X (with never-move semantics)
	  User 2: insert M before X (with never-move semantics)
	  User 2: insert O after Y (with never-move semantics)

	X Y should be inserted to into the bar trait.
	M N O  should be inserted to into the foo trait (in that order).
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						{ type: "MoveOutSlice", id: 0, length: 2 },
					],
					bar: [
						{ type: "MoveIn", id: 0, range: RangeType.Slice, length: 2 },
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "Insert", id: 0, content: [{ id: "X" }, { id: "Y" }], commute: Commutativity.Full },
					],
				},
			}],
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: [{
				modify: {
					foo: [
						2, // Skip A X
						{ type: "Insert", id: 0, content: [{ id: "N" }], commute: Commutativity.None },
					],
				},
			}],
		}],
	};

	export const e4: S.Transaction = {
		ref: 0,
		seq: 4,
		frames: [{
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{
							type: "Insert",
							id: 0,
							content: [{ id: "M" }],
							side: Sibling.Next,
							commute: Commutativity.None,
						},
					],
				},
			}],
		}],
	};

	export const e5: S.Transaction = {
		ref: 0,
		seq: 5,
		frames: [{
			marks: [{
				modify: {
					foo: [
						5, // Skip A X M N Y
						{ type: "Insert", id: 0, content: [{ id: "O" }], commute: Commutativity.None },
					],
				},
			}],
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			priorMoves: [{ seq: 1, id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						{
							type: "PriorMoveOutSlice",
							seq: 1,
							id: 0,
							length: 2,
							mods: [
								1, // A
								{
									type: "Insert",
									id: 0,
									content: [{ id: "X" }, { id: "Y" }],
									commute: Commutativity.Full,
								},
							],
						},
					],
				},
			}],
		}],
	};

	export const e3d: R.ChangeFrame = {
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: [{
			modify: {
				foo: [
					{ type: "MoveOutSlice", id: 0, length: 4 }, // A X Y B
				],
				bar: [
					{ type: "MoveIn", id: 0, range: RangeType.Slice, length: 4 }, // A X Y B
				],
			},
		}],
	};

	export const e3p: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 2,
		frames: [{
			priorMoves: [{ seq: 1, id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						{
							type: "PriorMoveOutSlice",
							seq: 1,
							id: 0,
							length: 4,
							mods: [
								2, // A X
								{
									type: "Insert",
									id: 0,
									content: [{ id: "N" }],
									commute: Commutativity.None,
								},
							],
						},
					],
				},
			}],
		}],
	};

	export const e4d: R.ChangeFrame = {
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: [{
			modify: {
				foo: [
					{ type: "MoveOutSlice", id: 0, length }, // A X
					1, // N
					{ type: "MoveOutSlice", id: 0, length: 2 }, // Y B
				],
				bar: [
					{ type: "MoveIn", id: 0, range: RangeType.Slice, length: 4 }, // A X Y B
				],
			},
		}],
	};

	export const e4p: S.Transaction = {
		seq: 4,
		ref: 0,
		newRef: 3,
		frames: [{
			priorMoves: [{ seq: 1, id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						{
							type: "PriorMoveOutSlice",
							seq: 1,
							id: 0,
							length: 2,
							mods: [
								1, // A
								{
									type: "Insert",
									id: 0,
									content: [{ id: "M" }],
									side: Sibling.Next,
									commute: Commutativity.None,
								},
							],
						},
						1, // N
						{ type: "PriorMoveOutSlice", seq: 1, id: 0, length: 2 }, // Y B
					],
				},
			}],
		}],
	};

	export const e5d: R.ChangeFrame = {
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: [{
			modify: {
				foo: [
					{ type: "MoveOutSlice", id: 0 }, // A
					1, // M
					{ type: "MoveOutSlice", id: 0 }, // X
					1, // N
					{ type: "MoveOutSlice", id: 0, length: 2 }, // Y B
				],
				bar: [
					{ type: "MoveIn", id: 0, range: RangeType.Slice, length: 4 }, // A X Y B
				],
			},
		}],
	};

	export const e5p: S.Transaction = {
		seq: 5,
		ref: 0,
		newRef: 3,
		frames: [{
			priorMoves: [{ seq: 1, id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						{ type: "PriorMoveOutSlice", seq: 1, id: 0 }, // A
						1, // M
						{ type: "PriorMoveOutSlice", seq: 1, id: 0 }, // X
						1, // N
						{
							type: "PriorMoveOutSlice",
							seq: 1,
							id: 0,
							length: 2,
							mods: [
								1, // Y
								{
									type: "Insert",
									id: 0,
									content: [{ id: "O" }],
									commute: Commutativity.None,
								},
							],
						},
					],
				},
			}],
		}],
	};

	export const originals = [e1, e2, e3, e4, e5];
}

export const allOriginals = [
	...ScenarioA1.originals,
	...ScenarioF.originals,
	...ScenarioG.originals,
];
