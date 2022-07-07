/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	clone,
	fail,
	mapObject,
	neverCase,
	contentWithCountPolicy,
	OffsetListPtr,
	unaryContentPolicy,
	mapGetOrSet,
} from "../util";
import { Transposed as T, SeqNumber, OffsetList, NodeCount, GapCount, OpId } from "./format";
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

type ModifyList = OffsetList<T.Modify, NodeCount>;
type ValueList = OffsetList<T.ValueMark, NodeCount>;

interface MovedMarks {
	modify: ModifyList;
	values: ValueList;
}

interface MoveDst {
	modifyPtr: OffsetListPtr<ModifyList>;
	valuesPtr: OffsetListPtr<ValueList>;
	count: number;
}

function invertMarks(marks: T.TraitMarks, context: Context): T.TraitMarks {
	const { seq } = context;
	const newTombs: OffsetList<T.Tombstones, NodeCount> = [];
	const newAttach: OffsetList<T.Attach[], GapCount> = [];
	const newGaps: OffsetList<T.GapEffectSegment, GapCount> = [];
	const newNodes: OffsetList<T.Detach | T.Reattach, NodeCount> = [];
	const newModify: OffsetList<T.Modify, NodeCount> = [];
	const newValues: OffsetList<T.ValueMark, NodeCount> = [];

	const nodesList = marks.nodes ?? [];
	const attachList = marks.attach ?? [];
	const modifyList = marks.modify ?? [];
	const gapsList = marks.gaps ?? [];
	const valuesList = marks.values ?? [];

	const movedMarks: Map<OpId, MovedMarks> = new Map();
	const movedMarksDst: Map<OpId, MoveDst[]> = new Map();

	const movedMarksFactory = () => ({ modify: [], values: [] });
	const movedMarksDstFactory = () => [];

	for (const mod of modifyList) {
		if (typeof mod === "number") {
			newModify.push(mod);
		} else {
			newModify.push(invertModify(mod, context));
		}
	}
	for (const valueEntry of valuesList) {
		if (typeof valueEntry === "number") {
			newValues.push(valueEntry);
		} else {
			newValues.push({ type: "Revert", seq });
		}
	}
	{
		let tombsPtr = OffsetListPtr.from(newTombs, contentWithCountPolicy);
		let modifyPtr = OffsetListPtr.from(newModify, unaryContentPolicy);
		let valuesPtr = OffsetListPtr.from(newValues, unaryContentPolicy);
		for (const nodeMark of nodesList) {
			if (typeof nodeMark === "number") {
				newNodes.push(nodeMark);
				tombsPtr = tombsPtr.addOffset(nodeMark);
				modifyPtr = modifyPtr.fwd(nodeMark);
				valuesPtr = valuesPtr.fwd(nodeMark);
			} else {
				const { type, count, id } = nodeMark;
				switch (type) {
					case "Delete": {
						tombsPtr = tombsPtr.addMark({
							seq,
							count,
						});
						newNodes.push({
							type: "Revive",
							id,
							count,
						});
						modifyPtr = modifyPtr.fwd(count);
						valuesPtr = valuesPtr.fwd(count);
						break;
					}
					case "Revive": {
						tombsPtr = tombsPtr.addOffset(count);
						newNodes.push({
							type: "Delete",
							id,
							count,
						});
						modifyPtr = modifyPtr.fwd(count);
						valuesPtr = valuesPtr.fwd(count);
						break;
					}
					case "Move": {
						tombsPtr = tombsPtr.addMark({
							seq,
							count,
						});
						newNodes.push({
							type: "Return",
							id,
							count,
						});
						// Here we need to transfer the inverse of the modify and value marks to the source of the
						// move in the output. This is because modify and value marks for moved content only appear
						// at the source of the move.
						const movedMarksForOp = mapGetOrSet(movedMarks, id, movedMarksFactory);
						const spliceReplacement = [count];
						movedMarksForOp.modify.push(spliceReplacement[0]);
						movedMarksForOp.modify.push(...modifyPtr.splice(count, spliceReplacement));
						movedMarksForOp.values.push(...valuesPtr.splice(count, spliceReplacement));
						break;
					}
					case "Return": {
						tombsPtr = tombsPtr.addOffset(count);
						newNodes.push({
							type: "Move",
							id,
							count,
						});
						const movedMarksDstForOp = mapGetOrSet(movedMarksDst, id, movedMarksDstFactory);
						movedMarksDstForOp.push({ modifyPtr, valuesPtr, count });
						modifyPtr = modifyPtr.fwd(count);
						valuesPtr = valuesPtr.fwd(count);
						break;
					}
					default: neverCase(type);
				}
			}
		}
	}
	{
		let modifyPtr = OffsetListPtr.from(newModify, unaryContentPolicy);
		let valuesPtr = OffsetListPtr.from(newValues, unaryContentPolicy);
		let nodesPtr = OffsetListPtr.from(newNodes, contentWithCountPolicy);
		for (const attachGroup of attachList) {
			if (typeof attachGroup === "number") {
				nodesPtr = nodesPtr.fwd(attachGroup);
				modifyPtr = modifyPtr.fwd(attachGroup);
				valuesPtr = valuesPtr.fwd(attachGroup);
			} else {
				for (const attach of attachGroup) {
					const { type, id } = attach;
					switch (type) {
						case "Insert": {
							const count = attach.content.length;
							nodesPtr = nodesPtr.addMark({
								type: "Delete",
								id,
								count,
							});
							// Tracks the number of inserted nodes that are after the last mod.
							let nodesUnseen = count;
							if (attach.modify) {
								for (const mod of attach.modify) {
									if (typeof mod === "number") {
										modifyPtr = modifyPtr.addOffset(mod);
										nodesUnseen -= mod;
									} else {
										const modify = invertModify(mod, { ...context, underInsert: true });
										modifyPtr = modifyPtr.addMark(modify);
										nodesUnseen -= 1;
									}
								}
							}
							modifyPtr = modifyPtr.addOffset(nodesUnseen);
							let valuesUnseen = count;
							if (attach.values) {
								for (const valueMark of attach.values) {
									if (typeof valueMark === "number") {
										valuesPtr = valuesPtr.addOffset(valueMark);
										valuesUnseen -= valueMark;
									} else {
										valuesPtr = valuesPtr.addMark({ type: "Revert", seq });
										valuesUnseen -= 1;
									}
								}
							}
							valuesPtr = valuesPtr.addOffset(valuesUnseen);
							break;
						}
						case "Move": {
							const count = attach.count;
							nodesPtr = nodesPtr.addMark({
								type: "Move",
								id,
								count,
							});
							const movedMarksDstForOp = mapGetOrSet(movedMarksDst, id, movedMarksDstFactory);
							movedMarksDstForOp.push({ modifyPtr, valuesPtr, count });
							modifyPtr = modifyPtr.fwd(count);
							valuesPtr = valuesPtr.fwd(count);
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
		values: newValues,
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
