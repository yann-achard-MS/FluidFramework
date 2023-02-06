/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { RevisionTag, TaggedChange } from "../../core";
import { clone, fail, getOrAddEmptyToMap, StackyIterator } from "../../util";
import { IdAllocator } from "../modular-schema";
import {
	Attach,
	Detach,
	HasTiebreakPolicy,
	Insert,
	LineageEvent,
	Mark,
	MoveIn,
	NewAttach,
	MoveOut,
	ObjectMark,
	InputSpanningMark,
	Reattach,
	ReturnFrom,
	ReturnTo,
	Skip,
	Conflicted,
	CanConflict,
	Changeset,
	SkipLikeReattach,
	OutputSpanningMark,
	SkipLikeDetach,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import { MarkQueue } from "./markQueue";
import {
	applyMoveEffectsToMark,
	getMoveEffect,
	getOrAddEffect,
	makeMergeable,
	MoveEffectTable,
	MoveEnd,
	MoveMark,
	newMoveEffectTable,
	splitMarkOnOutput,
	splitMove,
} from "./moveEffectTable";

export function isNewAttach(mark: Mark): mark is NewAttach {
	return isObjMark(mark) && (mark.type === "Insert" || mark.type === "MoveIn");
}

export function isAttach(mark: Mark): mark is Attach {
	return isNewAttach(mark) || isReattach(mark);
}

export function isAttachInGap(mark: Mark): mark is Attach {
	return isNewAttach(mark) || isActiveReattach(mark) || isBlockedReattach(mark);
}

export function isReattach(mark: Mark): mark is Reattach {
	return isObjMark(mark) && (mark.type === "Revive" || mark.type === "ReturnTo");
}

export function isActiveReattach(mark: Mark): mark is Reattach & { conflictsWith?: undefined } {
	// No need to check Reattach.lastDeletedBy because it can only be set if the mark is conflicted
	return isReattach(mark) && !isConflicted(mark);
}

export function isActiveDetach(mark: Mark): mark is Detach & { conflictsWith?: undefined } {
	return isDetachMark(mark) && !isConflicted(mark);
}

export function isConflictedReattach(mark: Mark): mark is Reattach & Conflicted {
	return isReattach(mark) && isConflicted(mark);
}

export function isConflictedDetach(mark: Mark): mark is Detach & Conflicted {
	return isDetachMark(mark) && isConflicted(mark);
}

export function isSkipLikeReattach(mark: Mark): mark is SkipLikeReattach {
	return isConflictedReattach(mark) && mark.lastDetachedBy === undefined;
}

export function isSkipLikeDetach(mark: Mark): mark is SkipLikeDetach {
	return isDetachMark(mark) && mark.type !== "Delete" && mark.isDstConflicted === true;
}

export function isBlockedReattach(mark: Mark): mark is Reattach & Conflicted {
	return isConflictedReattach(mark) && mark.lastDetachedBy !== undefined;
}

export function isConflicted(mark: CanConflict): mark is Conflicted {
	return mark.conflictsWith !== undefined;
}

export function getAttachLength(attach: Attach): number {
	const type = attach.type;
	switch (type) {
		case "Insert":
			return attach.content.length;
		case "MoveIn":
		case "Revive":
		case "ReturnTo":
			return attach.count;
		default:
			unreachableCase(type);
	}
}

/**
 * @returns `true` iff `lhs` and `rhs`'s `HasTiebreakPolicy` fields are structurally equal.
 */
export function isEqualPlace(
	lhs: Readonly<HasTiebreakPolicy>,
	rhs: Readonly<HasTiebreakPolicy>,
): boolean {
	return (
		lhs.heed === rhs.heed &&
		lhs.tiebreak === rhs.tiebreak &&
		areSameLineage(lhs.lineage ?? [], rhs.lineage ?? [])
	);
}

function areSameLineage(lineage1: LineageEvent[], lineage2: LineageEvent[]): boolean {
	if (lineage1.length !== lineage2.length) {
		return false;
	}

	for (let i = 0; i < lineage1.length; i++) {
		const event1 = lineage1[i];
		const event2 = lineage2[i];
		if (event1.revision !== event2.revision || event1.offset !== event2.offset) {
			return false;
		}
	}

	return true;
}

/**
 * @param mark - The mark to get the length of.
 * @param ignorePairing - When true, the length of a paired mark (e.g. MoveIn/MoveOut) whose matching mark is not active
 * will be treated the same as if the matching mark were active.
 * @returns The number of nodes within the output context of the mark.
 */
export function getOutputLength(mark: Mark, ignorePairing: boolean = false): number {
	if (isSkipMark(mark)) {
		return mark;
	}
	const type = mark.type;
	switch (type) {
		case "ReturnTo":
			return mark.isSrcConflicted && !ignorePairing ? 0 : mark.count;
		case "Revive":
		case "MoveIn":
			return mark.count;
		case "Insert":
			return mark.content.length;
		case "ReturnFrom":
			return mark.isDstConflicted && !ignorePairing ? mark.count : 0;
		case "Delete":
		case "MoveOut":
			return 0;
		default:
			unreachableCase(type);
	}
}

/**
 * @param mark - The mark to get the length of.
 * @returns The number of nodes within the input context of the mark.
 */
export function getInputLength(mark: Mark): number {
	if (isSkipMark(mark)) {
		return mark;
	}
	if (isAttach(mark)) {
		return isSkipLikeReattach(mark) ? mark.count : 0;
	}
	const type = mark.type;
	switch (type) {
		case "Delete":
		case "MoveOut":
		case "ReturnFrom":
			return isConflicted(mark) ? 0 : mark.count;
		default:
			unreachableCase(type);
	}
}

export function isNetZeroNodeCountChange<T>(
	mark: Mark,
): mark is Skip | SkipLikeDetach | SkipLikeReattach {
	return isSkipMark(mark) || isSkipLikeDetach(mark) || isSkipLikeReattach(mark);
}

export function isSkipMark(mark: Mark): mark is Skip {
	return typeof mark === "number";
}

export function getOffsetAtRevision(
	lineage: LineageEvent[] | undefined,
	reattachRevision: RevisionTag | undefined,
): number | undefined {
	if (lineage === undefined || reattachRevision === undefined) {
		return undefined;
	}

	for (const event of lineage) {
		if (event.revision === reattachRevision) {
			return event.offset;
		}
	}

	return undefined;
}

export function dequeueRelatedReattaches<T>(
	newMarks: MarkQueue,
	baseMarks: MarkQueue,
): {
	newMark?: Reattach;
	baseMark?: Reattach;
} {
	const newMark = newMarks.peek();
	const baseMark = baseMarks.peek();
	assert(
		newMark !== undefined && isReattach(newMark),
		0x504 /* No new reattach mark to line up */,
	);
	assert(
		baseMark !== undefined && isReattach(baseMark),
		0x505 /* No base reattach mark to line up */,
	);
	const newMarkLength = newMark.count;
	const baseMarkLength = baseMark.count;
	if (newMark.detachIndex === baseMark.detachIndex) {
		if (newMarkLength < baseMarkLength) {
			return {
				baseMark: baseMarks.dequeueOutput(newMarkLength) as Reattach,
				newMark: newMarks.dequeue() as Reattach,
			};
		} else if (newMarkLength > baseMarkLength) {
			return {
				baseMark: baseMarks.dequeue() as Reattach,
				newMark: newMarks.dequeueOutput(baseMarkLength, true) as Reattach,
			};
		} else {
			return {
				baseMark: baseMarks.dequeue() as Reattach,
				newMark: newMarks.dequeue() as Reattach,
			};
		}
	} else if (newMark.detachIndex < baseMark.detachIndex) {
		if (newMark.detachIndex + newMarkLength <= baseMark.detachIndex) {
			return { newMark: newMarks.dequeue() as Reattach };
		}
		return {
			newMark: newMarks.dequeueOutput(
				baseMark.detachIndex - newMark.detachIndex,
				true,
			) as Reattach,
		};
	} else {
		if (baseMark.detachIndex + baseMarkLength <= newMark.detachIndex) {
			return { baseMark: baseMarks.dequeue() as Reattach };
		}
		return {
			baseMark: baseMarks.dequeueOutput(
				newMark.detachIndex - baseMark.detachIndex,
			) as Reattach,
		};
	}
}

export function isDetachMark(mark: Mark | undefined): mark is Detach {
	if (isObjMark(mark)) {
		const type = mark.type;
		return type === "Delete" || type === "MoveOut" || type === "ReturnFrom";
	}
	return false;
}

export function isObjMark(mark: Mark | undefined): mark is ObjectMark {
	return typeof mark === "object";
}

export function isInputSpanningMark(mark: Mark): mark is InputSpanningMark {
	return (
		isSkipMark(mark) ||
		(isDetachMark(mark) && !isConflicted(mark)) ||
		(isConflictedReattach(mark) && !isBlockedReattach(mark))
	);
}

export function isOutputSpanningMark(mark: Mark): mark is OutputSpanningMark {
	return isSkipMark(mark) || isNewAttach(mark) || (isReattach(mark) && !isBlockedReattach(mark));
}

/**
 * Attempts to extend `lhs` to include the effects of `rhs`.
 * @param lhs - The mark to extend.
 * @param rhs - The effect so extend `rhs` with.
 * @returns `true` iff the function was able to mutate `lhs` to include the effects of `rhs`.
 * When `false` is returned, `lhs` is left untouched.
 */
export function tryExtendMark(
	lhs: ObjectMark,
	rhs: Readonly<ObjectMark>,
	revision: RevisionTag | undefined,
	moveEffects: MoveEffectTable | undefined,
	recordMerges: boolean,
): boolean {
	if (rhs.type !== lhs.type) {
		return false;
	}
	const type = rhs.type;
	switch (type) {
		case "Insert": {
			const lhsInsert = lhs as Insert;
			if (isEqualPlace(lhsInsert, rhs)) {
				lhsInsert.content.push(...rhs.content);
				return true;
			}
			break;
		}
		case "MoveIn":
		case "ReturnTo": {
			const lhsMoveIn = lhs as MoveIn | ReturnTo;
			if (
				isEqualPlace(lhsMoveIn, rhs) &&
				moveEffects !== undefined &&
				lhsMoveIn.isSrcConflicted === rhs.isSrcConflicted &&
				tryMergeMoves(MoveEnd.Dest, lhsMoveIn, rhs, revision, moveEffects, recordMerges)
			) {
				return true;
			}
			break;
		}
		case "Delete": {
			const lhsDetach = lhs as Detach;
			lhsDetach.count += rhs.count;
			return true;
		}
		case "MoveOut": {
			const lhsMoveOut = lhs as MoveOut;
			if (
				moveEffects !== undefined &&
				tryMergeMoves(MoveEnd.Source, lhsMoveOut, rhs, revision, moveEffects, recordMerges)
			) {
				return true;
			}
			break;
		}
		case "ReturnFrom": {
			const lhsReturn = lhs as ReturnFrom;
			if (
				areMergeableReturnFrom(lhsReturn, rhs) &&
				moveEffects !== undefined &&
				tryMergeMoves(MoveEnd.Source, lhsReturn, rhs, revision, moveEffects, recordMerges)
			) {
				return true;
			}
			break;
		}
		case "Revive": {
			const lhsReattach = lhs as Reattach;
			if (
				rhs.detachedBy === lhsReattach.detachedBy &&
				rhs.conflictsWith === lhsReattach.conflictsWith &&
				rhs.isIntention === lhsReattach.isIntention &&
				rhs.lastDetachedBy === lhsReattach.lastDetachedBy &&
				lhsReattach.detachIndex + lhsReattach.count === rhs.detachIndex
			) {
				lhsReattach.count += rhs.count;
				return true;
			}
			break;
		}
		default:
			break;
	}
	return false;
}

function tryMergeMoves(
	end: MoveEnd,
	left: MoveMark,
	right: MoveMark,
	revision: RevisionTag | undefined,
	moveEffects: MoveEffectTable,
	recordMerges: boolean,
): boolean {
	if (left.conflictsWith !== right.conflictsWith) {
		return false;
	}
	const rev = left.revision ?? revision;
	const oppEnd = end === MoveEnd.Source ? MoveEnd.Dest : MoveEnd.Source;
	const prevMergeId = getMoveEffect(moveEffects, oppEnd, rev, left.id).mergeRight;
	if (prevMergeId !== undefined && prevMergeId !== right.id) {
		makeMergeable(moveEffects, oppEnd, rev, prevMergeId, right.id);
	} else {
		makeMergeable(moveEffects, oppEnd, rev, left.id, right.id);
	}

	const leftEffect = getOrAddEffect(moveEffects, end, rev, left.id);
	if (leftEffect.mergeRight === right.id) {
		const rightEffect = getMoveEffect(moveEffects, end, rev, right.id);
		assert(rightEffect.mergeLeft === left.id, 0x54b /* Inconsistent merge info */);
		const nextId = rightEffect.mergeRight;
		if (nextId !== undefined) {
			makeMergeable(moveEffects, end, rev, left.id, nextId);
		} else {
			leftEffect.mergeRight = undefined;
		}

		if (recordMerges) {
			splitMove(moveEffects, end, revision, left.id, right.id, left.count, right.count);

			// TODO: This breaks the nextId mergeability, and would also be overwritten if we merged again
			makeMergeable(moveEffects, end, revision, left.id, right.id);
		}

		left.count += right.count;
		return true;
	}
	return false;
}

function areMergeableReturnFrom(lhs: ReturnFrom, rhs: ReturnFrom): boolean {
	if (
		lhs.detachedBy !== rhs.detachedBy ||
		lhs.conflictsWith !== rhs.conflictsWith ||
		lhs.isDstConflicted !== rhs.isDstConflicted ||
		lhs.revision !== rhs.revision
	) {
		return false;
	}
	if (lhs.detachIndex !== undefined) {
		return lhs.detachIndex + lhs.count === rhs.detachIndex;
	}
	return rhs.detachIndex === undefined;
}

interface DetachedNode {
	rev: RevisionTag;
	index: number;
}

/**
 * Keeps track of the different ways detached nodes may be referred to.
 * Allows updating changesets so they refer to a detached node by the details
 * of the last detach that affected them.
 *
 * WARNING: this code consumes O(N) space and time for marks that affect N nodes.
 * This is code is currently meant for usage in tests.
 * It should be tested and made more efficient before production use.
 */
export class DetachedNodeTracker {
	// Maps the index for a node to its last characterization as a reattached node.
	private nodes: Map<number, DetachedNode> = new Map();
	private readonly equivalences: { old: DetachedNode; new: DetachedNode }[] = [];

	public constructor() {}

	/**
	 * Updates the internals of this instance to account for `change` having been applied.
	 * @param change - The change that is being applied. Not mutated.
	 * Must be applicable (i.e., `isApplicable(change)` must be true).
	 */
	public apply(change: TaggedChange<Changeset>): void {
		let index = 0;
		for (const mark of change.change) {
			const inputLength: number = getInputLength(mark);
			if (isDetachMark(mark)) {
				const newNodes: Map<number, DetachedNode> = new Map();
				const after = index + inputLength;
				for (const [k, v] of this.nodes) {
					if (k >= index) {
						if (k >= after) {
							newNodes.set(k - inputLength, v);
						} else {
							// The node is removed
							this.equivalences.push({
								old: v,
								new: {
									rev:
										mark.revision ??
										change.revision ??
										fail("Unable to track detached nodes"),
									index: k,
								},
							});
						}
					} else {
						newNodes.set(k, v);
					}
				}
				this.nodes = newNodes;
			}
			index += inputLength;
		}
		index = 0;
		for (const mark of change.change) {
			const inputLength: number = getInputLength(mark);
			if (isActiveReattach(mark)) {
				const newNodes: Map<number, DetachedNode> = new Map();
				for (const [k, v] of this.nodes) {
					if (k >= index) {
						newNodes.set(k + inputLength, v);
					} else {
						newNodes.set(k, v);
					}
				}
				for (let i = 0; i < mark.count; ++i) {
					newNodes.set(index + i, {
						rev: mark.detachedBy ?? fail("Unable to track detached nodes"),
						index: mark.detachIndex + i,
					});
				}
				this.nodes = newNodes;
			}
			if (!isDetachMark(mark)) {
				index += inputLength;
			}
		}
	}

	/**
	 * Checks whether the given `change` is applicable based on previous changes.
	 * @param change - The change to verify the applicability of. Not mutated.
	 * @returns false iff `change`'s description of detached nodes is inconsistent with that of changes applied
	 * earlier. Returns true otherwise.
	 */
	public isApplicable(change: Changeset): boolean {
		for (const mark of change) {
			if (isActiveReattach(mark)) {
				const rev = mark.detachedBy ?? fail("Unable to track detached nodes");
				for (let i = 0; i < mark.count; ++i) {
					const index = mark.detachIndex + i;
					const original = { rev, index };
					const updated = this.getUpdatedDetach(original);
					for (const detached of this.nodes.values()) {
						if (updated.rev === detached.rev && updated.index === detached.index) {
							// The new change is attempting to reattach nodes in a location that has already been
							// filled by a prior reattach.
							return false;
						}
					}
				}
			}
		}
		return true;
	}

	/**
	 * Creates an updated representation of the given `change` so that it refers to detached nodes using the revision
	 * that last detached them.
	 * @param change - The change to update. Not mutated.
	 * Must be applicable (i.e., `isApplicable(change)` must be true).
	 * @param genId - An ID allocator that produces ID unique within this changeset.
	 * @returns A change equivalent to `change` that refers to detached nodes using the revision that last detached
	 * them. May reuse parts of the input `change` structure.
	 */
	public update(change: TaggedChange<Changeset>, genId: IdAllocator): TaggedChange<Changeset> {
		const moveEffects = newMoveEffectTable();
		const factory = new MarkListFactory(change.revision, moveEffects);
		const iter = new StackyIterator(change.change);
		while (!iter.done) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const preSplit = iter.pop()!;
			const splitMarks = applyMoveEffectsToMark(preSplit, change.revision, moveEffects, true);

			const mark = splitMarks[0];
			for (let i = splitMarks.length - 1; i > 0; i--) {
				iter.push(splitMarks[i]);
			}
			const cloned = clone(mark);
			if (isReattach(cloned)) {
				let remainder: Reattach = cloned;
				for (let i = 1; i < cloned.count; ++i) {
					const [head, tail] = splitMarkOnOutput(
						remainder,
						change.revision,
						1,
						genId,
						moveEffects,
						false,
						true,
					);
					this.updateMark(head, change.revision, moveEffects);
					factory.push(head);
					remainder = tail;
				}
				this.updateMark(remainder, change.revision, moveEffects);
				factory.push(remainder);
			} else {
				factory.push(cloned);
			}
		}

		// We may need to apply the effects of updateMoveSrcDetacher for some marks if those were located
		// before their corresponding detach mark.
		const factory2 = new MarkListFactory(change.revision, moveEffects);
		for (const mark of factory.list) {
			const splitMarks = applyMoveEffectsToMark(mark, change.revision, moveEffects, true);
			factory2.push(...splitMarks);
		}
		return {
			...change,
			change: factory2.list,
		};
	}

	private updateMark(
		mark: Reattach,
		revision: RevisionTag | undefined,
		moveEffects: MoveEffectTable,
	): void {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const original = { rev: mark.detachedBy!, index: mark.detachIndex };
		const updated = this.getUpdatedDetach(original);
		if (updated.rev !== original.rev || updated.index !== original.index) {
			mark.detachedBy = updated.rev;
			mark.detachIndex = updated.index;
		}
	}

	private getUpdatedDetach(detach: DetachedNode): DetachedNode {
		let curr = detach;
		for (const eq of this.equivalences) {
			if (curr.rev === eq.old.rev && curr.index === eq.old.index) {
				curr = eq.new;
			}
		}
		return curr;
	}
}

/**
 * Checks whether `branch` changeset is consistent with a `target` changeset that is may be rebased over.
 *
 * WARNING: this code consumes O(N) space and time for marks that affect N nodes.
 * This is code is currently meant for usage in tests.
 * It should be tested and made more efficient before production use.
 *
 * @param branch - The changeset that would be rebased over `target`.
 * @param target - The changeset that `branch` would be rebased over.
 * @returns false iff `branch`'s description of detached nodes is inconsistent with that of `target`.
 * Returns true otherwise.
 */
export function areRebasable(branch: Changeset, target: Changeset): boolean {
	const indexToReattach: Map<number, string[]> = new Map();
	const reattachToIndex: Map<string, number> = new Map();
	let index = 0;
	for (const mark of branch) {
		if (isActiveReattach(mark)) {
			const list = getOrAddEmptyToMap(indexToReattach, index);
			for (let i = 0; i < mark.count; ++i) {
				const entry = {
					rev: mark.detachedBy ?? fail("Unable to track detached nodes"),
					index: mark.detachIndex + i,
				};
				const key = `${entry.rev}|${entry.index}`;
				assert(
					!reattachToIndex.has(key),
					0x506 /* First changeset as inconsistent characterization of detached nodes */,
				);
				list.push(key);
				reattachToIndex.set(key, index);
			}
		}
		index += getInputLength(mark);
	}
	index = 0;
	let listIndex = 0;
	for (const mark of target) {
		if (isActiveReattach(mark)) {
			const list = getOrAddEmptyToMap(indexToReattach, index);
			for (let i = 0; i < mark.count; ++i) {
				const entry = {
					rev: mark.detachedBy ?? fail("Unable to track detached nodes"),
					index: mark.detachIndex + i,
				};
				const key = `${entry.rev}|${entry.index}`;
				const indexInA = reattachToIndex.get(key);
				if (indexInA !== undefined && indexInA !== index) {
					// change b tries to reattach the same content as change a but in a different location
					return false;
				}
				if (list.includes(key)) {
					while (list[listIndex] !== undefined && list[listIndex] !== key) {
						++listIndex;
					}
					if (list.slice(0, listIndex).includes(key)) {
						// change b tries to reattach the same content as change a but in a different order
						return false;
					}
				}
			}
		}
		const inputLength = getInputLength(mark);
		if (inputLength > 0) {
			listIndex = 0;
		}
		index += inputLength;
	}
	return true;
}

/**
 * Checks whether sequential changesets are consistent.
 *
 * WARNING: this code consumes O(N) space and time for marks that affect N nodes.
 * This is code is currently meant for usage in tests.
 * It should be tested and made more efficient before production use.
 *
 * @param changes - The changesets that would be composed together.
 * @returns false iff the changesets in `changes` are inconsistent/incompatible in their description of detached nodes.
 * Returns true otherwise.
 */
export function areComposable(changes: TaggedChange<Changeset>[]): boolean {
	const tracker = new DetachedNodeTracker();
	for (const change of changes) {
		if (!tracker.isApplicable(change.change)) {
			return false;
		}
		tracker.apply(change);
	}
	return true;
}
