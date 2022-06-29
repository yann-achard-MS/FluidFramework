/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { clone, fail, mapObject, neverCase, OffsetListPtr } from "../util";
import { Transposed as T, SeqNumber, OffsetList, NodeCount, GapCount } from "./format";
import { normalizeMarks } from "./normalize";

export function invert(frame: T.Changeset, seq: SeqNumber): T.Changeset {
	const context: Context = {
		frame,
		seq,
		underDelete: false,
	};
	const moves = frame.moves?.map((mv) => ({ id: mv.id, src: clone(mv.dst), dst: clone(mv.src) }));
	const marks = invertMarks(frame.marks, context);
	normalizeMarks(marks);

	if (moves !== undefined) {
		return {
			moves,
			marks,
		};
	}
	return {
		marks,
	};
}

interface Context {
	readonly frame: Readonly<T.Changeset>;
	readonly seq: SeqNumber;
	readonly underDelete: boolean;
}

function invertMarks(marks: T.TraitMarks, context: Context): T.TraitMarks {
	const { seq } = context;
	const newTombs: OffsetList<T.Tombstones, NodeCount> = [];
	const newAttach: OffsetList<T.Attach[], GapCount> = [];
	const newGaps: OffsetList<T.GapEffects, GapCount> = [];
	const newNodes: OffsetList<T.Detach | T.Reattach, NodeCount> = [];
	const newModify: OffsetList<T.Modify, NodeCount> = [];

	const attachList = marks.attach ?? [];
	const modifyList = marks.modify ?? [];

	for (const mod of modifyList) {
		if (typeof mod === "number") {
			newModify.push(mod);
		} else {
			newModify.push(invertModify(mod, context));
		}
	}
	if (marks.nodes !== undefined) {
		for (const nodeMark of marks.nodes) {
			if (typeof nodeMark === "number") {
				newNodes.push(nodeMark);
				newTombs.push(nodeMark);
			} else {
				const type = nodeMark.type;
				switch (type) {
					case "Delete": {
						newTombs.push({
							seq,
							count: nodeMark.count,
						});
						newNodes.push({
							type: "Revive",
							count: nodeMark.count,
							id: nodeMark.id,
						});
						break;
					}
					case "Move": {
						fail("Handle Move");
						break;
					}
					case "Revive": {
						fail("Handle Revive");
						break;
					}
					case "Return": {
						fail("Handle Return");
						break;
					}
					default: neverCase(type);
				}
			}
		}
	}
	let modifyIdx = OffsetListPtr.fromList(newModify);
	for (const attachGroup of attachList) {
		if (typeof attachGroup === "number") {
			modifyIdx = modifyIdx.fwd(attachGroup);
			newNodes.push(attachGroup);
		} else {
			for (const attach of attachGroup) {
				const type = attach.type;
				switch (type) {
					case "Insert": {
						newNodes.push({
							type: "Delete",
							count: attach.content.length,
							id: attach.id,
						});
						modifyIdx = modifyIdx.addOffset(attach.content.length);
						break;
					}
					case "Move": {
						fail("Handle Move");
						break;
					}
					case "Bounce": {
						fail("Handle Bounce");
						break;
					}
					case "Intake": {
						fail("Handle Intake");
						break;
					}
					default: neverCase(type);
				}
			}
		}
	}
	return {
		tombs: newTombs,
		gaps: newGaps,
		attach: newAttach,
		modify: newModify,
		nodes: newNodes,
	};
}

function invertModify(
	modify: T.Modify,
	context: Context,
): T.Modify {
	const newModify: T.Modify = mapObject(modify, (traitMarks) => invertMarks(traitMarks, context));
	return newModify;
}
