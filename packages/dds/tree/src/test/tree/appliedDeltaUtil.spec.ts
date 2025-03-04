/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	DeltaFieldChanges,
	DeltaFieldMap,
	DeltaRoot,
	FieldKey,
	TreeNodeSchemaIdentifier,
} from "../../core/index.js";
import { brand } from "../../util/index.js";
import { cursorForMapTreeNode } from "../../feature-libraries/index.js";
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

const type: TreeNodeSchemaIdentifier = brand("Node");
const emptyMap = new Map();
const nodeX = { type, value: "X", fields: emptyMap };
const nodeXCursor = cursorForMapTreeNode(nodeX);
const fooKey = brand<FieldKey>("foo");

describe("AppliedDeltaUtils", () => {
	describe("appliedDeltaFromForest", () => {
		it("no forest", () => {
			const fields: DeltaFieldMap = new Map<FieldKey, DeltaFieldChanges>([
				[
					fooKey,
					[
						{ count: 2 },
						{
							count: 1,
							detach: { minor: 0 }, // rename to 2
							fields: new Map<FieldKey, DeltaFieldChanges>([
								[
									fooKey,
									[
										{
											count: 1,
											attach: { minor: 10 },
										},
										{ count: 1 },
									],
								],
							]),
						},
						{
							count: 1,
							detach: { minor: 1 }, // rename to 3
							attach: { minor: 2 }, // renamed from 0
						},
						{
							count: 1,
							attach: { minor: 3 },
						},
					],
				],
			]);
			const delta: DeltaRoot = {
				build: [{ id: { minor: 10 }, trees: [nodeXCursor] }],
				rename: [
					{
						count: 2,
						oldId: { minor: 0 },
						newId: { minor: 2 },
					},
				],
				fields,
			};
			const actual = appliedDeltaFromForest(delta, undefined);
			const expected: AppliedDeltaRoot = {
				detachedNodes: [],
				detachedFields: {
					[fooKey]: [
						{
							type: "noop",
							nodes: ["<no data>", "<no data>"],
						},
						{
							type: "detach",
							nodes: [
								{
									type: undefined,
									fields: {
										[fooKey]: [
											{
												type: "attach",
												attach: [{ minor: 10 }, { minor: 10 }],
											},
											{
												type: "noop",
												nodes: ["<no data>"],
											},
										],
									},
								},
							],
							detach: [{ minor: 0 }, { minor: 2 }],
						},
						{
							type: "replace",
							nodes: ["<no data>"],
							detach: [{ minor: 1 }, { minor: 3 }],
							attach: [{ minor: 0 }, { minor: 2 }],
						},
						{
							type: "attach",
							attach: [{ minor: 1 }, { minor: 3 }],
						},
					],
				},
			};
			assert.deepEqual(actual, expected);
		});
	});
});
