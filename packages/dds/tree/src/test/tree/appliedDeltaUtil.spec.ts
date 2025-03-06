/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	EmptyKey,
	makeDetachedFieldIndex,
	rootFieldKey,
	type DeltaDetachedNodeChanges,
	type DeltaFieldChanges,
	type DeltaFieldMap,
	type DeltaRoot,
	type FieldKey,
} from "../../core/index.js";
import { brand, type JsonCompatible } from "../../util/index.js";
import { buildForest } from "../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { appliedDeltaFromForest } from "../../core/tree/appliedDeltaUtil.js";
import type {
	Root as AppliedDeltaRoot,
	// DetachedNode as AppliedDeltaDetachedNode,
	// FieldMap as AppliedDeltaFieldMap,
	// Mark as AppliedDeltaMark,
	// MarkList as AppliedDeltaMarkList,
	// DetachedNodeIdPair,
	// Node as AppliedDeltaNode,
	// InteriorNode,
	// eslint-disable-next-line import/no-internal-modules
} from "../../core/tree/appliedDelta.js";
import { JsonArray, JsonObject, singleJsonCursor } from "../json/index.js";
import { testIdCompressor, testRevisionTagCodec } from "../utils.js";

const fooKey = brand<FieldKey>("foo");
const barKey = brand<FieldKey>("bar");
const bazKey = brand<FieldKey>("baz");

const content: JsonCompatible = {
	foo: [{ bar: "A" }, 1, 2, 3, 4],
};

describe("AppliedDeltaUtils", () => {
	describe("appliedDeltaFromForest", () => {
		it("forest and delta", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const fieldWithObj = index.toFieldKey(index.createEntry({ minor: 10 }));
			const fieldWithX = index.toFieldKey(index.createEntry({ minor: 20 }));
			const fieldWithY = index.toFieldKey(index.createEntry({ minor: 30 }));
			const fieldWithZ = index.toFieldKey(index.createEntry({ minor: 40 }));
			const forest = buildForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor(content)], rootFieldKey);
			visitor.create([singleJsonCursor({ baz: true })], fieldWithObj);
			visitor.create([singleJsonCursor("X")], fieldWithX);
			visitor.create([singleJsonCursor("Y")], fieldWithY);
			visitor.create([singleJsonCursor("Z")], fieldWithZ);
			visitor.free();
			const fields: DeltaFieldMap = new Map<FieldKey, DeltaFieldChanges>([
				[
					rootFieldKey,
					[
						{
							count: 1,
							fields: new Map<FieldKey, DeltaFieldChanges>([
								[
									fooKey,
									[
										{
											count: 1,
											detach: { minor: 0 },
											fields: new Map<FieldKey, DeltaFieldChanges>([
												[
													EmptyKey,
													[
														{
															count: 1,
															attach: { minor: 4 },
														},
														{ count: 1 },
														{
															count: 2,
															detach: { minor: 1 },
															attach: { minor: 10 },
														},
													],
												],
											]),
										},
									],
								],
							]),
						},
					],
				],
			]);
			const detachedNodeChanges: DeltaDetachedNodeChanges[] = [
				{
					id: { minor: 20 },
					fields: new Map<FieldKey, DeltaFieldChanges>([
						[
							bazKey,
							[
								{
									count: 1,
									detach: { minor: 21 },
								},
							],
						],
					]),
				},
			];
			const delta: DeltaRoot = {
				build: [{ id: { minor: 10 }, trees: [singleJsonCursor("X")] }],
				refreshers: [{ id: { minor: 20 }, trees: [singleJsonCursor({ baz: true })] }],
				destroy: [{ id: { minor: 30 }, count: 1 }],
				rename: [
					{
						count: 2,
						oldId: { minor: 1 },
						newId: { minor: 3 },
					},
				],
				global: detachedNodeChanges,
				fields,
			};
			const actual = appliedDeltaFromForest(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 10 }, { minor: 10 }],
						src: "refresher",
						node: {
							nodeType: brand(JsonObject.identifier),
							fields: {
								[bazKey]: [
									{
										changeType: "detach",
										detach: [{ minor: 11 }, { minor: 11 }],
										nodes: [true],
									},
								],
							},
						},
					},
					{
						id: [{ minor: 20 }, { minor: 20 }],
						src: "build",
						dst: "attach",
						node: "X",
					},
					{
						id: [{ minor: 30 }, { minor: 30 }],
						dst: "destroy",
						node: "Y",
					},
					{
						id: [{ minor: 40 }, { minor: 40 }],
						node: "Z",
					},
				],
				rootField: [
					{
						changeType: "noop",
						nodes: [
							{
								nodeType: brand(JsonObject.identifier),
								fields: {
									[fooKey]: [
										{
											changeType: "detach",
											detach: [{ minor: 0 }, { minor: 0 }],
											nodes: [
												{
													nodeType: brand(JsonArray.identifier),
													fields: {
														[EmptyKey]: [
															{
																changeType: "attach",
																count: 1,
																attach: [{ minor: 2 }, { minor: 4 }],
															},
															{
																changeType: "noop",
																nodes: [
																	{
																		nodeType: brand(JsonObject.identifier),
																		fields: {
																			[barKey]: [
																				{
																					changeType: "noop",
																					nodes: ["A"],
																				},
																			],
																		},
																	},
																],
															},
															{
																changeType: "replace",
																nodes: [1, 2],
																detach: [{ minor: 1 }, { minor: 3 }],
																attach: [{ minor: 20 }, { minor: 20 }],
															},
															{
																changeType: "noop",
																nodes: [3, 4],
															},
														],
													},
												},
											],
										},
									],
								},
							},
						],
					},
				],
			};
			assert.deepEqual(actual, expected);
		});
		it("build leaf node", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const forest = buildForest();
			const delta: DeltaRoot = {
				build: [{ id: { minor: 0 }, trees: [singleJsonCursor("X")] }],
			};
			const actual = appliedDeltaFromForest(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 0 }, { minor: 0 }],
						src: "build",
						node: "X",
					},
				],
				rootField: [],
			};
			assert.deepEqual(actual, expected);
		});
		it("refresh absent leaf node", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const forest = buildForest();
			const delta: DeltaRoot = {
				refreshers: [{ id: { minor: 0 }, trees: [singleJsonCursor("X")] }],
			};
			const actual = appliedDeltaFromForest(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 0 }, { minor: 0 }],
						src: "refresher",
						node: "X",
					},
				],
				rootField: [],
			};
			assert.deepEqual(actual, expected);
		});
		it("refresh present leaf node", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const fieldWithX = index.toFieldKey(index.createEntry({ minor: 0 }));
			const forest = buildForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor("X")], fieldWithX);
			visitor.free();

			const delta: DeltaRoot = {
				refreshers: [{ id: { minor: 0 }, trees: [singleJsonCursor("X")] }],
			};
			const actual = appliedDeltaFromForest(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 0 }, { minor: 0 }],
						src: "refresher",
						node: "X",
					},
				],
				rootField: [],
			};
			assert.deepEqual(actual, expected);
		});
		it("destroy nodes", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const fieldWithX = index.toFieldKey(index.createEntry({ minor: 0 }));
			const fieldWithY = index.toFieldKey(index.createEntry({ minor: 1 }));
			const forest = buildForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor("X")], fieldWithX);
			visitor.create([singleJsonCursor("Y")], fieldWithY);
			visitor.free();

			const delta: DeltaRoot = {
				destroy: [{ id: { minor: 0 }, count: 2 }],
			};
			const actual = appliedDeltaFromForest(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 0 }, { minor: 0 }],
						dst: "destroy",
						node: "X",
					},
					{
						id: [{ minor: 1 }, { minor: 1 }],
						dst: "destroy",
						node: "Y",
					},
				],
				rootField: [],
			};
			assert.deepEqual(actual, expected);
		});
		it("rename nodes", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const fieldWithX = index.toFieldKey(index.createEntry({ minor: 0 }));
			const fieldWithY = index.toFieldKey(index.createEntry({ minor: 1 }));
			const forest = buildForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor("X")], fieldWithX);
			visitor.create([singleJsonCursor("Y")], fieldWithY);
			visitor.free();

			const delta: DeltaRoot = {
				rename: [{ oldId: { minor: 0 }, newId: { minor: 1 }, count: 2 }],
			};
			const actual = appliedDeltaFromForest(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 0 }, { minor: 1 }],
						node: "X",
					},
					{
						id: [{ minor: 1 }, { minor: 2 }],
						node: "Y",
					},
				],
				rootField: [],
			};
			assert.deepEqual(actual, expected);
		});
		it("build and modify object node", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const forest = buildForest();
			const delta: DeltaRoot = {
				build: [{ id: { minor: 0 }, trees: [singleJsonCursor("X")] }],
				global: [
					{
						id: { minor: 0 },
						fields: new Map<FieldKey, DeltaFieldChanges>([
							[
								bazKey,
								[
									{
										count: 1,
										detach: { minor: 1 },
									},
								],
							],
						]),
					},
				],
			};
			const actual = appliedDeltaFromForest(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 0 }, { minor: 0 }],
						src: "build",
						node: {
							nodeType: brand(JsonObject.identifier),
							fields: {
								[bazKey]: [
									{
										changeType: "detach",
										detach: [{ minor: 1 }, { minor: 1 }],
										nodes: [true],
									},
								],
							},
						},
					},
				],
				rootField: [],
			};
			assert.deepEqual(actual, expected);
		});
		it("modify detached node", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const fieldWithObj = index.toFieldKey(index.createEntry({ minor: 0 }));
			const forest = buildForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor({ baz: true })], fieldWithObj);
			visitor.free();

			const delta: DeltaRoot = {
				global: [
					{
						id: { minor: 0 },
						fields: new Map<FieldKey, DeltaFieldChanges>([
							[
								bazKey,
								[
									{
										count: 1,
										detach: { minor: 1 },
									},
								],
							],
						]),
					},
				],
			};
			const actual = appliedDeltaFromForest(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 0 }, { minor: 0 }],
						node: {
							nodeType: brand(JsonObject.identifier),
							fields: {
								[bazKey]: [
									{
										changeType: "detach",
										detach: [{ minor: 1 }, { minor: 1 }],
										nodes: [true],
									},
								],
							},
						},
					},
				],
				rootField: [],
			};
			assert.deepEqual(actual, expected);
		});
		it("attach detached node", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const fieldNodeX = index.toFieldKey(index.createEntry({ minor: 0 }));
			const forest = buildForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor("X")], fieldNodeX);
			visitor.free();

			const delta: DeltaRoot = {
				fields: new Map<FieldKey, DeltaFieldChanges>([
					[
						rootFieldKey,
						[
							{
								count: 1,
								attach: { minor: 0 },
							},
						],
					],
				]),
			};
			const actual = appliedDeltaFromForest(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 0 }, { minor: 0 }],
						node: "X",
						dst: "attach",
					},
				],
				rootField: [
					{
						changeType: "attach",
						count: 1,
						attach: [{ minor: 0 }, { minor: 0 }],
					},
				],
			};
			assert.deepEqual(actual, expected);
		});
	});
});
