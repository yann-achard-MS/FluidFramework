/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { RevisionTag, TaggedChange } from "../../core";
import { clone, fail } from "../../util";
import { IdAllocator } from "../modular-schema";
import { Changeset, Mark, MarkList, InputSpanningMark, Reattach } from "./format";
import { GapTracker, IndexTracker } from "./tracker";
import { MarkListFactory } from "./markListFactory";
import { MarkQueue } from "./markQueue";
import { getOrAddEffect, MoveEffectTable, MoveEnd, newMoveEffectTable } from "./moveEffectTable";
import {
	getInputLength,
	getOutputLength,
	isAttach,
	isDetachMark,
	isReattach,
	isSkipMark,
	isActiveReattach,
	isConflicted,
	isConflictedDetach,
	isConflictedReattach,
	dequeueRelatedReattaches,
	isBlockedReattach,
	getOffsetAtRevision,
} from "./utils";

/**
 * Composes a sequence of changesets into a single changeset.
 * @param changes - The changesets to be applied.
 * Parts of the input may be reused in the output, but the input is not mutated.
 * Each changeset in the list is assumed to be applicable after the previous one.
 * @returns A changeset that is equivalent to applying each of the given `changes` in order.
 *
 * WARNING! This implementation is incomplete:
 * - Tombstone information is ignored.
 * - Support for moves is not implemented.
 * - Support for slices is not implemented.
 */
export function compose(changes: TaggedChange<Changeset>[], genId: IdAllocator): Changeset {
	let composed: Changeset = [];
	for (const change of changes) {
		const moveEffects: MoveEffectTable = newMoveEffectTable();

		composed = composeMarkLists(composed, change.revision, change.change, genId, moveEffects);
	}
	return composed;
}

function composeMarkLists(
	baseMarkList: MarkList,
	newRev: RevisionTag | undefined,
	newMarkList: MarkList,
	genId: IdAllocator,
	moveEffects: MoveEffectTable,
): MarkList {
	const factory = new MarkListFactory(undefined, moveEffects);
	const queue = new ComposeQueue(
		undefined,
		baseMarkList,
		newRev,
		newMarkList,
		genId,
		moveEffects,
	);
	while (!queue.isEmpty()) {
		const popped = queue.pop();
		if (popped.areInverses) {
			factory.pushOffset(getInputLength(popped.baseMark));
			continue;
		}
		const { baseMark, newMark } = popped;
		if (newMark === undefined) {
			assert(
				baseMark !== undefined,
				0x4db /* Non-empty queue should not return two undefined marks */,
			);
			factory.push(baseMark);
		} else if (baseMark === undefined) {
			factory.push(composeMark(newMark, newRev));
		} else {
			// Past this point, we are guaranteed that `newMark` and `baseMark` have the same length and
			// start at the same location in the revision after the base changes.
			// They therefore refer to the same range for that revision.
			assert(
				!isAttach(newMark) || isConflictedReattach(newMark),
				0x4dc /* A new attach cannot be at the same position as a base mark */,
			);
			const composedMark = composeMarks(baseMark, newRev, newMark, genId, moveEffects);
			factory.push(composedMark);
		}
	}

	return applyMoveEffects(factory.list, moveEffects);
}

/**
 * Composes two marks where `newMark` is based on the state produced by `baseMark`.
 * @param baseMark - The mark to compose with `newMark`.
 * Its output range should be the same as `newMark`'s input range.
 * @param newRev - The revision the new mark is part of.
 * @param newMark - The mark to compose with `baseMark`.
 * Its input range should be the same as `baseMark`'s output range.
 * @returns A mark that is equivalent to applying both `baseMark` and `newMark` successively.
 */
function composeMarks(
	baseMark: Mark,
	newRev: RevisionTag | undefined,
	newMark: InputSpanningMark,
	genId: IdAllocator,
	moveEffects: MoveEffectTable,
): Mark {
	if (isSkipMark(baseMark)) {
		return composeMark(newMark, newRev);
	}
	if (isSkipMark(newMark)) {
		return baseMark;
	}

	const baseType = baseMark.type;
	const newType = newMark.type;
	switch (baseType) {
		case "Insert":
		case "Revive":
			switch (newType) {
				case "Delete": {
					// The insertion made by the base change is subsequently deleted.
					// TODO: preserve the insertions as conflicted.
					return 0;
				}
				case "MoveOut":
				case "ReturnFrom":
					// The insert has been moved by `newMark`.
					// We can represent net effect of the two marks as an insert at the move destination.
					getOrAddEffect(
						moveEffects,
						MoveEnd.Dest,
						newMark.revision ?? newRev,
						newMark.id,
						true,
					);
					return 0;
				case "Revive": {
					assert(
						!isConflictedReattach(baseMark) && isConflicted(newMark),
						0x4dd /* Invalid mark overlap */,
					);
					return baseMark;
				}
				default:
					fail(`Not implemented: ${newType}`);
			}
		case "MoveIn": {
			switch (newType) {
				case "Delete": {
					getOrAddEffect(
						moveEffects,
						MoveEnd.Source,
						baseMark.revision,
						baseMark.id,
						true,
					).mark = composeMark(newMark, newRev);
					return 0;
				}
				case "MoveOut": {
					getOrAddEffect(
						moveEffects,
						MoveEnd.Source,
						baseMark.revision,
						baseMark.id,
						true,
					).mark = composeMark(newMark, newRev);
					getOrAddEffect(
						moveEffects,
						MoveEnd.Dest,
						newMark.revision ?? newRev,
						newMark.id,
						true,
					);
					return 0;
				}
				case "ReturnFrom": {
					if (newMark.detachedBy === baseMark.revision) {
						getOrAddEffect(
							moveEffects,
							MoveEnd.Source,
							baseMark.revision,
							baseMark.id,
							true,
						).shouldRemove = true;
						getOrAddEffect(
							moveEffects,
							MoveEnd.Dest,
							newMark.revision ?? newRev,
							newMark.id,
							true,
						).shouldRemove = true;
						return 0;
					} else {
						getOrAddEffect(
							moveEffects,
							MoveEnd.Source,
							baseMark.revision,
							baseMark.id,
							true,
						).mark = composeMark(newMark, newRev);
						getOrAddEffect(
							moveEffects,
							MoveEnd.Dest,
							newMark.revision ?? newRev,
							newMark.id,
							true,
						);
						return 0;
					}
				}
				default:
					fail(`Not implemented: ${newType}`);
			}
		}
		case "ReturnTo": {
			switch (newType) {
				case "Delete": {
					getOrAddEffect(
						moveEffects,
						MoveEnd.Source,
						baseMark.revision,
						baseMark.id,
						true,
					).mark = composeMark(newMark, newRev);
					return 0;
				}
				case "MoveOut": {
					if (baseMark.detachedBy === (newMark.revision ?? newRev)) {
						getOrAddEffect(
							moveEffects,
							MoveEnd.Source,
							baseMark.revision,
							baseMark.id,
							true,
						).shouldRemove = true;
						getOrAddEffect(
							moveEffects,
							MoveEnd.Dest,
							newMark.revision ?? newRev,
							newMark.id,
							true,
						).shouldRemove = true;
						return 0;
					} else {
						getOrAddEffect(
							moveEffects,
							MoveEnd.Source,
							baseMark.revision,
							baseMark.id,
							true,
						).mark = composeMark(newMark, newRev);
						getOrAddEffect(
							moveEffects,
							MoveEnd.Dest,
							newMark.revision ?? newRev,
							newMark.id,
							true,
						);
						return 0;
					}
				}
				case "ReturnFrom": {
					if (
						baseMark.detachedBy === (newMark.revision ?? newRev) ||
						newMark.detachedBy === baseMark.revision
					) {
						getOrAddEffect(
							moveEffects,
							MoveEnd.Source,
							baseMark.revision,
							baseMark.id,
							true,
						).shouldRemove = true;
						getOrAddEffect(
							moveEffects,
							MoveEnd.Dest,
							newMark.revision ?? newRev,
							newMark.id,
							true,
						).shouldRemove = true;
						return 0;
					} else {
						getOrAddEffect(
							moveEffects,
							MoveEnd.Source,
							baseMark.revision,
							baseMark.id,
							true,
						).mark = composeMark(newMark, newRev);
						getOrAddEffect(
							moveEffects,
							MoveEnd.Dest,
							newMark.revision ?? newRev,
							newMark.id,
							true,
						);
						return 0;
					}
				}
				default:
					fail(`Not implemented: ${newType}`);
			}
		}
		default:
			fail(`Composing ${baseType} and ${newType} is not implemented`);
	}
}

function composeMark<TMark extends Mark>(mark: TMark, revision: RevisionTag | undefined): TMark {
	if (isSkipMark(mark)) {
		return mark;
	}

	const cloned = clone(mark);
	assert(!isSkipMark(cloned), 0x4de /* Cloned should be same type as input mark */);
	if (revision !== undefined && cloned.revision === undefined) {
		cloned.revision = revision;
	}

	return cloned;
}

function applyMoveEffects(marks: MarkList, moveEffects: MoveEffectTable): MarkList {
	const factory = new MarkListFactory(undefined, moveEffects);
	const queue = new MarkQueue(marks, undefined, moveEffects, true, () =>
		fail("Should not generate IDs"),
	);

	while (!queue.isEmpty()) {
		factory.push(queue.dequeue());
	}

	return factory.list;
}

export class ComposeQueue<T> {
	private readonly baseMarks: MarkQueue;
	private readonly newMarks: MarkQueue;
	private readonly baseIndex: IndexTracker;
	private readonly baseGap: GapTracker;

	public constructor(
		baseRevision: RevisionTag | undefined,
		baseMarks: Changeset,
		private readonly newRevision: RevisionTag | undefined,
		newMarks: Changeset,
		genId: IdAllocator,
		moveEffects: MoveEffectTable,
	) {
		this.baseIndex = new IndexTracker();
		this.baseGap = new GapTracker();
		this.baseMarks = new MarkQueue(baseMarks, baseRevision, moveEffects, true, genId);
		this.newMarks = new MarkQueue(newMarks, newRevision, moveEffects, true, genId);
	}

	public isEmpty(): boolean {
		return this.baseMarks.isEmpty() && this.newMarks.isEmpty();
	}

	public pop(): ComposeMarks<T> {
		const output = this.popImpl();
		if (output.baseMark !== undefined) {
			this.baseIndex.advance(output.baseMark);
			this.baseGap.advance(output.baseMark);
		}
		return output;
	}

	private popImpl(): ComposeMarks<T> {
		let baseMark = this.baseMarks.peek();
		let newMark = this.newMarks.peek();
		if (baseMark === undefined && newMark === undefined) {
			return {};
		} else if (baseMark === undefined) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const length = getInputLength(newMark!);
			return {
				baseMark: length > 0 ? length : undefined,
				newMark: this.newMarks.tryDequeue(),
			};
		} else if (newMark === undefined) {
			const length = getOutputLength(baseMark);
			return {
				baseMark: this.baseMarks.tryDequeue(),
				newMark: length > 0 ? length : undefined,
			};
		} else if (isAttach(newMark)) {
			if (isActiveReattach(newMark) && isDetachMark(baseMark)) {
				const newRev = newMark.revision ?? this.newRevision;
				const baseRev = baseMark.revision ?? this.baseMarks.revision;
				assert(
					baseRev !== undefined,
					0x4df /* Compose base mark should carry revision info */,
				);
				const areInverses =
					// The same RevisionTag implies the two changesets are inverses in a rebase sandwich
					(newRev !== undefined && baseRev === newRev) ||
					// The new mark is an undo of the base one
					newMark.detachedBy === baseRev;
				if (areInverses) {
					const baseMarkLength = getInputLength(baseMark);
					const newMarkLength = getOutputLength(newMark);
					const baseIndex = this.baseIndex.getIndex(baseRev);
					if (baseIndex === newMark.detachIndex) {
						if (newMarkLength < baseMarkLength) {
							baseMark = this.baseMarks.dequeueInput(newMarkLength);
							newMark = this.newMarks.dequeue();
						} else if (newMarkLength > baseMarkLength) {
							baseMark = this.baseMarks.dequeue();
							newMark = this.newMarks.dequeueOutput(baseMarkLength, true);
						} else {
							baseMark = this.baseMarks.dequeue();
							newMark = this.newMarks.dequeue();
						}
						return {
							baseMark,
							newMark,
							areInverses: true,
						};
					} else if (newMark.detachIndex < baseIndex) {
						return {
							newMark:
								newMark.detachIndex + newMarkLength <= baseIndex
									? this.newMarks.dequeue()
									: this.newMarks.dequeueOutput(
											baseIndex - newMark.detachIndex,
											true,
									  ),
						};
					} else {
						return {
							baseMark:
								baseIndex + baseMarkLength <= newMark.detachIndex
									? this.baseMarks.dequeue()
									: this.baseMarks.dequeueInput(newMark.detachIndex - baseIndex),
						};
					}
				} else {
					const targetOffset = getOffsetAtRevision(newMark.lineage, baseRev);
					if (targetOffset === undefined) {
						// Let baseMark represent the detach of some content X and newMark represent a reattach of some
						// different content Y.
						// The fact that newMark's lineage does not include an entry the detach of X, despite being in the
						// gap where that detach is taking place, means that the detach of Y must have occurred
						// chronologically after the detach of content X by baseMark.
						// Since the set of changes being composed include both the detach for X (in the form of
						// baseMark) and the reattach for Y (in the form of newMark), then we know for sure that the
						// set of changes being composed must also include the detach for content Y that must have
						// occurred (chronologically) between them.
						// We also know that, during this iteration of compose, the detach for content Y will show up
						// in the base changeset because we're in the process of merging in its inverse.
						// If we had already encountered this base detach of content Y then we would have cancelled it
						// out with (or ordered it with respect to) newMark.
						// This later detach must therefore be present in the base changeset, and further to the right.
						// We'll keep returning all the base marks before that.
						return {
							baseMark: this.baseMarks.dequeue(),
						};
					} else {
						// The reattach is for a detach that occurred chronologically before the baseMark detach.
						// We rely on the lineage information to tell us where in relation to baseMark this earlier
						// detach was.
						const currentOffset = this.baseGap.getOffset(baseRev);
						const remainingOffset = targetOffset - currentOffset;
						assert(remainingOffset >= 0, 0x4e0 /* Overshot the target gap */);
						if (remainingOffset === 0) {
							return { newMark: this.newMarks.dequeue() };
						}
						return {
							baseMark:
								remainingOffset < getInputLength(baseMark)
									? this.baseMarks.dequeueInput(remainingOffset)
									: this.baseMarks.dequeue(),
						};
					}
				}
			} else if (
				isReattach(newMark) &&
				isReattach(baseMark) &&
				areRelatedReattaches(baseMark, newMark)
			) {
				return dequeueRelatedReattaches(this.newMarks, this.baseMarks);
			}
			return { newMark: this.newMarks.dequeue() };
		} else if (isDetachMark(baseMark) || isBlockedReattach(baseMark)) {
			return { baseMark: this.baseMarks.dequeue() };
		} else if (isConflictedDetach(newMark)) {
			return { newMark: this.newMarks.dequeue() };
		} else {
			// If we've reached this branch then `baseMark` and `newMark` start at the same location
			// in the document field at the revision after the base changes and before the new changes.
			// Despite that, it's not necessarily true that they affect the same range in that document
			// field because they may be of different lengths.
			// We perform any necessary splitting in order to end up with a pair of marks that do have the same length.
			const newMarkLength = getInputLength(newMark);
			const baseMarkLength = getOutputLength(baseMark);
			if (newMarkLength < baseMarkLength) {
				this.newMarks.dequeue();
				baseMark = this.baseMarks.dequeueOutput(newMarkLength);
			} else if (newMarkLength > baseMarkLength) {
				this.baseMarks.dequeue();
				newMark = this.newMarks.dequeueInput(baseMarkLength);
			} else {
				this.baseMarks.dequeue();
				this.newMarks.dequeue();
			}
			// Past this point, we are guaranteed that `newMark` and `baseMark` have the same length and
			// start at the same location in the revision after the base changes.
			// They therefore refer to the same range for that revision.
			return { baseMark, newMark };
		}
	}
}

type ComposeMarks<T> =
	| {
			baseMark: Mark;
			newMark: Mark;
			areInverses: true;
	  }
	| {
			baseMark?: Mark;
			newMark?: Mark;
			areInverses?: false;
	  };

/**
 * @returns true iff both reattaches target cells that were affected by the same detach.
 * The target cells may or may not overlap depending on detach index information.
 *
 * Only valid in the context of a compose (i.e., the output context of `baseMarks` is the input context of `newMark`).
 */
function areRelatedReattaches<T>(baseMark: Reattach, newMark: Reattach): boolean {
	return newMark.detachedBy === baseMark.detachedBy;
}
