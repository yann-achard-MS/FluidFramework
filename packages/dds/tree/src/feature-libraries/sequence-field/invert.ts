/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionTag, TaggedChange } from "../../core";
import { fail } from "../../util";
import { Changeset, Mark, MarkList } from "./format";
import { MarkListFactory } from "./markListFactory";
import { getInputLength, isConflicted, isSkipMark } from "./utils";

/**
 * Inverts a given changeset.
 * @param change - The changeset to produce the inverse of.
 * @returns The inverse of the given `change` such that the inverse can be applied after `change`.
 *
 * WARNING! This implementation is incomplete:
 * - Support for slices is not implemented.
 */
export function invert(change: TaggedChange<Changeset>): Changeset {
	return invertMarkList(change.change, change.revision);
}

function invertMarkList(markList: MarkList, revision: RevisionTag | undefined): MarkList {
	const inverseMarkList = new MarkListFactory();
	let inputIndex = 0;

	for (const mark of markList) {
		const inverseMarks = invertMark(mark, inputIndex, revision);
		inverseMarkList.push(...inverseMarks);
		inputIndex += getInputLength(mark);
	}

	return inverseMarkList.list;
}

function invertMark(mark: Mark, inputIndex: number, revision: RevisionTag | undefined): Mark[] {
	if (isSkipMark(mark)) {
		return [mark];
	} else {
		switch (mark.type) {
			case "Insert": {
				return [
					{
						type: "Delete",
						count: mark.type === "Insert" ? mark.content.length : 1,
					},
				];
			}
			case "Delete": {
				return [
					{
						type: "Revive",
						detachedBy: mark.revision ?? revision,
						detachIndex: inputIndex,
						count: mark.count,
					},
				];
			}
			case "Revive": {
				if (!isConflicted(mark)) {
					return [
						{
							type: "Delete",
							count: mark.count,
						},
					];
				}
				if (mark.lastDetachedBy === undefined) {
					// The nodes were already revived, so the revive mark did not affect them.
					return [mark.count];
				}
				// The nodes were not revived and could not be revived.
				return [];
			}
			case "MoveOut":
			case "ReturnFrom": {
				if (isConflicted(mark)) {
					// The nodes were already detached so the mark had no effect
					return [];
				}
				if (mark.isDstConflicted) {
					// The nodes were present but the destination was conflicted, the mark had no effect on the nodes.
					return [mark.count];
				}
				return [
					{
						type: "ReturnTo",
						id: mark.id,
						count: mark.count,
						detachedBy: mark.revision ?? revision,
						detachIndex: inputIndex,
					},
				];
			}
			case "MoveIn":
			case "ReturnTo": {
				if (!isConflicted(mark)) {
					if (mark.isSrcConflicted) {
						// The nodes could have been attached but were not because of the source.
						return [];
					}
					return [
						{
							type: "ReturnFrom",
							id: mark.id,
							count: mark.count,
							detachedBy: mark.revision ?? revision,
						},
					];
				}
				if (mark.type === "ReturnTo" && mark.lastDetachedBy === undefined) {
					// The nodes were already attached, so the mark did not affect them.
					return [mark.count];
				}
				// The nodes were not attached and could not be attached.
				return [];
			}
			default:
				fail("Not implemented");
		}
	}
}
