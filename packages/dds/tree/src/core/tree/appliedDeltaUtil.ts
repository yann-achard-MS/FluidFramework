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
	forEachNode,
	type ITreeCursor,
	type ITreeCursorSynchronous,
} from "./cursor.js";
import type { DetachedFieldIndex } from "./detachedFieldIndex.js";
import type { ForestRootId } from "./detachedFieldIndexTypes.js";
import { offsetDetachId } from "./deltaUtil.js";
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
	src?: "build" | "refresh";
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
		let iTree = 0;
		forEachNode(trees.cursor(), (c) => {
			const offsetId = offsetDetachId(id, iTree);
			const idTuple = nodeIdTuple(offsetId);
			const data: DetachedNodeData = {
				oldId: offsetId,
				src: "build",
				buildData: c.fork(),
			};
			detachedRootsById.set(idTuple, data);
			iTree += 1;
		});
	}
	for (const { id, trees } of delta.refreshers ?? []) {
		let iTree = 0;
		forEachNode(trees.cursor(), (c) => {
			const offsetId = offsetDetachId(id, iTree);
			const idTuple = nodeIdTuple(offsetId);
			const existing = detachedRootsById.get(idTuple);
			if (existing !== undefined) {
				existing.src = "refresh";
				existing.buildData = c.fork();
			} else {
				const data: DetachedNodeData = {
					oldId: offsetId,
					src: "refresh",
					buildData: c.fork(),
				};
				detachedRootsById.set(idTuple, data);
			}
			iTree += 1;
		});
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

interface Metadata {
	readonly nodesByOldId: NodeIdBTree<AppliedDeltaNode>;
	readonly attachDstIds: NodeIdBTree<DetachedNodeIdPair>;
}

function collectMetadata(delta: AppliedDeltaRoot): Metadata {
	const nodesByOldId: NodeIdBTree<AppliedDeltaNode> = newTupleBTree();
	const attachDstIds: NodeIdBTree<DetachedNodeIdPair> = newTupleBTree();
	function collectFromMarkList(markList: AppliedDeltaMarkList): void {
		for (const mark of markList) {
			collectFromMark(mark);
		}
	}
	function collectFromMark(mark: AppliedDeltaMark): void {
		if (mark.changeType === "attach") {
			for (let index = 0; index < mark.count; index += 1) {
				const offsetId = offsetDetachIdPair(mark.attach, index);
				attachDstIds.set(nodeIdTuple(offsetId[1]), offsetId);
			}
			return;
		}
		for (const [index, node] of mark.nodes.entries()) {
			if ("detach" in mark) {
				const offsetId = offsetDetachId(mark.detach[0], index);
				nodesByOldId.set(nodeIdTuple(offsetId), node);
			}
			if ("attach" in mark) {
				const offsetId = offsetDetachIdPair(mark.attach, index);
				attachDstIds.set(nodeIdTuple(offsetId[1]), offsetId);
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
		collectFromNode(detachedNode.node);
		if (detachedNode.dst === "attach") {
			nodesByOldId.set(nodeIdTuple(detachedNode.id[0]), detachedNode.node);
		}
	}
	collectFromMarkList(delta.rootField);
	return { nodesByOldId, attachDstIds };
}

export function htmlFromAppliedDelta(delta: AppliedDeltaRoot): string {
	const metadata = collectMetadata(delta);

	const lines: string[] = [];
	lines.push(`<div class="delta">`);
	{
		lines.push(`<div><span>Detached Root Nodes:</span><ul>`);
		{
			for (const detachedNode of delta.detachedNodes) {
				lines.push(
					`<li id="${srcId(detachedNode.id)}"><div class="${detachedNode.src ?? "prior"}">`,
				);
				{
					const destiny: NodeDestiny = detachedNode.dst
						? detachedNode.dst === "destroy"
							? { type: "destroy" }
							: { type: "attach", dst: detachedNode.id }
						: { type: "noop" };
					lines.push(htmlFromNode(detachedNode.node, destiny, metadata));
				}
				lines.push(`</div></li>`);
			}
		}
		lines.push(`</ul></div>`);
		lines.push(`<div><span>Root Field:</span>`);
		{
			lines.push(htmlFromMarkList(delta.rootField, metadata));
		}
		lines.push(`</div>`);
	}
	lines.push(`</div>`);
	lines.push(`<style>`);
	lines.push(`
		.delta {
			font-family: 'consolas';
			font-size: small;
			padding: 0 0px;
			margin: 0px;
			color: white;
			display: flex;
			background: rgb(20, 20, 20);
			border-radius: 0.5em;
			line-height: 1em;
		}

		.delta ul {
			list-style-type: none;
			padding-inline-start: 0px;
		}

		.idx {
			vertical-align: middle;
			margin-left: 1em;
			font-size: x-small;
			color: gray;
		}
		
		.destiny-out, .destiny-in {
			vertical-align: middle;
			margin-left: 1em;
			font-style: italic;
			font-size: x-small;
			color: gray;
		}
		.destiny-out::before {
			content: " 🠪 ";
		}
		.destiny-in::before {
			content: "🠬 ";
		}

		.delta li {
			padding: 0.2em 0.8em;
			background: rgb(35, 35, 40);
			border-left: 2px solid rgb(45, 45, 45);
			border-radius: 0.5em;
		}

		li.attach, li.detach, li.replace {
			padding: 0.2em 0.8em 0.4em 0.8em;
			border-top: 1px solid rgb(45, 45, 45);
			border-bottom: 1px solid rgb(45, 45, 45);
		}
		li.attach {
			background: rgb(31, 59, 80);
		}
		li.detach {
			background: rgb(77, 17, 17);
		}
		li.replace {
			background: rgb(58, 37, 69);
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
			padding: .2em 1em;
			border-radius: 0.5em;
		}

		.delta {
			display: block;
			padding: 1em;
		}

		.prior::before,
		.refresh::before,
		.build::before {
			vertical-align: middle;
			text-align: center;
			border-radius: 1em;
			border: solid .1em #999;
			font-size: x-small;
			width: 4.8em;
			color: rgb(210, 210, 210);
			display: inline-block;
		}
		.build::before {
			content: "build";
			background: rgb(32, 97, 147);
		}
		.refresh::before {
			content: "refresh";
			background: rgb(32, 59, 147);
		}
		.prior::before {
			content: "prior";
			background: rgb(81, 81, 81);
		}
		
		.noop::before,
		.attach > .multiplier::before,
		.detach > .multiplier::before,
		.replace > .multiplier::before {
			vertical-align: middle;
			border-radius: 1em;
			border: solid .1em #999;
			margin-left: .2em;
			margin-right: .2em;
			padding: .0em .5em;
			font-size: x-small;
			color: rgb(210, 210, 210);
		}
		.multiplier {
			font-size: .8em;
			color: gray;
			display: inline-block;
			padding: 0em 0em .2em 0em;
		}
		.attach > .multiplier::before {
			content: "attach";
			background: rgb(32, 97, 147);
		}
		.detach > .multiplier::before {
			content: "detach";
			background: rgb(136, 17, 17);
		}
		.replace > .multiplier::before {
			content: "replace";
			background: rgb(97, 45, 123);
		}`);
	lines.push(`${Array.from(metadata.attachDstIds.values())
		.map((id) => `.delta:has(.pv${srcId(id)}:hover) #${srcId(id)}`)
		.join(", ")} {
		background-color: rgb(136, 17, 17);
	}`);
	lines.push(`${Array.from(metadata.attachDstIds.values())
		.map((id) => `.delta:has(.pv${dstId(id)}:hover) #${dstId(id)}`)
		.join(", ")} {
		background-color: rgb(32, 97, 147);
	}`);
	lines.push(`</style>`);
	return lines.join("\n");
}

function htmlFromDestiny(destiny: NodeDestiny, metadata: Metadata): string {
	if (destiny.type === "noop") {
		return "";
	}
	let outbound = "";
	let inbound = "";
	if (destiny.type === "replace") {
		inbound = ` and replaced by ${htmlPreview(destiny.src, metadata)}`;
	}
	switch (destiny.type) {
		case "attach":
		case "replace":
			outbound = metadata.attachDstIds.has(nodeIdTuple(destiny.dst[1]))
				? `sent to ${nodeDstLink(destiny.dst)}`
				: `removed as #${nodeIdToString(destiny.dst[1])}`;
			break;
		case "destroy":
			outbound = "destroyed";
			break;
		default:
			unreachableCase(destiny);
	}
	return `<span class="destiny-out">${outbound}${inbound}</span>`;
}

function htmlPreview(id: DetachedNodeIdPair, metadata: Metadata): string {
	const node = metadata.nodesByOldId.get(nodeIdTuple(id[0]));
	assert(node !== undefined, "Preview node not found");
	const lines: string[] = [];
	lines.push(`<div id="${dstId(id)}" class="preview pv${srcId(id)}">`);
	let previewContent: string;
	{
		if (typeof node === "string") {
			previewContent = `<span>"${node}"</span>`;
		} else if (typeof node === "number" || typeof node === "boolean") {
			previewContent = `<span>${node}</span>`;
		} else if (node === null) {
			previewContent = `<span>null</span>`;
		} else if (isFluidHandle(node)) {
			previewContent = `<span><fluid-handle></span>`;
		} else {
			previewContent = `<span>${node.nodeType ?? "<Object>"}</span>`;
		}
	}
	lines.push(nodeSrcLink(id, previewContent));
	lines.push(`</div>`);
	return lines.join("\n");
}

function htmlFromNode(
	node: AppliedDeltaNode,
	destiny: NodeDestiny,
	metadata: Metadata,
): string {
	const lines: string[] = [];
	const edit = htmlFromDestiny(destiny, metadata);
	if (typeof node === "string") {
		lines.push(`<span>"${node}"</span>${edit}`);
	} else if (typeof node === "number" || typeof node === "boolean") {
		lines.push(`<span>${node}</span>${edit}`);
	} else if (node === null) {
		lines.push(`<span>null</span>${edit}`);
	} else if (isFluidHandle(node)) {
		lines.push(`<span><fluid-handle></span>${edit}`);
	} else {
		if (node.nodeType !== undefined) {
			lines.push(`<span>${node.nodeType}</span>${edit}`);
		}
		lines.push(`<ul>`);
		{
			for (const [key, value] of Object.entries(node.fields)) {
				lines.push(`<li><span>"${key}":</span>`);
				lines.push(htmlFromMarkList(value, metadata));
				lines.push(`</li>`);
			}
		}
		lines.push(`</ul>`);
	}
	return lines.join("\n");
}

function htmlFromMarkList(markList: AppliedDeltaMarkList, metadata: Metadata): string {
	const lines: string[] = [];
	lines.push(`<ul>`);
	let oldIndex = 0;
	let newIndex = 0;
	for (const mark of markList) {
		lines.push(htmlFromMark(mark, metadata, oldIndex, newIndex));
		switch (mark.changeType) {
			case "noop":
			case "replace": {
				oldIndex += mark.nodes.length;
				newIndex += mark.nodes.length;
				break;
			}
			case "attach": {
				newIndex += mark.count;
				break;
			}
			case "detach": {
				oldIndex += mark.nodes.length;
				break;
			}
			default:
				unreachableCase(mark);
		}
	}
	lines.push(`</ul>`);
	return lines.join("\n");
}

function htmlFromMark(
	mark: AppliedDeltaMark,
	metadata: Metadata,
	oldIndex: number,
	newIndex: number,
): string {
	const lines: string[] = [];
	switch (mark.changeType) {
		case "noop":
			lines.push(`<li class="noop">`);
			lines.push(htmlFromNodes(mark.nodes, metadata, oldIndex, newIndex));
			lines.push(`</li>`);
			break;
		case "attach":
			lines.push(`<li class="attach">`);
			lines.push(`<span class="multiplier">(x${mark.count})</span>`);
			lines.push(`<ul>`);
			for (let i = 0; i < mark.count; i++) {
				const id = offsetDetachIdPair(mark.attach, i);
				lines.push(`<li class="cell" id=${dstId(id)}>`);
				lines.push(indexHtml(undefined, newIndex + i));
				lines.push(`@${nodeIdToString(id[1])}`);
				lines.push(`<span class="destiny-in">attaching ${htmlPreview(id, metadata)}</span>`);
				lines.push(`</li>`);
			}
			lines.push(`</ul>`);
			lines.push(`</li>`);
			break;
		case "detach":
			lines.push(`<li class="detach">`);
			lines.push(`<span class="multiplier">(x${mark.nodes.length})</span>`);
			lines.push(htmlFromNodes(mark.nodes, metadata, oldIndex, newIndex, mark.detach));
			lines.push(`</li>`);
			break;
		case "replace":
			lines.push(`<li class="replace">`);
			lines.push(`<span class="multiplier">(x${mark.nodes.length})</span>`);
			lines.push(
				htmlFromNodes(mark.nodes, metadata, oldIndex, newIndex, mark.detach, mark.attach),
			);
			lines.push(`</li>`);
			break;
		default:
			unreachableCase(mark);
	}
	return lines.join("\n");
}

function htmlFromNodes(
	nodes: readonly AppliedDeltaNode[],
	metadata: Metadata,
	oldIndex: number,
	newIndex: number,
	detachId?: DetachedNodeIdPair,
	attachId?: DetachedNodeIdPair,
): string {
	const lines: string[] = [];
	lines.push(`<ul>`);
	{
		const isDetachOnly = detachId !== undefined && attachId === undefined;
		for (const [index, node] of nodes.entries()) {
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
			const htmlId =
				detachId !== undefined ? ` id="${srcId(offsetDetachIdPair(detachId, index))}"` : "";
			lines.push(`<li${htmlId}>`);
			lines.push(indexHtml(oldIndex + index, isDetachOnly ? undefined : newIndex + index));
			lines.push(htmlFromNode(node, destiny, metadata));
			lines.push(`</li>`);
		}
	}
	lines.push(`</ul>`);
	return lines.join("\n");
}

function indexHtml(oldIndex?: number, newIndex?: number): string {
	return oldIndex === newIndex
		? `<span class="idx">[${oldIndex ?? "ⁿ/ₐ"}]</span>`
		: `<span class="idx">[${oldIndex ?? "ⁿ/ₐ"}]🠪[${newIndex ?? "ⁿ/ₐ"}]</span>`;
}

function nodeSrcLink(id: DetachedNodeIdPair, linkContent?: string): string {
	const idString = nodeIdToString(id[0]);
	return `<a href="#src${idString}">${linkContent ?? `#${idString}`}</a>`;
}

function nodeDstLink(id: DetachedNodeIdPair): string {
	const idString = nodeIdToString(id[1]);
	return `<a href="#${dstId(id)}" class="pv${dstId(id)}">@${idString}</a>`;
}

function offsetDetachIdPair(idPair: DetachedNodeIdPair, offset: number): DetachedNodeIdPair {
	return [offsetDetachId(idPair[0], offset), offsetDetachId(idPair[1], offset)];
}

function dstId(id: DetachedNodeIdPair): string {
	return `dst${nodeIdToString(id[1])}`;
}

function srcId(id: DetachedNodeIdPair): string {
	return `src${nodeIdToString(id[0])}`;
}

function nodeIdToString(id: DetachedNodeId): string {
	if (id.major === undefined) {
		return `${id.minor}`;
	}
	return `${id.major}_${id.minor}`;
}
