/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { makeArray, newTupleBTree, type Mutable, type TupleBTree } from "../../util/index.js";
import {
	TreeNavigationResult,
	type IForestSubscription,
	type ITreeSubscriptionCursor,
} from "../forest/index.js";
import type {
	FieldChanges as DeltaFieldChanges,
	FieldMap as DeltaFieldMap,
	Root as DeltaRoot,
	Mark as DeltaMark,
	DetachedNodeId,
} from "./delta.js";
import type {
	DetachedNode as AppliedDeltaDetachedNode,
	FieldMap as AppliedDeltaFieldMap,
	Mark as AppliedDeltaMark,
	MarkList as AppliedDeltaMarkList,
	Root as AppliedDeltaRoot,
	DetachedNodeIdPair,
	Node as AppliedDeltaNode,
	InteriorNode as AppliedDeltaInteriorNode,
} from "./appliedDelta.js";
import type { RevisionTag } from "../rebase/index.js";
import {
	CursorLocationType,
	forEachField,
	type ITreeCursor,
	type ITreeCursorSynchronous,
} from "./cursor.js";
import type { DetachedFieldIndex } from "./detachedFieldIndex.js";
import type { ForestRootId } from "./detachedFieldIndexTypes.js";
import { offsetDetachId } from "./deltaUtil.js";
import { rootFieldKey } from "./types.js";

type NodeIdTuple = [RevisionTag | undefined, number];
type NodeIdBTree<V> = TupleBTree<NodeIdTuple, V>;

type IdPairLookup = (id: DetachedNodeId) => DetachedNodeIdPair;
interface DetachedNodeData {
	readonly oldId: DetachedNodeId;
	readonly forestId?: ForestRootId;
	buildData?: ITreeCursorSynchronous;
	changeData?: DeltaFieldMap;
	src?: "build" | "refresher";
	dst?: "attach" | "destroy";
}

export function appliedDeltaFromForest(
	delta: DeltaRoot,
	forest?: IForestSubscription,
	detached?: DetachedFieldIndex,
): AppliedDeltaRoot {
	const newIdFromOldId = newTupleBTree(
		delta.rename?.flatMap((rename) =>
			makeArray(rename.count, (i): [NodeIdTuple, NodeIdTuple] => [
				[rename.oldId.major, rename.oldId.minor + i],
				[rename.newId.major, rename.newId.minor + i],
			]),
		),
	);
	const oldIdFromNewId = newTupleBTree(
		delta.rename?.flatMap((rename) =>
			makeArray(rename.count, (i): [NodeIdTuple, NodeIdTuple] => [
				[rename.newId.major, rename.newId.minor + i],
				[rename.oldId.major, rename.oldId.minor + i],
			]),
		),
	);
	const idPairFromOldId: IdPairLookup = (oldId: DetachedNodeId) => {
		const oldTuple = nodeIdTuple(oldId);
		const newTuple = newIdFromOldId.get(oldTuple);
		return [oldId, newTuple !== undefined ? nodeIdObj(newTuple) : oldId];
	};
	const idPairFromNewId: IdPairLookup = (newId: DetachedNodeId) => {
		const newTuple = nodeIdTuple(newId);
		const oldTuple = oldIdFromNewId.get(newTuple);
		return [oldTuple !== undefined ? nodeIdObj(oldTuple) : newId, newId];
	};
	const detachedRootsById: NodeIdBTree<DetachedNodeData> = newTupleBTree();

	function appliedDeltaMarkList(
		markList: DeltaFieldChanges | undefined,
		cursor: ITreeCursor | undefined,
	): AppliedDeltaMarkList {
		assert(
			!cursor || cursor.mode === CursorLocationType.Fields,
			"Expected cursor to be in fields",
		);
		const list: AppliedDeltaMark[] = [];
		const length = cursor?.getFieldLength();
		cursor?.firstNode();
		for (const mark of markList ?? []) {
			const appliedMark = appliedDeltaMark(mark, cursor);
			list.push(appliedMark);
		}
		// If processing the marks above has moved the cursor over all the nodes in the field,
		// then the cursor will automatically be put back into fields mode.
		// Only if the cursor is still in nodes mode is there more forest data to consume.
		if (cursor?.mode === CursorLocationType.Nodes) {
			const currentIndex = cursor.fieldIndex;
			// If `cursor` is defined, `length` is also defined.
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const remaining = length! - currentIndex;
			if (remaining > 0) {
				const noop: DeltaMark = { count: remaining };
				const appliedMark = appliedDeltaMark(noop, cursor);
				list.push(appliedMark);
			}
		}
		// We should be back in fields mode now since we consumed all the nodes in the field.
		assert(
			!cursor || cursor.mode === CursorLocationType.Fields,
			"Expected cursor to be in fields",
		);
		return list;
	}

	function appliedDeltaMark(
		mark: DeltaMark,
		cursor: ITreeCursor | undefined,
	): AppliedDeltaMark {
		if (mark.attach !== undefined) {
			const newTuple = nodeIdTuple(mark.attach);
			const oldTuple = oldIdFromNewId.get(newTuple) ?? newTuple;
			const detachedRoot = detachedRootsById.get(oldTuple);
			if (detachedRoot !== undefined) {
				detachedRoot.dst = "attach";
			}
		}
		if (mark.detach !== undefined && mark.attach !== undefined) {
			const nodes = appliedDeltaNodes(mark.count, mark.fields, cursor);
			return {
				changeType: "replace",
				nodes,
				detach: idPairFromOldId(mark.detach),
				attach: idPairFromNewId(mark.attach),
			};
		} else if (mark.detach !== undefined) {
			const nodes = appliedDeltaNodes(mark.count, mark.fields, cursor);
			return {
				changeType: "detach",
				nodes,
				detach: idPairFromOldId(mark.detach),
			};
		} else if (mark.attach !== undefined) {
			return {
				changeType: "attach",
				count: mark.count,
				attach: idPairFromNewId(mark.attach),
			};
		} else {
			const nodes = appliedDeltaNodes(mark.count, mark.fields, cursor);
			return {
				changeType: "noop",
				nodes,
			};
		}
	}

	function appliedDeltaNodes(
		count: number,
		nestedChanges: DeltaFieldMap | undefined,
		cursor: ITreeCursor | undefined,
	): [AppliedDeltaNode, ...AppliedDeltaNode[]] {
		assert(count > 0, "count must be greater than zero");
		assert(
			!cursor || cursor.mode === CursorLocationType.Nodes,
			"Expected cursor to be in nodes",
		);
		if (nestedChanges !== undefined) {
			assert(count === 1, "nested changes must apply to a single node");
			const interiorNode: AppliedDeltaInteriorNode = {
				nodeType: cursor?.type,
				fields: appliedDeltaFieldMap(nestedChanges, cursor),
			};
			cursor?.nextNode();
			return [interiorNode];
		} else {
			if (cursor === undefined) {
				return makeArray(count, () => "<no data>") as [
					AppliedDeltaNode,
					...AppliedDeltaNode[],
				];
			} else {
				const nodes: AppliedDeltaNode[] = [];
				for (let i = 0; i < count; i++) {
					const value = cursor.value;
					if (value !== undefined) {
						nodes.push(value);
					} else {
						const interiorNode: AppliedDeltaInteriorNode = {
							nodeType: cursor?.type,
							fields: appliedDeltaFieldMap(undefined, cursor),
						};
						nodes.push(interiorNode);
					}
					cursor.nextNode();
				}
				return nodes as [AppliedDeltaNode, ...AppliedDeltaNode[]];
			}
		}
	}

	function appliedDeltaFieldMap(
		nestedChanges: DeltaFieldMap | undefined,
		cursor: ITreeCursor | undefined,
	): AppliedDeltaFieldMap {
		assert(
			!cursor || cursor.mode === CursorLocationType.Nodes,
			"Expected cursor to be in nodes",
		);
		const deltaFields = new Map(nestedChanges ?? []);
		const map: Mutable<AppliedDeltaFieldMap> = {};
		if (cursor !== undefined) {
			forEachField(cursor, () => {
				const fieldKey = cursor.getFieldKey();
				const fieldChanges = deltaFields.get(fieldKey);
				if (fieldChanges !== undefined) {
					deltaFields.delete(fieldKey);
				}
				const markList = appliedDeltaMarkList(fieldChanges, cursor);
				map[fieldKey] = markList;
			});
		}
		// Remaining fields (newly created by delta)
		for (const [fieldKey, fieldChanges] of deltaFields) {
			const markList = appliedDeltaMarkList(fieldChanges, undefined);
			map[fieldKey] = markList;
		}
		return map;
	}

	const detachedRootsByFieldKey: Map<ForestRootId, DetachedNodeData> = new Map();
	for (const { id, root } of detached?.entries() ?? []) {
		const idTuple = nodeIdTuple(id);
		const data: DetachedNodeData = {
			oldId: id,
			forestId: root,
		};
		detachedRootsByFieldKey.set(root, data);
		detachedRootsById.set(idTuple, data);
	}
	for (const { id, trees } of delta.build ?? []) {
		for (let iTree = 0; iTree < trees.length; iTree += 1) {
			const offsetId = offsetDetachId(id, iTree);
			const idTuple = nodeIdTuple(offsetId);
			const data: DetachedNodeData = {
				oldId: offsetId,
				src: "build",
				buildData: trees[iTree],
			};
			detachedRootsById.set(idTuple, data);
		}
	}
	for (const { id, trees } of delta.refreshers ?? []) {
		for (let iTree = 0; iTree < trees.length; iTree += 1) {
			const offsetId = offsetDetachId(id, iTree);
			const idTuple = nodeIdTuple(offsetId);
			const existing = detachedRootsById.get(idTuple);
			if (existing !== undefined) {
				existing.src = "refresher";
				existing.buildData = trees[iTree];
			} else {
				const data: DetachedNodeData = {
					oldId: offsetId,
					src: "refresher",
					buildData: trees[iTree],
				};
				detachedRootsById.set(idTuple, data);
			}
		}
	}
	for (const { id, count } of delta.destroy ?? []) {
		for (let iTree = 0; iTree < count; iTree += 1) {
			const offsetId = offsetDetachId(id, iTree);
			const idTuple = nodeIdTuple(offsetId);
			const existing = detachedRootsById.get(idTuple);
			if (existing !== undefined) {
				existing.dst = "destroy";
			} else {
				const data: DetachedNodeData = {
					oldId: offsetId,
					dst: "destroy",
				};
				detachedRootsById.set(idTuple, data);
			}
		}
	}
	for (const { id, fields } of delta.global ?? []) {
		const idTuple = nodeIdTuple(id);
		const existing = detachedRootsById.get(idTuple);
		assert(existing !== undefined, "Invalid edit operation on unknown node");
		existing.changeData = fields;
	}

	let rootField: ITreeSubscriptionCursor | undefined;
	if (forest !== undefined) {
		const cursor = forest.allocateCursor();
		const navigationResult = forest.tryMoveCursorToField(
			{ parent: undefined, fieldKey: rootFieldKey },
			cursor,
		);
		if (navigationResult === TreeNavigationResult.Ok) {
			rootField = cursor;
		}
	}

	// The checks below ensure that the delta follows the expected format.
	// This whole function should be updated if the format changes.
	const detachedFieldKeys = Array.from(delta.fields?.keys() ?? []);
	assert(
		detachedFieldKeys.length <= 1,
		"At most one detached field is expected to be edited by path",
	);
	assert(
		detachedFieldKeys[0] === rootFieldKey || detachedFieldKeys[0] === undefined,
		"Ont the root field may be edited by path",
	);

	const rootMarkList = appliedDeltaMarkList(delta.fields?.get(rootFieldKey), rootField);
	rootField?.free();

	const detachedNodes: AppliedDeltaDetachedNode[] = [];
	for (const data of detachedRootsById.values()) {
		let forestNodeCursor: ITreeSubscriptionCursor | undefined;
		if (forest !== undefined && data.forestId !== undefined && detached !== undefined) {
			const forestFieldKey = detached.toFieldKey(data.forestId);
			const cursor = forest.allocateCursor();
			const navigationResult = forest.tryMoveCursorToField(
				{ parent: undefined, fieldKey: forestFieldKey },
				cursor,
			);
			if (navigationResult === TreeNavigationResult.Ok) {
				cursor.firstNode();
				forestNodeCursor = cursor;
			}
		}
		const nodes = appliedDeltaNodes(1, data.changeData, forestNodeCursor ?? data.buildData);
		forestNodeCursor?.free();
		const appliedDelta: Mutable<AppliedDeltaDetachedNode> = {
			id: idPairFromOldId(data.oldId),
			node: nodes[0],
		};
		if (data.src !== undefined) {
			appliedDelta.src = data.src;
		}
		if (data.dst !== undefined) {
			appliedDelta.dst = data.dst;
		}
		detachedNodes.push(appliedDelta);
	}
	return { rootField: rootMarkList, detachedNodes };
}

function nodeIdTuple(detachedNodeId: DetachedNodeId): NodeIdTuple {
	return [detachedNodeId.major, detachedNodeId.minor];
}

function nodeIdObj(id: NodeIdTuple): DetachedNodeId {
	return id[0] !== undefined ? { major: id[0], minor: id[1] } : { minor: id[1] };
}
