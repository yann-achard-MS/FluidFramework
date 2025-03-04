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
import { forEachField, type ITreeCursor } from "./cursor.js";

export type NodeIdTuple = [RevisionTag | undefined, number];
export type NodeIdBTree<V> = TupleBTree<NodeIdTuple, V>;

type IdPairLookup = (id: DetachedNodeId) => DetachedNodeIdPair;

export function appliedDeltaFromForest(
	delta: DeltaRoot,
	forest: IForestSubscription,
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
		fieldCursor: ITreeCursor | undefined,
	): AppliedDeltaMarkList {
		const list: AppliedDeltaMark[] = [];
		fieldCursor?.firstNode();
		for (const mark of markList ?? []) {
			const appliedMark = appliedDeltaMark(mark, fieldCursor);
			list.push(appliedMark);
		}
		if (fieldCursor !== undefined) {
			const length = fieldCursor.getFieldLength();
			const currentIndex = fieldCursor.fieldIndex;
			const remaining = length - currentIndex;
			if (remaining > 0) {
				const noop: DeltaMark = { count: remaining };
				const appliedMark = appliedDeltaMark(noop, fieldCursor);
				list.push(appliedMark);
			}
		}
		fieldCursor?.exitNode();
		return list;
	}

	function appliedDeltaMark(
		mark: DeltaMark,
		fieldCursor: ITreeCursor | undefined,
	): AppliedDeltaMark {
		if (mark.detach !== undefined && mark.attach !== undefined) {
			const nodes = appliedDeltaNodes(mark.count, mark.fields, fieldCursor);
			return {
				type: "replace",
				nodes,
				detach: idPairFromOldId(mark.detach),
				attach: idPairFromNewId(mark.attach),
			};
		} else if (mark.detach !== undefined) {
			const nodes = appliedDeltaNodes(mark.count, mark.fields, fieldCursor);
			return {
				type: "detach",
				nodes,
				detach: idPairFromOldId(mark.detach),
			};
		} else if (mark.attach !== undefined) {
			return {
				type: "attach",
				attach: idPairFromNewId(mark.attach),
			};
		} else {
			const nodes = appliedDeltaNodes(mark.count, mark.fields, fieldCursor);
			return {
				type: "noop",
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
		const nodes: AppliedDeltaNode[] = [];
		if (nestedChanges !== undefined) {
			assert(count === 1, "nested changes must apply to a single node");
			const interiorNode: InteriorNode = {
				type: cursor?.type,
				fields: appliedDeltaFieldMap(nestedChanges, cursor),
			};
			nodes.push(interiorNode);
			cursor?.nextNode();
		} else {
			if (cursor === undefined) {
				makeArray(count, () => "<no data>");
			} else {
				for (let i = 0; i < count; i++) {
					const value = cursor.value;
					if (value !== undefined) {
						nodes.push(value);
					} else {
						const interiorNode: InteriorNode = {
							type: cursor?.type,
							fields: appliedDeltaFieldMap(undefined, cursor),
						};
						nodes.push(interiorNode);
					}
					cursor.nextNode();
				}
			}
		}
		return nodes;
	}

	function appliedDeltaFieldMap(
		nestedChanges: DeltaFieldMap | undefined,
		fieldCursor: ITreeCursor | undefined,
	): AppliedDeltaFieldMap {
		const deltaFields = new Map(delta.fields ?? []);
		const map: Mutable<AppliedDeltaFieldMap> = {};
		forEachField(rootCursor, (field) => {
			const fieldKey = field.getFieldKey();
			const fieldChanges = deltaFields.get(fieldKey);
			if (fieldChanges !== undefined) {
				deltaFields.delete(fieldKey);
			}
			fieldCursor?.enterField(fieldKey);
			const markList = appliedDeltaMarkList(fieldChanges, fieldCursor);
			fieldCursor?.exitField();
			map[fieldKey] = markList;
		});
		// Remaining fields (newly created by delta)
		for (const [fieldKey, fieldChanges] of deltaFields) {
			const markList = appliedDeltaMarkList(fieldChanges, undefined);
			map[fieldKey] = markList;
		}
		return detachedFields;
	}

	const rootCursor = forest.getCursorAboveDetachedFields();
	const detachedFields = appliedDeltaFieldMap(delta.fields, rootCursor);
	const detachedNodes: AppliedDeltaDetachedNode[] = [];
	return { detachedFields, detachedNodes };
}

function nodeIdTuple(detachedNodeId: DetachedNodeId): NodeIdTuple {
	return [detachedNodeId.major, detachedNodeId.minor];
}

function nodeIdObj(id: NodeIdTuple): DetachedNodeId {
	return { major: id[0], minor: id[1] };
}
