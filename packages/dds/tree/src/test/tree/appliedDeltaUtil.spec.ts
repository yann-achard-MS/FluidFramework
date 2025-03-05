/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	EmptyKey,
	initializeForest,
	rootFieldKey,
	type DeltaFieldChanges,
	type DeltaFieldMap,
	type DeltaRoot,
	type FieldKey,
	type TreeNodeSchemaIdentifier,
} from "../../core/index.js";
import { brand, type JsonCompatible } from "../../util/index.js";
import { buildForest, cursorForMapTreeNode } from "../../feature-libraries/index.js";
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

const type: TreeNodeSchemaIdentifier = brand("Node");
const emptyMap = new Map();
const nodeX = { type, value: "X", fields: emptyMap };
const nodeXCursor = cursorForMapTreeNode(nodeX);
const fooKey = brand<FieldKey>("foo");
const barKey = brand<FieldKey>("bar");

const content: JsonCompatible = {
	foo: [{ bar: "A" }, 1, 2, 3, 4],
};

describe("AppliedDeltaUtils", () => {
	describe("appliedDeltaFromForest", () => {
		it("forest and delta", () => {
			const forest = buildForest();
			initializeForest(
				forest,
				[singleJsonCursor(content)],
				testRevisionTagCodec,
				testIdCompressor,
			);
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
			const delta: DeltaRoot = {
				build: [{ id: { minor: 10 }, trees: [nodeXCursor] }],
				rename: [
					{
						count: 2,
						oldId: { minor: 1 },
						newId: { minor: 3 },
					},
				],
				fields,
			};
			const actual = appliedDeltaFromForest(delta, forest);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [],
				detachedFields: {
					[rootFieldKey]: [
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
																	attach: [{ minor: 10 }, { minor: 10 }],
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
				},
			};
			assert.deepEqual(actual, expected);
		});
	});
});
