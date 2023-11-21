/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { Mutable } from "../../util";
import { FieldKey } from "../schema-stored";
import { ITreeCursorSynchronous } from "./cursor";
import { Root, DetachedNodeId, FieldChanges, Mark, FieldMap } from "./delta";
import { rootFieldKey } from "./types";

export const emptyDelta: Root<never> = {};

export const emptyFieldChanges: FieldChanges<never> = {};

export function isAttachMark(mark: Mark): boolean {
	return mark.attach !== undefined && mark.detach === undefined;
}

export function isDetachMark(mark: Mark): boolean {
	return mark.detach !== undefined && mark.attach === undefined;
}

export function isReplaceMark(mark: Mark): boolean {
	return mark.detach !== undefined && mark.attach !== undefined;
}

export function isEmptyFieldChanges(fieldChanges: FieldChanges): boolean {
	return (
		fieldChanges.local === undefined &&
		fieldChanges.global === undefined &&
		fieldChanges.build === undefined &&
		fieldChanges.rename === undefined
	);
}

export function deltaForRootInitialization(content: readonly ITreeCursorSynchronous[]): Root {
	if (content.length === 0) {
		return emptyDelta;
	}
	const buildId = { minor: 0 };
	const delta: Root = {
		build: [{ id: buildId, trees: content }],
		fields: new Map<FieldKey, FieldChanges>([
			[
				rootFieldKey,
				{
					local: [{ count: content.length, attach: buildId }],
				},
			],
		]),
	};
	return delta;
}

export function deltaForSet(
	newNode: ITreeCursorSynchronous,
	buildId: DetachedNodeId,
	detachId?: DetachedNodeId,
): FieldChanges {
	const mark: Mutable<Mark> = { count: 1, attach: buildId };
	if (detachId !== undefined) {
		mark.detach = detachId;
	}
	return {
		build: [{ id: buildId, trees: [newNode] }],
		local: [mark],
	};
}

export function makeDetachedNodeId(
	major: DetachedNodeId["major"],
	minor: DetachedNodeId["minor"],
): DetachedNodeId {
	const out: Mutable<DetachedNodeId> = { minor };
	if (major !== undefined) {
		out.major = major;
	}
	return out;
}

export function offsetDetachId(id: DetachedNodeId, offset: number): DetachedNodeId;
export function offsetDetachId(
	id: DetachedNodeId | undefined,
	offset: number,
): DetachedNodeId | undefined;
export function offsetDetachId(
	id: DetachedNodeId | undefined,
	offset: number,
): DetachedNodeId | undefined {
	if (id === undefined) {
		return undefined;
	}
	return {
		...id,
		minor: id.minor + offset,
	};
}

export function areDetachedNodeIdsEqual(a: DetachedNodeId, b: DetachedNodeId): boolean {
	return a.major === b.major && a.minor === b.minor;
}

export function mergeNestedChanges(
	marks: Mutable<Mark>[],
	nested: readonly { readonly index: number; readonly fields: FieldMap }[],
): void {
	let iMark = 0;
	let iNode = 0;
	for (const { index, fields } of nested) {
		while (iNode < index && iMark < marks.length) {
			const mark = marks[iMark];
			iNode += mark.count;
			iMark += 1;
			if (iNode > index) {
				const extra = iNode - index;
				marks.splice(iMark - 1, 1, ...splitMark(mark, extra));
				iNode -= extra;
			}
		}
		if (iMark === marks.length) {
			if (iNode < index) {
				marks.push({ count: index - iNode - 1 });
			}
			marks.push({ count: 1, fields });
		} else {
			const mark = marks[iMark];
			if (mark.count > 1) {
				marks.splice(iMark, 1, ...splitMark(mark, 1));
			}
			marks[iMark].fields = fields;
		}
	}
}

export function splitMark(mark: Mark, count: number): [Mark, Mark] {
	assert(mark.count > count, "Cannot split mark with count <= split count");
	const a: Mutable<Mark> = { count };
	const b: Mutable<Mark> = { count: mark.count - count };
	if (mark.attach !== undefined) {
		a.attach = mark.attach;
		b.attach = offsetDetachId(mark.attach, count);
	}
	if (mark.detach !== undefined) {
		a.detach = mark.detach;
		b.detach = offsetDetachId(mark.detach, count);
	}
	return [a, b];
}
