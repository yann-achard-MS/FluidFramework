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
								{ type: "Insert", id: 0, content: [{ id: "X" }] },
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
								{ type: "Insert", id: 0, content: [{ id: "X" }], commute: Commutativity.None },
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
										{ type: "Insert", id: 0, content: [{ id: "A" }, { id: "B" }] },
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
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
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
										{ type: "Insert", id: 0, content: [{ id: "A" }, { id: "B" }] },
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
							moves: [{ src: { bar: 0 }, dst: { foo: 0 } }],
							marks: [{
								modify: {
									foo: [
										{ type: "MoveInSlice", id: 0, length: 2 },
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
							priorMoves: { 1: [{ src: { bar: 0 }, dst: { foo: 0 } }] },
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
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
							moves: [{ src: { bar: 0 }, dst: { foo: 5 } }],
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "MoveInSlice", id: 0, length: 2 },
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
							priorMoves: { 1: [{ src: { bar: 0 }, dst: { foo: 5 } }] },
							marks: [{
								modify: {
									foo: [
										3,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
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
							moves: [{ src: { bar: 0 }, dst: { foo: 0 } }],
							marks: [{
								modify: {
									foo: [
										{ type: "MoveIn", id: 0, length: 2 },
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
							priorMoves: { 1: [{ src: { bar: 0 }, dst: { foo: 0 } }] },
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
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
							moves: [{ src: { bar: 0 }, dst: { foo: 5 } }],
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "MoveIn", id: 0, length: 2 },
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
							priorMoves: { 1: [{ src: { bar: 0 }, dst: { foo: 5 } }] },
							marks: [{
								modify: {
									foo: [
										3,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
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
										{ type: "DeleteSet", id: -1, length: 2 },
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
										{ type: "PriorSetDetachStart", seq: 1, id: -1 },
										2,
										{ type: "PriorRangeEnd", seq: 1, id: -1 },
										1,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
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
										{ type: "DeleteSet", id: -1, length: 2 },
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
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
										2,
										{ type: "PriorSetDetachStart", seq: 1, id: -1 },
										2,
										{ type: "PriorRangeEnd", seq: 1, id: -1 },
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
										{ type: "DeleteSet", id: -1, length: 3 },
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
										{ type: "PriorSetDetachStart", id: -1, seq: 1 },
										2,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
										1,
										{ type: "PriorRangeEnd", seq: 1, id: -1 },
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
							moves: [{ src: { foo: 0 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										{ type: "MoveOutSet", id: 0, length: 2 },
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
							priorMoves: { 1: [{ src: { foo: 0 }, dst: { bar: 0 } }] },
							marks: [{
								modify: {
									foo: [
										{ type: "PriorSetDetachStart", seq: 1, id: 0 },
										2,
										{ type: "PriorRangeEnd", seq: 1, id: 0 },
										1,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
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
							moves: [{ src: { foo: 5 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "MoveOutSet", id: 0, length: 2 },
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
							priorMoves: { 1: [{ src: { foo: 5 }, dst: { bar: 0 } }] },
							marks: [{
								modify: {
									foo: [
										3,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
										2,
										{ type: "PriorSetDetachStart", seq: 1, id: 0 },
										2,
										{ type: "PriorRangeEnd", seq: 1, id: 0 },
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
							moves: [{ src: { foo: 1 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										1,
										{ type: "MoveOutSet", id: 0, length: 3 },
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
							priorMoves: { 1: [{ src: { foo: 1 }, dst: { bar: 0 } }] },
							marks: [{
								modify: {
									foo: [
										1,
										{ type: "PriorSetDetachStart", seq: 1, id: 0 },
										2,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
										1,
										{ type: "PriorRangeEnd", seq: 1, id: 0 },
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
										{ type: "DeleteStart", id: 0 },
										2,
										{ type: "End", id: 0 },
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
										{ type: "PriorDeleteStart", seq: 1, id: 0 },
										2,
										{ type: "PriorRangeEnd", seq: 1, id: 0 },
										1,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
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
										{ type: "DeleteStart", id: 0 },
										2,
										{ type: "End", id: 0 },
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
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
										2,
										{ type: "PriorDeleteStart", seq: 1, id: 0 },
										2,
										{ type: "PriorRangeEnd", seq: 1, id: 0 },
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
										{ type: "DeleteStart", id: 0 },
										3,
										{ type: "End", id: 0 },
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
											{ type: "PriorDeleteStart", seq: 1, id: 0 },
											2,
											{ type: "Insert", id: 0, content: [{ id: "X" }] },
											1,
											{ type: "PriorRangeEnd", seq: 1, id: 0 },
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
											{ type: "PriorDeleteStart", seq: 1, id: 0 },
											2,
											{ type: "Insert", id: 0, content: [{ id: "X" }], commute: Commutativity.None },
											1,
											{ type: "PriorRangeEnd", seq: 1, id: 0 },
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
							moves: [{ src: { foo: 0 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										{ type: "MoveOutStart", id: 0 },
										2,
										{ type: "End", id: 0 },
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
							priorMoves: { 1: [{ src: { foo: 0 }, dst: { bar: 0 } }] },
							marks: [{
								modify: {
									foo: [
										{ type: "PriorMoveOutStart", seq: 1, id: 0 },
										2,
										{ type: "PriorRangeEnd", seq: 1, id: 0 },
										1,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
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
							moves: [{ src: { foo: 5 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "MoveOutStart", id: 0 },
										2,
										{ type: "End", id: 0 },
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
							priorMoves: { 1: [{ src: { foo: 5 }, dst: { bar: 0 } }] },
							marks: [{
								modify: {
									foo: [
										3,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
										2,
										{ type: "PriorMoveOutStart", seq: 1, id: 0 },
										2,
										{ type: "PriorRangeEnd", seq: 1, id: 0 },
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
							moves: [{ src: { foo: 1 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										1,
										{ type: "MoveOutStart", id: 0 },
										3,
										{ type: "End", id: 0 },
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
								priorMoves: { 1: [{ src: { foo: 1 }, dst: { bar: 0 } }] },
								marks: [{
									modify: {
										foo: [
											1,
											{ type: "PriorMoveOutStart", seq: 1, id: 0 },
											2,
											{ type: "Insert", id: 0, content: [{ id: "X" }] },
											1,
											{ type: "PriorRangeEnd", seq: 1, id: 0 },
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
								priorMoves: { 1: [{ src: { foo: 1 }, dst: { bar: 0 } }] },
								marks: [{
									modify: {
										foo: [
											1,
											{ type: "PriorMoveOutStart", seq: 1, id: 0 },
											2,
											{ type: "Insert", id: 0, content: [{ id: "X" }], commute: Commutativity.None },
											1,
											{ type: "PriorRangeEnd", seq: 1, id: 0 },
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
		describe("DeleteSet ↷ *", () => {
			const e2: S.Transaction = {
				ref: 0,
				seq: 2,
				frames: [{
					marks: [{
						modify: {
							foo: [
								2,
								{ type: "DeleteSet", id: -1, length: 3 },
							],
						},
					}],
				}],
			};
			describe("DeleteSet ↷ Insert", () => {
				it("base before new", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
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
										{ type: "DeleteSet", id: -1, length: 3 },
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
										6,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
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
										2,
										{ type: "DeleteSet", id: -1, length: 3 },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
				it("base within new", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										4,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
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
										2,
										{ type: "DeleteSet", id: -1, length: 2 },
										1,
										{ type: "DeleteSet", id: -2 },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
			});
			describe("DeleteSet ↷ DeleteSet", () => {
				it("base before new", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										{ type: "DeleteSet", id: -1 },
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
										{ type: "PriorSetDetachStart", seq: 1, id: -1 },
										1,
										{ type: "PriorRangeEnd", seq: 1, id: -1 },
										1,
										{ type: "DeleteSet", id: -1, length: 3 },
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
										6,
										{ type: "DeleteSet", id: -1 },
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
										2,
										{ type: "DeleteSet", id: -1, length: 3 },
										1,
										{ type: "PriorSetDetachStart", seq: 1, id: -1 },
										1,
										{ type: "PriorRangeEnd", seq: 1, id: -1 },
									],
								},
							}],
						}],
					};
					const actual = rebase(e2, e1);
					assert.deepEqual(actual.frames, e2p.frames);
				});
				it("base within new", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										4,
										{ type: "DeleteSet", id: -1 },
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
										2,
										{ type: "DeleteSet", id: -1 },
										{ type: "PriorSetDetachStart", seq: 1, id: -1 },
										1,
										{ type: "PriorRangeEnd", seq: 1, id: -1 },
										{ type: "DeleteSet", id: -2 },
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
										{ type: "DeleteSet", id: -1, length: 5 },
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
										{ type: "PriorSetDetachStart", seq: 1, id: -1 },
										1,
										{ type: "DeleteSet", id: 0, length: 3 },
										1,
										{ type: "PriorRangeEnd", seq: 1, id: -1 },
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
	});

	describe("Inverse-only Segments", () => {
		describe("PriorDetachSet ↷ ReviveSet = Offset", () => {
			const e1: S.Transaction = {
				ref: 0,
				seq: 1,
				frames: [{
					marks: [{
						modify: {
							foo: [
								1,
								{ type: "ReviveSet", seq: 0, id: -1, length: 3 },
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
									{ type: "PriorSetDetachStart", seq: 0, id: -1 },
									3,
									{ type: "PriorRangeEnd", seq: 0, id: -1 },
									{ type: "Insert", id: 0, content: [] },
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
									{ type: "Insert", id: 0, content: [] },
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
									{ type: "Insert", id: 0, content: [] },
									{ type: "PriorSetDetachStart", seq: 0, id: -1 },
									3,
									{ type: "PriorRangeEnd", seq: 0, id: -1 },
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
									{ type: "Insert", id: 0, content: [] },
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
									{ type: "PriorSetDetachStart", seq: 0, id: -1 },
									2,
									{ type: "Insert", id: 0, content: [] },
									1,
									{ type: "PriorRangeEnd", seq: 0, id: -1 },
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
									{ type: "Insert", id: 0, content: [] },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
		});
		describe("PriorDetachSlice ↷ ReviveSlice = Offset", () => {
			const e1: S.Transaction = {
				ref: 0,
				seq: 1,
				frames: [{
					marks: [{
						modify: {
							foo: [
								1,
								{ type: "ReviveSlice", id: 0, seq: 0, length: 3 },
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
									{ type: "PriorDeleteStart", seq: 0, id: 0 },
									3,
									{ type: "PriorRangeEnd", seq: 0, id: 0 },
									{ type: "Insert", id: 0, content: [] },
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
									{ type: "Insert", id: 0, content: [] },
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
									{ type: "Insert", id: 0, content: [] },
									{ type: "PriorDeleteStart", seq: 0, id: 0 },
									3,
									{ type: "PriorRangeEnd", seq: 0, id: 0 },
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
									{ type: "Insert", id: 0, content: [] },
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
									{ type: "PriorDeleteStart", seq: 0, id: 0 },
									2,
									{ type: "Insert", id: 0, content: [] },
									1,
									{ type: "PriorRangeEnd", seq: 0, id: 0 },
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
									{ type: "Insert", id: 0, content: [] },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
		});
		describe("ReviveSet ↷ DeleteSet = ReviveSet & PriorSetDetach", () => {
			const e1: S.Transaction = {
				ref: 0,
				seq: 1,
				frames: [{
					marks: [{
						modify: {
							foo: [
								1,
								{ type: "DeleteSet", id: -1, length: 3 },
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
									5,
									{ type: "ReviveSet", seq: 0, id: -1, length: 3 },
									{ type: "Insert", id: 0, content: [] },
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
									{ type: "PriorSetDetachStart", seq: 1, id: -1 },
									3,
									{ type: "PriorRangeEnd", seq: 1, id: -1 },
									1,
									{ type: "ReviveSet", seq: 0, id: -1, length: 3 },
									{ type: "Insert", id: 0, content: [] },
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
									{ type: "Insert", id: 0, content: [] },
									{ type: "ReviveSet", seq: 0, id: -1, length: 3 },
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
									{ type: "Insert", id: 0, content: [] },
									{ type: "ReviveSet", seq: 0, id: -1, length: 3 },
									1,
									{ type: "PriorSetDetachStart", seq: 1, id: -1 },
									3,
									{ type: "PriorRangeEnd", seq: 1, id: -1 },
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
									3,
									{ type: "ReviveSet", seq: 0, id: -1, length: 2 },
									{ type: "Insert", id: 0, content: [] },
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
									{ type: "PriorSetDetachStart", seq: 1, id: -1 },
									2,
									{ type: "ReviveSet", seq: 0, id: -1, length: 2 },
									{ type: "Insert", id: 0, content: [] },
									{ type: "PriorRangeEnd", seq: 1, id: -1 },
								],
							},
						}],
					}],
				};
				const actual = rebase(e2, e1);
				assert.deepEqual(actual.frames, e2p.frames);
			});
		});
		describe("ReviveSlice ↷ DeleteSlice = ReviveSlice & PriorDeleteSlice", () => {
			const e1: S.Transaction = {
				ref: 0,
				seq: 1,
				frames: [{
					marks: [{
						modify: {
							foo: [
								1,
								{ type: "DeleteStart", id: 0 },
								3,
								{ type: "End", id: 0 },
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
									5,
									{ type: "ReviveSlice", seq: 0, id: 0, length: 3 },
									{ type: "Insert", id: 0, content: [] },
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
									{ type: "PriorDeleteStart", seq: 1, id: 0 },
									3,
									{ type: "PriorRangeEnd", seq: 1, id: 0 },
									1,
									{ type: "ReviveSlice", seq: 0, id: 0, length: 3 },
									{ type: "Insert", id: 0, content: [] },
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
									{ type: "Insert", id: 0, content: [] },
									{ type: "ReviveSlice", seq: 0, id: 0, length: 3 },
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
									{ type: "Insert", id: 0, content: [] },
									{ type: "ReviveSlice", seq: 0, id: 0, length: 3 },
									1,
									{ type: "PriorDeleteStart", seq: 1, id: 0 },
									3,
									{ type: "PriorRangeEnd", seq: 1, id: 0 },
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
									3,
									{ type: "ReviveSlice", seq: 0, id: 0, length: 2 },
									{ type: "Insert", id: 0, content: [] },
									{ type: "ReviveSlice", seq: 0, id: 0 },
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
									{ type: "PriorDeleteStart", seq: 1, id: 0 },
									2,
									{ type: "ReviveSlice", seq: 0, id: 0, length: 2 },
									{ type: "Insert", id: 0, content: [] },
									{ type: "ReviveSlice", seq: 0, id: 0 },
									1,
									{ type: "PriorRangeEnd", seq: 1, id: 0 },
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
