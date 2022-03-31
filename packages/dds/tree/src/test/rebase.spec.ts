/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { rebase as rebaseImpl } from "../rebase";
import {
	Sequenced as S,
	Rebased as R,
	Commutativity,
} from "../format";
import {
	ScenarioA1,
	ScenarioA2,
	ScenarioC,
	ScenarioD,
	ScenarioE,
	ScenarioF,
	ScenarioG,
} from "./samples";
import { deepFreeze } from "./utils";

function rebase(original: R.Transaction, base: S.Transaction): R.Transaction {
	deepFreeze(original);
	deepFreeze(base);
	return rebaseImpl(original, base);
}

describe(rebase.name, () => {
	describe("Basic Segments Matrix", () => {
		describe("Insert ↷ *", () => {
			const e2: S.Transaction = {
				ref: 0,
				seq: 2,
				frames: [{
					marks: [{
						modify: {
							foo: [
								3,
								{ type: "Insert", content: [{ id: "X" }] },
							],
						},
					}],
				}],
			};
			const e2nc: S.Transaction = {
				ref: 0,
				seq: 2,
				frames: [{
					marks: [{
						modify: {
							foo: [
								3,
								{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.None },
							],
						},
					}],
				}],
			};
			describe("Insert ↷ Insert", () => {
				it("base before new", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										{ type: "Insert", content: [{ id: "A" }, { id: "B" }] },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "Insert", content: [{ id: "X" }] },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
				it("new before base", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "Insert", content: [{ id: "A" }, { id: "B" }] },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = e2;
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
			});
			describe("Insert ↷ MoveInSlice", () => {
				it("base before new", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							moves: [{ src: "bar.0", dst: "foo.0" }],
							marks: [{
								modify: {
									foo: [
										{ type: "MoveInSlice", op: 0, length: 2 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							priorMoves: { 1: [{ src: "bar.0", dst: "foo.0" }] },
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "Insert", content: [{ id: "X" }] },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
				it("new before base", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							moves: [{ src: "bar.0", dst: "foo.5" }],
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "MoveInSlice", op: 0, length: 2 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							priorMoves: { 1: [{ src: "bar.0", dst: "foo.5" }] },
							marks: [{
								modify: {
									foo: [
										3,
										{ type: "Insert", content: [{ id: "X" }] },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
			});
			describe("Insert ↷ MoveInSet", () => {
				it("base before new", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							moves: [{ src: "bar.0", dst: "foo.0" }],
							marks: [{
								modify: {
									foo: [
										{ type: "MoveInSet", op: 0, length: 2 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							priorMoves: { 1: [{ src: "bar.0", dst: "foo.0" }] },
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "Insert", content: [{ id: "X" }] },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
				it("new before base", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							moves: [{ src: "bar.0", dst: "foo.5" }],
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "MoveInSet", op: 0, length: 2 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							priorMoves: { 1: [{ src: "bar.0", dst: "foo.5" }] },
							marks: [{
								modify: {
									foo: [
										3,
										{ type: "Insert", content: [{ id: "X" }] },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
			});
			describe("Insert ↷ DeleteSet", () => {
				it("base before new", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										{ type: "Delete", length: 2 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										{ type: "PriorDetach", seq: 1, length: 2 },
										1,
										{ type: "Insert", content: [{ id: "X" }] },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
				it("new before base", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "Delete", length: 2 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										3,
										{ type: "Insert", content: [{ id: "X" }] },
										2,
										{ type: "PriorDetach", seq: 1, length: 2 },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
				it("new within base", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										1,
										{ type: "Delete", length: 3 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										1,
										{ type: "PriorDetach", seq: 1, length: 2 },
										{ type: "Insert", content: [{ id: "X" }] },
										{ type: "PriorDetach", seq: 1 },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
			});
			describe("Insert ↷ MoveOutSet", () => {
				it("base before new", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							moves: [{ src: "foo.0", dst: "bar.0" }],
							marks: [{
								modify: {
									foo: [
										{ type: "MoveOut", op: 0, length: 2 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							priorMoves: { 1: [{ src: "foo.0", dst: "bar.0" }] },
							marks: [{
								modify: {
									foo: [
										{ type: "PriorDetach", seq: 1, length: 2 },
										1,
										{ type: "Insert", content: [{ id: "X" }] },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
				it("new before base", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							moves: [{ src: "foo.5", dst: "bar.0" }],
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "MoveOut", op: 0, length: 2 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							priorMoves: { 1: [{ src: "foo.5", dst: "bar.0" }] },
							marks: [{
								modify: {
									foo: [
										3,
										{ type: "Insert", content: [{ id: "X" }] },
										2,
										{ type: "PriorDetach", seq: 1, length: 2 },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
				it("new within base", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							moves: [{ src: "foo.1", dst: "bar.0" }],
							marks: [{
								modify: {
									foo: [
										1,
										{ type: "MoveOut", op: 0, length: 3 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							priorMoves: { 1: [{ src: "foo.1", dst: "bar.0" }] },
							marks: [{
								modify: {
									foo: [
										1,
										{ type: "PriorDetach", seq: 1, length: 2 },
										{ type: "Insert", content: [{ id: "X" }] },
										{ type: "PriorDetach", seq: 1 },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
			});
			describe("Insert ↷ DeleteSlice", () => {
				it("base before new", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										{ type: "DeleteStart", op: 0 },
										2,
										{ type: "End", op: 0 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										{ type: "PriorDeleteStart", seq: 1, op: 0 },
										2,
										{ type: "PriorSliceEnd", seq: 1, op: 0 },
										1,
										{ type: "Insert", content: [{ id: "X" }] },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
				it("new before base", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "DeleteStart", op: 0 },
										2,
										{ type: "End", op: 0 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										3,
										{ type: "Insert", content: [{ id: "X" }] },
										2,
										{ type: "PriorDeleteStart", seq: 1, op: 0 },
										2,
										{ type: "PriorSliceEnd", seq: 1, op: 0 },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
				describe("new within base", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										1,
										{ type: "DeleteStart", op: 0 },
										3,
										{ type: "End", op: 0 },
									],
								},
							}],
						}],
					};
					it("commutative", () => {
						const e2p: S.Transaction = {
							seq: 2,
							ref: 0,
							newRef: 1,
							frames: [{
								marks: [{
									modify: {
										foo: [
											1,
											{ type: "PriorDeleteStart", seq: 1, op: 0 },
											2,
											{ type: "Insert", content: [{ id: "X" }] },
											1,
											{ type: "PriorSliceEnd", seq: 1, op: 0 },
										],
									},
								}],
							}],
						};
						const actual = rebase(e2, e1);
						assert.deepEqual(actual.frames, e2p.frames);
					});
					it("non-commutative", () => {
						const e2p: S.Transaction = {
							seq: 2,
							ref: 0,
							newRef: 1,
							frames: [{
								marks: [{
									modify: {
										foo: [
											1,
											{ type: "PriorDeleteStart", seq: 1, op: 0 },
											2,
											{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.None },
											1,
											{ type: "PriorSliceEnd", seq: 1, op: 0 },
										],
									},
								}],
							}],
						};
						const actual = rebase(e2nc, e1);
						assert.deepEqual(actual.frames, e2p.frames);
					});
				});
			});
			describe("Insert ↷ MoveOutSlice", () => {
				it("base before new", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							moves: [{ src: "foo.0", dst: "bar.0" }],
							marks: [{
								modify: {
									foo: [
										{ type: "MoveOutStart", op: 0 },
										2,
										{ type: "End", op: 0 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							priorMoves: { 1: [{ src: "foo.0", dst: "bar.0" }] },
							marks: [{
								modify: {
									foo: [
										{ type: "PriorMoveOutStart", seq: 1, op: 0 },
										2,
										{ type: "PriorSliceEnd", seq: 1, op: 0 },
										1,
										{ type: "Insert", content: [{ id: "X" }] },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
				it("new before base", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							moves: [{ src: "foo.5", dst: "bar.0" }],
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "MoveOutStart", op: 0 },
										2,
										{ type: "End", op: 0 },
									],
								},
							}],
						}],
					};
					const e2p: S.Transaction = {
						seq: 2,
						ref: 0,
						newRef: 1,
						frames: [{
							priorMoves: { 1: [{ src: "foo.5", dst: "bar.0" }] },
							marks: [{
								modify: {
									foo: [
										3,
										{ type: "Insert", content: [{ id: "X" }] },
										2,
										{ type: "PriorMoveOutStart", seq: 1, op: 0 },
										2,
										{ type: "PriorSliceEnd", seq: 1, op: 0 },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
				describe("new within base", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							moves: [{ src: "foo.1", dst: "bar.0" }],
							marks: [{
								modify: {
									foo: [
										1,
										{ type: "MoveOutStart", op: 0 },
										3,
										{ type: "End", op: 0 },
									],
								},
							}],
						}],
					};
					it("commutative", () => {
						const e2p: S.Transaction = {
							seq: 2,
							ref: 0,
							newRef: 1,
							frames: [{
								priorMoves: { 1: [{ src: "foo.1", dst: "bar.0" }] },
								marks: [{
									modify: {
										foo: [
											1,
											{ type: "PriorMoveOutStart", seq: 1, op: 0 },
											2,
											{ type: "Insert", content: [{ id: "X" }] },
											1,
											{ type: "PriorSliceEnd", seq: 1, op: 0 },
										],
									},
								}],
							}],
						};
						const actual = rebase(e2, e1);
						assert.deepEqual(actual.frames, e2p.frames);
					});
					it("non-commutative", () => {
						const e2p: S.Transaction = {
							seq: 2,
							ref: 0,
							newRef: 1,
							frames: [{
								priorMoves: { 1: [{ src: "foo.1", dst: "bar.0" }] },
								marks: [{
									modify: {
										foo: [
											1,
											{ type: "PriorMoveOutStart", seq: 1, op: 0 },
											2,
											{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.None },
											1,
											{ type: "PriorSliceEnd", seq: 1, op: 0 },
										],
									},
								}],
							}],
						};
						const actual = rebase(e2nc, e1);
						assert.deepEqual(actual.frames, e2p.frames);
					});
				});
			});
		});
	});

	describe("Inverse-only Segments", () => {
		describe("PriorDetachSet ↷ ReviveSet", () => {
			const e1: S.Transaction = {
				ref: 0,
				seq: 1,
				frames: [{
					marks: [{
						modify: {
							foo: [
								1,
								{ type: "ReviveSet", seq: 0, length: 3 },
							],
						},
					}],
				}],
			};
			it("base before new", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "PriorDetach", seq: 0, length: 3 },
									{ type: "Insert", content: [] },
								],
							},
						}],
					}],
				};
				const e2p: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									4,
									{ type: "Insert", content: [] },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
			it("new before base", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "Insert", content: [] },
									{ type: "PriorDetach", seq: 0, length: 3 },
								],
							},
						}],
					}],
				};
				const e2p: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "Insert", content: [] },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
			it("new within base", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "PriorDetach", seq: 0, length: 2 },
									{ type: "Insert", content: [] },
									{ type: "PriorDetach", seq: 0 },
								],
							},
						}],
					}],
				};
				const e2p: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									3,
									{ type: "Insert", content: [] },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
		});
		describe("PriorDetachSlice ↷ ReviveSlice", () => {
			const e1: S.Transaction = {
				ref: 0,
				seq: 1,
				frames: [{
					marks: [{
						modify: {
							foo: [
								1,
								{ type: "ReviveSlice", op: 0, seq: 0, length: 3 },
							],
						},
					}],
				}],
			};
			it("base before new", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "PriorDeleteStart", seq: 0, op: 0 },
									3,
									{ type: "PriorSliceEnd", seq: 0, op: 0 },
									{ type: "Insert", content: [] },
								],
							},
						}],
					}],
				};
				const e2p: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									4,
									{ type: "Insert", content: [] },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
			it("new before base", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "Insert", content: [] },
									{ type: "PriorDeleteStart", seq: 0, op: 0 },
									3,
									{ type: "PriorSliceEnd", seq: 0, op: 0 },
								],
							},
						}],
					}],
				};
				const e2p: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "Insert", content: [] },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
			it("new within base", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "PriorDeleteStart", seq: 0, op: 0 },
									2,
									{ type: "Insert", content: [] },
									1,
									{ type: "PriorSliceEnd", seq: 0, op: 0 },
								],
							},
						}],
					}],
				};
				const e2p: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									3,
									{ type: "Insert", content: [] },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
		});
		describe("ReviveSet ↷ Delete", () => {
			const e1: S.Transaction = {
				ref: 0,
				seq: 1,
				frames: [{
					marks: [{
						modify: {
							foo: [
								1,
								{ type: "Delete", length: 3 },
							],
						},
					}],
				}],
			};
			it("base before new", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "ReviveSet", seq: 0, length: 3 },
									{ type: "Insert", content: [] },
								],
							},
						}],
					}],
				};
				const e2p: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "PriorDetach", seq: 1, length: 3 },
									{ type: "Insert", content: [] },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
			it("new before base", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "Insert", content: [] },
									{ type: "ReviveSet", seq: 0, length: 3 },
								],
							},
						}],
					}],
				};
				const e2p: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "Insert", content: [] },
									{ type: "PriorDetach", seq: 1, length: 3 },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
			it("new within base", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "ReviveSet", seq: 0, length: 2 },
									{ type: "Insert", content: [] },
									{ type: "ReviveSet", seq: 0 },
								],
							},
						}],
					}],
				};
				const e2p: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "PriorDetach", seq: 1, length: 2 },
									{ type: "Insert", content: [] },
									{ type: "PriorDetach", seq: 1 },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
		});
		describe.skip("ReviveSlice ↷ DeleteSlice = PriorDeleteSlice", () => {
			const e1: S.Transaction = {
				ref: 0,
				seq: 1,
				frames: [{
					marks: [{
						modify: {
							foo: [
								1,
								{ type: "DeleteStart", op: 0 },
								3,
								{ type: "End", op: 0 },
							],
						},
					}],
				}],
			};
			it("base before new", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "ReviveSlice", seq: 0, op: 0, length: 3 },
									{ type: "Insert", content: [] },
								],
							},
						}],
					}],
				};
				const e2p: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "PriorDeleteStart", seq: 1, op: 0 },
									3,
									{ type: "PriorSliceEnd", seq: 1, op: 0 },
									{ type: "Insert", content: [] },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
			it("new before base", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "Insert", content: [] },
									{ type: "ReviveSlice", seq: 0, op: 0, length: 3 },
								],
							},
						}],
					}],
				};
				const e2p: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "Insert", content: [] },
									{ type: "PriorDeleteStart", seq: 1, op: 0 },
									3,
									{ type: "PriorSliceEnd", seq: 1, op: 0 },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
			it("new within base", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "PriorDeleteStart", seq: 1, op: 0 },
									2,
									{ type: "Insert", content: [] },
									1,
									{ type: "PriorSliceEnd", seq: 1, op: 0 },
								],
							},
						}],
					}],
				};
				const e2p: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									3,
									{ type: "PriorDetach", seq: 1, length: 2 },
									{ type: "Insert", content: [] },
									{ type: "PriorDetach", seq: 1 },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
		});
	});

	describe("Scenarios", () => {
		describe("ScenarioA1", () => {
			it("e2", () => {
				const actual = rebase(ScenarioA1.e2, ScenarioA1.e1);
				assert.deepEqual(actual.frames, ScenarioA1.e2p.frames);
			});
		});

		describe("ScenarioA2", () => {
			it("e2", () => {
				const actual = rebase(ScenarioA2.e2, ScenarioA2.e1);
				assert.deepEqual(actual.frames, ScenarioA2.e2p.frames);
			});
		});

		describe("ScenarioC", () => {
			it("e2", () => {
				const actual = rebase(ScenarioC.e3, ScenarioC.e2);
				assert.deepEqual(actual.frames, ScenarioC.e3p.frames);
			});
		});

		describe("ScenarioD", () => {
			it("e2", () => {
				const actual = rebase(ScenarioD.e2, ScenarioD.e1);
				assert.deepEqual(actual.frames, ScenarioD.e2p.frames);
			});
		});

		describe("ScenarioE", () => {
			it("e2", () => {
				const actual = rebase(ScenarioE.e2, ScenarioE.e1);
				assert.deepEqual(actual.frames, ScenarioE.e2p.frames);
			});
		});

		describe("ScenarioF", () => {
			it("e2", () => {
				const actual = rebase(ScenarioF.e2, ScenarioF.e1);
				assert.deepEqual(actual.frames, ScenarioF.e2p.frames);
			});
		});

		describe("ScenarioG", () => {
			it("e2", () => {
				const actual = rebase(ScenarioG.e2, ScenarioG.e1);
				assert.deepEqual(actual.frames, ScenarioG.e2p.frames);
			});
		});
	});
});
