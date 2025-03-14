/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import { strict as assert } from "node:assert";

import {
	EmptyKey,
	makeDetachedFieldIndex,
	rootFieldKey,
	type DeltaFieldChanges,
	type DeltaRoot,
	type FieldKey,
} from "../../core/index.js";
import { brand } from "../../util/index.js";
import { buildForest } from "../../feature-libraries/index.js";
import {
	getAppliedDelta,
	htmlFromAppliedDelta,
	// eslint-disable-next-line import/no-internal-modules
} from "../../core/tree/appliedDeltaUtil.js";
// eslint-disable-next-line import/no-internal-modules
import type { Root as AppliedDeltaRoot } from "../../core/tree/appliedDelta.js";
import { singleJsonCursor } from "../json/index.js";
import { chunkFromJsonTrees, testIdCompressor, testRevisionTagCodec } from "../utils.js";
import { JsonAsTree } from "../../jsonDomainSchema.js";

const fooKey = brand<FieldKey>("foo");

export function writeAppliedDelta(delta: AppliedDeltaRoot, path: string): void {
	const html = htmlFromAppliedDelta(delta);
	fs.writeFileSync(path, html, "utf8");
	console.log(`Wrote Delta to "./${path}"`);
}

describe("AppliedDeltaUtils", () => {
	describe("getAppliedDelta (with state)", () => {
		it("build leaf node", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const forest = buildForest();
			const delta: DeltaRoot = {
				build: [{ id: { minor: 0 }, trees: chunkFromJsonTrees(["X"]) }],
			};
			const actual = getAppliedDelta(delta, forest, index);
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
				refreshers: [{ id: { minor: 0 }, trees: chunkFromJsonTrees(["X"]) }],
			};
			const actual = getAppliedDelta(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 0 }, { minor: 0 }],
						src: "refresh",
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
				refreshers: [{ id: { minor: 0 }, trees: chunkFromJsonTrees(["X"]) }],
			};
			const actual = getAppliedDelta(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 0 }, { minor: 0 }],
						src: "refresh",
						node: "X",
					},
				],
				rootField: [],
			};
			assert.deepEqual(actual, expected);
		});
		it("destroy detached nodes", () => {
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
			const actual = getAppliedDelta(delta, forest, index);
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
		it("rename detached nodes", () => {
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
			const actual = getAppliedDelta(delta, forest, index);
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
				build: [{ id: { minor: 0 }, trees: chunkFromJsonTrees([{ foo: true }]) }],
				global: [
					{
						id: { minor: 0 },
						fields: new Map<FieldKey, DeltaFieldChanges>([
							[
								fooKey,
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
			const actual = getAppliedDelta(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 0 }, { minor: 0 }],
						src: "build",
						node: {
							nodeType: brand(JsonAsTree.JsonObject.identifier),
							fields: {
								[fooKey]: [
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
		it("modify attached node that is being detached", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const forest = buildForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor({ foo: "A" })], rootFieldKey);
			visitor.free();

			const delta: DeltaRoot = {
				fields: new Map<FieldKey, DeltaFieldChanges>([
					[
						rootFieldKey,
						[
							{
								count: 1,
								detach: { minor: 0 },
								fields: new Map<FieldKey, DeltaFieldChanges>([
									[
										fooKey,
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
					],
				]),
			};
			const actual = getAppliedDelta(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [],
				rootField: [
					{
						changeType: "detach",
						detach: [{ minor: 0 }, { minor: 0 }],
						nodes: [
							{
								nodeType: brand(JsonAsTree.JsonObject.identifier),
								fields: {
									[fooKey]: [
										{
											changeType: "detach",
											detach: [{ minor: 1 }, { minor: 1 }],
											nodes: ["A"],
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
		it("modify detached node", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const fieldWithObj = index.toFieldKey(index.createEntry({ minor: 0 }));
			const forest = buildForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor({ foo: true })], fieldWithObj);
			visitor.free();

			const delta: DeltaRoot = {
				global: [
					{
						id: { minor: 0 },
						fields: new Map<FieldKey, DeltaFieldChanges>([
							[
								fooKey,
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
			const actual = getAppliedDelta(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 0 }, { minor: 0 }],
						node: {
							nodeType: brand(JsonAsTree.JsonObject.identifier),
							fields: {
								[fooKey]: [
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
			const actual = getAppliedDelta(delta, forest, index);
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
		it("detach -> rename -> attach", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const forest = buildForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor("X")], rootFieldKey);
			visitor.free();

			const delta: DeltaRoot = {
				fields: new Map<FieldKey, DeltaFieldChanges>([
					[
						rootFieldKey,
						[
							{
								count: 1,
								detach: { minor: 0 },
							},
							{
								count: 1,
								attach: { minor: 1 },
							},
						],
					],
				]),
				rename: [{ oldId: { minor: 0 }, newId: { minor: 1 }, count: 1 }],
			};
			const actual = getAppliedDelta(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [],
				rootField: [
					{
						changeType: "detach",
						detach: [{ minor: 0 }, { minor: 1 }],
						nodes: ["X"],
					},
					{
						changeType: "attach",
						count: 1,
						attach: [{ minor: 0 }, { minor: 1 }],
					},
				],
			};
			assert.deepEqual(actual, expected);
		});
		it("replace", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const srcField = index.toFieldKey(index.createEntry({ minor: 1 }));
			const forest = buildForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor("new")], srcField);
			visitor.create([singleJsonCursor("old")], rootFieldKey);
			visitor.free();

			const delta: DeltaRoot = {
				fields: new Map<FieldKey, DeltaFieldChanges>([
					[
						rootFieldKey,
						[
							{
								count: 1,
								detach: { minor: 0 },
								attach: { minor: 1 },
							},
						],
					],
				]),
			};
			const actual = getAppliedDelta(delta, forest, index);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [
					{
						dst: "attach",
						id: [{ minor: 1 }, { minor: 1 }],
						node: "new",
					},
				],
				rootField: [
					{
						changeType: "replace",
						detach: [{ minor: 0 }, { minor: 0 }],
						attach: [{ minor: 1 }, { minor: 1 }],
						nodes: ["old"],
					},
				],
			};
			assert.deepEqual(actual, expected);
		});
	});
	describe("htmlFromAppliedDelta", () => {
		it("move object", () => {
			const delta: AppliedDeltaRoot = {
				detachedNodes: [
					{
						id: [{ minor: 40 }, { minor: 40 }],
						node: "X",
					},
					{
						id: [{ minor: 41 }, { minor: 41 }],
						src: "build",
						node: "Y",
					},
					{
						id: [{ minor: 42 }, { minor: 42 }],
						src: "refresh",
						node: "Z",
					},
					{
						id: [{ minor: 46 }, { minor: 46 }],
						node: "X",
						dst: "destroy",
					},
					{
						id: [{ minor: 47 }, { minor: 47 }],
						src: "build",
						dst: "destroy",
						node: "Y",
					},
					{
						id: [{ minor: 48 }, { minor: 48 }],
						src: "refresh",
						dst: "destroy",
						node: "Z",
					},
					{
						id: [{ minor: 50 }, { minor: 51 }],
						node: "X",
						dst: "attach",
					},
					{
						id: [{ minor: 52 }, { minor: 53 }],
						src: "build",
						dst: "attach",
						node: "Y",
					},
					{
						id: [{ minor: 54 }, { minor: 55 }],
						src: "refresh",
						dst: "attach",
						node: {
							nodeType: brand(JsonAsTree.JsonObject.identifier),
							fields: {
								[fooKey]: [
									{
										changeType: "noop",
										nodes: [false],
									},
								],
							},
						},
					},
				],
				rootField: [
					{
						changeType: "attach",
						count: 1,
						attach: [{ minor: 50 }, { minor: 51 }],
					},
					{
						changeType: "attach",
						count: 1,
						attach: [{ minor: 52 }, { minor: 53 }],
					},
					{
						changeType: "attach",
						count: 1,
						attach: [{ minor: 54 }, { minor: 55 }],
					},
					{
						changeType: "detach",
						detach: [{ minor: 0 }, { minor: 0 }],
						nodes: [
							{
								nodeType: brand(JsonAsTree.JsonObject.identifier),
								fields: {
									[fooKey]: [
										{
											changeType: "noop",
											nodes: [true],
										},
									],
								},
							},
							false,
							null,
						],
					},
					{
						changeType: "attach",
						count: 2,
						attach: [{ minor: 1 }, { minor: 1 }],
					},
					{
						changeType: "noop",
						nodes: [
							{
								nodeType: brand(JsonAsTree.Array.identifier),
								fields: {
									[EmptyKey]: [
										{
											changeType: "noop",
											nodes: [
												{
													nodeType: brand(JsonAsTree.JsonObject.identifier),
													fields: {
														[fooKey]: [
															{
																changeType: "noop",
																nodes: [1, 2, 3],
															},
														],
													},
												},
											],
										},
									],
								},
							},
							false,
							null,
						],
					},
					{
						changeType: "replace",
						detach: [{ minor: 10 }, { minor: 10 }],
						attach: [{ minor: 0 }, { minor: 0 }],
						nodes: [
							{
								nodeType: brand(JsonAsTree.JsonObject.identifier),
								fields: {
									[fooKey]: [
										{
											changeType: "noop",
											nodes: [false],
										},
									],
								},
							},
						],
					},
				],
			};
			writeAppliedDelta(delta, "move-object.html");
		});
	});
});
