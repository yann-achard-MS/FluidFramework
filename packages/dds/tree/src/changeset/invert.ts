/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { clone, fail, mapObject, neverCase, OffsetListPtr } from "../util";
import { Transposed as T, SeqNumber, OffsetList, NodeCount, GapCount } from "./format";
import { normalizeMarks } from "./normalize";

export function invert(changeset: T.Changeset, seq: SeqNumber): T.Changeset {
	const context: Context = {
		changeset,
		seq,
		underInsert: false,
	};
	const moves = changeset.moves?.map((mv) => ({ id: mv.id, src: clone(mv.dst), dst: clone(mv.src) }));
	const marks = invertMarks(changeset.marks, context);
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
	readonly changeset: Readonly<T.Changeset>;
	readonly seq: SeqNumber;
	readonly underInsert: boolean;
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
	let modifyPtr = OffsetListPtr.fromList(newModify);
	for (const attachGroup of attachList) {
		if (typeof attachGroup === "number") {
			modifyPtr = modifyPtr.fwd(attachGroup);
			newNodes.push(attachGroup);
		} else {
			for (const attach of attachGroup) {
				const type = attach.type;
				switch (type) {
					case "Insert": {
						newNodes.push({
							type: "Delete",
							id: attach.id,
							count: attach.content.length,
						});
						// Tracks the number of inserted nodes that are after the last mod.
						let nodesUnseen = attach.content.length;
						if (attach.mods) {
							for (const mod of attach.mods) {
								if (typeof mod === "number") {
									modifyPtr = modifyPtr.addOffset(mod);
									nodesUnseen -= mod;
								} else {
									modifyPtr = modifyPtr.insert(invertModify(mod, { ...context, underInsert: true }));
									nodesUnseen -= 1;
								}
							}
						}
						modifyPtr = modifyPtr.addOffset(nodesUnseen);
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
