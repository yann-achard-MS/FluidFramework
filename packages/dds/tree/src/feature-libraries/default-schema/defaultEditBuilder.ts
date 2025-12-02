/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { lt as semverLessThan } from "semver-ts";

import { assert, oob } from "@fluidframework/core-utils/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { FluidClientVersion, type ICodecFamily } from "../../codec/index.js";
import {
	type ChangeAtomId,
	type ChangeEncodingContext,
	type ChangeFamily,
	type ChangeFamilyEditor,
	type ChangeRebaser,
	type ChangesetLocalId,
	type DeltaDetachedNodeId,
	type DeltaRoot,
	type FieldUpPath,
	type NormalizedFieldUpPath,
	type NormalizedUpPath,
	type RevisionTag,
	type TaggedChange,
	type TreeChunk,
	type UpPath,
	compareFieldUpPaths,
	getDetachedFieldContainingFieldPath,
	rootField,
	topDownPath,
} from "../../core/index.js";
import { brand, RangeMap } from "../../util/index.js";
import {
	type EditDescription,
	type FieldChangeset,
	type FieldEditDescription,
	ModularChangeFamily,
	type ModularChangeset,
	ModularEditBuilder,
	intoDelta as intoModularDelta,
	relevantRemovedRoots as relevantModularRemovedRoots,
} from "../modular-schema/index.js";

import {
	fieldKinds,
	optional,
	sequence,
	required as valueFieldKind,
} from "./defaultFieldKinds.js";
import type { CellId } from "../sequence-field/index.js";

export type DefaultChangeset = ModularChangeset;

/**
 * Implementation of {@link ChangeFamily} based on the default set of supported field kinds.
 *
 * @sealed
 */
export class DefaultChangeFamily
	implements ChangeFamily<IdBasedChangeFamilyDataEditor, DefaultChangeset>
{
	private readonly modularFamily: ModularChangeFamily;

	public constructor(codecs: ICodecFamily<ModularChangeset, ChangeEncodingContext>) {
		this.modularFamily = new ModularChangeFamily(fieldKinds, codecs);
	}

	public get rebaser(): ChangeRebaser<DefaultChangeset> {
		return this.modularFamily.rebaser;
	}

	public get codecs(): ICodecFamily<DefaultChangeset, ChangeEncodingContext> {
		return this.modularFamily.codecs;
	}

	public buildEditor(
		mintRevisionTag: () => RevisionTag,
		changeReceiver: (change: TaggedChange<DefaultChangeset>) => void,
		minVersionForCollab?: MinimumVersionForCollab,
	): IdBasedChangeFamilyDataEditor {
		return new DefaultIdBasedDataEditor(
			this,
			mintRevisionTag,
			changeReceiver,
			minVersionForCollab,
		);
	}
}

/**
 * @param change - The change to convert into a delta.
 */
export function intoDelta(taggedChange: TaggedChange<ModularChangeset>): DeltaRoot {
	return intoModularDelta(taggedChange, fieldKinds);
}

/**
 * Returns the set of removed roots that should be in memory for the given change to be applied.
 * A removed root is relevant if any of the following is true:
 * - It is being inserted
 * - It is being restored
 * - It is being edited
 * - The ID it is associated with is being changed
 *
 * May be conservative by returning more removed roots than strictly necessary.
 *
 * Will never return IDs for non-root trees, even if they are removed.
 *
 * @param change - The change to be applied.
 */
export function relevantRemovedRoots(change: ModularChangeset): Iterable<DeltaDetachedNodeId> {
	return relevantModularRemovedRoots(change, fieldKinds);
}

export type DetachedRootIds = readonly DetachedRootIdRange[];
export interface DetachedRootIdRange {
	readonly first: ChangeAtomId;
	readonly count: number;
}

/**
 * Default editor for tree data changes.
 * @privateRemarks
 * When taking into account not just the content of the tree,
 * but also how the merge identities (and thus anchors, flex-tree and simple-tree nodes) of nodes before and after the edits correspond,
 * some edits are currently impossible to express.
 * Examples of these non-expressible edits include:
 *
 * - Changing the type of a node while keeping its merge identity.
 * - Changing the value of a leaf while keeping its merge identity.
 * - Swapping subtrees between two value fields.
 * - Replacing a node in the middle of a tree while reusing some of the old nodes decedents that were under value fields.
 *
 * At some point it will likely be worth supporting at least some of these, possibly using a mechanism that could support all of them if desired.
 * If/when such a mechanism becomes available, an evaluation should be done to determine if any existing editing operations should be changed to leverage it
 * (Possibly by adding opt ins at the view schema layer).
 */
export interface DataEditor<TContent, TDetachedRoot, TDetachedRoots> {
	/**
	 * Moves a subsequence from one sequence field to another sequence field.
	 *
	 * Note that the `destinationIndex` is interpreted based on the state of the sequence *before* the move operation.
	 * For example, `move(field, 0, 1, field, 2)` changes `[A, B, C]` to `[B, A, C]`.
	 */
	move(
		sourceField: NormalizedFieldUpPath,
		sourceIndex: number,
		count: number,
		destinationField: NormalizedFieldUpPath,
		destinationIndex: number,
	): void;

	/**
	 * Add a constraint that the node at the given path must exist.
	 * @param path - The path to the node that must exist.
	 */
	addNodeExistsConstraint(path: NormalizedUpPath): void;

	/**
	 * Add a constraint that the node at the given path must exist when reverting a change.
	 * @param path - The path to the node that must exist when reverting a change.
	 */
	addNodeExistsConstraintOnRevert(path: NormalizedUpPath): void;

	/**
	 * Builds the detached roots for the given content.
	 * @param content - The content to be built into detached nodes.
	 *
	 * Requires SharedTreeFormatVersion.vDetachedRoots or later.
	 */
	buildRoots(content: TContent): TDetachedRoots;

	/**
	 * @param field - the value field which is being edited under the parent node
	 * @returns An object with methods to edit the given field of the given parent.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	valueField(field: NormalizedFieldUpPath): RequiredFieldEditor<TContent, TDetachedRoot>;

	/**
	 * @param field - the optional field which is being edited under the parent node
	 * @returns An object with methods to edit the given field of the given parent.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	optionalField(field: NormalizedFieldUpPath): OptionalFieldEditor<TContent, TDetachedRoot>;

	/**
	 * @param field - the sequence field which is being edited under the parent node
	 *
	 * @returns An object with methods to edit the given field of the given parent.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	sequenceField(field: NormalizedFieldUpPath): SequenceFieldEditor<TContent, TDetachedRoots>;
}

export type IdBasedChangeFamilyDataEditor = ChangeFamilyEditor &
	DataEditor<TreeChunk, ChangeAtomId, DetachedRootIds>;

export function offsetChangesetLocalId(
	id: ChangesetLocalId,
	offset: number,
): ChangesetLocalId {
	return brand(id + offset);
}

export function subtractChangesetLocalId(a: ChangesetLocalId, b: ChangesetLocalId): number {
	return a - b;
}

/**
 * Implementation of {@link IdBasedChangeFamilyDataEditor} based on the default set of supported field kinds.
 * @sealed
 */
export class DefaultIdBasedDataEditor implements IdBasedChangeFamilyDataEditor {
	private readonly modularBuilder: ModularEditBuilder;
	private readonly nodesWithoutCells: RangeMap<ChangesetLocalId, true> = new RangeMap(
		offsetChangesetLocalId,
		subtractChangesetLocalId,
	);

	public constructor(
		family: ChangeFamily<ChangeFamilyEditor, DefaultChangeset>,
		private readonly mintRevisionTag: () => RevisionTag,
		changeReceiver: (change: TaggedChange<DefaultChangeset>) => void,
		private readonly minVersionForCollab: MinimumVersionForCollab = FluidClientVersion.v2_0,
	) {
		this.modularBuilder = new ModularEditBuilder(family, fieldKinds, changeReceiver);
	}

	public enterTransaction(): void {
		if (this.modularBuilder.isInTransaction() === false) {
			this.nodesWithoutCells.clear();
		}
		this.modularBuilder.enterTransaction();
	}
	public exitTransaction(): void {
		this.modularBuilder.exitTransaction();
		if (this.modularBuilder.isInTransaction() === false) {
			this.nodesWithoutCells.clear();
		}
	}

	public addNodeExistsConstraint(path: NormalizedUpPath): void {
		enforceMinVersionForCollabOnEditsToDetachedTrees(
			{ parent: path.parent, field: path.parentField },
			this.minVersionForCollab,
		);
		this.modularBuilder.addNodeExistsConstraint(path, this.mintRevisionTag());
	}

	public addNodeExistsConstraintOnRevert(path: NormalizedUpPath): void {
		enforceMinVersionForCollabOnEditsToDetachedTrees(
			{ parent: path.parent, field: path.parentField },
			this.minVersionForCollab,
		);
		this.modularBuilder.addNodeExistsConstraintOnRevert(path, this.mintRevisionTag());
	}

	public buildRoots(content: TreeChunk): DetachedRootIds {
		const detachedRoots = [];
		const count = content.topLevelLength;
		if (count > 0) {
			const buildRevision = this.mintRevisionTag();
			const buildId = {
				localId: this.modularBuilder.generateId(count),
				revision: buildRevision,
			};
			const build = this.modularBuilder.buildTrees(buildId.localId, content, buildRevision);
			this.modularBuilder.submitChanges([build], buildRevision);
			detachedRoots.push({ first: buildId, count });
			this.nodesWithoutCells.set(buildId.localId, count, true);
		}
		return detachedRoots;
	}

	public valueField(
		field: NormalizedFieldUpPath,
	): RequiredFieldEditor<TreeChunk, ChangeAtomId> {
		enforceMinVersionForCollabOnEditsToDetachedTrees(field, this.minVersionForCollab);
		const makeAttachEditDescription = (
			fill: ChangeAtomId,
			revision: RevisionTag,
		): FieldEditDescription => {
			const detachLocalId = this.modularBuilder.generateId();
			const detach = { localId: detachLocalId, revision };
			const change = valueFieldKind.changeHandler.editor.set({ fill, detach });
			return {
				type: "field",
				field,
				fieldKind: valueFieldKind.identifier,
				change: brand(change),
				revision,
			};
		};
		return {
			set: (newContent: TreeChunk): void => {
				assert(newContent.topLevelLength === 1, "Expected exactly one node");
				const revision = this.mintRevisionTag();
				const buildLocalId = this.modularBuilder.generateId();
				const buildId = { localId: buildLocalId, revision };
				const build = this.modularBuilder.buildTrees(buildLocalId, newContent, revision);
				const attach = makeAttachEditDescription(buildId, revision);
				this.modularBuilder.submitChanges([build, attach], revision);
			},

			attach: (newContent: ChangeAtomId): void => {
				const isWithoutCell = this.nodesWithoutCells.delete(newContent.localId, 1) === 1;
				if (
					!isWithoutCell &&
					semverLessThan(this.minVersionForCollab, FluidClientVersion.vDetachedRoots)
				) {
					throw new UsageError(
						`Attach edits require a minimum version for collaboration >= ${FluidClientVersion.vDetachedRoots}.`,
					);
				}
				const revision = this.mintRevisionTag();
				const attach = makeAttachEditDescription(newContent, revision);
				this.modularBuilder.submitChanges([attach], revision);
			},
		};
	}

	public optionalField(
		field: NormalizedFieldUpPath,
	): OptionalFieldEditor<TreeChunk, ChangeAtomId> {
		enforceMinVersionForCollabOnEditsToDetachedTrees(field, this.minVersionForCollab);
		const makeAttachEditDescription = (
			fill: ChangeAtomId,
			revision: RevisionTag,
			wasEmpty: boolean,
		): FieldEditDescription => {
			const detachLocalId = this.modularBuilder.generateId();
			const detach = { localId: detachLocalId, revision };
			const change = optional.changeHandler.editor.set(wasEmpty, { fill, detach });
			return {
				type: "field",
				field,
				fieldKind: optional.identifier,
				change: brand(change),
				revision,
			};
		};
		const editBuilder = {
			set: (newContent: TreeChunk | undefined, wasEmpty: boolean): void => {
				if (newContent === undefined) {
					editBuilder.clear(wasEmpty);
					return;
				}
				assert(newContent.topLevelLength === 1, "Expected exactly one node");
				const revision = this.mintRevisionTag();
				const buildLocalId = this.modularBuilder.generateId();
				const buildId = { localId: buildLocalId, revision };
				const build = this.modularBuilder.buildTrees(buildLocalId, newContent, revision);
				const attach = makeAttachEditDescription(buildId, revision, wasEmpty);
				this.modularBuilder.submitChanges([build, attach], revision);
			},
			attach: (newContent: ChangeAtomId | undefined, wasEmpty: boolean): void => {
				if (newContent === undefined) {
					editBuilder.clear(wasEmpty);
					return;
				}
				const isWithoutCell = this.nodesWithoutCells.delete(newContent.localId, 1) === 1;
				if (
					!isWithoutCell &&
					semverLessThan(this.minVersionForCollab, FluidClientVersion.vDetachedRoots)
				) {
					throw new UsageError(
						`Attach edits require a minimum version for collaboration >= ${FluidClientVersion.vDetachedRoots}.`,
					);
				}
				const revision = this.mintRevisionTag();
				const attach = makeAttachEditDescription(newContent, revision, wasEmpty);
				this.modularBuilder.submitChanges([attach], revision);
			},
			clear: (wasEmpty: boolean): void => {
				const revision = this.mintRevisionTag();
				const detach: ChangeAtomId = { localId: this.modularBuilder.generateId(), revision };
				const optionalChange = optional.changeHandler.editor.clear(wasEmpty, detach);
				const change: FieldChangeset = brand(optionalChange);
				const edit: FieldEditDescription = {
					type: "field",
					field,
					fieldKind: optional.identifier,
					change,
					revision,
				};
				this.modularBuilder.submitChanges([edit], revision);
			},
		};
		return editBuilder;
	}

	public move(
		sourceField: NormalizedFieldUpPath,
		sourceIndex: number,
		count: number,
		destinationField: NormalizedFieldUpPath,
		destIndex: number,
	): void {
		if (count === 0) {
			return;
		} else if (count < 0 || !Number.isSafeInteger(count)) {
			throw new UsageError(`Expected non-negative integer count, got ${count}.`);
		}
		enforceMinVersionForCollabOnEditsToDetachedTrees(sourceField, this.minVersionForCollab);
		enforceMinVersionForCollabOnEditsToDetachedTrees(
			destinationField,
			this.minVersionForCollab,
		);
		const revision = this.mintRevisionTag();
		const detachCellId = this.modularBuilder.generateId(count);
		const attachCellId: CellId = { localId: this.modularBuilder.generateId(count), revision };
		if (compareFieldUpPaths(sourceField, destinationField)) {
			const change = sequence.changeHandler.editor.move(
				sourceIndex,
				count,
				destIndex,
				detachCellId,
				attachCellId,
				revision,
			);
			this.modularBuilder.submitChange(
				sourceField,
				sequence.identifier,
				brand(change),
				revision,
			);
		} else {
			const detachPath = topDownPath(sourceField.parent);
			const attachPath = topDownPath(destinationField.parent);
			const sharedDepth = getSharedPrefixLength(detachPath, attachPath);
			let adjustedAttachField = destinationField;
			// `sharedDepth` is the number of elements, starting from the root, that both paths have in common.
			if (sharedDepth === detachPath.length) {
				const lowestCommonAncestor: NormalizedUpPath | undefined = attachPath[sharedDepth];
				const attachField = lowestCommonAncestor?.parentField ?? destinationField.field;
				if (attachField === sourceField.field) {
					// The detach occurs in an ancestor field of the field where the attach occurs.
					const attachAncestorIndex = lowestCommonAncestor?.parentIndex ?? destIndex;
					if (attachAncestorIndex < sourceIndex) {
						// The attach path runs through a node located before the detached nodes.
						// No need to adjust the attach path.
					} else if (sourceIndex + count <= attachAncestorIndex) {
						// The attach path runs through a node located after the detached nodes.
						// adjust the index for the node at that depth of the path, so that it is interpreted correctly
						// in the composition performed by `submitChanges`.
						const adjustedAttachAncestorIndex = attachAncestorIndex - count;
						let parent: NormalizedUpPath =
							lowestCommonAncestor === undefined
								? {
										parent: undefined,
										detachedNodeId: undefined,
										parentIndex: adjustedAttachAncestorIndex,
										parentField: destinationField.field,
									}
								: {
										...lowestCommonAncestor,
										parentIndex: adjustedAttachAncestorIndex,
									};
						for (let i = sharedDepth + 1; i < attachPath.length; i += 1) {
							parent = {
								...(attachPath[i] ?? oob()),
								parent,
							};
						}
						adjustedAttachField = { parent, field: destinationField.field };
					} else {
						throw new UsageError(
							"Invalid move operation: the destination is located under one of the moved elements. Consider using the Tree.contains API to detect this.",
						);
					}
				}
			}
			const moveOut = sequence.changeHandler.editor.remove(
				sourceIndex,
				count,
				detachCellId,
				revision,
			);
			const moveIn = sequence.changeHandler.editor.insert(
				destIndex,
				count,
				attachCellId,
				revision,
				detachCellId,
			);

			this.modularBuilder.submitChanges(
				[
					{
						type: "field",
						field: sourceField,
						fieldKind: sequence.identifier,
						change: brand(moveOut),
						revision,
					},
					{
						type: "field",
						field: adjustedAttachField,
						fieldKind: sequence.identifier,
						change: brand(moveIn),
						revision,
					},
				],
				revision,
			);
		}
	}

	public sequenceField(
		field: NormalizedFieldUpPath,
	): SequenceFieldEditor<TreeChunk, DetachedRootIds> {
		enforceMinVersionForCollabOnEditsToDetachedTrees(field, this.minVersionForCollab);
		const makeAttachEditDescription = (
			index: number,
			newContent: DetachedRootIds,
			revision: RevisionTag,
			areWithoutCells: boolean,
		): EditDescription[] => {
			const edits: EditDescription[] = [];
			let insertOffset = 0;
			for (const { first, count } of newContent) {
				if (count === 0) {
					continue;
				}
				// If the nodes have never been attached in cell, then we must use a cell ID that matches the build ID.
				// This ensures back-compatibility with the v1 ModularChangeFamily model which requires that every node be associated with cell
				// by generating an insert whose destination cell is the cell associated with the build ID.
				const cellId = areWithoutCells
					? first
					: { localId: this.modularBuilder.generateId(count), revision };
				assert(first.revision !== undefined, "Detached nodes ID must have a revision");
				const change = sequence.changeHandler.editor.insert(
					index + insertOffset,
					count,
					cellId,
					first.revision,
					first.localId,
				);
				const attach: FieldEditDescription = {
					type: "field",
					field,
					fieldKind: sequence.identifier,
					change: brand(change),
					revision,
				};
				edits.push(attach);
				insertOffset += count;
			}
			return edits;
		};
		const editBuilder = {
			insert: (index: number, content: TreeChunk): void => {
				const count = content.topLevelLength;
				if (count === 0) {
					return;
				}
				const revision = this.mintRevisionTag();
				const buildLocalId = this.modularBuilder.generateId();
				const build = this.modularBuilder.buildTrees(buildLocalId, content, revision);
				const roots: DetachedRootIdRange = {
					first: { localId: buildLocalId, revision },
					count,
				};
				const edits = makeAttachEditDescription(index, [roots], revision, true);
				this.modularBuilder.submitChanges([build, ...edits], revision);
			},
			attach: (index: number, newContent: DetachedRootIds): void => {
				let areAllWithoutCells = true;
				for (const range of newContent) {
					const areWithoutCells =
						this.nodesWithoutCells.delete(range.first.localId, range.count) === range.count;
					if (!areWithoutCells) {
						if (semverLessThan(this.minVersionForCollab, FluidClientVersion.vDetachedRoots)) {
							throw new UsageError(
								`Attach edits require a minimum version for collaboration >= ${FluidClientVersion.vDetachedRoots}.`,
							);
						}
						areAllWithoutCells = false;
					}
				}
				const attachRevision = this.mintRevisionTag();
				const edits = makeAttachEditDescription(
					index,
					newContent,
					attachRevision,
					areAllWithoutCells,
				);
				if (edits.length > 0) {
					this.modularBuilder.submitChanges(edits, attachRevision);
				}
			},
			remove: (index: number, count: number): void => {
				if (count === 0) {
					return;
				}
				const revision = this.mintRevisionTag();
				const id = this.modularBuilder.generateId(count);
				const change: FieldChangeset = brand(
					sequence.changeHandler.editor.remove(index, count, id, revision),
				);
				this.modularBuilder.submitChange(field, sequence.identifier, change, revision);
			},
		};
		return editBuilder;
	}
}

function enforceMinVersionForCollabOnEditsToDetachedTrees(
	field: FieldUpPath,
	minVersionForCollab: MinimumVersionForCollab,
): void {
	if (semverLessThan(minVersionForCollab, FluidClientVersion.vDetachedRoots)) {
		const topField = getDetachedFieldContainingFieldPath(field);
		if (topField !== rootField) {
			throw new UsageError(
				`Edits and constraints on detached trees require a minimum version for collaboration >= ${FluidClientVersion.vDetachedRoots}.`,
			);
		}
	}
}

export interface RequiredFieldEditor<TContent, TDetachedRoot> {
	/**
	 * Issues a change which replaces the content of the field with the given detached node.
	 * @param content - The content to be attached in the field in the given order.
	 * Must represent a single detached node.
	 * Must have been created in the same JS turn.
	 *
	 * Requires SharedTreeFormatVersion.vDetachedRoots or later.
	 */
	attach(content: TDetachedRoot): void;

	/**
	 * Issues a change which replaces the content of the field with `newContent`.
	 * @param newContent - the new content for the field.
	 */
	set(newContent: TContent): void;
}

export interface OptionalFieldEditor<TContent, TDetachedRoots> {
	/**
	 * Issues a change which replaces the content of the field with the given detached node.
	 * @param content - The content to be attached in the field in the given order.
	 * Must represent a single detached node.
	 *
	 * Requires SharedTreeFormatVersion.vDetachedRoots or later.
	 */
	attach(content: TDetachedRoots | undefined, wasEmpty: boolean): void;

	/**
	 * Issues a change which clears content of the field.
	 * @param wasEmpty - whether the field is empty when creating this change
	 */
	clear(wasEmpty: boolean): void;

	/**
	 * Issues a change which replaces the content of the field with `newContent`
	 * @param newContent - the new content for the field.
	 * @param wasEmpty - whether the field is empty when creating this change
	 */
	set(newContent: TContent | undefined, wasEmpty: boolean): void;
}

/**
 * Editor for the sequence field kind.
 */
export interface SequenceFieldEditor<TContent, TDetachedRoots, TRemoved = void> {
	/**
	 * Issues a change which attaches a sequence of detached nodes at the given `index`.
	 * @param index - The index at which to attach the detached nodes.
	 * @param detachedContent - The content to be attached in the field in the given order. Each node must be detached.
	 *
	 * Requires SharedTreeFormatVersion.vDetachedRoots or later.
	 */
	attach(index: number, detachedContent: TDetachedRoots): void;

	/**
	 * Issues a change which inserts the `newContent` at the given `index`.
	 * @param index - the index at which to insert the `newContent`.
	 * @param newContent - the new content to be inserted in the field.
	 */
	insert(index: number, newContent: TContent): void;

	/**
	 * Issues a change which removes `count` elements starting at the given `index`.
	 * @param index - The index of the first removed element.
	 * @param count - The number of elements to remove.
	 */
	remove(index: number, count: number): TRemoved;
}

/**
 * Gets the number of path elements that both paths share, starting at index 0.
 */
function getSharedPrefixLength(pathA: readonly UpPath[], pathB: readonly UpPath[]): number {
	const minDepth = Math.min(pathA.length, pathB.length);
	let sharedDepth = 0;
	while (sharedDepth < minDepth) {
		const detachStep = pathA[sharedDepth] ?? oob();
		const attachStep = pathB[sharedDepth] ?? oob();
		if (detachStep !== attachStep) {
			if (
				detachStep.parentField !== attachStep.parentField ||
				detachStep.parentIndex !== attachStep.parentIndex
			) {
				break;
			}
		}
		sharedDepth += 1;
	}
	return sharedDepth;
}
