/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { brandOpaque, Mutable, OffsetListFactory } from "../../util";
import { Delta } from "../../core";
import { singleTextCursor } from "../treeTextCursor";
import { MarkList, ProtoNode } from "./format";
import { isSkipMark } from "./utils";

export type ToDelta<TNodeChange> = (child: TNodeChange) => Delta.Modify;

export function sequenceFieldToDelta<TNodeChange>(
	marks: MarkList<TNodeChange>,
	deltaFromChild: ToDelta<TNodeChange>,
): Delta.MarkList {
	const out = new OffsetListFactory<Delta.Mark>();
	for (const mark of marks) {
		if (isSkipMark(mark)) {
			out.pushOffset(mark);
		} else {
			// Inline into `switch(mark.type)` once we upgrade to TS 4.7
			const type = mark.type;
			switch (type) {
				case "Insert": {
					const insertMark: Delta.Mark = makeDeltaInsert(
						mark.content,
						mark.changes,
						deltaFromChild,
					);
					out.pushContent(insertMark);
					break;
				}
				case "MoveIn":
				case "ReturnTo": {
					const moveMark: Delta.MoveIn = {
						type: Delta.MarkType.MoveIn,
						count: mark.count,
						moveId: brandOpaque<Delta.MoveId>(mark.id),
					};
					out.pushContent(moveMark);
					break;
				}
				case "Modify": {
					const modify = deltaFromChild(mark.changes);
					if (modify.setValue !== undefined || modify.fields !== undefined) {
						out.pushContent(modify);
					} else {
						out.pushOffset(1);
					}
					break;
				}
				case "Delete": {
					const deleteMark: Delta.Delete = {
						type: Delta.MarkType.Delete,
						count: mark.count,
					};
					out.pushContent(deleteMark);
					break;
				}
				case "MoveOut":
				case "ReturnFrom": {
					const moveMark: Delta.MoveOut = {
						type: Delta.MarkType.MoveOut,
						moveId: brandOpaque<Delta.MoveId>(mark.id),
						count: mark.count,
					};
					out.pushContent(moveMark);
					break;
				}
				case "Revive": {
					if (mark.conflictsWith === undefined) {
						if (mark.changes !== undefined) {
							const modify = deltaFromChild(mark.changes);
							const insertMark: Mutable<Delta.InsertAndModify> = {
								type: Delta.MarkType.InsertAndModify,
								content: mark.content[0],
							};
							if (modify.setValue !== undefined) {
								insertMark.setValue = modify.setValue;
							}
							if (modify.fields !== undefined) {
								insertMark.fields = modify.fields;
							}
							out.pushContent(insertMark);
						} else {
							const insertMark: Delta.Insert = {
								type: Delta.MarkType.Insert,
								content: mark.content,
							};
							out.pushContent(insertMark);
						}
					} else if (mark.lastDetachedBy === undefined) {
						out.pushOffset(mark.count);
					}
					break;
				}
				default:
					unreachableCase(type);
			}
		}
	}
	return out.list;
}

/**
 * Converts inserted content into the format expected in Delta instances.
 * This involves applying all except MoveIn changes.
 *
 * The returned `fields` map may be empty if all modifications are applied by the function.
 */
function makeDeltaInsert<TNodeChange>(
	content: ProtoNode[],
	changes: TNodeChange | undefined,
	deltaFromChild: ToDelta<TNodeChange>,
): Delta.Insert | Delta.InsertAndModify {
	// TODO: consider processing modifications at the same time as cloning to avoid unnecessary cloning
	const cursors = content.map(singleTextCursor);
	if (changes !== undefined) {
		const outModifications = deltaFromChild(changes);
		return {
			...outModifications,
			type: Delta.MarkType.InsertAndModify,
			content: cursors[0],
		};
	} else {
		return { type: Delta.MarkType.Insert, content: cursors };
	}
}
