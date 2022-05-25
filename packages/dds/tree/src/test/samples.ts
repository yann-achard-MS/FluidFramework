/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Effects, Rebased as R, Sequenced as S, Tiebreak } from "../format";

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

	Expected outcome: foo=[A] bar=[X D]
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
				modifyI: [{
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
				modifyI: [{
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
				modifyI: [{
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
				modifyI: [{
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

export namespace ScenarioA2 {
	/**
	Scenario A2 (same as A but with the slice starting at C)
	In a trait foo that contains the nodes [A B C D], three users concurrently attempt the following operations (ordered
	here from first sequenced to last sequenced):
	  User 1: set-delete B C
	  User 2: move slice-like range C D to some other trait bar
	  User 3: insert X after C (commutative)

	Expected outcome: foo=[A] bar=[X D]
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
							2, // A B
							{ type: "Move", id: 0, count: 2 },
						],
						gaps: [
							2,
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

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: {
				modifyI: [{
					foo: {
						attach: [
							3,
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
			moves: [{ id: 0, src: { foo: 2 }, dst: { bar: 0 } }],
			marks: {
				modifyI: [{
					foo: {
						tombs: [1, { count: 2, seq: 1, id: 1 } ],
						nodes: [
							2, // A B
							{ type: "Move", id: 0, count: 2 },
						],
						gaps: [
							3,
							{ count: 1, stack: [{ type: "Forward", id: 0 }] },
						],
					},
					bar: {
						attach: [
							[{ type: "Move", id: 0, count: 2 }], // Count not updated
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
							3,
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
						// Note the count:1 because only one of the deleted nodes got imported
						tombs: [{ count: 1, seq: 1, id: 1 }],
						attach: [
							1,
							[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
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
							1,
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
				modifyI: [{
					foo: {
						tombs: [{ count: 4, seq: 1, id: 1 }],
						attach: [
							1,
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
							2,
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
							3, // After B
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
		seq: 4,
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
		seq: 4,
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
		seq: 4,
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

	Expected outcome: foo=[] bar=[B] baz=[A B X C]
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
							1, // A
							{ type: "Move", id: 0, count: 1 },
						],
						gaps: [
							2,
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
			moves: [
				{ id: 0, src: { foo: 0 }, dst: { baz: 0 } },
				{ id: 1, src: { bar: 0 }, dst: { baz: 1 } },
			],
			marks: {
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 2 },
						],
					},
					bar: {
						nodes: [
							{ type: "Move", id: 1, count: 1 },
						],
					},
					baz: {
						attach: [
							[
								{ type: "Move", id: 0, count: 1 }, // A
								{ type: "Move", id: 1, count: 1 }, // B
								{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.Move },
								{ type: "Move", id: 0, count: 1 }, // C
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

	Expected outcome: foo=[] bar=[B]
	X should be deleted (as opposed to inserted in trait bar).
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
							1, // A
							{ type: "Move", id: 0, count: 1 },
						],
						gaps: [
							2,
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
						gaps: [
							{ count: 4, stack: [{ type: "Scorch", id: 0 }] },
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
						gaps: [
							{ count: 4, stack: [{ type: "Scorch", id: 0 }] },
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
				modifyI: [{
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
				modifyI: [{
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
			modifyI: [{
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
				modifyI: [{
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
	In trait foo [A B]:
	  User 1: move slice [A B] to some other trait bar
	  User 2: insert [X Y] after A (commute:move) (local: [A X Y B])
	  User 2: insert N after X (commute:none) (local: [A X N Y B])
	  User 2: insert M before X (commute:none) (local: [A M X N Y B])
	  User 2: insert O after Y (commute:none) (local: [A M X N Y O B])

	Expected outcome: foo=[M N O] bar=[A X Y B]
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
				modifyI: [{
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
				modifyI: [{
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
				modifyI: [{
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
				modifyI: [{
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
				modifyI: [{
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
			modifyI: [{
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
				modifyI: [{
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
			modifyI: [{
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
				modifyI: [{
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
			modifyI: [{
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
				modifyI: [{
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
	Starting state: foo=[A B] bar=[U V] baz=[]
	  User 1: slice-move all of trait foo after U with a (commute:all)
	  User 2: slice-move all of trait bar into trait baz
	  User 3: insert X after A and insert Y after B in foo (commute:all)

	Expected outcome: foo=[] bar=[A X B Y] baz=[U V]
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 1 } }],
			marks: {
				modifyI: [{
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
				modifyI: [{
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
				modifyI: [{
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
				modifyI: [{
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
				modifyI: [{
					bar: {
						attach: [
							2,
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
				modifyI: [{
					bar: {
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
			moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 1 } }],
			marks: {
				modifyI: [{
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
				modifyI: [{
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
	Starting with a trait foo that contains the nodes [A B C]:
	  1. User 1: set-delete node B
	  2. User 2: slice-move all of trait foo to trait bar
	  3. User 3: insert Y after B (LLW commutative)
	  4. User 4: insert X before B (LLW commutative)
	  5. User 5: insert W after A (FFW) and insert Z before C (FFW) (with knowledge with e1 and e2)

	Expected outcome: foo=[] bar=[W X Y Z]
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
						gaps: [
							2,
							{ count: 4, stack: [{ type: "Forward", id: 0 }] },
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
							4,
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
							3,
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
				modifyI: [{
					bar: {
						attach: [
							2,
							[{ type: "Insert", id: 0, content: [{ id: "W" }], tiebreak: Tiebreak.FWW }],
							// Note how this second insert is in a separate array from the insert above.
							// This means it targets the next affix (i.e., Before C)
							[{ type: "Insert", id: 0, content: [{ id: "Z" }], tiebreak: Tiebreak.FWW }],
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
				modifyI: [{
					foo: {
						tombs: [1, { count: 1, seq: 1, id: 0 }],
						nodes: [
							{ type: "Move", id: 0, count: 3 },
						],
						gaps: [
							2,
							{ count: 4, stack: [{ type: "Forward", id: 0 }] },
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
				modifyI: [{
					foo: {
						tombs: [1, { count: 1, seq: 1, id: 0 }],
						attach: [
							4,
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
					bar: {
						tombs: [1, { count: 1, seq: 1, id: 0, src: { seq: 2, id: 0 } }],
						attach: [
							4,
							[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
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
				modifyI: [{
					foo: {
						tombs: [1, { count: 1, seq: 1, id: 0 }],
						attach: [
							3,
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
				modifyI: [{
					bar: {
						tombs: [1, { count: 1, seq: 1, id: 0, src: { seq: 2, id: 0 } }],
						attach: [
							3,
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
				modifyI: [{
					bar: {
						tombs: [
							1,
							{ count: 1, seq: 1, id: 0, src: { seq: 2, id: 0 } },
							1, // Y
							{ count: 1, seq: 1, id: 0, src: { seq: 2, id: 0 } },
						],
						attach: [
							3,
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
				modifyI: [{
					bar: {
						attach: [
							2,
							[{ type: "Insert", id: 0, content: [{ id: "W" }], tiebreak: Tiebreak.FWW }],
							2, // Affixes for Y
							[{ type: "Insert", id: 0, content: [{ id: "Z" }], tiebreak: Tiebreak.FWW }],
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
				modifyI: [{
					bar: {
						attach: [
							2,
							[{ type: "Insert", id: 0, content: [{ id: "W" }], tiebreak: Tiebreak.FWW }],
							4, // Affixes for X and Y
							[{ type: "Insert", id: 0, content: [{ id: "Z" }], tiebreak: Tiebreak.FWW }],
						],
					},
				}],
			},
		}],
	};
}

export namespace ScenarioK {
	/**
	The goal of this scenario is to show that we need to differentiate affix replicas that are
	introduced by slice moves from their originals.

	Starting with a trait foo that contains the nodes [A B C]:
	  User 1: set-delete node B
	  User 2: slice-move [A B C] to the start of trait foo
	  User 3:
	    - insert X before B (LLW commutative)
	    - insert Y before B (LLW non-commutative)

	Expected outcome: foo=[A X C Y]
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
				modifyI: [{
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 3 },
						],
						gaps: [
							2,
							{ count: 4, stack: [{ type: "Forward", id: 0 }] },
						],
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
							3,
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
				modifyI: [{
					foo: {
						tombs: [1, { count: 1, seq: 1, id: 0 }],
						nodes: [
							{ type: "Move", id: 0, count: 3 },
						],
						gaps: [
							2,
							{ count: 4, stack: [{ type: "Forward", id: 0 }] },
						],
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
				modifyI: [{
					foo: {
						tombs: [1, { count: 1, seq: 1, id: 0 }],
						attach: [
							3,
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
				modifyI: [{
					foo: {
						tombs: [
							1,
							{ count: 1, seq: 1, id: 0, src: { seq: 2, id: 0 } },
							1,
							{ count: 1, seq: 1, id: 0 },
						],
						attach: [
							3,
							[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.Move }],
							3,
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
	The point of this scenario is to show:
	That two different tombstones can have originated from the same edit (E1), been first replicated
	by the same slice-move (E2), been last replicated by the same slice-move (E4) yet be targeted by
	different concurrent inserts that end up in the same trait and therefore need to be able to
	distinguish one replica from the other, and order them properly.
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

	Starting state: foo=[A B]
	User 1: set-delete A
	User 2: set-delete B
	User 3: insert X after A
	User 4: insert Y after B
*/

export const e1: S.Transaction = {
	ref: 0,
	seq: 1,
	frames: [{
		marks: {
			modifyI: [{
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
			modifyI: [{
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
			modifyI: [{
				foo: {
					attach: [
						2,
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
			modifyI: [{
				foo: {
					attach: [
						4,
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
			modifyI: [{
				foo: {
					tombs: [{ count: 1, seq: 1, id: 0 }],
					attach: [
						2,
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
			modifyI: [{
				foo: {
					tombs: [{ count: 1, seq: 1, id: 0 }, { count: 1, seq: 2, id: 0 }],
					attach: [
						2,
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
			modifyI: [{
				foo: {
					tombs: [{ count: 1, seq: 1, id: 0 }],
					attach: [
						4,
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
			modifyI: [{
				foo: {
					tombs: [{ count: 1, seq: 1, id: 0 }, { count: 1, seq: 2, id: 0 }],
					attach: [
						4,
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
			modifyI: [{
				foo: {
					tombs: [
						{ count: 1, seq: 1, id: 0 },
						1, // X
						{ count: 1, seq: 2, id: 0 },
					],
					attach: [
						6,
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
	The point of this scenario is to show that to successfully order two tombstones that are relied
	on by separate changes, we need to include tombstones for orphan affixes at the edge of the
	range when rebasing over slice move-ins.

	In this scenario, if E2 and E3 don't record both tombstones for B when rebasing
	over both of E1's slice move-ins, then the rebasing of E2 over E3 will not know how to order
	the tombstone in E2 relative to the one in E3.

	Starting with traits foo=[A B C], bar=[]:
	  E1: User 1:
	    slice-move foo [A_ (_)B] to the start of trait bar
	    slice-move foo [B(_) _C] to the end of trait bar
	  E2: User 2: insert X before B (LLW commutative)
	  E3: User 3: insert Y after B (LLW commutative)

	Expected outcome: bar=[X Y]
	*/
}

export const allOriginals = [
	...ScenarioA1.originals,
	...ScenarioF.originals,
	...ScenarioG.originals,
];
