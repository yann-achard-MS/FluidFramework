/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { brandOpaque, fail, OffsetListFactory } from "../../util";
import { Delta } from "../../core";
import { singleTextCursor } from "../treeTextCursor";
import { NodeReviver } from "../modular-schema";
import { MarkList } from "./format";
import { isSkipMark } from "./utils";

const ERR_NO_REVISION_ON_REVIVE =
	"Unable to get convert revive mark to delta due to missing revision tag";

export function sequenceFieldToDelta(marks: MarkList, reviver: NodeReviver): Delta.MarkList {
	const markList = new OffsetListFactory<Delta.Mark>();
	for (const mark of marks) {
		if (isSkipMark(mark)) {
			markList.pushOffset(mark);
		} else {
			// Inline into `switch(mark.type)` once we upgrade to TS 4.7
			const type = mark.type;
			switch (type) {
				case "Insert": {
					const insertMark: Delta.Mark = {
						type: Delta.MarkType.Insert,
						content: mark.content.map(singleTextCursor),
					};
					markList.pushContent(insertMark);
					break;
				}
				case "MoveIn":
				case "ReturnTo": {
					const moveMark: Delta.MoveIn = {
						type: Delta.MarkType.MoveIn,
						count: mark.count,
						moveId: brandOpaque<Delta.MoveId>(mark.id),
					};
					markList.pushContent(moveMark);
					break;
				}
				case "Delete": {
					const deleteMark: Delta.Delete = {
						type: Delta.MarkType.Delete,
						count: mark.count,
					};
					markList.pushContent(deleteMark);
					break;
				}
				case "MoveOut":
				case "ReturnFrom": {
					const moveMark: Delta.MoveOut = {
						type: Delta.MarkType.MoveOut,
						moveId: brandOpaque<Delta.MoveId>(mark.id),
						count: mark.count,
					};
					markList.pushContent(moveMark);
					break;
				}
				case "Revive": {
					if (mark.conflictsWith === undefined) {
						const insertMark: Delta.Insert = {
							type: Delta.MarkType.Insert,
							content: reviver(
								mark.detachedBy ??
									mark.lastDetachedBy ??
									fail(ERR_NO_REVISION_ON_REVIVE),
								mark.detachIndex,
								mark.count,
							),
						};
						markList.pushContent(insertMark);
					} else if (mark.lastDetachedBy === undefined) {
						markList.pushOffset(mark.count);
					}
					break;
				}
				default:
					unreachableCase(type);
			}
		}
	}
	return markList.list;
}
