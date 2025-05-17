/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { ICodecFamily } from "../../codec/index.js";
import {
	type ChangeAtomId,
	type ChangeAtomIdWithRevision,
	type ChangeEncodingContext,
	type ChangeFamily,
	type ChangeFamilyEditor,
	type ChangeRebaser,
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
	topDownPath,
} from "../../core/index.js";
import { brand, hasSingle } from "../../util/index.js";
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
	implements ChangeFamily<DefaultEditBuilder, DefaultChangeset>
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
	): DefaultEditBuilder {
		return new DefaultEditBuilder(this, mintRevisionTag, changeReceiver);
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

export type DetachedRootIds = readonly DeltaRootIdRange[];
export interface DeltaRootIdRange {
	readonly first: ChangeAtomIdWithRevision;
	readonly count: number;
}

/**
 * Default editor for transactional tree data changes.
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
export interface IDefaultEditBuilder<TUnhydrated = TreeChunk, TDetachedRoots = DetachedRootIds>
	extends CanHydrateNodes<TUnhydrated, TDetachedRoots> {
	/**
	 * @param field - the value field which is being edited under the parent node
	 * @returns An object with methods to edit the given field of the given parent.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	valueField(field: NormalizedFieldUpPath): ValueFieldEditBuilder<TUnhydrated, TDetachedRoots>;

	/**
	 * @param field - the optional field which is being edited under the parent node
	 * @returns An object with methods to edit the given field of the given parent.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	optionalField(
		field: NormalizedFieldUpPath,
	): OptionalFieldEditBuilder<TUnhydrated, TDetachedRoots>;

	/**
	 * @param field - the sequence field which is being edited under the parent node
	 *
	 * @returns An object with methods to edit the given field of the given parent.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	sequenceField(
		field: NormalizedFieldUpPath,
	): SequenceFieldEditBuilder<TUnhydrated, TDetachedRoots>;

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
}

/**
 * Implementation of {@link IDefaultEditBuilder} based on the default set of supported field kinds.
 * @sealed
 */
export class DefaultEditBuilder implements ChangeFamilyEditor, IDefaultEditBuilder {
	private readonly modularBuilder: ModularEditBuilder;

	public constructor(
		family: ChangeFamily<ChangeFamilyEditor, DefaultChangeset>,
		private readonly mintRevisionTag: () => RevisionTag,
		changeReceiver: (change: TaggedChange<DefaultChangeset>) => void,
	) {
		this.modularBuilder = new ModularEditBuilder(family, fieldKinds, changeReceiver);
	}

	public enterTransaction(): void {
		this.modularBuilder.enterTransaction();
	}
	public exitTransaction(): void {
		this.modularBuilder.exitTransaction();
	}

	public addNodeExistsConstraint(path: UpPath): void {
		this.modularBuilder.addNodeExistsConstraint(path, this.mintRevisionTag());
	}

	public addNodeExistsConstraintOnRevert(path: UpPath): void {
		this.modularBuilder.addNodeExistsConstraintOnRevert(path, this.mintRevisionTag());
	}

	public hydrate(content: TreeChunk): DetachedRootIds {
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
		}
		return detachedRoots;
	}

	public valueField(field: FieldUpPath): ValueFieldEditBuilder<TreeChunk, DetachedRootIds> {
		const editBuilder = {
			set: (newContent: TreeChunk): void => {
				assert(newContent.topLevelLength === 1, "Expected exactly one node");
				const root = this.hydrate(newContent);
				editBuilder.attach(root);
			},
			attach: (newContent: DetachedRootIds): void => {
				assert(
					hasSingle(newContent) && newContent[0].count === 1,
					"Expected exactly one node",
				);
				const revision = this.mintRevisionTag();
				const detach: ChangeAtomId = { localId: this.modularBuilder.generateId(), revision };
				const fill: ChangeAtomId = newContent[0].first;
				const change: FieldChangeset = brand(
					valueFieldKind.changeHandler.editor.set({
						fill,
						detach,
					}),
				);
				const edit: FieldEditDescription = {
					type: "field",
					field,
					fieldKind: valueFieldKind.identifier,
					change,
					revision,
				};
				this.modularBuilder.submitChanges([edit], revision);
			},
		};
		return editBuilder;
	}

	public optionalField(
		field: FieldUpPath,
	): OptionalFieldEditBuilder<TreeChunk, DetachedRootIds> {
		const editBuilder = {
			set: (newContent: TreeChunk | undefined, wasEmpty: boolean): void => {
				if (newContent === undefined) {
					editBuilder.clear(wasEmpty);
					return;
				}
				assert(newContent.topLevelLength === 1, "Expected exactly one node");
				const root = this.hydrate(newContent);
				editBuilder.attach(root, wasEmpty);
			},
			attach: (newContent: DetachedRootIds, wasEmpty: boolean): void => {
				assert(
					hasSingle(newContent) && newContent[0].count === 1,
					"Expected exactly one node",
				);
				const revision = this.mintRevisionTag();
				const detach: ChangeAtomId = { localId: this.modularBuilder.generateId(), revision };
				const fill: ChangeAtomId = newContent[0].first;
				const optionalChange = optional.changeHandler.editor.set(wasEmpty, {
					fill,
					detach,
				});

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
		sourceField: FieldUpPath,
		sourceIndex: number,
		count: number,
		destinationField: FieldUpPath,
		destIndex: number,
	): void {
		if (count === 0) {
			return;
		} else if (count < 0 || !Number.isSafeInteger(count)) {
			throw new UsageError(`Expected non-negative integer count, got ${count}.`);
		}
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
			// After the above loop, `sharedDepth` is the number of elements, starting from the root,
			// that both paths have in common.
			if (sharedDepth === detachPath.length) {
				const attachField = attachPath[sharedDepth]?.parentField ?? destinationField.field;
				if (attachField === sourceField.field) {
					// The detach occurs in an ancestor field of the field where the attach occurs.
					let attachAncestorIndex = attachPath[sharedDepth]?.parentIndex ?? sourceIndex;
					if (attachAncestorIndex < sourceIndex) {
						// The attach path runs through a node located before the detached nodes.
						// No need to adjust the attach path.
					} else if (sourceIndex + count <= attachAncestorIndex) {
						// The attach path runs through a node located after the detached nodes.
						// adjust the index for the node at that depth of the path, so that it is interpreted correctly
						// in the composition performed by `submitChanges`.
						attachAncestorIndex -= count;
						let parent: UpPath | undefined = attachPath[sharedDepth - 1];
						const parentField = attachPath[sharedDepth] ?? oob();
						parent = {
							parent,
							parentIndex: attachAncestorIndex,
							parentField: parentField.parentField,
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
			const moveOut = sequence.changeHandler.editor.moveOut(
				sourceIndex,
				count,
				detachCellId,
				revision,
			);
			const moveIn = sequence.changeHandler.editor.moveIn(
				destIndex,
				count,
				detachCellId,
				attachCellId,
				revision,
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
		field: FieldUpPath,
	): SequenceFieldEditBuilder<TreeChunk, DetachedRootIds> {
		const editBuilder = {
			insert: (index: number, content: TreeChunk): void => {
				const count = content.topLevelLength;
				if (count === 0) {
					return;
				}
				const roots = this.hydrate(content);
				editBuilder.attach(index, roots);
			},
			attach: (index: number, newContent: DetachedRootIds): void => {
				const attachRevision = this.mintRevisionTag();
				const edits: EditDescription[] = [];
				let insertOffset = 0;
				for (const { first, count } of newContent) {
					if (count === 0) {
						continue;
					}
					const cellId = {
						localId: this.modularBuilder.generateId(count),
						revision: attachRevision,
					};
					const change: FieldChangeset = brand(
						sequence.changeHandler.editor.insert(
							index + insertOffset,
							count,
							cellId,
							first.revision,
							first.localId,
						),
					);
					const attach: FieldEditDescription = {
						type: "field",
						field,
						fieldKind: sequence.identifier,
						change,
						revision: attachRevision,
					};
					edits.push(attach);
					insertOffset += count;
				}
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

/**
 */
export interface ValueFieldEditBuilder<TContent, TDetachedRoots> {
	/**
	 * Issues a change which replaces the content of the field with the given detached node.
	 * @param content - The content to be attached in the field in the given order.
	 * Must represent a single detached node.
	 * Must have been created in the same JS turn.
	 */
	attach(content: TDetachedRoots): void;

	/**
	 * Issues a change which replaces the content of the field with `newContent`.
	 * @param newContent - the new content for the field.
	 * The cursor can be in either Field or Node mode and must represent exactly one node.
	 *
	 * @deprecated Use {@link attach} instead.
	 */
	set(newContent: TContent): void;
}

/**
 */
export interface OptionalFieldEditBuilder<TContent, TDetachedRoots> {
	/**
	 * Issues a change which replaces the content of the field with the given detached node.
	 * @param content - The content to be attached in the field in the given order.
	 * Must represent a single detached node.
	 */
	attach(content: TDetachedRoots, wasEmpty: boolean): void;

	/**
	 * Issues a change which clears content of the field.
	 * @param wasEmpty - whether the field is empty when creating this change
	 */
	clear(wasEmpty: boolean): void;

	/**
	 * Issues a change which replaces the content of the field with `newContent`
	 * @param newContent - the new content for the field.
	 * @param wasEmpty - whether the field is empty when creating this change
	 *
	 * @deprecated Use {@link attach} or {@link clear} instead.
	 */
	set(newContent: TContent | undefined, wasEmpty: boolean): void;
}

/**
 */
export interface SequenceFieldEditBuilder<TContent, TDetachedRoots> {
	/**
	 * Issues a change which attaches a sequence of detached nodes at the given `index`.
	 * @param index - The index at which to attach the detached nodes.
	 * @param detachedContent - The content to be attached in the field in the given order. Each node must be detached.
	 */
	attach(index: number, detachedContent: TDetachedRoots): void;

	/**
	 * Issues a change which inserts the `newContent` at the given `index`.
	 * @param index - the index at which to insert the `newContent`.
	 * @param newContent - the new content to be inserted in the field.
	 *
	 * @deprecated Use {@link attach} instead.
	 */
	insert(index: number, newContent: TContent): void;

	/**
	 * Issues a change which removes `count` elements starting at the given `index`.
	 * @param index - The index of the first removed element.
	 * @param count - The number of elements to remove.
	 */
	remove(index: number, count: number): void;
}

export interface CanHydrateNodes<TUnhydrated, TDetachedRoots> {
	hydrate(unhydrated: TUnhydrated): TDetachedRoots;
}

/**
 * @returns The number of path elements that both paths share, starting at index 0.
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
