/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Effects, Rebased as R, Sequenced as S } from "../format";

export namespace InsertRoot {
	export const e1: R.ChangeFrame = {
		marks: {
			attach: [
				[ // Array of attach operations for index 0
					{
						type: "Insert",
						id: 0, // ID of the insert operation
						content: [ // Serialized trees
							{
								id: "cbb9bf86-12bf-46d2-95e5-bdc50bde3cd0", // ID of the root node
								type: "Point",
								traits: {
									x: [{
										id: "cebb2540-a654-4e1d-8d04-5a678f628c1d", // ID of the X node
										value: 42,
									}],
									y: [{
										id: "2dc94084-dcd5-4141-9eee-fa59f9c4642e", // ID of the Y node
										value: 42,
									}],
									arrayField: [{
										id: "376aa297-4b8b-4d85-ad0f-79ee7e9e6efc",
										type: "JSON-Array",
										traits: {
											entries: [
												{ id: "1a2815ee-0495-4ffa-b958-156abbfbb074", value: 0 },
												{ id: "e39fe778-35ac-4629-b890-5b38bf441984", value: 1 },
											],
										},
									}],
								},
							},
						],
					},
				],
			],
		},
	};
}

export namespace SwapCousins {
	// Swap the first nodes of traits foo and bar using set-like ranges
	export const e1: R.ChangeFrame = {
		moves: [
			{ id: 0, src: { foo: 0 }, dst: { bar: 0 } },
			{ id: 1, src: { bar: 0 }, dst: { foo: 0 } },
		],
		marks: {
			modifyI: [{
				foo: {
					nodes: [{ type: "Move", id: 0, count: 1 }],
					attach: [[ { type: "Move", id: 1, count: 1 } ]],
				},
				bar: {
					nodes: [{ type: "Move", id: 1, count: 1 }],
					attach: [[ { type: "Move", id: 0, count: 1 } ]],
				},
			}],
		},
	};
}

export namespace SwapParentChild {
	// Swap parent/child:
	// From: R{ foo: B{ bar: C{ baz: D } } }
	// To:   R{ foo: C{ bar: B{ baz: D } } }
	export const e1: R.ChangeFrame = {
		moves: [
			{ id: 0, src: { foo: 0 }, dst: { foo: { 0: { bar: 0 } } } }, // B
			{ id: 1, src: { foo: { 0: { bar: 0 } } }, dst: { foo: 0 } }, // C
			{ // D
				id: 2,
				src: { foo: { 0: { bar: { 0: { baz: 0 } } } } },
				dst: { foo: { 0: { bar: { 0: { baz: 0 } } } } },
			},
		],
		marks: {
			modifyI: [{
				foo: {
					nodes: [{ type: "Move", id: 0, count: 1 }],
					modifyI: [{
						bar: {
							nodes: [{ type: "Move", id: 1, count: 1 }],
							modifyI: [{
								baz: {
									nodes: [{ type: "Move", id: 2, count: 1 }],
								},
							}],
						},
					}],
					attach: [
						[{ type: "Move", id: 1, count: 1 }],
					],
					modifyO: [{
						bar: {
							attach: [
								[{ type: "Move", id: 0, count: 1 }],
							],
							modifyO: [{
								baz: {
									attach: [
										[{ type: "Move", id: 2, count: 1 }],
									],
								},
							}],
						},
					}],
				},
			}],
		},
	};
}

export namespace ScenarioA1 {
	/**
	Scenario A
	In a trait foo that contains the nodes [A B C D], three users concurrently attempt the following operations (ordered
	here from first sequenced to last sequenced):
	  User 1: set-delete B C
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
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							1, // Skip A
							{ type: "Delete", id:0 , count: 2 },
						],
					},
				}],
			},
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							1, // Skip A
							{ type: "Move", id: 0, count: 3 },
						],
						affixes: [
							3, // Before B
							{ count: 8, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							4, // After B
							[{ type: "Move", id: 0, count: 3 }],
						],
					},
				}],
			},
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							4, // After B
							[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
						],
					},
				}],
			},
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
			marks: {
				modifyI: [{
					foo: {
						tombs: [1, { count: 2, seq: 1, id: 1 } ],
						nodes: [
							1, // Skip A
							{
								type: "Move",
								id: 0,
								count: 3,
							},
						],
						affixes: [
							3, // Before B
							{ count: 8, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							[{ type: "Move", id: 0, count: 3 }], // Count does not get updated
						],
					},
				}],
			},
		}],
	};

	export const e3_r_e1: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 1,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						tombs: [1, { count: 2, seq: 1, id: 1 } ],
						attach: [
							4, // After B
							[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
						],
					},
				}],
			},
		}],
	};

	export const e3p: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 2,
		frames: [{
			marks: {
				modifyI: [{
					bar: {
						attach: [
							[{
								type: "Portal",
								seq: 2,
								id: 1,
								tombs: [{ count: 2, seq: 1, id: 1 } ],
								attach: [
									4, // After B
									[{
										type: "Insert",
										id: 0,
										content: [{ id: "X" }],
										heed: Effects.All,
									}],
								],
							}],
						],
					},
				}],
			},
		}],
	};

	export const originals = [e1, e2, e3];
}

export namespace ScenarioA2 {
	/**
	Scenario A2 (same as A but with the slice starting at C)
	In a trait foo that contains the nodes [A B C D], three users concurrently attempt the following operations (ordered
	here from first sequenced to last sequenced):
	  User 1: set-delete B C
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
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							1, // Skip A
							{ type: "Delete", id: 0, count: 2 },
						],
					},
				}],
			},
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			moves: [{ id: 0, src: { foo: 2 }, dst: { bar: 0 } }],
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							2, // Skip A B
							{ type: "Move", id: 0, count: 2 },
						],
						affixes: [
							5, // Before C
							{ count: 4, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							[{ type: "Move", id: 0, count: 2 }],
						],
					},
				}],
			},
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							6, // After C
							[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
						],
					},
				}],
			},
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
			marks: {
				modifyI: [{
					foo: {
						tombs: [1, { count: 2, seq: 1, id: 1 } ],
						nodes: [
							2, // Skip A B
							{ type: "Move", id: 0, count: 2 },
						],
						affixes: [
							5, // Before C
							{ count: 4, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							[{ type: "Move", id: 0, count: 1 }],
						],
					},
				}],
			},
		}],
	};

	export const e3_r_e1: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 1,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						tombs: [1, { count: 2, seq: 1, id: 1 } ],
						attach: [
							6, // After C
							[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
						],
					},
				}],
			},
		}],
	};

	export const e3p: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 2,
		frames: [{
			marks: {
				modifyI: [{
					bar: {
						attach: [
							[{
								type: "Portal",
								seq: 2,
								id: 1,
								tombs: [{ count: 2, seq: 1, id: 1 } ],
								attach: [
									2, // After C
									[{
										type: "Insert",
										id: 0,
										content: [{ id: "X" }],
										heed: Effects.All,
									}],
								],
							}],
						],
					},
				}],
			},
		}],
	};
}

export namespace ScenarioB {
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
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Delete", id: 0 , count: 4 },
						],
					},
				}],
			},
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							2, // After A
							[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							4, // After B
							[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e2p: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						tombs: [{ count: 4, seq: 1, id: 1 }],
						attach: [
							2, // After A
							[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e3_r_e1: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						tombs: [{ count: 4, seq: 1, id: 1 }],
						attach: [
							4, // After B
							[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e3p: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						tombs: [
							{ count: 1, seq: 1, id: 1 },
							1, // X
							{ count: 3, seq: 1, id: 1 },
						],
						attach: [
							4, // After B
							[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
						],
					},
				}],
			},
		}],
	};
}

export namespace ScenarioC {
	/**
	 * In trait foo [A]:
	 * User 1: set-delete A
	 * User 1: undo
	 * User 2: set-delete A
	 * User 3: set-delete A
	 *
	 * A should be deleted by user 2's edit.
	 * User 3's edit should be muted.
	 */

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Delete", id: 0 , count: 1 },
						],
					},
				}],
			},
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						tombs: [{ count: 1, seq: 1, id: 0 }],
						nodes: [
							{ type: "Revive", id: 0 , count: 1 },
						],
					},
				}],
			},
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Delete", id: 0 , count: 1 },
						],
					},
				}],
			},
		}],
	};

	export const e3_r_e1: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 1,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						tombs: [{ count: 1, seq: 1, id: 0 }],
						nodes: [
							{ type: "Delete", id: 0 , count: 1 },
						],
					},
				}],
			},
		}],
	};

	export const e3p: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Delete", id: 0 , count: 1 },
						],
					},
				}],
			},
		}],
	};

	export const e4: S.Transaction = {
		ref: 0,
		seq: 4,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Delete", id: 0 , count: 1 },
						],
					},
				}],
			},
		}],
	};

	export const e4_r_e1: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 1,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						tombs: [{ count: 1, seq: 1, id: 0 }],
						nodes: [
							{ type: "Delete", id: 0 , count: 1 },
						],
					},
				}],
			},
		}],
	};

	export const e4_r_e2: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 2,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Delete", id: 0 , count: 1 },
						],
					},
				}],
			},
		}],
	};

	export const e4p: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 3,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						tombs: [{ count: 1, seq: 1, id: 0 }],
						nodes: [
							{ type: "Delete", id: 0 , count: 1 },
						],
					},
				}],
			},
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
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							1, // Skip A
							{ type: "Move", id: 0, count: 1 },
						],
						affixes: [
							3,
							{ count: 1, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							[{ type: "Move", id: 0, count: 1 }],
						],
					},
				}],
			},
		}],
	};

	export const e2: S.Transaction = {
		seq: 2,
		ref: 0,
		frames: [{
			moves: [{ id: 0, src: { foo: 0 }, dst: { baz: 0 } }],
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 3 },
						],
					},
					baz: {
						attach: [
							[
								{ type: "Move", id: 0, count: 2 },
								{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.Move },
								{ type: "Move", id: 0, count: 1 },
							],
						],
					},
				}],
			},
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			moves: [{ id: 0, src: { foo: 0 }, dst: { baz: 0 } }],
			marks: {
				modifyI: [{
					foo: {
						tombs: [
							1,
							{ seq: 1, id: 0, count: 1 }, // B
						],
						nodes: [
							{ type: "Move", id: 0, count: 3 },
						],
					},
					baz: {
						attach: [
							[
								{ type: "Move", id: 0, count: 2 },
								{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.Move },
								{ type: "Move", id: 0, count: 1 },
							],
						],
					},
				}],
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

	B should be deleted (as opposed to inserted in trait bar).
	*/

	export const e1: S.Transaction = {
		seq: 1,
		ref: 0,
		frames: [{
			moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							1, // Skip A
							{ type: "Move", id: 0, count: 1 },
						],
						affixes: [
							3,
							{ count: 1, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							[{ type: "Move", id: 0, count: 1 }],
						],
					},
				}],
			},
		}],
	};

	export const e2: S.Transaction = {
		seq: 2,
		ref: 0,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Delete", id: 0, count: 3 },
						],
						affixes: [
							{ count: 8, stack: [{ type: "Scorch", id: 0 }] },
						],
					},
				}],
			},
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						tombs: [
							1,
							{ seq: 1, id: 0, count: 1 }, // B
						],
						nodes: [
							{ type: "Delete", id: 0, count: 3 },
						],
						affixes: [
							{ count: 8, stack: [{ type: "Scorch", id: 0 }] },
						],
					},
				}],
			},
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
			marks: {
				modifyI: [{
					foo: {
						attach: [
							[{ type: "Insert", id: 0, content: [{ id: "r" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							2, // After A
							[{ type: "Insert", id: 0, content: [{ id: "x" }, { id: "z" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							4, // After x
							[{ type: "Insert", id: 0, content: [{ id: "y" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e3d: R.ChangeFrame = {
		marks: {
			modifyI: [{
				foo: {
					attach: [
						[{ type: "Insert", id: 0, content: [{ id: "r" }] }],
					],
				},
			}],
		},
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							4, // After A
							[{ type: "Insert", id: 0, content: [{ id: "x" }, { id: "z" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e3p: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 2,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							6, // After x
							[{ type: "Insert", id: 0, content: [{ id: "y" }] }],
						],
					},
				}],
			},
		}],
	};

	export const originals = [e1, e2, e3];
}

export namespace ScenarioG {
	/*
	In trait foo [A B]:
	  User 1: move slice [A B] to some other trait bar
	  User 2: insert [X Y] after A (with commutative-move semantics) (local: [A X Y B])
	  User 2: insert N after X (with never-move semantics) (local: [A X N Y B])
	  User 2: insert M before X (with never-move semantics) (local: [A M X N Y B])
	  User 2: insert O after Y (with never-move semantics) (local: [A M X N Y O B])

	X Y should be inserted to into the bar trait.
	M N O  should be inserted to into the foo trait (in that order).
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 2 },
						],
						affixes: [
							{ count: 6, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							[{ type: "Move", id: 0, count: 2 }],
						],
					},
				}],
			},
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							2, // After A
							[{
								type: "Insert",
								id: 0,
								content: [{ id: "X" }, { id: "Y" }],
								heed: Effects.Move,
							}],
						],
					},
				}],
			},
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							4, // After X
							[{ type: "Insert", id: 0, content: [{ id: "N" }], heed: Effects.None }],
						],
					},
				}],
			},
		}],
	};

	export const e4: S.Transaction = {
		ref: 0,
		seq: 4,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							3, // Before X
							[{ type: "Insert", id: 0, content: [{ id: "M" }], heed: Effects.None }],
						],
					},
				}],
			},
		}],
	};

	export const e5: S.Transaction = {
		ref: 0,
		seq: 5,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							10, // After Y
							[{ type: "Insert", id: 0, content: [{ id: "O" }], heed: Effects.None }],
						],
					},
				}],
			},
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			marks: {
				modifyI: [{
					bar: {
						attach: [
							2, // After A
							[{
								type: "Insert",
								id: 0,
								content: [{ id: "X" }, { id: "Y" }],
								heed: Effects.Move,
							}],
						],
					},
				}],
			},
		}],
	};

	export const e3d: R.ChangeFrame = {
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: {
			modifyI: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 4 }, // A X Y B
					],
					affixes: [
						{ count: 10, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						[{ type: "Move", id: 0, count: 4 }],
					],
				},
			}],
		},
	};

	export const e3p: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 2,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						tombs: [
							{ count: 1, seq: 1, id: 0 }, // A
							{ count: 2, seq: [1, 2], id: 0 }, // X Y
							{ count: 1, seq: 1, id: 0 }, // B
						],
						attach: [
							4, // After X
							[{ type: "Insert", id: 0, content: [{ id: "N" }], heed: Effects.None }],
						],
					},
				}],
			},
		}],
	};

	export const e4d: R.ChangeFrame = {
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: {
			modifyI: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 2 }, // A X
						1, // N
						{ type: "Move", id: 0, count: 2 }, // Y B
					],
					affixes: [
						{ count: 5, stack: [{ type: "Forward", id: 0 }] },
						2, // Before and After N
						{ count: 5, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						[{ type: "Move", id: 0, count: 4 }],
					],
				},
			}],
		},
	};

	export const e4p: S.Transaction = {
		seq: 4,
		ref: 0,
		newRef: 3,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						tombs: [
							{ count: 1, seq: [1, 2], id: 0 }, // X
							1, // N
							{ count: 1, seq: [1, 2], id: 0 }, // Y
						],
						attach: [
							1, // Before X
							[{ type: "Insert", id: 0, content: [{ id: "M" }], heed: Effects.None }],
						],
					},
				}],
			},
		}],
	};

	export const e5d: R.ChangeFrame = {
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: {
			modifyI: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 1 }, // A
						1, // M
						{ type: "Move", id: 0, count: 1 }, // X
						1, // N
						{ type: "Move", id: 0, count: 2 }, // Y B
					],
					affixes: [
						{ count: 3, stack: [{ type: "Forward", id: 0 }] },
						2, // Before and After M
						{ count: 2, stack: [{ type: "Forward", id: 0 }] },
						2, // Before and After N
						{ count: 5, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						[{ type: "Move", id: 0, count: 4 }],
					],
				},
			}],
		},
	};

	export const e5p: S.Transaction = {
		seq: 5,
		ref: 0,
		newRef: 3,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						tombs: [
							1, // M
							{ count: 1, seq: [1, 2], id: 0 }, // X
							1, // N
							{ count: 1, seq: [1, 2], id: 0 }, // Y (maybe omit this)
						],
						attach: [
							8, // After Y
							[{ type: "Insert", id: 0, content: [{ id: "O" }], heed: Effects.None }],
						],
					},
				}],
			},
		}],
	};

	export const originals = [e1, e2, e3, e4, e5];
}

export namespace ScenarioH {
	/**
	Starting state: foo=[A B] bar=[U V] baz=[]
	  User 1: slice-move all of trait foo after U with a (non-commutative)
	  User 2: slice-move all of trait bar into trait baz
	  User 3: insert X after A in foo (commutative)

	X should end up in bar (with A and B).
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 2 },
						],
						affixes: [
							{ count: 6, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							2, // After U
							[{ type: "Move", id: 0, count: 2 }],
						],
					},
				}],
			},
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			moves: [{ id: 0, src: { bar: 0 }, dst: { baz: 0 } }],
			marks: {
				modifyI: [{
					bar: {
						nodes: [
							{ type: "Move", id: 0, count: 2 },
						],
						affixes: [
							{ count: 6, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					baz: {
						attach: [
							[{ type: "Move", id: 0, count: 2 }],
						],
					},
				}],
			},
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							2, // After A
							[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
						],
					},
				}],
			},
		}],
	};

	export const e2p: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		frames: [{
			moves: [{ id: 0, src: { bar: 0 }, dst: { baz: 0 } }],
			marks: {
				modifyI: [{
					bar: {
						nodes: [
							{ type: "Move", id: 0, count: 1 },
							2, // A B
							{ type: "Move", id: 0, count: 1 },
						],
						affixes: [
							{ count: 3, stack: [{ type: "Forward", id: 0 }] },
							4,
							{ count: 3, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					baz: {
						attach: [
							[{ type: "Move", id: 0, count: 2 }],
						],
					},
				}],
			},
		}],
	};

	export const e3_r_e1: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 1,
		frames: [{
			marks: {
				modifyI: [{
					bar: {
						attach: [
							4, // After A
							[{
								type: "Portal",
								seq: 1,
								id: 0,
								heed: Effects.None,
								attach: [
									[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
								],
							}],
						],
					},
				}],
			},
		}],
	};

	export const e3p: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		frames: [{
			marks: {
				modifyI: [{
					bar: {
						attach: [
							2, // After A
							[{
								type: "Portal",
								seq: 1,
								id: 0,
								heed: Effects.None,
								attach: [
									[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
								],
							}],
						],
					},
				}],
			},
		}],
	};
}

export namespace ScenarioI {
	/**
	Starting state: foo=[A B] bar=[X Y]
	  User 1: slice-move all of trait foo after X with a commutative attach
	  User 2: slice-move all of trait bar after A with a commutative attach

	Option 1: The first edit should apply but not the second.
		foo: []
		bar: [X A B Y]

	Option 2: They both apply but a "don't chase your own tail" rule us applied.
	This rule would also make sense if we allowed slice ranges to move inside themselves.
		foo: []
		bar: [X A B Y]

	Option 3: They both apply but the second move's commutativity is ignored.
		foo: [X A B Y]
		bar: []

	Option 4: The slice-ness of edit 2 is applied to determine that A and B should be moved as
	well. Then the commutativity of edits 2 is taken into account, at which point the destination
	of the first move is still considered to be in bar.
		foo: []
		bar: [X A B Y]

	Even though some of the outcomes are the same, there seems to be semantic differences between
	options 1, 3, 4. A longer cycles (involving a baz trait might make that clearer).
	The semantic difference may be about whether the destination of the move is changed, or whether
	it is preserved, but the content that it brought is affected.
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 2 },
						],
						affixes: [
							{ count: 6, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							[{ type: "Move", id: 0, count: 2 }],
						],
					},
				}],
			},
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			moves: [{ id: 0, src: { bar: 0 }, dst: { foo: 0 } }],
			marks: {
				modifyI: [{
					bar: {
						nodes: [
							{ type: "Move", id: 0, count: 2 },
						],
						affixes: [
							{ count: 6, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					foo: {
						attach: [
							[{ type: "Move", id: 0, count: 2 }],
						],
					},
				}],
			},
		}],
	};
}

export namespace ScenarioJ {
	/**
	Starting with a trait foo that contains the nodes [A B C]:
	  User 1: set-delete node B
	  User 2: slice-move all of trait foo to trait bar
	  User 3: insert Y after B (LLW commutative)
	  User 4: insert X after A (LLW commutative)

	Expected outcome: foo=[] bar=[A, X, Y, C]
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							1, // A
							{ type: "Delete", id: 0, count: 1 },
						],
					},
				}],
			},
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 3 },
						],
						affixes: [
							{ count: 8, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							[{ type: "Move", id: 0, count: 3 }],
						],
					},
				}],
			},
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							4, // After B
							[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e4: S.Transaction = {
		ref: 0,
		seq: 4,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							2, // After A
							[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
						],
					},
				}],
			},
		}],
	};
}

export const allOriginals = [
	...ScenarioA1.originals,
	...ScenarioF.originals,
	...ScenarioG.originals,
];
