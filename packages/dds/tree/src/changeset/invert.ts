/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { clone, fail, mapObject, neverCase, contentWithCountPolicy, OffsetListPtr, unaryContentPolicy } from "../util";
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
	const newGaps: OffsetList<T.GapEffectSegment, GapCount> = [];
	const newNodes: OffsetList<T.Detach | T.Reattach, NodeCount> = [];
	const newModify: OffsetList<T.Modify, NodeCount> = [];

	const nodesList = marks.nodes ?? [];
	const attachList = marks.attach ?? [];
	const modifyList = marks.modify ?? [];
	const gapsList = marks.gaps ?? [];

	for (const mod of modifyList) {
		if (typeof mod === "number") {
			newModify.push(mod);
		} else {
			newModify.push(invertModify(mod, context));
		}
	}
	let tombsPtr = OffsetListPtr.fromList(newTombs, contentWithCountPolicy);
	for (const nodeMark of nodesList) {
		if (typeof nodeMark === "number") {
			newNodes.push(nodeMark);
			tombsPtr = tombsPtr.addOffset(nodeMark);
		} else {
			const type = nodeMark.type;
			switch (type) {
				case "Delete": {
					tombsPtr = tombsPtr.addMark({
						seq,
						count: nodeMark.count,
					});
					newNodes.push({
						type: "Revive",
						id: nodeMark.id,
						count: nodeMark.count,
					});
					break;
				}
				case "Revive": {
					tombsPtr = tombsPtr.addOffset(nodeMark.count);
					newNodes.push({
						type: "Delete",
						id: nodeMark.id,
						count: nodeMark.count,
					});
					break;
				}
				case "Move": {
					tombsPtr = tombsPtr.addMark({
						seq,
						count: nodeMark.count,
					});
					newNodes.push({
						type: "Return",
						id: nodeMark.id,
						count: nodeMark.count,
					});
					break;
				}
				case "Return": {
					tombsPtr = tombsPtr.addOffset(nodeMark.count);
					newNodes.push({
						type: "Move",
						id: nodeMark.id,
						count: nodeMark.count,
					});
					break;
				}
				default: neverCase(type);
			}
		}
	}
	let modifyPtr = OffsetListPtr.fromList(newModify, unaryContentPolicy);
	let nodesPtr = OffsetListPtr.fromList(newNodes, contentWithCountPolicy);
	for (const attachGroup of attachList) {
		if (typeof attachGroup === "number") {
			modifyPtr = modifyPtr.fwd(attachGroup);
			nodesPtr = nodesPtr.fwd(attachGroup);
		} else {
			for (const attach of attachGroup) {
				const type = attach.type;
				switch (type) {
					case "Insert": {
						nodesPtr = nodesPtr.addMark({
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
									modifyPtr = modifyPtr.addMark(invertModify(mod, { ...context, underInsert: true }));
									nodesUnseen -= 1;
								}
							}
						}
						modifyPtr = modifyPtr.addOffset(nodesUnseen);
						break;
					}
					case "Move": {
						nodesPtr = nodesPtr.addMark({
							type: "Move",
							id: attach.id,
							count: attach.count,
						});
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
	for (const gapEntry of gapsList) {
		if (typeof gapEntry === "number") {
			newGaps.push(gapEntry);
		} else {
			newGaps.push(invertGapEffects(gapEntry));
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

function invertGapEffects(gapEntry: T.GapEffectSegment): T.GapEffectSegment {
	return {
		count: gapEntry.count,
		stack: gapEntry.stack.map(invertGapEffect),
	};
}

function invertGapEffect(effect: T.GapEffect): T.GapEffect {
	return { ...effect, type: invertGapEffectType(effect.type) };
}

function invertGapEffectType(type: T.GapEffectType): T.GapEffectType {
	switch (type) {
		case "Scorch": return "Heal";
		case "Heal": return "Scorch";
		case "Forward": return "Unforward";
		case "Unforward": return "Forward";
		default: neverCase(type);
	}
}
