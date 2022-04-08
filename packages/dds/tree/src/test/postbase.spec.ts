/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { postbase as postbaseImpl } from "../postbase";
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

function postbase(original: R.Transaction, base: S.Transaction): R.Transaction {
	deepFreeze(original);
	deepFreeze(base);
	return postbaseImpl(original, base);
}

describe(postbase.name, () => {
	describe("Basic Segments Matrix", () => {
		describe("* ↷ Insert", () => {
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
			// const e2nc: S.Transaction = {
			// 	ref: 0,
			// 	seq: 2,
			// 	frames: [{
			// 		marks: [{
			// 			modify: {
			// 				foo: [
			// 					3,
			// 					{ type: "Insert", id: 0, content: [{ id: "X" }], commute: Commutativity.None },
			// 				],
			// 			},
			// 		}],
			// 	}],
			// };
			describe("Insert ↷ Insert", () => {
				it("new before base", () => {
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
					const e1p: S.Transaction = {
						ref: 0,
						seq: 1,
						newRef: 2,
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
					const actual = postbase(e1, e2);
					assert.deepEqual(actual.frames, e1p.frames);
				});
				it("base before new", () => {
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
					const e1p: S.Transaction = {
						ref: 0,
						seq: 1,
						newRef: 2,
						frames: [{
							marks: [{
								modify: {
									foo: [
										6,
										{ type: "Insert", id: 0, content: [{ id: "A" }, { id: "B" }] },
									],
								},
							}],
						}],
					};
					const actual = postbase(e1, e2);
					assert.deepEqual(actual.frames, e1p.frames);
				});
			});
		});
	});

	describe.skip("Scenarios", () => {
		describe("ScenarioA1", () => {
			it("e2", () => {
				const actual = postbase(ScenarioA1.e2, ScenarioA1.e1);
				assert.deepEqual(actual.frames, ScenarioA1.e2p.frames);
			});
		});

		describe("ScenarioA2", () => {
			it("e2", () => {
				const actual = postbase(ScenarioA2.e2, ScenarioA2.e1);
				assert.deepEqual(actual.frames, ScenarioA2.e2p.frames);
			});
		});

		describe("ScenarioC", () => {
			it("e2", () => {
				const actual = postbase(ScenarioC.e3, ScenarioC.e2);
				assert.deepEqual(actual.frames, ScenarioC.e3p.frames);
			});
		});

		describe("ScenarioD", () => {
			it("e2", () => {
				const actual = postbase(ScenarioD.e2, ScenarioD.e1);
				assert.deepEqual(actual.frames, ScenarioD.e2p.frames);
			});
		});

		describe("ScenarioE", () => {
			it("e2", () => {
				const actual = postbase(ScenarioE.e2, ScenarioE.e1);
				assert.deepEqual(actual.frames, ScenarioE.e2p.frames);
			});
		});

		describe("ScenarioF", () => {
			it("e2", () => {
				const actual = postbase(ScenarioF.e2, ScenarioF.e1);
				assert.deepEqual(actual.frames, ScenarioF.e2p.frames);
			});
		});

		describe("ScenarioG", () => {
			it("e2", () => {
				const actual = postbase(ScenarioG.e2, ScenarioG.e1);
				assert.deepEqual(actual.frames, ScenarioG.e2p.frames);
			});
		});
	});
});
