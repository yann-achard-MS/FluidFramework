/* eslint-disable unicorn/no-array-push-push */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
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
import { areDetachedNodeIdsEqual, offsetDetachId } from "./deltaUtil.js";
import { rootFieldKey } from "./types.js";
import { isFluidHandle } from "@fluidframework/runtime-utils";

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

type NodeDestiny =
	| { type: "noop" }
	| { type: "attach"; dst: DetachedNodeIdPair }
	| { type: "replace"; dst: DetachedNodeIdPair; src: DetachedNodeIdPair }
	| { type: "destroy" };

function collectAttachedNodes(delta: AppliedDeltaRoot): NodeIdBTree<AppliedDeltaNode> {
	const nodesByOldId: NodeIdBTree<AppliedDeltaNode> = newTupleBTree();
	function collectFromMarkList(markList: AppliedDeltaMarkList): void {
		for (const mark of markList) {
			collectFromMark(mark);
		}
	}
	function collectFromMark(mark: AppliedDeltaMark): void {
		if (mark.changeType === "attach") {
			return;
		}
		for (const [index, node] of mark.nodes.entries()) {
			if (mark.changeType === "detach" || mark.changeType === "replace") {
				const offsetId = offsetDetachId(mark.detach[0], index);
				nodesByOldId.set(nodeIdTuple(offsetId), node);
			}
			collectFromNode(node);
		}
	}
	function collectFromNode(mark: AppliedDeltaNode): void {
		if (typeof mark !== "object" || mark === null || isFluidHandle(mark)) {
			return;
		}
		for (const fieldList of Object.values(mark.fields)) {
			collectFromMarkList(fieldList);
		}
	}
	for (const detachedNode of delta.detachedNodes) {
		if (detachedNode.dst === "attach") {
			nodesByOldId.set(nodeIdTuple(detachedNode.id[0]), detachedNode.node);
		}
	}
	collectFromMarkList(delta.rootField);
	return nodesByOldId;
}

export function htmlFromAppliedDelta(delta: AppliedDeltaRoot): string {
	const nodesByOldId = collectAttachedNodes(delta);

	const lines: string[] = [];
	lines.push(`<div class="delta">`);
	{
		lines.push(`<div><span>Detached Root Nodes:</span><ul>`);
		{
			for (const detachedNode of delta.detachedNodes) {
				lines.push(
					`<li><div id="src${nodeIdPairToString(detachedNode.id)}" class="${detachedNode.src ?? "prior"}">`,
				);
				{
					const destiny: NodeDestiny = detachedNode.dst
						? detachedNode.dst === "destroy"
							? { type: "destroy" }
							: { type: "attach", dst: detachedNode.id }
						: { type: "noop" };
					lines.push(htmlFromNode(detachedNode.node, destiny, nodesByOldId));
				}
				lines.push(`</div></li>`);
			}
		}
		lines.push(`</ul></div>`);
		lines.push(`<div><span>Root Field:</span>`);
		{
			lines.push(htmlFromMarkList(delta.rootField, nodesByOldId));
		}
		lines.push(`</div>`);
	}
	lines.push(`</div>`);
	lines.push(`
		<style>
		:root {
			/* space toggles */
			--on: initial;
			--off: /*!*/;

			--bg1: rgb(35, 35, 40);
			--bg2: rgb(45, 45, 45);

			/* initialize toggles */
			--_1: var(--on);
			--_2: var(--off);
		}

		.delta {
			font-family: 'consolas';
			padding: 0 0px;
			margin: 0px;
			color: white;
			display: flex;
		}

		.delta ul {
			list-style-type: none;
			padding-right: 10px;
		}

		.destiny-out, .destiny-in, .cell {
			margin-left: 1em;
			font-style: italic;
			font-size: small;
			color: gray;
		}
		.destiny-out::before {
			content: " ⭢ ";
		}
		.destiny-in::before {
			content: "⭠ ";
		}

		.delta li > * {
			/* rotate toggles */
			--_1: var(--2);
			--_2: var(--1);
		}

		.delta li {
			/* promote toggles */
			--1: var(--_1);
			--2: var(--_2);
			--bgIn: var(--1,var(--bg1)) var(--2, var(--bg2));
			--bgOut: var(--1,var(--bg2)) var(--2, var(--bg1));

			background: var(--bgIn);
			padding: 0.0em 0.4em;
			margin-left: -1em;
			border: 2px solid var(--bgOut);
		}
		/* unvisited link */
		.delta a:link {
			color: rgb(255, 255, 255);
		}
		/* visited link */
		.delta a:visited {
			color: rgb(146, 190, 255);
		}
		/* mouse over link */
		.delta a:hover {
			color: rgb(146, 190, 255);
		}
		/* selected link */
		.delta a:active {
			color: rgb(146, 190, 255);
		}
		.preview {
			display: inline-block;
			text-decoration: underline;
		}
		.delta {
			display: block;
		}
		.noop::before, .attach::before, .detach::before, .replace::before {
			border-radius: 1em;
			border: solid .1em #999;
			margin-left: .2em;
			padding: .0em .4em;
			font-size: small;
			color: rgb(210, 210, 210);
		}
		.multiplier {
			font-size: .8em;
			color: gray;
		}
		.noop::before {
			content: "no-op";
			background: gray;
		}
		.attach::before {
			content: "attach";
			background: #070;
		}
		.detach::before {
			content: "detach";
			background: #811;
		}
		.replace::before {
			content: "replace";
			background: #048;
		}
		</style>`);
	return lines.join("\n");
}

function dstId(id: DetachedNodeIdPair): string {
	return `dst${nodeIdToString(id[1])}`;
}

function srcId(id: DetachedNodeIdPair): string {
	return `src${nodeIdToString(id[0])}`;
}

function nodeIdPairToString(id: DetachedNodeIdPair): string {
	if (areDetachedNodeIdsEqual(id[0], id[1])) {
		return nodeIdToString(id[0]);
	}
	return `${nodeIdToString(id[0])}->${nodeIdToString(id[1])}`;
}

function nodeIdToString(id: DetachedNodeId): string {
	if (id.major === undefined) {
		return `${id.minor}`;
	}
	return `${id.major}_${id.minor}`;
}

function htmlFromDestiny(
	destiny: NodeDestiny,
	nodesByOldId: NodeIdBTree<AppliedDeltaNode>,
): string {
	switch (destiny.type) {
		case "noop":
			return "";
		case "attach":
			return `<span class="destiny-out">sent to ${nodeDstLink(destiny.dst)}</span>`;
		case "replace":
			return `<span class="destiny-out">sent to ${nodeDstLink(destiny.dst)} and replaced by ${nodeSrcLink(destiny.src, htmlPreview(destiny.src, nodesByOldId))}</span>`;
		case "destroy":
			return `<span class="destiny-out">destroyed</span>`;
		default:
			unreachableCase(destiny);
	}
}

function htmlPreview(
	id: DetachedNodeIdPair,
	nodesByOldId: NodeIdBTree<AppliedDeltaNode>,
): string {
	const node = nodesByOldId.get(nodeIdTuple(id[0]));
	assert(node !== undefined, "Preview node not found");
	const lines: string[] = [];
	lines.push(`<div class="preview">`);
	{
		if (typeof node === "string") {
			lines.push(`<span>"${node}"</span>`);
		} else if (typeof node === "number" || typeof node === "boolean") {
			lines.push(`<span>${node}</span>`);
		} else if (node === null) {
			lines.push(`<span>null</span>`);
		} else if (isFluidHandle(node)) {
			lines.push(`<span><fluid-handle></span>`);
		} else {
			lines.push(`<span>${node.nodeType ?? "<Object>"}</span>`);
		}
	}
	lines.push(`</div>`);
	return lines.join("\n");
}

function htmlFromNode(
	node: AppliedDeltaNode,
	destiny: NodeDestiny,
	nodesByOldId: NodeIdBTree<AppliedDeltaNode>,
): string {
	const lines: string[] = [];
	lines.push(`<div>`);
	{
		const edit = htmlFromDestiny(destiny, nodesByOldId);
		const id =
			destiny.type === "attach" || destiny.type === "replace" ? destiny.dst : undefined;
		const htmlId = id !== undefined ? ` id="${srcId(id)}"` : "";
		if (typeof node === "string") {
			lines.push(`<span${htmlId}>"${node}"</span>${edit}`);
		} else if (typeof node === "number" || typeof node === "boolean") {
			lines.push(`<span${htmlId}>${node}</span>${edit}`);
		} else if (node === null) {
			lines.push(`<span${htmlId}>null</span>${edit}`);
		} else if (isFluidHandle(node)) {
			lines.push(`<span${htmlId}><fluid-handle></span>${edit}`);
		} else {
			if (node.nodeType !== undefined) {
				lines.push(`<span${htmlId}>${node.nodeType}</span>${edit}`);
			}
			lines.push(`<ul>`);
			{
				for (const [key, value] of Object.entries(node.fields)) {
					lines.push(`<li><span>${key}:</span>`);
					lines.push(htmlFromMarkList(value, nodesByOldId));
					lines.push(`</li>`);
				}
			}
			lines.push(`</ul>`);
		}
	}
	lines.push(`</div>`);
	return lines.join("\n");
}

function htmlFromMarkList(
	marklist: AppliedDeltaMarkList,
	nodesByOldId: NodeIdBTree<AppliedDeltaNode>,
): string {
	const lines: string[] = [];
	lines.push(`<ul>`);
	for (const mark of marklist) {
		lines.push(htmlFromMark(mark, nodesByOldId));
	}
	lines.push(`</ul>`);
	return lines.join("\n");
}

function htmlFromMark(
	mark: AppliedDeltaMark,
	nodesByOldId: NodeIdBTree<AppliedDeltaNode>,
): string {
	const lines: string[] = [];
	switch (mark.changeType) {
		case "noop":
			lines.push(`<li class="noop">`);
			lines.push(`<span class="multiplier">(x${mark.nodes.length})</span>`);
			lines.push(htmlFromNodes(mark.nodes, nodesByOldId));
			break;
		case "attach":
			lines.push(`<li class="attach">`);
			lines.push(`<span class="multiplier">(x${mark.count})</span>`);
			lines.push(`<ul>`);
			for (let i = 0; i < mark.count; i++) {
				const id = offsetDetachIdPair(mark.attach, i);
				lines.push(
					`<li class="cell" id=${dstId(id)}>@${nodeIdToString(id[1])}<span class="destiny-in">attaching ${nodeSrcLink(id, htmlPreview(id, nodesByOldId))}</span></li>`,
				);
			}
			lines.push(`</ul>`);

			break;
		case "detach":
			lines.push(`<li class="detach">`);
			lines.push(`<span class="multiplier">(x${mark.nodes.length})</span>`);
			lines.push(htmlFromNodes(mark.nodes, nodesByOldId, mark.detach));
			break;
		case "replace":
			lines.push(`<li class="replace">`);
			lines.push(`<span class="multiplier">(x${mark.nodes.length})</span>`);
			lines.push(htmlFromNodes(mark.nodes, nodesByOldId, mark.detach, mark.attach));
			break;
		default:
			unreachableCase(mark);
	}
	lines.push(`</li>`);
	return lines.join("\n");
}

function htmlFromNodes(
	nodes: readonly AppliedDeltaNode[],
	nodesByOldId: NodeIdBTree<AppliedDeltaNode>,
	detachId?: DetachedNodeIdPair,
	attachId?: DetachedNodeIdPair,
): string {
	const lines: string[] = [];
	lines.push(`<ul>`);
	{
		for (const [index, node] of nodes.entries()) {
			lines.push(`<li>`);
			const destiny: NodeDestiny =
				detachId && attachId
					? {
							type: "replace",
							dst: offsetDetachIdPair(detachId, index),
							src: offsetDetachIdPair(attachId, index),
						}
					: detachId
						? { type: "attach", dst: offsetDetachIdPair(detachId, index) }
						: { type: "noop" };
			lines.push(htmlFromNode(node, destiny, nodesByOldId));
			lines.push(`</li>`);
		}
	}
	lines.push(`</ul>`);
	return lines.join("\n");
}

function nodeSrcLink(id: DetachedNodeIdPair, linkContent?: string): string {
	const idString = nodeIdToString(id[0]);
	return `<a href="#src${idString}">${linkContent ?? `#${idString}`}</a>`;
}

function nodeDstLink(id: DetachedNodeIdPair): string {
	const idString = nodeIdToString(id[1]);
	return `<a href="#dst${idString}">@${idString}</a>`;
}

function offsetDetachIdPair(idPair: DetachedNodeIdPair, offset: number): DetachedNodeIdPair {
	return [offsetDetachId(idPair[0], offset), offsetDetachId(idPair[1], offset)];
}
