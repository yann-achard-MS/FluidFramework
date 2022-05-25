/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Effects, Rebased as R, Sequenced as S, Tiebreak } from "../format";

export namespace InsertRoot {
/**
 * This scenario demonstrates how to represent a change that inserts a root tree.
 */
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
/**
 * This scenario demonstrates how to represent a change that swaps a pair of nodes from different
 * traits.
 */
	export const e1: R.ChangeFrame = {
		moves: [
			{ id: 0, src: { foo: 0 }, dst: { bar: 0 } },
			{ id: 1, src: { bar: 0 }, dst: { foo: 0 } },
		],
		marks: {
			modifyOld: [{
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
/**
 * This scenario demonstrates how to represent a change that swaps a node and its child.
 *
 * From: R{ foo: B{ bar: C{ baz: D } } }
 * To:   R{ foo: C{ bar: B{ baz: D } } }
 */
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
			modifyOld: [{
				foo: {
					nodes: [{ type: "Move", id: 0, count: 1 }],
					modifyOld: [{
						bar: {
							nodes: [{ type: "Move", id: 1, count: 1 }],
							modifyOld: [{
								baz: {
									nodes: [{ type: "Move", id: 2, count: 1 }],
								},
							}],
						},
					}],
					attach: [
						[{ type: "Move", id: 1, count: 1 }],
					],
					modifyNew: [{
						bar: {
							attach: [
								[{ type: "Move", id: 0, count: 1 }],
							],
							modifyNew: [{
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

export namespace ScenarioA {
	/**
	This scenario demonstrates the need to use tombstones in order to precisely describe the
	extent of slice ranges that cover concurrently deleted content.

	Without a tombstone to represent B and C, the slice range [C D] would not include the gap
	between B and C, which would leave the insertion of X unaffected by the slice.

	Starting state foo=[A B C D]
	User 1: set-delete B C
	User 2: move slice-like range B C D to some other trait bar
	User 3: insert X before C (commutative)

	Expected outcome: foo=[A] bar=[X D]
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: {
				modifyOld: [{
					foo: {
						nodes: [
							1, // A
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
				modifyOld: [{
					foo: {
						nodes: [
							1, // A
							{ type: "Move", id: 0, count: 3 },
						],
						gaps: [
							2,
							{ count: 2, stack: [{ type: "Forward", id: 0 }] },
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
				modifyOld: [{
					foo: {
						attach: [
							2,
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
				modifyOld: [{
					foo: {
						tombs: [1, { count: 2, seq: 1, id: 1 } ],
						nodes: [
							1, // A
							{ type: "Move", id: 0, count: 3 },
						],
						gaps: [
							2,
							{ count: 2, stack: [{ type: "Forward", id: 0 }] },
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
				modifyOld: [{
					foo: {
						tombs: [1, { count: 2, seq: 1, id: 1 } ],
						attach: [
							2,
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
				modifyOld: [{
					bar: {
						tombs: [
							{ count: 2, seq: 1, id: 0 },
						],
						attach: [
							1,
							[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
						],
					},
				}],
			},
		}],
	};

	export const originals = [e1, e2, e3];
}

export namespace ScenarioB {
	/**
	 * This scenario demonstrates the need for tombstones in order for multiple concurrent inserts
	 * to be ordered corrected with respect to one another.
	 *
	 * Starting state: foo=[A B C D E]
	 * U1: set-delete whole trait
	 * U2: insert W before B and Y before D
	 * U3: insert X before C and Z before E
	 * Expected outcome: foo=[W X Y Z]
	 */
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: {
				modifyOld: [{
					foo: {
						nodes: [
							{ type: "Delete", id: 0 , count: 5 },
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
				modifyOld: [{
					foo: {
						attach: [
							1,
							[{ type: "Insert", id: 0, content: [{ id: "W" }] }],
							1,
							[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
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
				modifyOld: [{
					foo: {
						attach: [
							2,
							[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
							1,
							[{ type: "Insert", id: 0, content: [{ id: "Z" }] }],
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
				modifyOld: [{
					foo: {
						tombs: [{ count: 5, seq: 1, id: 0 }],
						attach: [
							1,
							[{ type: "Insert", id: 0, content: [{ id: "W" }] }],
							1,
							[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
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
				modifyOld: [{
					foo: {
						tombs: [{ count: 5, seq: 1, id: 0 }],
						attach: [
							2,
							[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
							1,
							[{ type: "Insert", id: 0, content: [{ id: "Z" }] }],
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
				modifyOld: [{
					foo: {
						tombs: [
							{ count: 1, seq: 1, id: 0 },
							1, // W
							{ count: 2, seq: 1, id: 0 },
							1, // Y
							{ count: 1, seq: 1, id: 0 },
						],
						attach: [
							3, // [-A-W-B
							[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
							2, // C-Y-D
							[{ type: "Insert", id: 0, content: [{ id: "Z" }] }],
						],
					},
				}],
			},
		}],
	};
}

export namespace ScenarioC {
	/**
	 * This scenario demonstrates how multiple deletes of the same node interact.
	 * Specifically, it shows that it is not necessary for a deletion to keep a list of all prior
	 * deletes that targeted the same node. It is sufficient to only recall the first prior delete.
	 *
	 * In trait foo [A]:
	 * E1: User 1: set-delete A
	 * E2: User 1: undo
	 * E3: User 2: set-delete A
	 * E4: User 3: set-delete A
	 *
	 * Expected outcome: foo=[]
	 * A should be deleted by user 2's edit.
	 * User 3's edit should be muted.
	 */

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: {
				modifyOld: [{
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
				modifyOld: [{
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
				modifyOld: [{
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
				modifyOld: [{
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
				modifyOld: [{
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
				modifyOld: [{
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
		seq: 4,
		newRef: 1,
		frames: [{
			marks: {
				modifyOld: [{
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
		seq: 4,
		newRef: 2,
		frames: [{
			marks: {
				modifyOld: [{
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
		seq: 4,
		newRef: 3,
		frames: [{
			marks: {
				modifyOld: [{
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

export namespace ScenarioE {
	/*
	This scenario demonstrates how subsequent changes within the same commit affect prior changes
	in the same commit even if concurrent changes sequenced prior would also affect those prior
	changes. One could say subsequent changes within the same commit trump concurrent changes in
	that respect.

	In trait foo [A B]:
	  User 1: move slice A[_]B to some other trait bar
	  User 2 in one commit:
	    insert X before B (with commutative-move semantics)
	    delete slice-like range [A X B]

	Expected outcome: foo=[] bar=[]
	X is deleted (as opposed to inserted in trait bar).
	*/

	export const e1: S.Transaction = {
		seq: 1,
		ref: 0,
		frames: [{
			moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
			marks: {
				modifyOld: [{
					foo: {
						gaps: [
							1,
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
				modifyOld: [{
					foo: {
						nodes: [
							{ type: "Delete", id: 0, count: 2 },
						],
						gaps: [
							1,
							{ count: 1, stack: [{ type: "Scorch", id: 0 }] },
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
				modifyOld: [{
					foo: {
						nodes: [
							{ type: "Delete", id: 0, count: 2 },
						],
						gaps: [
							1,
							{ count: 1, stack: [{ type: "Scorch", id: 0 }] },
						],
					},
				}],
			},
		}],
	};
}

export namespace ScenarioF {
	/*
	starting state: [A B] (known to both client 1 and client 2)
	  Edit #1 by client 1: insert [r] at index 0 (local state: [r A B])
	  Edit #2 by client 2: insert [xz] at index 1 (local state: [A x z B])
	  Edit #3 by client 2: insert [y] at index 2 (local state: [A x y z B])

	Expected outcome: [r A x y z B]
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: {
				modifyOld: [{
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
				modifyOld: [{
					foo: {
						attach: [
							1,
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
				modifyOld: [{
					foo: {
						attach: [
							2,
							[{ type: "Insert", id: 0, content: [{ id: "y" }] }],
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
				modifyOld: [{
					foo: {
						attach: [
							2,
							[{ type: "Insert", id: 0, content: [{ id: "x" }, { id: "z" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e3d: R.ChangeFrame = {
		marks: {
			modifyOld: [{
				foo: {
					attach: [
						[{ type: "Insert", id: 0, content: [{ id: "r" }] }],
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
				modifyOld: [{
					foo: {
						attach: [
							3,
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
	This scenario demonstrates the need to have tombstones for moved-out content.
	It is also a testing ground for the rebasing of dependent changes.

	In trait foo [A B]:
	  E1: User 1: move slice [A B] to some other trait bar
	  E2: User 2: insert [X Y] before B (commute:move) (local: [A X Y B])
	  E3: User 2: insert N before Y (commute:none) (local: [A X N Y B])
	  E4: User 2: insert M before X (commute:none) (local: [A M X N Y B])
	  E5: User 2: insert O before B (commute:none) (local: [A M X N Y O B])

	Expected outcome: foo=[M N O] bar=[A X Y B]
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
			marks: {
				modifyOld: [{
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 2 },
						],
						gaps: [
							1,
							{ count: 1, stack: [{ type: "Forward", id: 0 }] },
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
				modifyOld: [{
					foo: {
						attach: [
							1,
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
				modifyOld: [{
					foo: {
						attach: [
							2,
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
				modifyOld: [{
					foo: {
						attach: [
							1, // Before X
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
				modifyOld: [{
					foo: {
						attach: [
							5,
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
				modifyOld: [{
					bar: {
						attach: [
							1,
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
			modifyOld: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 4 }, // A X Y B
					],
					gaps: [
						1,
						{ count: 3, stack: [{ type: "Forward", id: 0 }] },
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
				modifyOld: [{
					foo: {
						tombs: [
							{ count: 1, seq: 1, id: 0 }, // A
							{ count: 2, seq: [1, 2], id: 0 }, // X Y
							{ count: 1, seq: 1, id: 0 }, // B
						],
						attach: [
							2,
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
			modifyOld: [{
				foo: {
					tombs: [
						2, // A X
						{ count: 1, seq: 1, id: 0 }, // synthetic tombstone (ST)
						1, // N
						{ count: 1, seq: 1, id: 0 }, // synthetic tombstone (ST)
					],
					nodes: [
						{ type: "Move", id: 0, count: 2 }, // A X
						3, // ST N ST
						{ type: "Move", id: 0, count: 2 }, // Y B
					],
					gaps: [
						1, // [-A
						{ count: 2, stack: [{ type: "Forward", id: 0 }] }, // A-X-ST
						2, // ST-N-ST
						{ count: 2, stack: [{ type: "Forward", id: 0 }] }, // ST-B-Y
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
				modifyOld: [{
					foo: {
						tombs: [
							{ count: 1, seq: [1, 2], id: 0 }, // X
							1, // N
							{ count: 1, seq: [1, 2], id: 0 }, // Y
						],
						attach: [
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
			modifyOld: [{
				foo: {
					tombs: [
						1, // A
						{ count: 1, seq: 1, id: 0 }, // synthetic tombstone (ST1)
						1, // M
						{ count: 1, seq: 1, id: 0 }, // synthetic tombstone (ST2)
						1, // X
						{ count: 1, seq: 1, id: 0 }, // synthetic tombstone (ST3)
						1, // N
						{ count: 1, seq: 1, id: 0 }, // synthetic tombstone (ST4)
					],
					nodes: [
						{ type: "Move", id: 0, count: 1 }, // A
						3, // ST M ST
						{ type: "Move", id: 0, count: 1 }, // X
						3, // ST N ST
						{ type: "Move", id: 0, count: 2 }, // Y B
					],
					gaps: [
						1, // [-A
						{ count: 1, stack: [{ type: "Forward", id: 0 }] }, // A-ST1
						2, // ST1-M-ST2
						{ count: 2, stack: [{ type: "Forward", id: 0 }] }, // ST2-X-ST3
						2, // ST3-N-ST4
						{ count: 2, stack: [{ type: "Forward", id: 0 }] }, // ST4-B-Y
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
				modifyOld: [{
					foo: {
						tombs: [
							1, // M
							{ count: 1, seq: [1, 2], id: 0 }, // X
							1, // N
							{ count: 1, seq: [1, 2], id: 0 }, // Y
						],
						attach: [
							4,
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
	This scenario demonstrates how commutative inserts are only affected by the slice range they
	fall within, as opposed to also being affected by slice range that a the slice range they fall
	within falls within. It is up to the slice-range the insert falls within to determine whether
	it commutes with a slice range at its destination, thus indirectly affecting the final location
	of the insert.

	Starting state: foo=[A B] bar=[U V] baz=[]
	  User 1: slice-move all of trait foo before V with a (commute:all)
	  User 2: slice-move all of trait bar into trait baz
	  User 3: insert X before B and insert Y before the end in foo (commute:all)

	Expected outcome: foo=[] bar=[A X B Y] baz=[U V]
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 1 } }],
			marks: {
				modifyOld: [{
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 2 },
						],
						gaps: [
							{ count: 3, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							1,
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
				modifyOld: [{
					bar: {
						nodes: [
							{ type: "Move", id: 0, count: 2 },
						],
						gaps: [
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

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: {
				modifyOld: [{
					foo: {
						attach: [
							1,
							[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
							[{ type: "Insert", id: 0, content: [{ id: "Y" }], heed: Effects.All }],
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
				modifyOld: [{
					bar: {
						tombs: [
							1, // U
							{ count: 1, seq: 1, id: 0 }, // synthetic tombstone (ST1)
							2,// A B
							{ count: 1, seq: 1, id: 0 }, // synthetic tombstone (ST2)
						],
						nodes: [
							{ type: "Move", id: 0, count: 1 },
							4, // ST1 A B ST2
							{ type: "Move", id: 0, count: 1 },
						],
						gaps: [
							{ count: 3, stack: [{ type: "Forward", id: 0 }] }, // [-U-A-ST1
							3, // ST1-A-B-ST2
							{ count: 3, stack: [{ type: "Forward", id: 0 }] }, // ST2-B-V-[
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
				modifyOld: [{
					bar: {
						attach: [
							2, // [-U-A
							[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
							[{ type: "Insert", id: 0, content: [{ id: "Y" }], heed: Effects.All }],
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
				modifyOld: [{
					bar: {
						attach: [
							1, // [-A
							[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
							[{ type: "Insert", id: 0, content: [{ id: "Y" }], heed: Effects.All }],
						],
					},
				}],
			},
		}],
	};
}

export namespace ScenarioI {
	/**
	This scenario demonstrates the possibility of creating a circular interaction between slice moves.

	Starting state: foo=[A B] bar=[X Y]
	  User 1: slice-move all of trait foo before Y with a commutative attach
	  User 2: slice-move all of trait bar before B with a commutative attach

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
			moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 1 } }],
			marks: {
				modifyOld: [{
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 2 },
						],
						gaps: [
							{ count: 6, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							1,
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
			moves: [{ id: 0, src: { bar: 0 }, dst: { foo: 1 } }],
			marks: {
				modifyOld: [{
					bar: {
						nodes: [
							{ type: "Move", id: 0, count: 2 },
						],
						gaps: [
							{ count: 6, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					foo: {
						attach: [
							1,
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
	This scenario demonstrates the need to replicate tombstone information when inserting into at
	the destination of a slice-move.
	Starting with a trait foo that contains the nodes [A B C]:
	  1. User 1: set-delete node B
	  2. User 2: slice-move _[A B C]_ to trait bar
	  3. User 3: insert Y after B (LLW commutative)
	  4. User 4: insert X before B (LLW commutative)
	  5. User 5: insert W after A (FFW) and insert Z before C (FFW) (with knowledge with e1 and e2)

	Expected outcome: foo=[] bar=[A W X Y Z C]
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: {
				modifyOld: [{
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
				modifyOld: [{
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 3 },
						],
						gaps: [
							1,
							{ count: 2, stack: [{ type: "Forward", id: 0 }] },
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
				modifyOld: [{
					foo: {
						attach: [
							2,
							[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Left }],
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
				modifyOld: [{
					foo: {
						attach: [
							1,
							[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e5: S.Transaction = {
		ref: 2, // With knowledge with e1 and e2
		seq: 5,
		frames: [{
			marks: {
				modifyOld: [{
					bar: {
						attach: [
							1,
							[
								{ type: "Insert", id: 0, content: [{ id: "W" }], tiebreak: Tiebreak.Left },
								{ type: "Insert", id: 0, content: [{ id: "Z" }] },
							],
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
			moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
			marks: {
				modifyOld: [{
					foo: {
						tombs: [1, { count: 1, seq: 1, id: 0 }],
						nodes: [
							{ type: "Move", id: 0, count: 3 },
						],
						gaps: [
							1,
							{ count: 2, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							[{ type: "Move", id: 0, count: 3 }], // Count is not updated
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
				modifyOld: [{
					foo: {
						tombs: [1, { count: 1, seq: 1, id: 0 }],
						attach: [
							2,
							[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Left }],
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
				modifyOld: [{
					bar: {
						tombs: [1, { count: 1, seq: 1, id: 0, src: [{ seq: 2, id: 0 }] }],
						attach: [
							2,
							[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Left }],
						],
					},
				}],
			},
		}],
	};

	export const e4_r_e1: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 1,
		frames: [{
			marks: {
				modifyOld: [{
					foo: {
						tombs: [1, { count: 1, seq: 1, id: 0 }],
						attach: [
							1,
							[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e4_r_e2: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 2,
		frames: [{
			marks: {
				modifyOld: [{
					bar: {
						tombs: [1, { count: 1, seq: 1, id: 0, src: [{ seq: 2, id: 0 }] }],
						attach: [
							1,
							[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e4p: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 3,
		frames: [{
			marks: {
				modifyOld: [{
					bar: {
						tombs: [
							1,
							{ count: 1, seq: 1, id: 0, src: [{ seq: 2, id: 0 }] },
							1, // Y
							{ count: 1, seq: 1, id: 0, src: [{ seq: 2, id: 0 }] },
						],
						attach: [
							1,
							[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e5_r_e3: S.Transaction = {
		ref: 2,
		seq: 5,
		newRef: 3,
		frames: [{
			marks: {
				modifyOld: [{
					bar: {
						attach: [
							1,
							[{ type: "Insert", id: 0, content: [{ id: "W" }], tiebreak: Tiebreak.Left }],
							[{ type: "Insert", id: 0, content: [{ id: "Z" }] }],
						],
					},
				}],
			},
		}],
	};

	export const e5p: S.Transaction = {
		ref: 2,
		seq: 5,
		newRef: 4,
		frames: [{
			marks: {
				modifyOld: [{
					bar: {
						attach: [
							1,
							[{ type: "Insert", id: 0, content: [{ id: "W" }], tiebreak: Tiebreak.Left }],
							1, // X-Y
							[{ type: "Insert", id: 0, content: [{ id: "Z" }] }],
						],
					},
				}],
			},
		}],
	};
}

export namespace ScenarioK {
	/**
	This scenario attempts but fails to demonstrate the need to differentiate tombstone replicas
	that are introduced by slice moves from their originals.

	Without this differentiation, the two tombstones in e3p would look the same, but it's not clear
	that this is a problem. Indeed, it could only be an issue if a change could be manufactured
	such that it contains only one of the two replicas. This would be an issue because when
	rebasing such a change over a change such as e3p, we wouldn't be able to tell which of the two
	tombstones in ep3 that change contains.
	It seems impossible to manufacture such a change:
	- The only way to have only one of two tombstones for a trait is to not be concurrent to the
	prior change that introduced the older tombstone. This is because we have a rule that a change
	that uses a tombstone in a trait must also carry all subsequently created tombstones for that
	trait.
	- If the change we're trying to create doesn't know about the set-delete operation then it does
	not need to carry tombstone information for A's replica introduced by the slice move.

	Starting state foo=[A]:
	User 1: set-delete node A
	User 2: slice-move [A-] to the start of trait foo
	User 3:
	  - insert X at the end of foo (commute:move)
	  - insert Y at the end of foo (commute:none)

	Expected outcome: foo=[A X C Y]
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: {
				modifyOld: [{
					foo: {
						nodes: [
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
			moves: [{ id: 0, src: { foo: 0 }, dst: { foo: 0 } }],
			marks: {
				modifyOld: [{
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 1 },
						],
						gaps: [
							1,
							{ count: 1, stack: [{ type: "Forward", id: 0 }] },
						],
						attach: [
							[{ type: "Move", id: 0, count: 1 }],
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
				modifyOld: [{
					foo: {
						attach: [
							1,
							[
								{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.Move },
								{ type: "Insert", id: 1, content: [{ id: "Y" }], heed: Effects.None },
							],
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
			moves: [{ id: 0, src: { foo: 0 }, dst: { foo: 0 } }],
			marks: {
				modifyOld: [{
					foo: {
						tombs: [{ count: 1, seq: 1, id: 0 }],
						nodes: [
							{ type: "Move", id: 0, count: 1 },
						],
						gaps: [
							1,
							{ count: 1, stack: [{ type: "Forward", id: 0 }] },
						],
						attach: [
							[{ type: "Move", id: 0, count: 1 }], // Count is not updated
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
				modifyOld: [{
					foo: {
						tombs: [{ count: 1, seq: 1, id: 0 }],
						attach: [
							1,
							[
								{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.Move },
								{ type: "Insert", id: 1, content: [{ id: "Y" }], heed: Effects.None },
							],
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
				modifyOld: [{
					foo: {
						tombs: [
							{ count: 1, seq: 1, id: 0, src: [{ seq: 2, id: 0 }] },
							{ count: 1, seq: 1, id: 0 },
						],
						attach: [
							1, // [-A2
							[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.Move }],
							[{ type: "Insert", id: 1, content: [{ id: "Y" }], heed: Effects.None }],
						],
					},
				}],
			},
		}],
	};
}

export namespace ScenarioL {
	/**
	This scenario demonstrates that two different tombstones can have originated from the same edit
	(E1), been first replicated by the same slice-move (E2), been last replicated by the same
	slice-move (E4) yet be targeted by different concurrent inserts that end up in the same trait
	and therefore need to be able to distinguish one replica from the other, and order them properly.
	This entails that recording information about the original edit, and the first
	and/or last replication edits is not enough to tell apart all tombstones.

	Note how the slice-moves in E3 flip the order of X and Y. This is done to help distinguish
	designs where the two tombstones are successfully told apart from designs where they are not.
	Indeed, without this flip, they would have the same outcome.

	Starting with traits foo=[A B], bar=[], baz=[], qux=[]:
	  E1: User 1: set-delete nodes A B
	  E2: User 2: slice-move all of foo to the start of trait bar
	  E3: User 2:
	    slice-move foo [_A] to the end of trait baz
	    slice-move foo [B_] to the start of trait baz
	  E4: User 2: slice-move all of baz to the start of trait qux
	  E5: User 3: insert X after B (LLW commutative)
	  E6: User 3: insert Y before A (LLW commutative)

	Expected outcome: qux=[X Y]
	*/
}

export namespace ScenarioM {
/*
	This scenario demonstrates the need for changesets to record all the tombstones for each field
	that they are targeting.
	In this scenario, if each insert changeset only stored the tombstone that is relevant to its
	insert's target location then, when rebasing edit 4 over edit 3, we wouldn't know how to order
	the tombstone for A relative to the tombstone for B.

	Starting state: foo=[A B C]
	User 1: set-delete A
	User 2: set-delete B
	User 3: insert X before B
	User 4: insert Y before C

	Expected outcome: foo=[X Y C]
*/

export const e1: S.Transaction = {
	ref: 0,
	seq: 1,
	frames: [{
		marks: {
			modifyOld: [{
				foo: {
					nodes: [
						{  type: "Delete", id: 0, count: 1 },
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
			modifyOld: [{
				foo: {
					nodes: [
						1, // A
						{  type: "Delete", id: 0, count: 1 },
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
			modifyOld: [{
				foo: {
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
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
			modifyOld: [{
				foo: {
					attach: [
						2,
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
			modifyOld: [{
				foo: {
					nodes: [
						{  type: "Delete", id: 0, count: 1 },
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
			modifyOld: [{
				foo: {
					tombs: [{ count: 1, seq: 1, id: 0 }],
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
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
			modifyOld: [{
				foo: {
					tombs: [{ count: 1, seq: 1, id: 0 }, { count: 1, seq: 2, id: 0 }],
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
					],
				},
			}],
		},
	}],
};

export const e4_r_e1: S.Transaction = {
	ref: 0,
	seq: 4,
	newRef: 1,
	frames: [{
		marks: {
			modifyOld: [{
				foo: {
					tombs: [{ count: 1, seq: 1, id: 0 }],
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
					],
				},
			}],
		},
	}],
};

export const e4_r_e2: S.Transaction = {
	ref: 0,
	seq: 4,
	newRef: 2,
	frames: [{
		marks: {
			modifyOld: [{
				foo: {
					tombs: [{ count: 1, seq: 1, id: 0 }, { count: 1, seq: 2, id: 0 }],
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
					],
				},
			}],
		},
	}],
};

export const e4p: S.Transaction = {
	ref: 0,
	seq: 4,
	newRef: 3,
	frames: [{
		marks: {
			modifyOld: [{
				foo: {
					tombs: [
						{ count: 1, seq: 1, id: 0 },
						1, // X
						{ count: 1, seq: 2, id: 0 },
					],
					attach: [
						3, // [-A-X-B
						[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
					],
				},
			}],
		},
	}],
};
}

export namespace ScenarioN {
	/**
	This scenario demonstrates that to successfully order two tombstones that are relied
	on by separate changes, we need to include tombstones for orphan gaps at the edge of the
	range when rebasing over slice move-ins.

	In this scenario, if E2 and E3 don't record both tombstones for B when rebasing
	over both of E1's slice move-ins, then the rebasing of E2 over E3 will not know how to order
	the tombstone in E2 relative to the one in E3.

	Starting with traits foo=[A B C], bar=[]:
	  E1: User 1:
	    slice-move foo A[_]B to the start of trait bar
	    slice-move foo B[_]C to the end of trait bar
	  E2: User 2: insert X before B (commute:all)
	  E3: User 3: insert Y before C (commute:all)

	Expected outcome: foo=[A B C] bar=[X Y]
	*/
}

export const allOriginals = [
	...ScenarioA.originals,
	...ScenarioF.originals,
	...ScenarioG.originals,
];
