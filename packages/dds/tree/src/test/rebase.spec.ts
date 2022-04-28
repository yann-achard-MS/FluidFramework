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
	RangeType,
} from "../format";
import {
	ScenarioA1,
	ScenarioA2,
	ScenarioB,
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
							moves: [{ id: 0, src: { bar: 0 }, dst: { foo: 0 } }],
							marks: [{
								modify: {
									foo: [
										{ type: "MoveIn", range: RangeType.Slice, id: 0, length: 2 },
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
							priorMoves: [{ seq: 1, id: 0, src: { bar: 0 }, dst: { foo: 0 } }],
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
							moves: [{ id: 0, src: { bar: 0 }, dst: { foo: 5 } }],
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "MoveIn", range: RangeType.Slice, id: 0, length: 2 },
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
							priorMoves: [{ seq: 1, id: 0, src: { bar: 0 }, dst: { foo: 5 } }],
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
							moves: [{ id: 0, src: { bar: 0 }, dst: { foo: 0 } }],
							marks: [{
								modify: {
									foo: [
										{ type: "MoveIn", range: RangeType.Set, id: 0, length: 2 },
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
							priorMoves: [{ seq: 1, id: 0, src: { bar: 0 }, dst: { foo: 0 } }],
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
							moves: [{ id: 0, src: { bar: 0 }, dst: { foo: 5 } }],
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "MoveIn", range: RangeType.Set, id: 0, length: 2 },
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
							priorMoves: [{ seq: 1, id: 0, src: { bar: 0 }, dst: { foo: 5 } }],
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
										{ type: "DeleteSet", id: 0, length: 2 },
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
										{ type: "PriorDeleteSet", seq: 1, id: 0, length: 2 },
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
										{ type: "DeleteSet", id: 0, length: 2 },
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
										{ type: "PriorDeleteSet", seq: 1, id: 0, length: 2 },
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
										{ type: "DeleteSet", id: 0, length: 3 },
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
										{
											type: "PriorDeleteSet",
											seq: 1,
											id: 0,
											length: 3,
											mods: [
												2,
												{ type: "Insert", id: 0, content: [{ id: "X" }] },
											],
										},
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
							moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
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
							priorMoves: [{ seq: 1, id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										{ type: "PriorMoveOutSet", seq: 1, id: 0, length: 2 },
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
							moves: [{ id: 0, src: { foo: 5 }, dst: { bar: 0 } }],
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
							priorMoves: [{ seq: 1, id: 0, src: { foo: 5 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										3,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
										2,
										{ type: "PriorMoveOutSet", seq: 1, id: 0, length: 2 },
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
							moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
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
							priorMoves: [{ seq: 1, id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										1,
										{
											type: "PriorMoveOutSet",
											seq: 1,
											id: 0,
											length: 3,
											mods: [
												2,
												{ type: "Insert", id: 0, content: [{ id: "X" }] },
											],
										},
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
										{ type: "DeleteSlice", id: 0, length: 2 },
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
										{ type: "PriorDeleteSlice", seq: 1, id: 0, length: 2 },
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
										{ type: "DeleteSlice", id: 0, length: 2 },
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
										{ type: "PriorDeleteSlice", seq: 1, id: 0, length: 2 },
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
										{ type: "DeleteSlice", id: 0, length: 3 },
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
											{
												type: "PriorDeleteSlice",
												seq: 1,
												id: 0,
												length: 3,
											},
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
											{
												type: "PriorDeleteSlice",
												seq: 1,
												id: 0,
												length: 3,
												mods: [
													2,
													{
														type: "Insert",
														id: 0,
														content: [{ id: "X" }],
														commute: Commutativity.None,
													},
												],
											},
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
							moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										{ type: "MoveOutSlice", id: 0, length: 2 },
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
							priorMoves: [{ seq: 1, id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										{ type: "PriorMoveOutSlice", seq: 1, id: 0, length: 2 },
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
							moves: [{ id: 0, src: { foo: 5 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										5,
										{ type: "MoveOutSlice", id: 0, length: 2 },
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
							priorMoves: [{ seq: 1, id: 0, src: { foo: 5 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										3,
										{ type: "Insert", id: 0, content: [{ id: "X" }] },
										2,
										{ type: "PriorMoveOutSlice", seq: 1, id: 0, length: 2 },
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
							moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
							marks: [{
								modify: {
									foo: [
										1,
										{ type: "MoveOutSlice", id: 0, length: 3 },
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
								priorMoves: [{ seq: 1, id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
								marks: [{
									modify: {
										foo: [
											1,
											{
												type: "PriorMoveOutSlice",
												seq: 1,
												id: 0,
												length: 3,
												mods: [
													2,
													{ type: "Insert", id: 0, content: [{ id: "X" }] },
												],
											},
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
								priorMoves: [{ seq: 1, id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
								marks: [{
									modify: {
										foo: [
											1,
											{
												type: "PriorMoveOutSlice",
												seq: 1,
												id: 0,
												length: 3,
												mods: [
													2,
													{
														type: "Insert",
														id: 0,
														content: [{ id: "X" }],
														commute: Commutativity.None,
													},
												],
											},
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
								{ type: "DeleteSet", id: 0, length: 3 },
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
										{ type: "DeleteSet", id: 0, length: 3 },
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
										{ type: "DeleteSet", id: 0, length: 3 },
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
										{
											type: "DeleteSet",
											id: 0,
											length: 3,
											mods: [
												2,
												{ type: "PriorInsert", seq: 1, id: 0 },
											],
										},
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
										{ type: "DeleteSet", id: 0 },
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
										{ type: "PriorDeleteSet", seq: 1, id: 0 },
										1,
										{ type: "DeleteSet", id: 0, length: 3 },
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
										{ type: "DeleteSet", id: 0 },
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
										{ type: "DeleteSet", id: 0, length: 3 },
										1,
										{ type: "PriorDeleteSet", seq: 1, id: 0 },
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
										{ type: "DeleteSet", id: 0 },
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
										{
											type: "DeleteSet",
											id: 0,
											length: 3,
											mods: [
												2,
												{ type: "PriorDeleteSet", seq: 1, id: 0 },
											],
										},
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
										{ type: "DeleteSet", id: 0, length: 6 },
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
										{ type: "PriorDeleteSet", seq: 1, id: 0 },
										{
											type: "DeleteSet",
											id: 0,
											length: 3,
											mods: [
												{ type: "PriorDeleteSet", seq: 1, id: 0, length: 3 },
											],
										},
										{ type: "PriorDeleteSet", seq: 1, id: 0, length: 2 },
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
		describe("ReviveSet ↷ *", () => {
			const e2: S.Transaction = {
				ref: 0,
				seq: 2,
				frames: [{
					marks: [{
						modify: {
							foo: [
								2,
								{
									type: "Revive",
									range: RangeType.Set,
									id: 0,
									priorSeq: 0,
									priorId: 0,
									length: 3,
								},
							],
						},
					}],
				}],
			};
			/**
			 * The ReviveSet segment must be about a different set of nodes than those targeted by
			 * the DeleteSet because the DeleteSet applies before the ReviveSet at which point no
			 * nodes have been revived. Both the revive and the delete must therefore endure.
			 */
			describe("ReviveSet ↷ DeleteSet = ReviveSet & PriorDeleteSet", () => {
				it("base before new", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										{ type: "DeleteSet", id: 0 },
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
										{ type: "PriorDeleteSet", seq: 1, id: 0 },
										1,
										{
											type: "Revive",
											range: RangeType.Set,
											id: 0,
											priorSeq: 0,
											priorId: 0,
											length: 3,
										},
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
										{ type: "DeleteSet", id: 0 },
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
										{
											type: "Revive",
											range: RangeType.Set,
											id: 0,
											priorSeq: 0,
											priorId: 0,
											length: 3,
										},
										4,
										{ type: "PriorDeleteSet", seq: 1, id: 0 },
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
										{ type: "DeleteSet", id: 0, length: 6 },
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
										{
											type: "PriorDeleteSet",
											seq: 1,
											id: 0,
											length: 6,
											mods: [
												1,
												{
													type: "Revive",
													range: RangeType.Set,
													id: 0,
													priorSeq: 0,
													priorId: 0,
													length: 3,
												},
											],
										},
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
		describe("ReviveSlice ↷ *", () => {
			const e2: S.Transaction = {
				ref: 0,
				seq: 2,
				frames: [{
					marks: [{
						modify: {
							foo: [
								2,
								{
									type: "Revive",
									range: RangeType.Slice,
									id: 0,
									priorSeq: 0,
									priorId: 0,
									length: 3,
								},
							],
						},
					}],
				}],
			};
			/**
			 * The ReviveSlice segment must be about a different range of nodes than those targeted by
			 * the DeleteSlice because the DeleteSlice applies before the ReviveSlice at which point no nodes
			 * have been revived. Both the revive and the delete must therefore endure.
			 */
			describe("ReviveSlice ↷ DeleteSlice = ReviveSlice & PriorDeleteSlice", () => {
				it("base before new", () => {
					const e1: S.Transaction = {
						ref: 0,
						seq: 1,
						frames: [{
							marks: [{
								modify: {
									foo: [
										{ type: "DeleteSlice", id: 0 },
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
										{ type: "PriorDeleteSlice", seq: 1, id: 0 },
										1,
										{
											type: "Revive",
											range: RangeType.Slice,
											id: 0,
											priorSeq: 0,
											priorId: 0,
											length: 3,
										},
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
										{ type: "DeleteSlice", id: 0 },
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
										{
											type: "Revive",
											range: RangeType.Slice,
											id: 0,
											priorSeq: 0,
											priorId: 0,
											length: 3,
										},
										4,
										{ type: "PriorDeleteSlice", seq: 1, id: 0 },
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
										{ type: "DeleteSlice", id: 0, length: 6 },
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
										{
											type: "PriorDeleteSlice",
											seq: 1,
											id: 0,
											length: 6,
											mods: [
												1,
												{
													type: "Revive",
													range: RangeType.Slice,
													id: 0,
													priorSeq: 0,
													priorId: 0,
													length: 3,
												},
											],
										},
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

	describe("Inverse Segments Cancellation", () => {
		describe("PriorDeleteSet ↷ ReviveSet = Offset", () => {
			const e1: S.Transaction = {
				ref: 0,
				seq: 1,
				frames: [{
					marks: [{
						modify: {
							foo: [
								1,
								{
									type: "Revive",
									range: RangeType.Set,
									id: 0,
									priorSeq: 0,
									priorId: 0,
									length: 3,
								},
							],
						},
					}],
				}],
			};
			it("match before change", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "PriorDeleteSet", seq: 0, id: 0, length: 3 },
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
			it("change before match", () => {
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
									{ type: "PriorDeleteSet", seq: 0, id: 0, length: 3 },
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
			it("change within match", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{
										type: "PriorDeleteSet",
										seq: 0,
										id: 0,
										length: 3,
										mods: [
											2,
											{ type: "Insert", id: 0, content: [] },
										],
									},
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
		describe("PriorDeleteSlice ↷ ReviveSlice = Offset", () => {
			const e1: S.Transaction = {
				ref: 0,
				seq: 1,
				frames: [{
					marks: [{
						modify: {
							foo: [
								1,
								{
									type: "Revive",
									range: RangeType.Slice,
									id: 0,
									priorSeq: 0,
									priorId: 0,
									length: 3,
								},
							],
						},
					}],
				}],
			};
			it("match before change", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{ type: "PriorDeleteSlice", seq: 0, id: 0, length: 3 },
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
			it("change before match", () => {
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
									{ type: "PriorDeleteSlice", seq: 0, id: 0, length: 3 },
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
			it("change within match", () => {
				const e2: S.Transaction = {
					seq: 2,
					ref: 0,
					newRef: 1,
					frames: [{
						marks: [{
							modify: {
								foo: [
									1,
									{
										type: "PriorDeleteSlice",
										seq: 0,
										id: 0,
										length: 3,
										mods: [
											2,
											{ type: "Insert", id: 0, content: [] },
										],
									},
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

		describe("ScenarioB", () => {
			it("e2", () => {
				const actual = rebase(ScenarioB.e3, ScenarioB.e2);
				assert.deepEqual(actual.frames, ScenarioB.e3p.frames);
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
