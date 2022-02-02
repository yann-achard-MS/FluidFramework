/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-dynamic-delete */

import { assert } from "@fluidframework/common-utils";
import {
	Transaction,
	PeerChangeFrame,
	NodeId,
	Value,
	SeqNumber,
	PeerTraitMarks,
	PeerTypes,
	Offset,
	TraitMarks,
	Modify,
	ConstraintFrame,
	PeerModify,
	Mods,
	PeerDelete,
	PeerMoveOut,
} from "./Format";
import {
	isAttachSegment,
	isBound,
	isChangeFrame,
	isConstraintFrame,
	isDetachSegment,
	isModify,
	isOffset,
	isSetValueMark,
	visitMark,
	visitMods,
} from "./Utils";

export interface CollabWindow {
	transactions: Transaction[];
	changes: PeerChangeFrame;
}

export interface Node {
	id: NodeId;
	type?: string;
	value?: Value;
	traits?: Traits;
}

export interface Traits {
	[key: string]: Node[];
}

export function extendWindow(transaction: Transaction, window: CollabWindow): boolean {
	window.transactions.push(transaction);
	for (const frame of transaction.frames) {
		if (isConstraintFrame(frame)) {
			if (isConstraintFrameSatisfied(frame, window) === false) {
				return false;
			}
		} else {
			if (isChangeFrame(frame)) {
				appendChangeToWindow(window, frame);
			} else {
				throw(new Error("Transaction frame is neither a constraint nor a change"));
			}
		}
	}
	return true;
}

export function shrinkWindow(window: CollabWindow, knownSeq: SeqNumber): void {
	if (window.transactions.length === 0 || window.transactions[0].seq > knownSeq) {
		// Nothing to remove
		return;
	}
	if (Array.isArray(window.changes)) {
		shrinkMarks(window.changes, knownSeq);
	} else {
		shrinkModify(window.changes, knownSeq);
	}
	// Cull from the queue the transaction whose seq# is lower or equal to `knownSeq`
	const cullCount = window.transactions.findIndex((t: Transaction) => t.seq > knownSeq);
	if (cullCount !== 0) {
		window.transactions.splice(0, cullCount === -1 ? window.transactions.length : cullCount);
	}
}

function shrinkMarks(marks: PeerTraitMarks, knownSeq: SeqNumber): boolean {
	let idx = 0;
	while (marks[idx] !== undefined) {
		const mark = marks[idx];
		if (typeof mark === "object") {
			// SetValue | Modify | Insert | Delete | MoveIn | MoveOut | SliceBound | Race;
			if (Array.isArray(mark)) {
				const raceLength = shrinkMarksRace(mark, knownSeq);
				if (raceLength !== null) {
					idx += heal(marks, idx, raceLength);
				}
			} else if (isModify(mark)) {
				if (shrinkModify(mark, knownSeq)) {
					idx += heal(marks, idx);
				}
			} else if (isSetValueMark(mark)) {
				if (mark.seq <= knownSeq) {
					idx += heal(marks, idx);
				}
			} else if (isBound(mark)) {
				if (mark.seq <= knownSeq) {
					marks.splice(idx, 1);
					idx -= 1;
				}
			} else if (isDetachSegment(mark)) {
				if (mark.seq <= knownSeq) {
					// It should be safe to delete a detach segment along with its nested mods because all those should
					// have occurred prior to the detach.
					if (mark.mods !== undefined) {
						visitMods<PeerTypes>(
							mark.mods,
							{
								onObjMark: (lowerMark) =>
									assert(
										isModify(lowerMark) || lowerMark.seq <= knownSeq,
										"Lossy removal of detach",
									),
							},
						);
					}
					marks.splice(idx, 1);
					idx -= 1;
				} else {
					if (mark.mods !== undefined) {
						// In all other cases we need to shrink and preserve nested mods.
						if (shrinkMods(mark.mods, knownSeq)) {
							delete mark.mods;
						}
					}
				}
			} else if (isAttachSegment(mark)) {
				// It's possible the attach segment was subsequently detached
				if (mark.detach !== undefined && mark.detach.seq <= knownSeq) {
					// It should be safe to delete this segment along with its nested mods because all
					// those should have occurred prior to the detach.
					visitMark<PeerTypes>(
						mark,
						{
							onObjMark: (m) =>
								assert(
									isModify(m) || m.seq <= knownSeq,
									"Lossy removal of detach",
								),
						},
					);
					marks.splice(idx, 1);
					idx -= 1;
				} else {
					if (mark.mods !== undefined) {
						// In all other cases we need to shrink and preserve nested mods.
						if (shrinkMods(mark.mods, knownSeq)) {
							delete mark.mods;
						}
					}

					if (mark.seq <= knownSeq) {
						if (mark.detach !== undefined) {
							// In this case the inner detach needs to replace the outer attach segment
							const newDetach: PeerDelete | PeerMoveOut = { ...mark.detach };
							if (mark.length !== undefined) {
								newDetach.length = mark.length;
							}
							if (mark.mods !== undefined) {
								newDetach.mods = mark.mods;
							}
							marks.splice(idx, 1, newDetach);
						} else {
							// In this case the inner mods need to be transplanted to the marks array
							if (mark.mods === undefined) {
								idx += heal(marks, idx, mark.length);
							} else if (Array.isArray(mark.mods)) {
								if (isOffset(mark.mods[0]) && idx > 0 && isOffset(marks[idx - 1])) {
									(marks[idx - 1] as Offset) += mark.mods[0];
									mark.mods.splice(0, 1);
								}
								marks.splice(idx, 1, ...mark.mods);
								idx += mark.mods.length;
							} else {
								// Promote the single Modify or SetValue
								marks.splice(idx, 1, mark.mods);
							}
						}
					}
				}
			} else {
				throw(new Error(`Unrecognized mark: ${JSON.stringify(mark)}`));
			}
		} else if (typeof mark === "number") {
			if (idx > 0 && typeof marks[idx - 1] === "number") {
				(marks[idx - 1] as Offset) += mark;
				marks.splice(idx, 1);
				idx -= 1;
			}
		}
		++idx;
	}
	while (typeof marks[marks.length - 1] === "number") {
		marks.pop();
	}
	return marks.length === 0;
}

function shrinkMods(mods: Mods<PeerTypes>, knownSeq: SeqNumber): boolean {
	if (Array.isArray(mods)) {
		if (shrinkMarks(mods, knownSeq)) {
			return true;
		}
	} else if (isModify(mods)) {
		if (shrinkModify(mods, knownSeq)) {
			return true;
		}
	} else {
		// mark.mods is of type PeerSetValueMark
		if (mods.seq <= knownSeq) {
			return true;
		}
	}
	return false;
}

function shrinkMarksRace(markLanes: PeerTraitMarks[], knownSeq: SeqNumber): number | null {
	let ancillary = true;
	for (const lane of markLanes) {
		ancillary ||= shrinkMarks(lane, knownSeq);
	}
	if (ancillary) {
		let offset = 0;
		for (const lane of markLanes) {
			offset += (lane[0] as Offset | undefined) ?? 0;
		}
		return offset;
	}
	return null;
}

function heal(marks: TraitMarks, index: number, length: number = 1): number {
	if (length === 0) {
		marks.splice(index, 1);
		return -1;
	}
	if (index > 0 && isOffset(marks[index - 1])) {
		(marks[index - 1] as Offset) += length;
		marks.splice(index, 1);
		return -1;
	}
	if (isOffset(marks[index + 1])) {
		(marks[index + 1] as Offset) += length;
		marks.splice(index, 1);
		return -1;
	}
	// Replace the segment with an Offset of `length`
	marks.splice(index, 1, length);
	return 0;
}

function shrinkModify(modify: PeerModify, knownSeq: SeqNumber): boolean {
	const setValueSeq = modify.setValue?.seq;
	if (setValueSeq !== undefined && setValueSeq <= knownSeq) {
		delete modify.setValue;
	}
	for (const [label, marksOrModify] of Object.entries(modify)) {
		// NOTE: we don't need to filter out [type] and [setValue] keys but that might change
		if (Array.isArray(marksOrModify)) {
			if (shrinkMarks(marksOrModify, knownSeq)) {
				delete modify[label];
			}
		} else {
			if (shrinkModify(marksOrModify, knownSeq)) {
				delete modify[label];
			}
		}
	}
	return Object.entries(modify).length === 0 && modify.setValue === undefined;
}

function appendChangeToWindow(window: CollabWindow, frame: Modify | TraitMarks): void {
	throw new Error("Function not implemented.");
}

function isConstraintFrameSatisfied(frame: ConstraintFrame, window: CollabWindow): boolean {
	throw(new Error("isConstraintFrameSatisfied not implemented"));
}
