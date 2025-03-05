/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { makeArray, newTupleBTree, type Mutable, type TupleBTree } from "../../util/index.js";
import type { IForestSubscription } from "../forest/index.js";
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
	InteriorNode,
} from "./appliedDelta.js";
import type { RevisionTag } from "../rebase/index.js";
import { CursorLocationType, forEachField, type ITreeCursor } from "./cursor.js";

export type NodeIdTuple = [RevisionTag | undefined, number];
export type NodeIdBTree<V> = TupleBTree<NodeIdTuple, V>;

type IdPairLookup = (id: DetachedNodeId) => DetachedNodeIdPair;

export function appliedDeltaFromForest(
	delta: DeltaRoot,
	forest: IForestSubscription | undefined,
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
		assert(
			!cursor || cursor.mode === CursorLocationType.Nodes,
			"Expected cursor to be in nodes",
		);
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
	): AppliedDeltaNode[] {
		assert(count > 0, "count must be greater than zero");
		assert(
			!cursor || cursor.mode === CursorLocationType.Nodes,
			"Expected cursor to be in nodes",
		);
		if (nestedChanges !== undefined) {
			assert(count === 1, "nested changes must apply to a single node");
			const interiorNode: InteriorNode = {
				nodeType: cursor?.type,
				fields: appliedDeltaFieldMap(nestedChanges, cursor),
			};
			cursor?.nextNode();
			return [interiorNode];
		} else {
			if (cursor === undefined) {
				return makeArray(count, () => "<no data>");
			} else {
				const nodes: AppliedDeltaNode[] = [];
				for (let i = 0; i < count; i++) {
					const value = cursor.value;
					if (value !== undefined) {
						nodes.push(value);
					} else {
						const interiorNode: InteriorNode = {
							nodeType: cursor?.type,
							fields: appliedDeltaFieldMap(undefined, cursor),
						};
						nodes.push(interiorNode);
					}
					cursor.nextNode();
				}
				return nodes;
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

	const rootCursor = forest?.getCursorAboveDetachedFields();
	const detachedFields = appliedDeltaFieldMap(delta.fields, rootCursor);
	const detachedNodes: AppliedDeltaDetachedNode[] = [];
	return { detachedFields, detachedNodes };
}

function nodeIdTuple(detachedNodeId: DetachedNodeId): NodeIdTuple {
	return [detachedNodeId.major, detachedNodeId.minor];
}

function nodeIdObj(id: NodeIdTuple): DetachedNodeId {
	return id[0] !== undefined ? { major: id[0], minor: id[1] } : { minor: id[1] };
}
