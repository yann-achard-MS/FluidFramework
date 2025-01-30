/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { BTree } from "@tylerbu/sorted-btree-es6";

import type { ICodecFamily } from "../../codec/index.js";
import {
	type ChangeEncodingContext,
	type ChangeFamily,
	type ChangeFamilyEditor,
	type ChangeRebaser,
	type ChangesetLocalId,
	CursorLocationType,
	type DeltaDetachedNodeBuild,
	type DeltaDetachedNodeDestruction,
	type DeltaDetachedNodeId,
	type DeltaFieldChanges,
	type DeltaFieldMap,
	type DeltaRoot,
	EditBuilder,
	type FieldKey,
	type FieldKindIdentifier,
	type FieldUpPath,
	type ITreeCursorSynchronous,
	type RevisionInfo,
	type RevisionMetadataSource,
	type RevisionTag,
	type TaggedChange,
	type UpPath,
	isEmptyFieldChanges,
	makeAnonChange,
	makeDetachedNodeId,
	mapCursorField,
	replaceAtomRevisions,
	revisionMetadataSourceFromInfo,
	areEqualChangeAtomIds,
	type ChangeAtomId,
} from "../../core/index.js";
import {
	type IdAllocationState,
	type IdAllocator,
	type Mutable,
	brand,
	fail,
	getOrAddInMap,
	idAllocatorFromMaxId,
	idAllocatorFromState,
	type RangeQueryResult,
	newTupleBTree,
	type TupleBTree,
} from "../../util/index.js";
import {
	type TreeChunk,
	chunkFieldSingle,
	chunkTree,
	defaultChunkPolicy,
} from "../chunked-forest/index.js";
import { cursorForMapTreeNode, mapTreeFromCursor } from "../mapTreeCursor.js";
import { MemoizedIdRangeAllocator } from "../memoizedIdRangeAllocator.js";

import {
	type CrossFieldManager,
	type CrossFieldMap,
	CrossFieldTarget,
	getFirstFromCrossFieldMap,
	setInCrossFieldMap,
} from "./crossFieldQueries.js";
import {
	type FieldChangeHandler,
	NodeAttachState,
	type RebaseRevisionMetadata,
} from "./fieldChangeHandler.js";
import { type FieldKindWithEditor, withEditor } from "./fieldKindWithEditor.js";
import { convertGenericChange, genericFieldKind } from "./genericFieldKind.js";
import type { GenericChangeset } from "./genericFieldKindTypes.js";
import type {
	ChangeAtomIdBTree,
	CrossFieldKeyRange,
	CrossFieldKeyTable,
	FieldChange,
	FieldChangeMap,
	FieldChangeset,
	FieldId,
	ModularChangeset,
	NodeChangeset,
	NodeId,
} from "./modularChangeTypes.js";

/**
 * Implementation of ChangeFamily which delegates work in a given field to the appropriate FieldKind
 * as determined by the schema.
 */
export class ModularChangeFamily
	implements
		ChangeFamily<ModularEditBuilder, ModularChangeset>,
		ChangeRebaser<ModularChangeset>
{
	public static readonly emptyChange: ModularChangeset = makeModularChangeset();

	public readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>;

	public constructor(
		fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
		public readonly codecs: ICodecFamily<ModularChangeset, ChangeEncodingContext>,
	) {
		this.fieldKinds = fieldKinds;
	}

	public get rebaser(): ChangeRebaser<ModularChangeset> {
		return this;
	}

	/**
	 * Produces an equivalent list of `FieldChangeset`s that all target the same {@link FlexFieldKind}.
	 * @param changes - The list of `FieldChange`s whose `FieldChangeset`s needs to be normalized.
	 * @returns An object that contains both the equivalent list of `FieldChangeset`s that all
	 * target the same {@link FlexFieldKind}, and the `FieldKind` that they target.
	 * The returned `FieldChangeset`s may be a shallow copy of the input `FieldChange`s.
	 */
	private normalizeFieldChanges(
		change1: FieldChange,
		change2: FieldChange,
		genId: IdAllocator,
		revisionMetadata: RevisionMetadataSource,
	): {
		fieldKind: FieldKindIdentifier;
		changeHandler: FieldChangeHandler<unknown>;
		change1: FieldChangeset;
		change2: FieldChangeset;
	} {
		// TODO: Handle the case where changes have conflicting field kinds
		const kind =
			change1.fieldKind !== genericFieldKind.identifier
				? change1.fieldKind
				: change2.fieldKind;

		if (kind === genericFieldKind.identifier) {
			// Both changes are generic
			return {
				fieldKind: genericFieldKind.identifier,
				changeHandler: genericFieldKind.changeHandler,
				change1: change1.change,
				change2: change2.change,
			};
		}
		const fieldKind = getFieldKind(this.fieldKinds, kind);
		const changeHandler = fieldKind.changeHandler;
		const normalizedChange1 = this.normalizeFieldChange(
			change1,
			changeHandler,
			genId,
			revisionMetadata,
		);
		const normalizedChange2 = this.normalizeFieldChange(
			change2,
			changeHandler,
			genId,
			revisionMetadata,
		);
		return {
			fieldKind: kind,
			changeHandler,
			change1: normalizedChange1,
			change2: normalizedChange2,
		};
	}

	private normalizeFieldChange<T>(
		fieldChange: FieldChange,
		handler: FieldChangeHandler<T>,
		genId: IdAllocator,
		revisionMetadata: RevisionMetadataSource,
	): FieldChangeset {
		if (fieldChange.fieldKind !== genericFieldKind.identifier) {
			return fieldChange.change;
		}

		// The cast is based on the `fieldKind` check above
		const genericChange = fieldChange.change as unknown as GenericChangeset;
		const convertedChange = convertGenericChange(
			genericChange,
			handler,
			(child1, child2) => {
				assert(
					child1 === undefined || child2 === undefined,
					0x92f /* Should not have two changesets to compose */,
				);

				return child1 ?? child2 ?? fail("Should not compose two undefined node IDs");
			},
			genId,
			revisionMetadata,
		) as FieldChangeset;

		return convertedChange;
	}

	public compose(changes: TaggedChange<ModularChangeset>[]): ModularChangeset {
		const { revInfos, maxId } = getRevInfoFromTaggedChanges(changes);
		const idState: IdAllocationState = { maxId };

		if (changes.length === 0) {
			return makeModularChangeset();
		}

		return changes
			.map((change) => change.change)
			.reduce((change1, change2) => this.composePair(change1, change2, revInfos, idState));
	}

	private composePair(
		change1: ModularChangeset,
		change2: ModularChangeset,
		revInfos: RevisionInfo[],
		idState: IdAllocationState,
	): ModularChangeset {
		const { fieldChanges, nodeChanges, nodeToParent, nodeAliases, crossFieldKeys } =
			this.composeAllFields(change1, change2, revInfos, idState);

		const { allBuilds, allDestroys, allRefreshers } = composeBuildsDestroysAndRefreshers(
			change1,
			change2,
		);

		return makeModularChangeset(
			fieldChanges,
			nodeChanges,
			nodeToParent,
			nodeAliases,
			crossFieldKeys,
			idState.maxId,
			revInfos,
			undefined,
			allBuilds,
			allDestroys,
			allRefreshers,
		);
	}

	private composeAllFields(
		change1: ModularChangeset,
		change2: ModularChangeset,
		revInfos: RevisionInfo[],
		idState: IdAllocationState,
	): ModularChangesetContent {
		if (hasConflicts(change1) && hasConflicts(change2)) {
			return {
				fieldChanges: new Map(),
				nodeChanges: newTupleBTree(),
				nodeToParent: newTupleBTree(),
				nodeAliases: newTupleBTree(),
				crossFieldKeys: newTupleBTree(),
			};
		} else if (hasConflicts(change1)) {
			return change2;
		} else if (hasConflicts(change2)) {
			return change1;
		}

		const genId: IdAllocator = idAllocatorFromState(idState);
		const revisionMetadata: RevisionMetadataSource = revisionMetadataSourceFromInfo(revInfos);

		const crossFieldTable = newComposeTable(change1, change2);

		// We merge nodeChanges, nodeToParent, and nodeAliases from the two changesets.
		// The merged tables will have correct entries for all nodes which are only referenced in one of the input changesets.
		// During composeFieldMaps and processInvalidatedElements we will find all nodes referenced in both input changesets
		// and adjust these tables as necessary.
		// Note that when merging these tables we may encounter key collisions and will arbitrarily drop values in that case.
		// A collision for a node ID means that that node is referenced in both changesets
		// (since we assume that if two changesets use the same node ID they are referring to the same node),
		// therefore all collisions will be addressed when processing the intersection of the changesets.
		const composedNodeChanges: ChangeAtomIdBTree<NodeChangeset> = brand(
			mergeBTrees(change1.nodeChanges, change2.nodeChanges),
		);

		const composedNodeToParent: ChangeAtomIdBTree<FieldId> = brand(
			mergeBTrees(change1.nodeToParent, change2.nodeToParent),
		);
		const composedNodeAliases: ChangeAtomIdBTree<NodeId> = brand(
			mergeBTrees(change1.nodeAliases, change2.nodeAliases),
		);

		const composedFields = this.composeFieldMaps(
			change1.fieldChanges,
			change2.fieldChanges,
			genId,
			crossFieldTable,
			revisionMetadata,
		);

		this.processInvalidatedElements(
			crossFieldTable,
			composedFields,
			composedNodeChanges,
			composedNodeToParent,
			composedNodeAliases,
			genId,
			revisionMetadata,
		);

		// Currently no field kinds require making changes to cross-field keys during composition, so we can just merge the two tables.
		const composedCrossFieldKeys = mergeBTrees(change1.crossFieldKeys, change2.crossFieldKeys);
		return {
			fieldChanges: composedFields,
			nodeChanges: composedNodeChanges,
			nodeToParent: composedNodeToParent,
			nodeAliases: composedNodeAliases,
			crossFieldKeys: brand(composedCrossFieldKeys),
		};
	}

	private composeInvalidatedField(
		fieldChange: FieldChange,
		crossFieldTable: ComposeTable,
		genId: IdAllocator,
		revisionMetadata: RevisionMetadataSource,
	): void {
		const context = crossFieldTable.fieldToContext.get(fieldChange);
		assert(context !== undefined, 0x8cc /* Should have context for every invalidated field */);
		const { change1: fieldChange1, change2: fieldChange2, composedChange } = context;

		const rebaser = getChangeHandler(this.fieldKinds, composedChange.fieldKind).rebaser;
		const composeNodes = (child1: NodeId | undefined, child2: NodeId | undefined): NodeId => {
			if (
				child1 !== undefined &&
				child2 !== undefined &&
				getFromChangeAtomIdMap(crossFieldTable.newToBaseNodeId, child2) === undefined
			) {
				setInChangeAtomIdMap(crossFieldTable.newToBaseNodeId, child2, child1);
				crossFieldTable.pendingCompositions.nodeIdsToCompose.push([child1, child2]);
			}

			return child1 ?? child2 ?? fail("Should not compose two undefined nodes");
		};

		const amendedChange = rebaser.compose(
			fieldChange1,
			fieldChange2,
			composeNodes,
			genId,
			new ComposeManager(crossFieldTable, fieldChange, false),
			revisionMetadata,
		);
		composedChange.change = brand(amendedChange);
	}

	/**
	 * Updates everything in the composed output which may no longer be valid.
	 * This could be due to
	 * - discovering that two node changesets refer to the same node (`nodeIdsToCompose`)
	 * - a previously composed field being invalidated by a cross field effect (`invalidatedFields`)
	 * - a field which was copied directly from an input changeset being invalidated by a cross field effect
	 * (`affectedBaseFields` and `affectedNewFields`)
	 *
	 * Updating an element may invalidate further elements. This function runs until there is no more invalidation.
	 */
	private processInvalidatedElements(
		table: ComposeTable,
		composedFields: FieldChangeMap,
		composedNodes: ChangeAtomIdBTree<NodeChangeset>,
		composedNodeToParent: ChangeAtomIdBTree<FieldId>,
		nodeAliases: ChangeAtomIdBTree<NodeId>,
		genId: IdAllocator,
		metadata: RevisionMetadataSource,
	): void {
		const pending = table.pendingCompositions;
		while (
			table.invalidatedFields.size > 0 ||
			pending.nodeIdsToCompose.length > 0 ||
			pending.affectedBaseFields.length > 0 ||
			pending.affectedNewFields.length > 0
		) {
			// Note that the call to `composeNodesById` can add entries to `crossFieldTable.nodeIdPairs`.
			for (const [id1, id2] of pending.nodeIdsToCompose) {
				this.composeNodesById(
					table.baseChange.nodeChanges,
					table.newChange.nodeChanges,
					composedNodes,
					composedNodeToParent,
					nodeAliases,
					id1,
					id2,
					genId,
					table,
					metadata,
				);
			}

			pending.nodeIdsToCompose.length = 0;

			this.composeAffectedFields(
				table,
				table.baseChange,
				true,
				pending.affectedBaseFields,
				composedFields,
				composedNodes,
				genId,
				metadata,
			);

			this.composeAffectedFields(
				table,
				table.newChange,
				false,
				pending.affectedNewFields,
				composedFields,
				composedNodes,
				genId,
				metadata,
			);

			this.processInvalidatedCompositions(table, genId, metadata);
		}
	}

	private processInvalidatedCompositions(
		table: ComposeTable,
		genId: IdAllocator,
		metadata: RevisionMetadataSource,
	): void {
		const fieldsToUpdate = table.invalidatedFields;
		table.invalidatedFields = new Set();
		for (const fieldChange of fieldsToUpdate) {
			this.composeInvalidatedField(fieldChange, table, genId, metadata);
		}
	}

	/**
	 * Ensures that each field in `affectedFields` has been updated in the composition output.
	 * Any field which has already been composed is ignored.
	 * All other fields are optimistically assumed to not have any changes in the other input changeset.
	 *
	 * @param change - The changeset which contains the affected fields.
	 * This should be one of the two changesets being composed.
	 * @param areBaseFields - Whether the affected fields are part of the base changeset.
	 * If not, they are assumed to be part of the new changeset.
	 * @param affectedFields - The set of fields to process.
	 */
	private composeAffectedFields(
		table: ComposeTable,
		change: ModularChangeset,
		areBaseFields: boolean,
		affectedFields: BTree<FieldIdKey, true>,
		composedFields: FieldChangeMap,
		composedNodes: ChangeAtomIdBTree<NodeChangeset>,
		genId: IdAllocator,
		metadata: RevisionMetadataSource,
	): void {
		for (const fieldIdKey of affectedFields.keys()) {
			const fieldId = normalizeFieldId(fieldIdFromFieldIdKey(fieldIdKey), change.nodeAliases);
			const fieldChange = fieldChangeFromId(change.fieldChanges, change.nodeChanges, fieldId);

			if (
				table.fieldToContext.has(fieldChange) ||
				table.newFieldToBaseField.has(fieldChange)
			) {
				// This function handles fields which were not part of the intersection of the two changesets but which need to be updated anyway.
				// If we've already processed this field then either it is up to date
				// or there is pending inval which will be handled in processInvalidatedCompositions.
				continue;
			}

			const emptyChange = this.createEmptyFieldChange(fieldChange.fieldKind);
			const [change1, change2] = areBaseFields
				? [fieldChange, emptyChange]
				: [emptyChange, fieldChange];

			const composedField = this.composeFieldChanges(change1, change2, genId, table, metadata);

			if (fieldId.nodeId === undefined) {
				composedFields.set(fieldId.field, composedField);
				continue;
			}

			const nodeId =
				getFromChangeAtomIdMap(table.newToBaseNodeId, fieldId.nodeId) ?? fieldId.nodeId;

			let nodeChangeset = nodeChangeFromId(composedNodes, nodeId);
			if (!table.composedNodes.has(nodeChangeset)) {
				nodeChangeset = cloneNodeChangeset(nodeChangeset);
				setInChangeAtomIdMap(composedNodes, nodeId, nodeChangeset);
			}

			if (nodeChangeset.fieldChanges === undefined) {
				nodeChangeset.fieldChanges = new Map();
			}

			nodeChangeset.fieldChanges.set(fieldId.field, composedField);
		}

		affectedFields.clear();
	}

	private composeFieldMaps(
		change1: FieldChangeMap | undefined,
		change2: FieldChangeMap | undefined,
		genId: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): FieldChangeMap {
		const composedFields: FieldChangeMap = new Map();
		if (change1 === undefined || change2 === undefined) {
			return change1 ?? change2 ?? composedFields;
		}

		for (const [field, fieldChange1] of change1) {
			const fieldChange2 = change2.get(field);
			const composedField =
				fieldChange2 !== undefined
					? this.composeFieldChanges(
							fieldChange1,
							fieldChange2,
							genId,
							crossFieldTable,
							revisionMetadata,
						)
					: fieldChange1;

			composedFields.set(field, composedField);
		}

		for (const [field, fieldChange2] of change2) {
			if (change1 === undefined || !change1.has(field)) {
				composedFields.set(field, fieldChange2);
			}
		}

		return composedFields;
	}

	/**
	 * Returns the composition of the two input fields.
	 *
	 * Any nodes in this field which were modified by both changesets
	 * will be added to `crossFieldTable.pendingCompositions.nodeIdsToCompose`.
	 *
	 * Any fields which had cross-field information sent to them as part of this field composition
	 * will be added to either `affectedBaseFields` or `affectedNewFields` in `crossFieldTable.pendingCompositions`.
	 *
	 * Any composed `FieldChange` which is invalidated by new cross-field information will be added to `crossFieldTable.invalidatedFields`.
	 */
	private composeFieldChanges(
		change1: FieldChange,
		change2: FieldChange,
		idAllocator: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): FieldChange {
		const {
			fieldKind,
			changeHandler,
			change1: change1Normalized,
			change2: change2Normalized,
		} = this.normalizeFieldChanges(change1, change2, idAllocator, revisionMetadata);

		const manager = new ComposeManager(crossFieldTable, change1);

		const composedChange = changeHandler.rebaser.compose(
			change1Normalized,
			change2Normalized,
			(child1, child2) => {
				if (child1 !== undefined && child2 !== undefined) {
					setInChangeAtomIdMap(crossFieldTable.newToBaseNodeId, child2, child1);
					crossFieldTable.pendingCompositions.nodeIdsToCompose.push([child1, child2]);
				}
				return child1 ?? child2 ?? fail("Should not compose two undefined nodes");
			},
			idAllocator,
			manager,
			revisionMetadata,
		);

		const composedField: FieldChange = {
			fieldKind,
			change: brand(composedChange),
		};

		crossFieldTable.fieldToContext.set(change1, {
			change1: change1Normalized,
			change2: change2Normalized,
			composedChange: composedField,
		});

		crossFieldTable.newFieldToBaseField.set(change2, change1);
		return composedField;
	}

	private composeNodesById(
		nodeChanges1: ChangeAtomIdBTree<NodeChangeset>,
		nodeChanges2: ChangeAtomIdBTree<NodeChangeset>,
		composedNodes: ChangeAtomIdBTree<NodeChangeset>,
		composedNodeToParent: ChangeAtomIdBTree<FieldId>,
		nodeAliases: ChangeAtomIdBTree<NodeId>,
		id1: NodeId,
		id2: NodeId,
		idAllocator: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): void {
		const nodeChangeset1 = nodeChangeFromId(nodeChanges1, id1);
		const nodeChangeset2 = nodeChangeFromId(nodeChanges2, id2);
		const composedNodeChangeset = this.composeNodeChanges(
			nodeChangeset1,
			nodeChangeset2,
			idAllocator,
			crossFieldTable,
			revisionMetadata,
		);

		setInChangeAtomIdMap(composedNodes, id1, composedNodeChangeset);

		if (!areEqualChangeAtomIds(id1, id2)) {
			composedNodes.delete([id2.revision, id2.localId]);
			composedNodeToParent.delete([id2.revision, id2.localId]);
			setInChangeAtomIdMap(nodeAliases, id2, id1);

			// We need to delete id1 to avoid forming a cycle in case id1 already had an alias.
			nodeAliases.delete([id1.revision, id1.localId]);
		}

		crossFieldTable.composedNodes.add(composedNodeChangeset);
	}

	private composeNodeChanges(
		change1: NodeChangeset,
		change2: NodeChangeset,
		genId: IdAllocator,
		crossFieldTable: ComposeTable,
		revisionMetadata: RevisionMetadataSource,
	): NodeChangeset {
		const nodeExistsConstraint = change1.nodeExistsConstraint ?? change2.nodeExistsConstraint;

		const composedFieldChanges = this.composeFieldMaps(
			change1.fieldChanges,
			change2.fieldChanges,
			genId,
			crossFieldTable,
			revisionMetadata,
		);

		const composedNodeChange: NodeChangeset = {};

		if (composedFieldChanges.size > 0) {
			composedNodeChange.fieldChanges = composedFieldChanges;
		}

		if (nodeExistsConstraint !== undefined) {
			composedNodeChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return composedNodeChange;
	}

	/**
	 * @param change - The change to invert.
	 * @param isRollback - Whether the inverted change is meant to rollback a change on a branch as is the case when
	 * performing a sandwich rebase.
	 */
	public invert(
		change: TaggedChange<ModularChangeset>,
		isRollback: boolean,
	): ModularChangeset {
		// Rollback changesets destroy the nodes created by the change being rolled back.
		const destroys = isRollback ? invertBuilds(change.change.builds) : undefined;

		// Destroys only occur in rollback changesets, which are never inverted.
		assert(
			change.change.destroys === undefined,
			0x89a /* Unexpected destroys in change to invert */,
		);

		if ((change.change.constraintViolationCount ?? 0) > 0) {
			return makeModularChangeset(
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				change.change.maxId,
				[],
				undefined,
				undefined,
				destroys,
			);
		}

		const genId: IdAllocator = idAllocatorFromMaxId(change.change.maxId ?? -1);

		const crossFieldTable: InvertTable = {
			...newCrossFieldTable<FieldChange>(),
			originalFieldToContext: new Map(),
			invertedNodeToParent: brand(change.change.nodeToParent.clone()),
		};

		const { revInfos } = getRevInfoFromTaggedChanges([change]);
		const revisionMetadata = revisionMetadataSourceFromInfo(revInfos);

		const invertedFields = this.invertFieldMap(
			change.change.fieldChanges,
			undefined,
			isRollback,
			genId,
			crossFieldTable,
			revisionMetadata,
		);

		const invertedNodes: ChangeAtomIdBTree<NodeChangeset> = newTupleBTree();
		change.change.nodeChanges.forEachPair(([revision, localId], nodeChangeset) => {
			invertedNodes.set(
				[revision, localId],
				this.invertNodeChange(
					nodeChangeset,
					{ revision, localId },
					isRollback,
					genId,
					crossFieldTable,
					revisionMetadata,
				),
			);
		});

		if (crossFieldTable.invalidatedFields.size > 0) {
			const fieldsToUpdate = crossFieldTable.invalidatedFields;
			crossFieldTable.invalidatedFields = new Set();
			for (const fieldChange of fieldsToUpdate) {
				const originalFieldChange = fieldChange.change;
				const context = crossFieldTable.originalFieldToContext.get(fieldChange);
				assert(
					context !== undefined,
					0x851 /* Should have context for every invalidated field */,
				);
				const { invertedField, fieldId } = context;

				const amendedChange = getChangeHandler(
					this.fieldKinds,
					fieldChange.fieldKind,
				).rebaser.invert(
					originalFieldChange,
					isRollback,
					genId,
					new InvertManager(crossFieldTable, fieldChange, fieldId),
					revisionMetadata,
				);
				invertedField.change = brand(amendedChange);
			}
		}

		const crossFieldKeys = this.makeCrossFieldKeyTable(invertedFields, invertedNodes);

		return makeModularChangeset(
			invertedFields,
			invertedNodes,
			crossFieldTable.invertedNodeToParent,
			change.change.nodeAliases,
			crossFieldKeys,
			genId.getMaxId(),
			[],
			change.change.constraintViolationCount,
			undefined,
			destroys,
		);
	}

	private invertFieldMap(
		changes: FieldChangeMap,
		parentId: NodeId | undefined,
		isRollback: boolean,
		genId: IdAllocator,
		crossFieldTable: InvertTable,
		revisionMetadata: RevisionMetadataSource,
	): FieldChangeMap {
		const invertedFields: FieldChangeMap = new Map();

		for (const [field, fieldChange] of changes) {
			const fieldId = { nodeId: parentId, field };
			const manager = new InvertManager(crossFieldTable, fieldChange, fieldId);
			const invertedChange = getChangeHandler(
				this.fieldKinds,
				fieldChange.fieldKind,
			).rebaser.invert(fieldChange.change, isRollback, genId, manager, revisionMetadata);

			const invertedFieldChange: FieldChange = {
				...fieldChange,
				change: brand(invertedChange),
			};
			invertedFields.set(field, invertedFieldChange);

			crossFieldTable.originalFieldToContext.set(fieldChange, {
				fieldId,
				invertedField: invertedFieldChange,
			});
		}

		return invertedFields;
	}

	private invertNodeChange(
		change: NodeChangeset,
		id: NodeId,
		isRollback: boolean,
		genId: IdAllocator,
		crossFieldTable: InvertTable,
		revisionMetadata: RevisionMetadataSource,
	): NodeChangeset {
		const inverse: NodeChangeset = {};

		if (change.fieldChanges !== undefined) {
			inverse.fieldChanges = this.invertFieldMap(
				change.fieldChanges,
				id,
				isRollback,
				genId,
				crossFieldTable,
				revisionMetadata,
			);
		}

		return inverse;
	}

	public rebase(
		taggedChange: TaggedChange<ModularChangeset>,
		over: TaggedChange<ModularChangeset>,
		revisionMetadata: RevisionMetadataSource,
	): ModularChangeset {
		const change = taggedChange.change;
		const maxId = Math.max(change.maxId ?? -1, over.change.maxId ?? -1);
		const idState: IdAllocationState = { maxId };
		const genId: IdAllocator = idAllocatorFromState(idState);

		const crossFieldTable: RebaseTable = {
			...newCrossFieldTable<FieldChange>(),
			newChange: change,
			baseChange: over.change,
			baseFieldToContext: new Map(),
			baseToRebasedNodeId: newTupleBTree(),
			rebasedFields: new Set(),
			rebasedNodeToParent: brand(change.nodeToParent.clone()),
			rebasedCrossFieldKeys: brand(change.crossFieldKeys.clone()),
			nodeIdPairs: [],
			affectedBaseFields: newTupleBTree(),
		};

		let constraintState = newConstraintState(change.constraintViolationCount ?? 0);

		const getBaseRevisions = (): RevisionTag[] =>
			revisionInfoFromTaggedChange(over).map((info) => info.revision);

		const rebaseMetadata: RebaseRevisionMetadata = {
			...revisionMetadata,
			getRevisionToRebase: () => taggedChange.revision,
			getBaseRevisions,
		};

		const rebasedNodes: ChangeAtomIdBTree<NodeChangeset> = brand(change.nodeChanges.clone());

		const rebasedFields = this.rebaseIntersectingFields(
			crossFieldTable,
			rebasedNodes,
			genId,
			constraintState,
			rebaseMetadata,
		);

		this.rebaseFieldsWithoutNewChanges(
			rebasedFields,
			rebasedNodes,
			crossFieldTable,
			genId,
			rebaseMetadata,
		);

		if (crossFieldTable.invalidatedFields.size > 0) {
			const fieldsToUpdate = crossFieldTable.invalidatedFields;
			crossFieldTable.invalidatedFields = new Set();
			constraintState = newConstraintState(change.constraintViolationCount ?? 0);
			for (const field of fieldsToUpdate) {
				const context = crossFieldTable.baseFieldToContext.get(field);
				assert(context !== undefined, 0x852 /* Every field should have a context */);
				const {
					changeHandler,
					change1: fieldChangeset,
					change2: baseChangeset,
				} = this.normalizeFieldChanges(
					context.newChange,
					context.baseChange,
					genId,
					revisionMetadata,
				);

				const rebaseChild = (
					curr: NodeId | undefined,
					base: NodeId | undefined,
				): NodeId | undefined => {
					if (curr !== undefined) {
						return curr;
					}

					if (base !== undefined) {
						for (const id of context.baseNodeIds) {
							if (areEqualChangeAtomIds(base, id)) {
								return base;
							}
						}
					}

					return undefined;
				};

				context.rebasedChange.change = brand(
					changeHandler.rebaser.rebase(
						fieldChangeset,
						baseChangeset,
						rebaseChild,
						genId,
						new RebaseManager(crossFieldTable, field, context.fieldId),
						rebaseMetadata,
					),
				);
			}
		}

		this.updateConstraintsForFields(
			rebasedFields,
			NodeAttachState.Attached,
			constraintState,
			rebasedNodes,
		);

		return makeModularChangeset(
			this.pruneFieldMap(rebasedFields, rebasedNodes),
			rebasedNodes,
			crossFieldTable.rebasedNodeToParent,
			change.nodeAliases,
			crossFieldTable.rebasedCrossFieldKeys,
			idState.maxId,
			change.revisions,
			constraintState.violationCount,
			change.builds,
			change.destroys,
			change.refreshers,
		);
	}

	// This performs a first pass on all fields which have both new and base changes.
	// TODO: Can we also handle additional passes in this method?
	private rebaseIntersectingFields(
		crossFieldTable: RebaseTable,
		rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
		genId: IdAllocator,
		constraintState: ConstraintState,
		metadata: RebaseRevisionMetadata,
	): FieldChangeMap {
		const change = crossFieldTable.newChange;
		const baseChange = crossFieldTable.baseChange;
		const rebasedFields = this.rebaseFieldMap(
			change.fieldChanges,
			baseChange.fieldChanges,
			undefined,
			genId,
			crossFieldTable,
			metadata,
		);

		// This loop processes all fields which have both base and new changes.
		// Note that the call to `rebaseNodeChange` can add entries to `crossFieldTable.nodeIdPairs`.
		for (const [newId, baseId, _attachState] of crossFieldTable.nodeIdPairs) {
			const rebasedNode = this.rebaseNodeChange(
				newId,
				baseId,
				genId,
				crossFieldTable,
				metadata,
				constraintState,
			);

			setInChangeAtomIdMap(rebasedNodes, newId, rebasedNode);
		}

		return rebasedFields;
	}

	// This processes fields which have no new changes but have been invalidated by another field.
	private rebaseFieldsWithoutNewChanges(
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
		crossFieldTable: RebaseTable,
		genId: IdAllocator,
		metadata: RebaseRevisionMetadata,
	): void {
		const baseChange = crossFieldTable.baseChange;
		for (const [revision, localId, fieldKey] of crossFieldTable.affectedBaseFields.keys()) {
			const baseNodeId =
				localId !== undefined
					? normalizeNodeId({ revision, localId }, baseChange.nodeAliases)
					: undefined;

			const baseFieldChange = fieldMapFromNodeId(
				baseChange.fieldChanges,
				baseChange.nodeChanges,
				baseNodeId,
			).get(fieldKey);

			assert(
				baseFieldChange !== undefined,
				0x9c2 /* Cross field key registered for empty field */,
			);
			if (crossFieldTable.baseFieldToContext.has(baseFieldChange)) {
				// This field has already been processed because there were changes to rebase.
				continue;
			}

			// This field has no changes in the new changeset, otherwise it would have been added to
			// `crossFieldTable.baseFieldToContext` when processing fields with both base and new changes.
			const rebaseChild = (
				child: NodeId | undefined,
				baseChild: NodeId | undefined,
				stateChange: NodeAttachState | undefined,
			): NodeId | undefined => {
				assert(child === undefined, 0x9c3 /* There should be no new changes in this field */);
				return undefined;
			};

			const handler = getChangeHandler(this.fieldKinds, baseFieldChange.fieldKind);
			const fieldChange: FieldChange = {
				...baseFieldChange,
				change: brand(handler.createEmpty()),
			};

			const rebasedNodeId =
				baseNodeId !== undefined
					? rebasedNodeIdFromBaseNodeId(crossFieldTable, baseNodeId)
					: undefined;

			const fieldId: FieldId = { nodeId: rebasedNodeId, field: fieldKey };
			const rebasedField: unknown = handler.rebaser.rebase(
				fieldChange.change,
				baseFieldChange.change,
				rebaseChild,
				genId,
				new RebaseManager(crossFieldTable, baseFieldChange, fieldId),
				metadata,
			);

			const rebasedFieldChange: FieldChange = {
				...baseFieldChange,
				change: brand(rebasedField),
			};

			// TODO: Deduplicate
			crossFieldTable.baseFieldToContext.set(baseFieldChange, {
				newChange: fieldChange,
				baseChange: baseFieldChange,
				rebasedChange: rebasedFieldChange,
				fieldId,
				baseNodeIds: [],
			});
			crossFieldTable.rebasedFields.add(rebasedFieldChange);

			this.attachRebasedField(
				rebasedFields,
				rebasedNodes,
				crossFieldTable,
				rebasedFieldChange,
				fieldId,
				genId,
				metadata,
			);
		}
	}

	private attachRebasedField(
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
		table: RebaseTable,
		rebasedField: FieldChange,
		{ nodeId, field: fieldKey }: FieldId,
		idAllocator: IdAllocator,
		metadata: RebaseRevisionMetadata,
	): void {
		if (nodeId === undefined) {
			rebasedFields.set(fieldKey, rebasedField);
			return;
		}
		const rebasedNode = getFromChangeAtomIdMap(rebasedNodes, nodeId);
		if (rebasedNode !== undefined) {
			if (rebasedNode.fieldChanges === undefined) {
				rebasedNode.fieldChanges = new Map([[fieldKey, rebasedField]]);
				return;
			}

			assert(!rebasedNode.fieldChanges.has(fieldKey), 0x9c4 /* Expected an empty field */);
			rebasedNode.fieldChanges.set(fieldKey, rebasedField);
			return;
		}

		const newNode: NodeChangeset = {
			fieldChanges: new Map([[fieldKey, rebasedField]]),
		};

		setInChangeAtomIdMap(rebasedNodes, nodeId, newNode);
		setInChangeAtomIdMap(table.baseToRebasedNodeId, nodeId, nodeId);

		const parentFieldId = getParentFieldId(table.baseChange, nodeId);

		this.attachRebasedNode(
			rebasedFields,
			rebasedNodes,
			table,
			nodeId,
			parentFieldId,
			idAllocator,
			metadata,
		);
	}

	private attachRebasedNode(
		rebasedFields: FieldChangeMap,
		rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
		table: RebaseTable,
		baseNodeId: NodeId,
		parentFieldIdBase: FieldId,
		idAllocator: IdAllocator,
		metadata: RebaseRevisionMetadata,
	): void {
		const baseFieldChange = fieldChangeFromId(
			table.baseChange.fieldChanges,
			table.baseChange.nodeChanges,
			parentFieldIdBase,
		);

		const rebasedFieldId = rebasedFieldIdFromBaseId(table, parentFieldIdBase);
		setInChangeAtomIdMap(table.rebasedNodeToParent, baseNodeId, rebasedFieldId);

		const context = table.baseFieldToContext.get(baseFieldChange);
		if (context !== undefined) {
			// We've already processed this field.
			// The new child node can be attached when processing invalidated fields.
			context.baseNodeIds.push(baseNodeId);
			table.invalidatedFields.add(baseFieldChange);
			return;
		}

		const handler = getChangeHandler(this.fieldKinds, baseFieldChange.fieldKind);

		const fieldChange: FieldChange = {
			...baseFieldChange,
			change: brand(handler.createEmpty()),
		};

		const rebasedChangeset = handler.rebaser.rebase(
			handler.createEmpty(),
			baseFieldChange.change,
			(_idNew, idBase) =>
				idBase !== undefined && areEqualChangeAtomIds(idBase, baseNodeId)
					? baseNodeId
					: undefined,
			idAllocator,
			new RebaseManager(table, baseFieldChange, rebasedFieldId),
			metadata,
		);

		const rebasedField: FieldChange = { ...baseFieldChange, change: brand(rebasedChangeset) };
		table.rebasedFields.add(rebasedField);
		table.baseFieldToContext.set(baseFieldChange, {
			newChange: fieldChange,
			baseChange: baseFieldChange,
			rebasedChange: rebasedField,
			fieldId: rebasedFieldId,
			baseNodeIds: [],
		});

		this.attachRebasedField(
			rebasedFields,
			rebasedNodes,
			table,
			rebasedField,
			rebasedFieldId,
			idAllocator,
			metadata,
		);
	}

	private rebaseFieldMap(
		change: FieldChangeMap,
		over: FieldChangeMap,
		parentId: NodeId | undefined,
		genId: IdAllocator,
		crossFieldTable: RebaseTable,
		revisionMetadata: RebaseRevisionMetadata,
	): FieldChangeMap {
		const rebasedFields: FieldChangeMap = new Map();
		const rebaseChild = (
			child: NodeId | undefined,
			baseChild: NodeId | undefined,
			stateChange: NodeAttachState | undefined,
		): NodeId | undefined => {
			if (child !== undefined && baseChild !== undefined) {
				crossFieldTable.nodeIdPairs.push([child, baseChild, stateChange]);
			}
			return child;
		};

		for (const [field, fieldChange] of change) {
			const fieldId: FieldId = { nodeId: parentId, field };
			const baseChange = over.get(field);
			if (baseChange === undefined) {
				rebasedFields.set(field, fieldChange);
				continue;
			}

			const {
				fieldKind,
				changeHandler,
				change1: fieldChangeset,
				change2: baseChangeset,
			} = this.normalizeFieldChanges(fieldChange, baseChange, genId, revisionMetadata);

			const manager = new RebaseManager(crossFieldTable, baseChange, fieldId);

			const rebasedField = changeHandler.rebaser.rebase(
				fieldChangeset,
				baseChangeset,
				rebaseChild,
				genId,
				manager,
				revisionMetadata,
			);

			const rebasedFieldChange: FieldChange = {
				fieldKind,
				change: brand(rebasedField),
			};

			rebasedFields.set(field, rebasedFieldChange);

			crossFieldTable.baseFieldToContext.set(baseChange, {
				baseChange,
				newChange: fieldChange,
				rebasedChange: rebasedFieldChange,
				fieldId,
				baseNodeIds: [],
			});

			crossFieldTable.rebasedFields.add(rebasedFieldChange);
		}

		return rebasedFields;
	}

	private rebaseNodeChange(
		newId: NodeId,
		baseId: NodeId,
		genId: IdAllocator,
		crossFieldTable: RebaseTable,
		revisionMetadata: RebaseRevisionMetadata,
		constraintState: ConstraintState,
	): NodeChangeset {
		const change = nodeChangeFromId(crossFieldTable.newChange.nodeChanges, newId);
		const over = nodeChangeFromId(crossFieldTable.baseChange.nodeChanges, baseId);

		const baseMap: FieldChangeMap = over?.fieldChanges ?? new Map();

		const fieldChanges =
			change.fieldChanges !== undefined && over.fieldChanges !== undefined
				? this.rebaseFieldMap(
						change?.fieldChanges ?? new Map(),
						baseMap,
						newId,
						genId,
						crossFieldTable,
						revisionMetadata,
					)
				: change.fieldChanges;

		const rebasedChange: NodeChangeset = {};

		if (fieldChanges !== undefined && fieldChanges.size > 0) {
			rebasedChange.fieldChanges = fieldChanges;
		}

		if (change?.nodeExistsConstraint !== undefined) {
			rebasedChange.nodeExistsConstraint = change.nodeExistsConstraint;
		}

		setInChangeAtomIdMap(crossFieldTable.baseToRebasedNodeId, baseId, newId);
		return rebasedChange;
	}

	private updateConstraintsForFields(
		fields: FieldChangeMap,
		parentAttachState: NodeAttachState,
		constraintState: ConstraintState,
		nodes: ChangeAtomIdBTree<NodeChangeset>,
	): void {
		for (const field of fields.values()) {
			const handler = getChangeHandler(this.fieldKinds, field.fieldKind);
			for (const [nodeId, index] of handler.getNestedChanges(field.change)) {
				const isDetached = index === undefined;
				const attachState =
					parentAttachState === NodeAttachState.Detached || isDetached
						? NodeAttachState.Detached
						: NodeAttachState.Attached;
				this.updateConstraintsForNode(nodeId, attachState, constraintState, nodes);
			}
		}
	}

	private updateConstraintsForNode(
		nodeId: NodeId,
		attachState: NodeAttachState,
		constraintState: ConstraintState,
		nodes: ChangeAtomIdBTree<NodeChangeset>,
	): void {
		const node = nodes.get([nodeId.revision, nodeId.localId]) ?? fail("Unknown node ID");
		if (node.nodeExistsConstraint !== undefined) {
			const isNowViolated = attachState === NodeAttachState.Detached;
			if (node.nodeExistsConstraint.violated !== isNowViolated) {
				node.nodeExistsConstraint = {
					...node.nodeExistsConstraint,
					violated: isNowViolated,
				};
				constraintState.violationCount += isNowViolated ? 1 : -1;
			}
		}

		if (node.fieldChanges !== undefined) {
			this.updateConstraintsForFields(node.fieldChanges, attachState, constraintState, nodes);
		}
	}

	private pruneFieldMap(
		changeset: FieldChangeMap | undefined,
		nodeMap: ChangeAtomIdBTree<NodeChangeset>,
	): FieldChangeMap | undefined {
		if (changeset === undefined) {
			return undefined;
		}

		const prunedChangeset: FieldChangeMap = new Map();
		for (const [field, fieldChange] of changeset) {
			const handler = getChangeHandler(this.fieldKinds, fieldChange.fieldKind);

			const prunedFieldChangeset = handler.rebaser.prune(fieldChange.change, (nodeId) =>
				this.pruneNodeChange(nodeId, nodeMap),
			);

			if (!handler.isEmpty(prunedFieldChangeset)) {
				prunedChangeset.set(field, { ...fieldChange, change: brand(prunedFieldChangeset) });
			}
		}

		return prunedChangeset.size > 0 ? prunedChangeset : undefined;
	}

	private pruneNodeChange(
		nodeId: NodeId,
		nodeMap: ChangeAtomIdBTree<NodeChangeset>,
	): NodeId | undefined {
		const changeset = nodeChangeFromId(nodeMap, nodeId);
		const prunedFields =
			changeset.fieldChanges !== undefined
				? this.pruneFieldMap(changeset.fieldChanges, nodeMap)
				: undefined;

		const prunedChange = { ...changeset, fieldChanges: prunedFields };
		if (prunedChange.fieldChanges === undefined) {
			delete prunedChange.fieldChanges;
		}

		if (isEmptyNodeChangeset(prunedChange)) {
			nodeMap.delete([nodeId.revision, nodeId.localId]);
			return undefined;
		} else {
			setInChangeAtomIdMap(nodeMap, nodeId, prunedChange);
			return nodeId;
		}
	}

	public changeRevision(
		change: ModularChangeset,
		newRevision: RevisionTag | undefined,
		rollbackOf?: RevisionTag,
	): ModularChangeset {
		const oldRevisions = new Set(
			change.revisions === undefined
				? [undefined]
				: change.revisions.map((revInfo) => revInfo.revision),
		);
		const updatedFields = this.replaceFieldMapRevisions(
			change.fieldChanges,
			oldRevisions,
			newRevision,
		);

		const updatedNodes: ChangeAtomIdBTree<NodeChangeset> = newTupleBTree();
		for (const [[revision, id], nodeChangeset] of change.nodeChanges.entries()) {
			updatedNodes.set(
				[replaceRevision(revision, oldRevisions, newRevision), id],
				this.replaceNodeChangesetRevisions(nodeChangeset, oldRevisions, newRevision),
			);
		}

		const updatedNodeToParent: ChangeAtomIdBTree<FieldId> = newTupleBTree();
		for (const [[revision, id], fieldId] of change.nodeToParent.entries()) {
			updatedNodeToParent.set(
				[replaceRevision(revision, oldRevisions, newRevision), id],
				replaceFieldIdRevision(
					normalizeFieldId(fieldId, change.nodeAliases),
					oldRevisions,
					newRevision,
				),
			);
		}

		const updated: Mutable<ModularChangeset> = {
			...change,
			fieldChanges: updatedFields,
			nodeChanges: updatedNodes,
			nodeToParent: updatedNodeToParent,

			// We've updated all references to old node IDs, so we no longer need an alias table.
			nodeAliases: newTupleBTree(),
			crossFieldKeys: replaceCrossFieldKeyTableRevisions(
				change.crossFieldKeys,
				oldRevisions,
				newRevision,
				change.nodeAliases,
			),
		};

		if (change.builds !== undefined) {
			updated.builds = replaceIdMapRevisions(change.builds, oldRevisions, newRevision);
		}

		if (change.destroys !== undefined) {
			updated.destroys = replaceIdMapRevisions(change.destroys, oldRevisions, newRevision);
		}

		if (change.refreshers !== undefined) {
			updated.refreshers = replaceIdMapRevisions(change.refreshers, oldRevisions, newRevision);
		}

		if (newRevision !== undefined) {
			const revInfo: Mutable<RevisionInfo> = { revision: newRevision };
			if (rollbackOf !== undefined) {
				revInfo.rollbackOf = rollbackOf;
			}

			updated.revisions = [revInfo];
		} else {
			delete updated.revisions;
		}

		return updated;
	}

	private replaceNodeChangesetRevisions(
		nodeChangeset: NodeChangeset,
		oldRevisions: Set<RevisionTag | undefined>,
		newRevision: RevisionTag | undefined,
	): NodeChangeset {
		const updated = { ...nodeChangeset };
		if (nodeChangeset.fieldChanges !== undefined) {
			updated.fieldChanges = this.replaceFieldMapRevisions(
				nodeChangeset.fieldChanges,
				oldRevisions,
				newRevision,
			);
		}

		return updated;
	}

	private replaceFieldMapRevisions(
		fields: FieldChangeMap,
		oldRevisions: Set<RevisionTag | undefined>,
		newRevision: RevisionTag | undefined,
	): FieldChangeMap {
		const updatedFields: FieldChangeMap = new Map();
		for (const [field, fieldChange] of fields) {
			const updatedFieldChange = getChangeHandler(
				this.fieldKinds,
				fieldChange.fieldKind,
			).rebaser.replaceRevisions(fieldChange.change, oldRevisions, newRevision);

			updatedFields.set(field, { ...fieldChange, change: brand(updatedFieldChange) });
		}

		return updatedFields;
	}

	private makeCrossFieldKeyTable(
		fields: FieldChangeMap,
		nodes: ChangeAtomIdBTree<NodeChangeset>,
	): CrossFieldKeyTable {
		const keys: CrossFieldKeyTable = newCrossFieldKeyTable();
		this.populateCrossFieldKeyTableForFieldMap(keys, fields, undefined);
		nodes.forEachPair(([revision, localId], node) => {
			if (node.fieldChanges !== undefined) {
				this.populateCrossFieldKeyTableForFieldMap(keys, node.fieldChanges, {
					revision,
					localId,
				});
			}
		});

		return keys;
	}

	private populateCrossFieldKeyTableForFieldMap(
		table: CrossFieldKeyTable,
		fields: FieldChangeMap,
		parent: NodeId | undefined,
	): void {
		for (const [fieldKey, fieldChange] of fields) {
			const keys = getChangeHandler(this.fieldKinds, fieldChange.fieldKind).getCrossFieldKeys(
				fieldChange.change,
			);
			for (const key of keys) {
				table.set(key, { nodeId: parent, field: fieldKey });
			}
		}
	}

	public buildEditor(changeReceiver: (change: ModularChangeset) => void): ModularEditBuilder {
		return new ModularEditBuilder(this, this.fieldKinds, changeReceiver);
	}

	private createEmptyFieldChange(fieldKind: FieldKindIdentifier): FieldChange {
		const emptyChange = getChangeHandler(this.fieldKinds, fieldKind).createEmpty();
		return { fieldKind, change: brand(emptyChange) };
	}
}

function replaceCrossFieldKeyTableRevisions(
	table: CrossFieldKeyTable,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): CrossFieldKeyTable {
	const updated: CrossFieldKeyTable = newTupleBTree();
	table.forEachPair(([target, revision, id, count], field) => {
		const updatedKey: CrossFieldKeyRange = [
			target,
			replaceRevision(revision, oldRevisions, newRevision),
			id,
			count,
		];

		const normalizedFieldId = normalizeFieldId(field, nodeAliases);
		const updatedNodeId =
			normalizedFieldId.nodeId !== undefined
				? replaceAtomRevisions(normalizedFieldId.nodeId, oldRevisions, newRevision)
				: undefined;

		const updatedValue: FieldId = {
			...normalizedFieldId,
			nodeId: updatedNodeId,
		};

		updated.set(updatedKey, updatedValue);
	});

	return updated;
}

function replaceRevision(
	revision: RevisionTag | undefined,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): RevisionTag | undefined {
	return oldRevisions.has(revision) ? newRevision : revision;
}

function replaceIdMapRevisions<T>(
	map: ChangeAtomIdBTree<T>,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): ChangeAtomIdBTree<T> {
	const updated: ChangeAtomIdBTree<T> = newTupleBTree();
	for (const [[revision, id], value] of map.entries()) {
		updated.set([replaceRevision(revision, oldRevisions, newRevision), id], value);
	}

	return updated;
}

interface BuildsDestroysAndRefreshers {
	readonly allBuilds: ChangeAtomIdBTree<TreeChunk>;
	readonly allDestroys: ChangeAtomIdBTree<number>;
	readonly allRefreshers: ChangeAtomIdBTree<TreeChunk>;
}

function composeBuildsDestroysAndRefreshers(
	change1: ModularChangeset,
	change2: ModularChangeset,
): BuildsDestroysAndRefreshers {
	// Duplicate builds can happen in compositions of commits that needed to include detached tree refreshers (e.g., undos):
	// In that case, it's possible for the refreshers to contain different trees because the latter
	// refresher may already reflect the changes made by the commit that includes the earlier
	// refresher. This composition includes the changes made by the commit that includes the
	// earlier refresher, so we need to include the build for the earlier refresher, otherwise
	// the produced changeset will build a tree one which those changes have already been applied
	// and also try to apply the changes again, effectively applying them twice.
	// Note that it would in principle be possible to adopt the later build and exclude from the
	// composition all the changes already reflected on the tree, but that is not something we
	// care to support at this time.
	const allBuilds: ChangeAtomIdBTree<TreeChunk> = brand(
		mergeBTrees(change1.builds ?? newTupleBTree(), change2.builds ?? newTupleBTree(), true),
	);

	const allDestroys: ChangeAtomIdBTree<number> = brand(
		mergeBTrees(change1.destroys ?? newTupleBTree(), change2.destroys ?? newTupleBTree()),
	);

	const allRefreshers: ChangeAtomIdBTree<TreeChunk> = brand(
		mergeBTrees(
			change1.refreshers ?? newTupleBTree(),
			change2.refreshers ?? newTupleBTree(),
			true,
		),
	);

	if (change1.destroys !== undefined && change2.builds !== undefined) {
		for (const [key, chunk] of change2.builds.entries()) {
			const destroyCount = change1.destroys.get(key);
			if (destroyCount !== undefined) {
				assert(
					destroyCount === chunk.topLevelLength,
					0x89b /* Expected build and destroy to have the same length */,
				);

				allBuilds.delete(key);
				allDestroys.delete(key);
			}
		}
	}

	if (change1.builds !== undefined && change2.destroys !== undefined) {
		for (const [key, chunk] of change1.builds.entries()) {
			const destroyCount = change2.destroys.get(key);
			if (destroyCount !== undefined) {
				assert(
					destroyCount === chunk.topLevelLength,
					0x89b /* Expected build and destroy to have the same length */,
				);

				allBuilds.delete(key);
				allDestroys.delete(key);
			}
		}
	}

	return { allBuilds, allDestroys, allRefreshers };
}

function invertBuilds(
	builds: ChangeAtomIdBTree<TreeChunk> | undefined,
): ChangeAtomIdBTree<number> | undefined {
	if (builds !== undefined) {
		return brand(builds.mapValues((chunk) => chunk.topLevelLength));
	}
	return undefined;
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
 * @param fieldKinds - The field kinds to delegate to.
 */
export function* relevantRemovedRoots(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): Iterable<DeltaDetachedNodeId> {
	yield* relevantRemovedRootsFromFields(change.fieldChanges, change.nodeChanges, fieldKinds);
}

function* relevantRemovedRootsFromFields(
	change: FieldChangeMap,
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): Iterable<DeltaDetachedNodeId> {
	for (const [_, fieldChange] of change) {
		const handler = getChangeHandler(fieldKinds, fieldChange.fieldKind);
		const delegate = function* (node: NodeId): Iterable<DeltaDetachedNodeId> {
			const nodeChangeset = nodeChangeFromId(nodeChanges, node);
			if (nodeChangeset.fieldChanges !== undefined) {
				yield* relevantRemovedRootsFromFields(
					nodeChangeset.fieldChanges,
					nodeChanges,
					fieldKinds,
				);
			}
		};
		yield* handler.relevantRemovedRoots(fieldChange.change, delegate);
	}
}

/**
 * Adds any refreshers missing from the provided change that are relevant to the change and
 * removes any refreshers from the provided change that are not relevant to the change.
 *
 * @param change - The change that possibly has missing or superfluous refreshers. Not mutated by this function.
 * @param getDetachedNode - The function to retrieve a tree chunk from the corresponding detached node id.
 * @param removedRoots - The set of removed roots that should be in memory for the given change to be applied.
 * Can be retrieved by calling {@link relevantRemovedRoots}.
 * @param requireRefreshers - when true, this function enforces that all relevant removed roots have a
 * corresponding build or refresher.
 */
export function updateRefreshers(
	change: ModularChangeset,
	getDetachedNode: (id: DeltaDetachedNodeId) => TreeChunk | undefined,
	removedRoots: Iterable<DeltaDetachedNodeId>,
	requireRefreshers: boolean = true,
): ModularChangeset {
	const refreshers: ChangeAtomIdBTree<TreeChunk> = newTupleBTree();
	const chunkLengths: Map<RevisionTag | undefined, BTree<number, number>> = new Map();

	if (change.builds !== undefined) {
		for (const [[revision, id], chunk] of change.builds.entries()) {
			const lengthTree = getOrAddInMap(chunkLengths, revision, new BTree());
			lengthTree.set(id, chunk.topLevelLength);
		}
	}

	for (const root of removedRoots) {
		if (change.builds !== undefined) {
			const lengthTree = chunkLengths.get(root.major);

			if (lengthTree !== undefined) {
				const lengthPair = lengthTree.getPairOrNextLower(root.minor);
				if (lengthPair !== undefined) {
					const [firstMinor, length] = lengthPair;

					// if the root minor is within the length of the minor of the retrieved pair
					// then there's no need to check for the detached node
					if (root.minor < firstMinor + length) {
						continue;
					}
				}
			}
		}

		const node = getDetachedNode(root);
		if (node === undefined) {
			assert(!requireRefreshers, 0x8cd /* detached node should exist */);
		} else {
			refreshers.set([root.major, brand(root.minor)], node);
		}
	}

	const {
		fieldChanges,
		nodeChanges,
		maxId,
		revisions,
		constraintViolationCount,
		builds,
		destroys,
	} = change;

	return makeModularChangeset(
		fieldChanges,
		nodeChanges,
		change.nodeToParent,
		change.nodeAliases,
		change.crossFieldKeys,
		maxId,
		revisions,
		constraintViolationCount,
		builds,
		destroys,
		refreshers,
	);
}

/**
 * @param change - The change to convert into a delta.
 * @param fieldKinds - The field kinds to delegate to.
 */
export function intoDelta(
	taggedChange: TaggedChange<ModularChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): DeltaRoot {
	const change = taggedChange.change;
	const idAllocator = MemoizedIdRangeAllocator.fromNextId();
	const rootDelta: Mutable<DeltaRoot> = {};

	if ((change.constraintViolationCount ?? 0) === 0) {
		// If there are no constraint violations, then tree changes apply.
		const fieldDeltas = intoDeltaImpl(
			change.fieldChanges,
			change.nodeChanges,
			idAllocator,
			fieldKinds,
		);
		if (fieldDeltas.size > 0) {
			rootDelta.fields = fieldDeltas;
		}
	}

	// Constraint violations should not prevent nodes from being built
	if (change.builds && change.builds.size > 0) {
		rootDelta.build = copyDetachedNodes(change.builds);
	}
	if (change.destroys !== undefined && change.destroys.size > 0) {
		const destroys: DeltaDetachedNodeDestruction[] = [];
		for (const [[major, minor], count] of change.destroys.entries()) {
			destroys.push({
				id: makeDetachedNodeId(major, minor),
				count,
			});
		}
		rootDelta.destroy = destroys;
	}
	if (change.refreshers && change.refreshers.size > 0) {
		rootDelta.refreshers = copyDetachedNodes(change.refreshers);
	}
	return rootDelta;
}

function copyDetachedNodes(
	detachedNodes: ChangeAtomIdBTree<TreeChunk>,
): DeltaDetachedNodeBuild[] | undefined {
	const copiedDetachedNodes: DeltaDetachedNodeBuild[] = [];
	for (const [[major, minor], chunk] of detachedNodes.entries()) {
		if (chunk.topLevelLength > 0) {
			const trees = mapCursorField(chunk.cursor(), (c) =>
				cursorForMapTreeNode(mapTreeFromCursor(c)),
			);
			copiedDetachedNodes.push({
				id: makeDetachedNodeId(major, minor),
				trees,
			});
		}
	}
	return copiedDetachedNodes.length > 0 ? copiedDetachedNodes : undefined;
}

/**
 * @param change - The change to convert into a delta.
 */
function intoDeltaImpl(
	change: FieldChangeMap,
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>,
	idAllocator: MemoizedIdRangeAllocator,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): Map<FieldKey, DeltaFieldChanges> {
	const delta: Map<FieldKey, DeltaFieldChanges> = new Map();
	for (const [field, fieldChange] of change) {
		const deltaField = getChangeHandler(fieldKinds, fieldChange.fieldKind).intoDelta(
			fieldChange.change,
			(childChange): DeltaFieldMap => {
				const nodeChange = nodeChangeFromId(nodeChanges, childChange);
				return deltaFromNodeChange(nodeChange, nodeChanges, idAllocator, fieldKinds);
			},
			idAllocator,
		);
		if (!isEmptyFieldChanges(deltaField)) {
			delta.set(field, deltaField);
		}
	}
	return delta;
}

function deltaFromNodeChange(
	change: NodeChangeset,
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>,
	idAllocator: MemoizedIdRangeAllocator,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
): DeltaFieldMap {
	if (change.fieldChanges !== undefined) {
		return intoDeltaImpl(change.fieldChanges, nodeChanges, idAllocator, fieldKinds);
	}
	// TODO: update the API to allow undefined to be returned here
	return new Map();
}

/**
 * @internal
 * @param revInfos - This should describe the revision being rebased and all revisions in the rebase path,
 * even if not part of the current base changeset.
 * For example, when rebasing change B from a local branch [A, B, C] over a branch [X, Y], the `revInfos` must include
 * the changes [A⁻¹ X, Y, A, B] for each rebase step of B.
 * @param revisionToRebase - The revision of the changeset which is being rebased.
 * @param baseRevisions - The set of revisions in the changeset being rebased over.
 * For example, when rebasing change B from a local branch [A, B, C] over a branch [X, Y], the `baseRevisions` must include
 * revisions [A⁻¹ X, Y, A] if rebasing over the composition of all those changes, or
 * revision [A⁻¹] for the first rebase, then [X], etc. if rebasing over edits individually.
 * @returns - RebaseRevisionMetadata to be passed to `FieldChangeRebaser.rebase`*
 */
export function rebaseRevisionMetadataFromInfo(
	revInfos: readonly RevisionInfo[],
	revisionToRebase: RevisionTag | undefined,
	baseRevisions: (RevisionTag | undefined)[],
): RebaseRevisionMetadata {
	const filteredRevisions: RevisionTag[] = [];
	for (const revision of baseRevisions) {
		if (revision !== undefined) {
			filteredRevisions.push(revision);
		}
	}

	const getBaseRevisions = (): RevisionTag[] => filteredRevisions;
	return {
		...revisionMetadataSourceFromInfo(revInfos),
		getRevisionToRebase: () => revisionToRebase,
		getBaseRevisions,
	};
}

function isEmptyNodeChangeset(change: NodeChangeset): boolean {
	return change.fieldChanges === undefined && change.nodeExistsConstraint === undefined;
}

export function getFieldKind(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
	kind: FieldKindIdentifier,
): FieldKindWithEditor {
	if (kind === genericFieldKind.identifier) {
		return genericFieldKind;
	}
	const fieldKind = fieldKinds.get(kind);
	assert(fieldKind !== undefined, 0x3ad /* Unknown field kind */);
	return withEditor(fieldKind);
}

export function getChangeHandler(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
	kind: FieldKindIdentifier,
): FieldChangeHandler<unknown> {
	return getFieldKind(fieldKinds, kind).changeHandler;
}

// TODO: TFieldData could instead just be a numeric ID generated by the CrossFieldTable
// The CrossFieldTable could have a generic field ID to context table
interface CrossFieldTable<TFieldData> {
	srcTable: CrossFieldMap<unknown>;
	dstTable: CrossFieldMap<unknown>;
	srcDependents: CrossFieldMap<TFieldData>;
	dstDependents: CrossFieldMap<TFieldData>;
	invalidatedFields: Set<TFieldData>;
}

interface InvertTable extends CrossFieldTable<FieldChange> {
	originalFieldToContext: Map<FieldChange, InvertContext>;
	invertedNodeToParent: ChangeAtomIdBTree<FieldId>;
}

interface InvertContext {
	fieldId: FieldId;
	invertedField: FieldChange;
}

interface RebaseTable extends CrossFieldTable<FieldChange> {
	readonly baseChange: ModularChangeset;
	readonly newChange: ModularChangeset;

	/**
	 * Maps from the FieldChange key used for the CrossFieldTable (which is the base FieldChange)
	 * to the context for the field.
	 */
	readonly baseFieldToContext: Map<FieldChange, RebaseFieldContext>;
	readonly baseToRebasedNodeId: ChangeAtomIdBTree<NodeId>;
	readonly rebasedFields: Set<FieldChange>;
	readonly rebasedNodeToParent: ChangeAtomIdBTree<FieldId>;
	readonly rebasedCrossFieldKeys: CrossFieldKeyTable;

	/**
	 * List of unprocessed (newId, baseId) pairs encountered so far.
	 */
	readonly nodeIdPairs: [NodeId, NodeId, NodeAttachState | undefined][];
	readonly affectedBaseFields: TupleBTree<FieldIdKey, boolean>;
}

type FieldIdKey = [RevisionTag | undefined, ChangesetLocalId | undefined, FieldKey];

interface RebaseFieldContext {
	baseChange: FieldChange;
	newChange: FieldChange;
	rebasedChange: FieldChange;
	fieldId: FieldId;

	/**
	 * The set of node IDs in the base changeset which should be included in the rebased field,
	 * even if there is no corresponding node changeset in the new change.
	 */
	baseNodeIds: NodeId[];
}

function newComposeTable(
	baseChange: ModularChangeset,
	newChange: ModularChangeset,
): ComposeTable {
	return {
		...newCrossFieldTable<FieldChange>(),
		baseChange,
		newChange,
		fieldToContext: new Map(),
		newFieldToBaseField: new Map(),
		newToBaseNodeId: newTupleBTree(),
		composedNodes: new Set(),
		pendingCompositions: {
			nodeIdsToCompose: [],
			affectedBaseFields: newTupleBTree(),
			affectedNewFields: newTupleBTree(),
		},
	};
}

interface ComposeTable extends CrossFieldTable<FieldChange> {
	readonly baseChange: ModularChangeset;
	readonly newChange: ModularChangeset;

	/**
	 * Maps from an input changeset for a field (from change1 if it has one, from change2 otherwise) to the context for that field.
	 */
	readonly fieldToContext: Map<FieldChange, ComposeFieldContext>;
	readonly newFieldToBaseField: Map<FieldChange, FieldChange>;
	readonly newToBaseNodeId: ChangeAtomIdBTree<NodeId>;
	readonly composedNodes: Set<NodeChangeset>;
	readonly pendingCompositions: PendingCompositions;
}

interface PendingCompositions {
	/**
	 * Each entry in this list represents a node with both base and new changes which have not yet been composed.
	 * Entries are of the form [baseId, newId].
	 */
	readonly nodeIdsToCompose: [NodeId, NodeId][];

	/**
	 * The set of fields in the base changeset which have been affected by a cross field effect.
	 */
	readonly affectedBaseFields: BTree<FieldIdKey, true>;

	/**
	 * The set of fields in the new changeset which have been affected by a cross field effect.
	 */
	readonly affectedNewFields: BTree<FieldIdKey, true>;
}

interface ComposeFieldContext {
	change1: FieldChangeset;
	change2: FieldChangeset;
	composedChange: FieldChange;
}

function newCrossFieldTable<T>(): CrossFieldTable<T> {
	return {
		srcTable: new Map(),
		dstTable: new Map(),
		srcDependents: new Map(),
		dstDependents: new Map(),
		invalidatedFields: new Set(),
	};
}

/**
 * @internal
 */
interface ConstraintState {
	violationCount: number;
}

function newConstraintState(violationCount: number): ConstraintState {
	return {
		violationCount,
	};
}

abstract class CrossFieldManagerI<T> implements CrossFieldManager {
	public constructor(
		protected readonly crossFieldTable: CrossFieldTable<T>,
		private readonly currentFieldKey: T,
		protected readonly allowInval = true,
	) {}

	public set(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
		newValue: unknown,
		invalidateDependents: boolean,
	): void {
		if (invalidateDependents && this.allowInval) {
			const lastChangedId = (id as number) + count - 1;
			let firstId = id;
			while (firstId <= lastChangedId) {
				const dependentEntry = getFirstFromCrossFieldMap(
					this.getDependents(target),
					revision,
					firstId,
					lastChangedId - firstId + 1,
				);
				if (dependentEntry.value !== undefined) {
					this.crossFieldTable.invalidatedFields.add(dependentEntry.value);
				}

				firstId = brand(firstId + dependentEntry.length);
			}
		}
		setInCrossFieldMap(this.getMap(target), revision, id, count, newValue);
	}

	public get(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
		addDependency: boolean,
	): RangeQueryResult<unknown> {
		if (addDependency) {
			// We assume that if there is already an entry for this ID it is because
			// a field handler has called compose on the same node multiple times.
			// In this case we only want to update the latest version, so we overwrite the dependency.
			setInCrossFieldMap(
				this.getDependents(target),
				revision,
				id,
				count,
				this.currentFieldKey,
			);
		}
		return getFirstFromCrossFieldMap(this.getMap(target), revision, id, count);
	}

	public abstract onMoveIn(id: NodeId): void;

	public abstract moveKey(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
	): void;

	private getMap(target: CrossFieldTarget): CrossFieldMap<unknown> {
		return target === CrossFieldTarget.Source
			? this.crossFieldTable.srcTable
			: this.crossFieldTable.dstTable;
	}

	private getDependents(target: CrossFieldTarget): CrossFieldMap<T> {
		return target === CrossFieldTarget.Source
			? this.crossFieldTable.srcDependents
			: this.crossFieldTable.dstDependents;
	}
}

class InvertManager extends CrossFieldManagerI<FieldChange> {
	public constructor(
		table: InvertTable,
		field: FieldChange,
		private readonly fieldId: FieldId,
		allowInval = true,
	) {
		super(table, field, allowInval);
	}

	public override onMoveIn(id: ChangeAtomId): void {
		setInChangeAtomIdMap(this.table.invertedNodeToParent, id, this.fieldId);
	}

	public override moveKey(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
	): void {
		assert(false, 0x9c5 /* Keys should not be moved manually during invert */);
	}

	private get table(): InvertTable {
		return this.crossFieldTable as InvertTable;
	}
}

class RebaseManager extends CrossFieldManagerI<FieldChange> {
	public constructor(
		table: RebaseTable,
		currentField: FieldChange,
		private readonly fieldId: FieldId,
		allowInval = true,
	) {
		super(table, currentField, allowInval);
	}

	public override set(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
		newValue: unknown,
		invalidateDependents: boolean,
	): void {
		if (invalidateDependents && this.allowInval) {
			const newFieldIds = getFieldsForCrossFieldKey(this.table.newChange, [
				target,
				revision,
				id,
				count,
			]);

			assert(
				newFieldIds.length === 0,
				0x9c6 /* TODO: Modifying a cross-field key from the new changeset is currently unsupported */,
			);

			const baseFieldIds = getFieldsForCrossFieldKey(this.table.baseChange, [
				target,
				revision,
				id,
				count,
			]);

			assert(
				baseFieldIds.length > 0,
				0x9c7 /* Cross field key not registered in base or new change */,
			);

			for (const baseFieldId of baseFieldIds) {
				this.table.affectedBaseFields.set(
					[baseFieldId.nodeId?.revision, baseFieldId.nodeId?.localId, baseFieldId.field],
					true,
				);
			}
		}

		super.set(target, revision, id, count, newValue, invalidateDependents);
	}

	public override onMoveIn(id: ChangeAtomId): void {
		setInChangeAtomIdMap(this.table.rebasedNodeToParent, id, this.fieldId);
	}

	public override moveKey(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
	): void {
		setInCrossFieldKeyTable(
			this.table.rebasedCrossFieldKeys,
			target,
			revision,
			id,
			count,
			this.fieldId,
		);
	}

	private get table(): RebaseTable {
		return this.crossFieldTable as RebaseTable;
	}
}

// TODO: Deduplicate this with RebaseTable
class ComposeManager extends CrossFieldManagerI<FieldChange> {
	public constructor(table: ComposeTable, currentField: FieldChange, allowInval = true) {
		super(table, currentField, allowInval);
	}

	public override set(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
		newValue: unknown,
		invalidateDependents: boolean,
	): void {
		if (invalidateDependents && this.allowInval) {
			const newFieldIds = getFieldsForCrossFieldKey(this.table.newChange, [
				target,
				revision,
				id,
				count,
			]);

			if (newFieldIds.length > 0) {
				for (const newFieldId of newFieldIds) {
					this.table.pendingCompositions.affectedNewFields.set(
						[newFieldId.nodeId?.revision, newFieldId.nodeId?.localId, newFieldId.field],
						true,
					);
				}
			} else {
				const baseFieldIds = getFieldsForCrossFieldKey(this.table.baseChange, [
					target,
					revision,
					id,
					count,
				]);

				assert(
					baseFieldIds.length > 0,
					0x9c8 /* Cross field key not registered in base or new change */,
				);

				for (const baseFieldId of baseFieldIds) {
					this.table.pendingCompositions.affectedBaseFields.set(
						[baseFieldId.nodeId?.revision, baseFieldId.nodeId?.localId, baseFieldId.field],
						true,
					);
				}
			}
		}

		super.set(target, revision, id, count, newValue, invalidateDependents);
	}

	public override onMoveIn(id: ChangeAtomId): void {
		throw new Error("Method not implemented.");
	}
	public override moveKey(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
	): void {
		throw new Error("Method not implemented.");
	}

	private get table(): ComposeTable {
		return this.crossFieldTable as ComposeTable;
	}
}

function makeModularChangeset(
	fieldChanges: FieldChangeMap | undefined = undefined,
	nodeChanges: ChangeAtomIdBTree<NodeChangeset> | undefined = undefined,
	nodeToParent: ChangeAtomIdBTree<FieldId> | undefined = undefined,
	nodeAliases: ChangeAtomIdBTree<NodeId> | undefined = undefined,
	crossFieldKeys: CrossFieldKeyTable | undefined = undefined,
	maxId: number = -1,
	revisions: readonly RevisionInfo[] | undefined = undefined,
	constraintViolationCount: number | undefined = undefined,
	builds?: ChangeAtomIdBTree<TreeChunk>,
	destroys?: ChangeAtomIdBTree<number>,
	refreshers?: ChangeAtomIdBTree<TreeChunk>,
): ModularChangeset {
	const changeset: Mutable<ModularChangeset> = {
		fieldChanges: fieldChanges ?? new Map(),
		nodeChanges: nodeChanges ?? newTupleBTree(),
		nodeToParent: nodeToParent ?? newTupleBTree(),
		nodeAliases: nodeAliases ?? newTupleBTree(),
		crossFieldKeys: crossFieldKeys ?? newCrossFieldKeyTable(),
	};

	if (revisions !== undefined && revisions.length > 0) {
		changeset.revisions = revisions;
	}
	if (maxId >= 0) {
		changeset.maxId = brand(maxId);
	}
	if (constraintViolationCount !== undefined && constraintViolationCount > 0) {
		changeset.constraintViolationCount = constraintViolationCount;
	}
	if (builds !== undefined && builds.size > 0) {
		changeset.builds = builds;
	}
	if (destroys !== undefined && destroys.size > 0) {
		changeset.destroys = destroys;
	}
	if (refreshers !== undefined && refreshers.size > 0) {
		changeset.refreshers = refreshers;
	}
	return changeset;
}

export class ModularEditBuilder extends EditBuilder<ModularChangeset> {
	private transactionDepth: number = 0;
	private idAllocator: IdAllocator;

	public constructor(
		family: ChangeFamily<ChangeFamilyEditor, ModularChangeset>,
		private readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
		changeReceiver: (change: ModularChangeset) => void,
	) {
		super(family, changeReceiver);
		this.idAllocator = idAllocatorFromMaxId();
	}

	public override enterTransaction(): void {
		this.transactionDepth += 1;
		if (this.transactionDepth === 1) {
			this.idAllocator = idAllocatorFromMaxId();
		}
	}

	public override exitTransaction(): void {
		assert(this.transactionDepth > 0, 0x5b9 /* Cannot exit inexistent transaction */);
		this.transactionDepth -= 1;
		if (this.transactionDepth === 0) {
			this.idAllocator = idAllocatorFromMaxId();
		}
	}

	/**
	 * @param firstId - The ID to associate with the first node
	 * @param content - The node(s) to build. Can be in either Field or Node mode.
	 * @returns A description of the edit that can be passed to `submitChanges`.
	 */
	public buildTrees(
		firstId: ChangesetLocalId,
		content: ITreeCursorSynchronous,
	): GlobalEditDescription {
		if (content.mode === CursorLocationType.Fields && content.getFieldLength() === 0) {
			return { type: "global" };
		}
		const builds: ChangeAtomIdBTree<TreeChunk> = newTupleBTree();
		const chunk =
			content.mode === CursorLocationType.Fields
				? chunkFieldSingle(content, defaultChunkPolicy)
				: chunkTree(content, defaultChunkPolicy);
		builds.set([undefined, firstId], chunk);

		return {
			type: "global",
			builds,
		};
	}

	/**
	 * Adds a change to the edit builder
	 * @param field - the field which is being edited
	 * @param fieldKind - the kind of the field
	 * @param change - the change to the field
	 * @param maxId - the highest `ChangesetLocalId` used in this change
	 */
	public submitChange(
		field: FieldUpPath,
		fieldKind: FieldKindIdentifier,
		change: FieldChangeset,
	): void {
		const crossFieldKeys = getChangeHandler(this.fieldKinds, fieldKind).getCrossFieldKeys(
			change,
		);

		const modularChange = buildModularChangesetFromField(
			field,
			{ fieldKind, change },
			newTupleBTree(),
			newTupleBTree(),
			newCrossFieldKeyTable(),
			this.idAllocator,
			crossFieldKeys,
		);
		this.applyChange(modularChange);
	}

	public submitChanges(changes: EditDescription[]): void {
		const modularChange = this.buildChanges(changes);
		this.applyChange(modularChange);
	}

	public buildChanges(changes: EditDescription[]): ModularChangeset {
		const changeMaps = changes.map((change) =>
			makeAnonChange(
				change.type === "global"
					? makeModularChangeset(
							undefined,
							undefined,
							undefined,
							undefined,
							undefined,
							this.idAllocator.getMaxId(),
							undefined,
							undefined,
							change.builds,
						)
					: buildModularChangesetFromField(
							change.field,
							{
								fieldKind: change.fieldKind,
								change: change.change,
							},
							newTupleBTree(),
							newTupleBTree(),
							newCrossFieldKeyTable(),
							this.idAllocator,
							getChangeHandler(this.fieldKinds, change.fieldKind).getCrossFieldKeys(
								change.change,
							),
						),
			),
		);
		const composedChange: Mutable<ModularChangeset> =
			this.changeFamily.rebaser.compose(changeMaps);

		const maxId: ChangesetLocalId = brand(this.idAllocator.getMaxId());
		if (maxId >= 0) {
			composedChange.maxId = maxId;
		}
		return composedChange;
	}

	public generateId(count?: number): ChangesetLocalId {
		return brand(this.idAllocator.allocate(count));
	}

	public addNodeExistsConstraint(path: UpPath): void {
		const nodeChange: NodeChangeset = {
			nodeExistsConstraint: { violated: false },
		};

		this.applyChange(
			buildModularChangesetFromNode(
				path,
				nodeChange,
				newTupleBTree(),
				newTupleBTree(),
				newCrossFieldKeyTable(),
				this.idAllocator,
			),
		);
	}
}

function buildModularChangesetFromField(
	path: FieldUpPath,
	fieldChange: FieldChange,
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>,
	nodeToParent: ChangeAtomIdBTree<FieldId>,
	crossFieldKeys: CrossFieldKeyTable,
	idAllocator: IdAllocator = idAllocatorFromMaxId(),
	localCrossFieldKeys: CrossFieldKeyRange[] = [],
	childId: NodeId | undefined = undefined,
): ModularChangeset {
	const fieldChanges: FieldChangeMap = new Map([[path.field, fieldChange]]);

	if (path.parent === undefined) {
		for (const key of localCrossFieldKeys) {
			crossFieldKeys.set(key, { nodeId: undefined, field: path.field });
		}

		if (childId !== undefined) {
			setInChangeAtomIdMap(nodeToParent, childId, {
				nodeId: undefined,
				field: path.field,
			});
		}

		return makeModularChangeset(
			fieldChanges,
			nodeChanges,
			nodeToParent,
			undefined,
			crossFieldKeys,
			idAllocator.getMaxId(),
		);
	}

	const nodeChangeset: NodeChangeset = {
		fieldChanges,
	};

	const parentId: NodeId = { localId: brand(idAllocator.allocate()) };

	for (const key of localCrossFieldKeys) {
		crossFieldKeys.set(key, { nodeId: parentId, field: path.field });
	}

	if (childId !== undefined) {
		setInChangeAtomIdMap(nodeToParent, childId, {
			nodeId: parentId,
			field: path.field,
		});
	}

	return buildModularChangesetFromNode(
		path.parent,
		nodeChangeset,
		nodeChanges,
		nodeToParent,
		crossFieldKeys,
		idAllocator,
		parentId,
	);
}

function buildModularChangesetFromNode(
	path: UpPath,
	nodeChange: NodeChangeset,
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>,
	nodeToParent: ChangeAtomIdBTree<FieldId>,
	crossFieldKeys: CrossFieldKeyTable,
	idAllocator: IdAllocator,
	nodeId: NodeId = { localId: brand(idAllocator.allocate()) },
): ModularChangeset {
	setInChangeAtomIdMap(nodeChanges, nodeId, nodeChange);
	const fieldChangeset = genericFieldKind.changeHandler.editor.buildChildChange(
		path.parentIndex,
		nodeId,
	);

	const fieldChange: FieldChange = {
		fieldKind: genericFieldKind.identifier,
		change: fieldChangeset,
	};

	return buildModularChangesetFromField(
		{ parent: path.parent, field: path.parentField },
		fieldChange,
		nodeChanges,
		nodeToParent,
		crossFieldKeys,
		idAllocator,
		[],
		nodeId,
	);
}

/**
 * @internal
 */
export interface FieldEditDescription {
	type: "field";
	field: FieldUpPath;
	fieldKind: FieldKindIdentifier;
	change: FieldChangeset;
}

/**
 * @internal
 */
export interface GlobalEditDescription {
	type: "global";
	builds?: ChangeAtomIdBTree<TreeChunk>;
}

/**
 * @internal
 */
export type EditDescription = FieldEditDescription | GlobalEditDescription;

function getRevInfoFromTaggedChanges(changes: TaggedChange<ModularChangeset>[]): {
	revInfos: RevisionInfo[];
	maxId: ChangesetLocalId;
} {
	let maxId = -1;
	const revInfos: RevisionInfo[] = [];
	for (const taggedChange of changes) {
		const change = taggedChange.change;
		maxId = Math.max(change.maxId ?? -1, maxId);
		revInfos.push(...revisionInfoFromTaggedChange(taggedChange));
	}

	const revisions = new Set<RevisionTag>();
	const rolledBackRevisions: RevisionTag[] = [];
	for (const info of revInfos) {
		revisions.add(info.revision);
		if (info.rollbackOf !== undefined) {
			rolledBackRevisions.push(info.rollbackOf);
		}
	}

	rolledBackRevisions.reverse();
	for (const revision of rolledBackRevisions) {
		if (!revisions.has(revision)) {
			revInfos.push({ revision });
		}
	}

	return { maxId: brand(maxId), revInfos };
}

function revisionInfoFromTaggedChange(
	taggedChange: TaggedChange<ModularChangeset>,
): RevisionInfo[] {
	const revInfos: RevisionInfo[] = [];
	if (taggedChange.change.revisions !== undefined) {
		revInfos.push(...taggedChange.change.revisions);
	} else if (taggedChange.revision !== undefined) {
		const info: Mutable<RevisionInfo> = { revision: taggedChange.revision };
		if (taggedChange.rollbackOf !== undefined) {
			info.rollbackOf = taggedChange.rollbackOf;
		}
		revInfos.push(info);
	}
	return revInfos;
}

function mergeBTrees<K, V>(
	tree1: BTree<K, V>,
	tree2: BTree<K, V>,
	preferLeft = true,
): BTree<K, V> {
	const result = tree1.clone();
	for (const [key, value] of tree2.entries()) {
		result.set(key, value, !preferLeft);
	}

	return result;
}

function fieldChangeFromId(
	fields: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	id: FieldId,
): FieldChange {
	const fieldMap = fieldMapFromNodeId(fields, nodes, id.nodeId);
	return fieldMap.get(id.field) ?? fail("No field exists for the given ID");
}

function fieldMapFromNodeId(
	rootFieldMap: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	nodeId: NodeId | undefined,
): FieldChangeMap {
	if (nodeId === undefined) {
		return rootFieldMap;
	}

	const node = nodeChangeFromId(nodes, nodeId);
	assert(node.fieldChanges !== undefined, 0x9c9 /* Expected node to have field changes */);
	return node.fieldChanges;
}

function rebasedFieldIdFromBaseId(table: RebaseTable, baseId: FieldId): FieldId {
	if (baseId.nodeId === undefined) {
		return baseId;
	}

	return { ...baseId, nodeId: rebasedNodeIdFromBaseNodeId(table, baseId.nodeId) };
}

function rebasedNodeIdFromBaseNodeId(table: RebaseTable, baseId: NodeId): NodeId {
	return getFromChangeAtomIdMap(table.baseToRebasedNodeId, baseId) ?? baseId;
}

function nodeChangeFromId(nodes: ChangeAtomIdBTree<NodeChangeset>, id: NodeId): NodeChangeset {
	const node = getFromChangeAtomIdMap(nodes, id);
	assert(node !== undefined, 0x9ca /* Unknown node ID */);
	return node;
}

function fieldIdFromFieldIdKey([revision, localId, field]: FieldIdKey): FieldId {
	const nodeId = localId !== undefined ? { revision, localId } : undefined;
	return { nodeId, field };
}

function cloneNodeChangeset(nodeChangeset: NodeChangeset): NodeChangeset {
	if (nodeChangeset.fieldChanges !== undefined) {
		return { ...nodeChangeset, fieldChanges: new Map(nodeChangeset.fieldChanges) };
	}

	return { ...nodeChangeset };
}

function replaceFieldIdRevision(
	fieldId: FieldId,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): FieldId {
	if (fieldId.nodeId === undefined) {
		return fieldId;
	}

	return {
		...fieldId,
		nodeId: replaceAtomRevisions(fieldId.nodeId, oldRevisions, newRevision),
	};
}

export function getParentFieldId(changeset: ModularChangeset, nodeId: NodeId): FieldId {
	const parentId = getFromChangeAtomIdMap(changeset.nodeToParent, nodeId);
	assert(parentId !== undefined, 0x9cb /* Parent field should be defined */);
	return normalizeFieldId(parentId, changeset.nodeAliases);
}

export function getFieldsForCrossFieldKey(
	changeset: ModularChangeset,
	[target, revision, id, count]: CrossFieldKeyRange,
): FieldId[] {
	let firstLocalId: number = id;
	const lastLocalId = id + count - 1;

	const fields: FieldId[] = [];

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const entry = getFirstIntersectingCrossFieldEntry(changeset.crossFieldKeys, [
			target,
			revision,
			brand(firstLocalId),
			count,
		]);

		if (entry === undefined) {
			return fields;
		}

		const [[_target, _revision, entryId, entryCount], fieldId] = entry;
		fields.push(normalizeFieldId(fieldId, changeset.nodeAliases));

		const entryLastId = entryId + entryCount - 1;
		if (entryLastId >= lastLocalId) {
			return fields;
		}

		firstLocalId = entryLastId + 1;
	}
}

function getFirstIntersectingCrossFieldEntry(
	table: CrossFieldKeyTable,
	[target, revision, id, count]: CrossFieldKeyRange,
): [CrossFieldKeyRange, FieldId] | undefined {
	const entry = table.nextLowerPair([target, revision, id, Infinity]);
	if (entry === undefined) {
		return undefined;
	}

	const [entryTarget, entryRevision, entryId, entryCount] = entry[0];
	if (entryTarget !== target || entryRevision !== revision) {
		return undefined;
	}

	const lastQueryId = id + count - 1;
	const entryLastId = entryId + entryCount - 1;
	if (entryId > lastQueryId || entryLastId < id) {
		return undefined;
	}

	return entry;
}

function setInCrossFieldKeyTable(
	table: CrossFieldKeyTable,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: ChangesetLocalId,
	count: number,
	value: FieldId,
): void {
	let entry = getFirstIntersectingCrossFieldEntry(table, [target, revision, id, count]);
	const lastQueryId = id + count - 1;
	while (entry !== undefined) {
		const [entryKey, entryValue] = entry;
		table.delete(entryKey);

		const [_target, _revision, entryId, entryCount] = entryKey;
		if (entryId < id) {
			table.set([target, revision, entryId, id - entryId], entryValue);
		}

		const lastEntryId = entryId + entryCount - 1;
		if (lastEntryId > lastQueryId) {
			table.set(
				[target, revision, brand(lastQueryId + 1), lastEntryId - lastQueryId],
				entryValue,
			);
			break;
		}

		const nextId: ChangesetLocalId = brand(lastEntryId + 1);
		entry = getFirstIntersectingCrossFieldEntry(table, [
			target,
			revision,
			nextId,
			lastQueryId - nextId + 1,
		]);
	}

	table.set([target, revision, id, count], value);
}

function normalizeFieldId(fieldId: FieldId, nodeAliases: ChangeAtomIdBTree<NodeId>): FieldId {
	return fieldId.nodeId !== undefined
		? { ...fieldId, nodeId: normalizeNodeId(fieldId.nodeId, nodeAliases) }
		: fieldId;
}

/**
 * @returns The canonical form of nodeId, according to nodeAliases
 */
function normalizeNodeId(nodeId: NodeId, nodeAliases: ChangeAtomIdBTree<NodeId>): NodeId {
	let currentId = nodeId;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const dealiased = getFromChangeAtomIdMap(nodeAliases, currentId);
		if (dealiased === undefined) {
			return currentId;
		}

		currentId = dealiased;
	}
}

function hasConflicts(change: ModularChangeset): boolean {
	return (change.constraintViolationCount ?? 0) > 0;
}

export function newCrossFieldKeyTable(): CrossFieldKeyTable {
	return newTupleBTree();
}

interface ModularChangesetContent {
	fieldChanges: FieldChangeMap;
	nodeChanges: ChangeAtomIdBTree<NodeChangeset>;
	nodeToParent: ChangeAtomIdBTree<FieldId>;
	nodeAliases: ChangeAtomIdBTree<NodeId>;
	crossFieldKeys: CrossFieldKeyTable;
}

function getFromChangeAtomIdMap<T>(
	map: ChangeAtomIdBTree<T>,
	id: ChangeAtomId,
): T | undefined {
	return map.get([id.revision, id.localId]);
}

function setInChangeAtomIdMap<T>(map: ChangeAtomIdBTree<T>, id: ChangeAtomId, value: T): void {
	map.set([id.revision, id.localId], value);
}
