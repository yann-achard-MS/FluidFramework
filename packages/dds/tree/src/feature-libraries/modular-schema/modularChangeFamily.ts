/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	ChangeEncoder,
	ChangeFamily,
	ProgressiveEditBuilder,
	ProgressiveEditBuilderBase,
	ChangeRebaser,
	FieldKindIdentifier,
	AnchorSet,
	Delta,
	FieldKey,
	UpPath,
	Value,
	TaggedChange,
	ReadonlyRepairDataStore,
	RevisionTag,
	tagChange,
	makeAnonChange,
} from "../../core";
import { brand, clone, getOrAddEmptyToMap, JsonCompatibleReadOnly, Mutable } from "../../util";
import { modifyMarkList } from "../deltaUtils";
import { dummyRepairDataStore } from "../fakeRepairDataStore";
import {
	FieldChangeHandler,
	FieldChangeMap,
	FieldChange,
	FieldChangeset,
	NodeChangeset,
	ValueChange,
	ModularChangeset,
	ChangesetLocalId,
	IdAllocator,
	Context,
} from "./fieldChangeHandler";
import { FieldKind, RebaseDirection } from "./fieldKind";
import { genericFieldKind } from "./genericFieldKind";
import { decodeJsonFormat0, encodeForJsonFormat0 } from "./modularChangeEncoding";

/**
 * Implementation of ChangeFamily which delegates work in a given field to the appropriate FieldKind
 * as determined by the schema.
 *
 * @sealed
 * @alpha
 */
export class ModularChangeFamily
	implements ChangeFamily<ModularEditBuilder, ModularChangeset>, ChangeRebaser<ModularChangeset>
{
	readonly encoder: ChangeEncoder<ModularChangeset>;

	constructor(readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>) {
		this.encoder = new ModularChangeEncoder(this.fieldKinds);
	}

	get rebaser(): ChangeRebaser<ModularChangeset> {
		return this;
	}

	compose(changes: TaggedChange<ModularChangeset>[]): ModularChangeset {
		let maxId = changes.reduce((max, change) => Math.max(change.change.maxId ?? -1, max), -1);
		const genId: IdAllocator = () => brand(++maxId);

		const composedFields = this.composeFieldMaps(
			changes.map((change) => tagChange(change.change.changes, change.revision)),
			genId,
		);
		return makeModularChangeset(composedFields, maxId);
	}

	private composeFieldMaps(
		changes: TaggedChange<FieldChangeMap>[],
		genId: IdAllocator,
	): FieldChangeMap {
		const fieldChanges = new Map<FieldKey, FieldChange[]>();
		for (const change of changes) {
			for (const [fieldKey, fieldChange] of change.change) {
				const fieldChangeToCompose =
					fieldChange.revision !== undefined || change.revision === undefined
						? fieldChange
						: {
								...fieldChange,
								revision: change.revision,
						  };

				getOrAddEmptyToMap(fieldChanges, fieldKey).push(fieldChangeToCompose);
			}
		}

		const composedFields: FieldChangeMap = new Map();
		for (const [fieldKey, changesForField] of fieldChanges) {
			let composedField: FieldChange;
			if (changesForField.length === 1) {
				composedField = changesForField[0];
			} else {
				const fieldKindId = changesForField[0].fieldKind;
				const taggedChangesets: TaggedChange<unknown>[] = [];
				for (const fieldChange of changesForField) {
					assert(fieldChange.fieldKind === fieldKindId, "Inconsistent field kind");
					taggedChangesets.push(
						tagChange(fieldChange.fieldChanges, fieldChange.revision),
					);
				}

				const fieldKind = getFieldKind(this.fieldKinds, fieldKindId);
				const rebaser = fieldKind.changeHandler.rebaser;
				const composedChange = rebaser.compose(taggedChangesets, genId);

				const childChanges = fieldKind.anchorStoreFactory<NodeChangeset>();
				for (let i = changesForField.length - 1; i >= 0; --i) {
					const iThFieldChanges = changesForField[i];
					childChanges.mergeIn(
						iThFieldChanges.childChanges,
						(existing: NodeChangeset, added: NodeChangeset) =>
							this.composeNodeChanges(
								[
									makeAnonChange(existing),
									tagChange(added, iThFieldChanges.revision),
								],
								genId,
							),
					);
					if (i > 0) {
						childChanges.rebase(
							tagChange(iThFieldChanges.fieldChanges, iThFieldChanges.revision),
							RebaseDirection.Backward,
						);
					}
				}

				composedField = {
					fieldKind: fieldKindId,
					fieldChanges: brand(composedChange),
					childChanges,
				};
			}

			// TODO: Could optimize by checking that composedField is non-empty
			composedFields.set(fieldKey, composedField);
		}
		return composedFields;
	}

	private composeNodeChanges(
		changes: TaggedChange<NodeChangeset>[],
		genId: IdAllocator,
	): NodeChangeset {
		const fieldChanges: TaggedChange<FieldChangeMap>[] = [];
		let valueChange: ValueChange | undefined;
		for (const change of changes) {
			if (change.change.valueChange !== undefined) {
				valueChange = clone(change.change.valueChange);
				valueChange.revision ??= change.revision;
			}
			if (change.change.fieldChanges !== undefined) {
				fieldChanges.push(tagChange(change.change.fieldChanges, change.revision));
			}
		}

		const composedFieldChanges = this.composeFieldMaps(fieldChanges, genId);
		const composedNodeChange: NodeChangeset = {};
		if (valueChange !== undefined) {
			composedNodeChange.valueChange = valueChange;
		}

		if (composedFieldChanges.size > 0) {
			composedNodeChange.fieldChanges = composedFieldChanges;
		}

		return composedNodeChange;
	}

	invert(change: TaggedChange<ModularChangeset>): ModularChangeset {
		let maxId = change.change.maxId ?? -1;
		const genId: IdAllocator = () => brand(++maxId);
		const invertedFields = this.invertFieldMap(
			tagChange(change.change.changes, change.revision),
			genId,
		);

		return makeModularChangeset(invertedFields, maxId);
	}

	private invertFieldMap(
		changes: TaggedChange<FieldChangeMap>,
		genId: IdAllocator,
	): FieldChangeMap {
		const invertedFields: FieldChangeMap = new Map();

		for (const [field, fieldChange] of changes.change) {
			const { revision } = fieldChange.revision !== undefined ? fieldChange : changes;

			const invertedChange = getChangeHandler(
				this.fieldKinds,
				fieldChange.fieldKind,
			).rebaser.invert({ revision, change: fieldChange.fieldChanges }, genId);

			const childChanges = fieldChange.childChanges.clone();
			childChanges.rebase(
				tagChange(fieldChange.fieldChanges, revision),
				RebaseDirection.Forward,
			);
			for (const { data } of childChanges.entries()) {
				this.invertNodeChange({ revision, change: data }, genId);
			}

			invertedFields.set(field, {
				...fieldChange,
				fieldChanges: brand(invertedChange),
				childChanges,
			});
		}

		return invertedFields;
	}

	private invertNodeChange(
		change: TaggedChange<NodeChangeset>,
		genId: IdAllocator,
	): NodeChangeset {
		const inverse: NodeChangeset = {};

		if (change.change.valueChange !== undefined) {
			assert(
				!("revert" in change.change.valueChange),
				0x4a9 /* Inverting inverse changes is currently not supported */,
			);
			const revision = change.change.valueChange.revision ?? change.revision;
			inverse.valueChange = { revert: revision };
		}

		if (change.change.fieldChanges !== undefined) {
			inverse.fieldChanges = this.invertFieldMap(
				{ ...change, change: change.change.fieldChanges },
				genId,
			);
		}

		return inverse;
	}

	rebase(change: ModularChangeset, over: TaggedChange<ModularChangeset>): ModularChangeset {
		let maxId = change.maxId ?? -1;
		const genId: IdAllocator = () => brand(++maxId);
		const rebasedFields = this.rebaseFieldMap(
			change.changes,
			tagChange(over.change.changes, over.revision),
			genId,
		);

		return makeModularChangeset(rebasedFields, maxId);
	}

	private rebaseFieldMap(
		change: FieldChangeMap,
		over: TaggedChange<FieldChangeMap>,
		genId: IdAllocator,
	): FieldChangeMap {
		const rebasedFields: FieldChangeMap = new Map();

		for (const [field, fieldChange] of change) {
			const baseChanges = over.change.get(field);
			if (baseChanges === undefined) {
				rebasedFields.set(field, fieldChange);
			} else {
				const fieldKind = getFieldKind(this.fieldKinds, fieldChange.fieldKind);
				const rebaser = fieldKind.changeHandler.rebaser;

				const { revision } = fieldChange.revision !== undefined ? fieldChange : over;
				const taggedBaseChanges = tagChange(baseChanges.fieldChanges, revision);
				const rebasedField = rebaser.rebase(
					fieldChange.fieldChanges,
					taggedBaseChanges,
					genId,
				);

				const childChanges = fieldChange.childChanges.clone();
				for (const { key, data } of childChanges.entries()) {
					const baseChildChanges = baseChanges.childChanges.lookup(key);
					if (baseChildChanges !== undefined) {
						this.rebaseNodeChange(
							data,
							{ revision, change: baseChildChanges.data },
							genId,
						);
					}
				}
				childChanges.rebase(taggedBaseChanges, RebaseDirection.Forward);

				// TODO: Could optimize by skipping this assignment if `rebasedField` is empty
				rebasedFields.set(field, {
					fieldKind: fieldKind.identifier,
					fieldChanges: brand(rebasedField),
					childChanges,
				});
			}
		}

		return rebasedFields;
	}

	private rebaseNodeChange(
		change: NodeChangeset,
		over: TaggedChange<NodeChangeset>,
		genId: IdAllocator,
	): NodeChangeset {
		if (change.fieldChanges === undefined || over.change.fieldChanges === undefined) {
			return change;
		}

		return {
			...change,
			fieldChanges: this.rebaseFieldMap(
				change.fieldChanges,
				{
					...over,
					change: over.change.fieldChanges,
				},
				genId,
			),
		};
	}

	rebaseAnchors(anchors: AnchorSet, over: ModularChangeset): void {
		anchors.applyDelta(this.intoDelta(over));
	}

	intoDelta(change: ModularChangeset, repairStore?: ReadonlyRepairDataStore): Delta.Root {
		return this.intoDeltaImpl(change.changes, repairStore ?? dummyRepairDataStore, undefined);
	}

	/**
	 * @param change - The change to convert into a delta.
	 * @param repairStore - The store to query for repair data.
	 * @param path - The path of the node being altered by the change as defined by the input context.
	 * Undefined for the root and for nodes that do not exist in the input context.
	 */
	private intoDeltaImpl(
		change: FieldChangeMap,
		repairStore: ReadonlyRepairDataStore,
		path: UpPath | undefined,
	): Delta.Root {
		const delta: Map<FieldKey, Delta.MarkList> = new Map();
		for (const [field, fieldChange] of change) {
			const changeHandler = getChangeHandler(this.fieldKinds, fieldChange.fieldKind);
			const deltaField = changeHandler.intoDelta(
				fieldChange.fieldChanges,
				(revision: RevisionTag, index: number, count: number): Delta.ProtoNode[] =>
					repairStore.getNodes(revision, path, field, index, count),
			);

			for (const { key, data } of fieldChange.childChanges.entries()) {
				const deltaKey = changeHandler.keyToDeltaKey(key);
				if (deltaKey !== undefined) {
					const nodeDelta = this.deltaFromNodeChange(
						data,
						repairStore,
						deltaKey.context === Context.Input
							? {
									parent: path,
									parentField: field,
									parentIndex: deltaKey.index,
							  }
							: undefined,
					);
					modifyMarkList(deltaField, nodeDelta, deltaKey);
				}
			}

			delta.set(field, deltaField);
		}
		return delta;
	}

	private deltaFromNodeChange(
		change: NodeChangeset,
		repairStore: ReadonlyRepairDataStore,
		path?: UpPath,
	): Delta.Modify {
		const modify: Mutable<Delta.Modify> = {
			type: Delta.MarkType.Modify,
		};

		const valueChange = change.valueChange;
		if (valueChange !== undefined) {
			if ("revert" in valueChange) {
				assert(
					path !== undefined,
					0x4aa /* Only existing nodes can have their value restored */,
				);
				assert(
					valueChange.revert !== undefined,
					0x4ab /* Unable to revert to undefined revision */,
				);
				modify.setValue = repairStore.getValue(valueChange.revert, path);
			} else {
				modify.setValue = valueChange.value;
			}
		}

		if (change.fieldChanges !== undefined) {
			modify.fields = this.intoDeltaImpl(change.fieldChanges, repairStore, path);
		}

		return modify;
	}

	buildEditor(
		changeReceiver: (change: ModularChangeset) => void,
		anchors: AnchorSet,
	): ModularEditBuilder {
		return new ModularEditBuilder(this, changeReceiver, anchors);
	}
}

export function getFieldKind(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
	kind: FieldKindIdentifier,
): FieldKind {
	if (kind === genericFieldKind.identifier) {
		return genericFieldKind;
	}
	const fieldKind = fieldKinds.get(kind);
	assert(fieldKind !== undefined, 0x3ad /* Unknown field kind */);
	return fieldKind;
}

export function getChangeHandler(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
	kind: FieldKindIdentifier,
): FieldChangeHandler<unknown> {
	return getFieldKind(fieldKinds, kind).changeHandler;
}

function makeModularChangeset(changes: FieldChangeMap, maxId: number): ModularChangeset {
	const changeset: ModularChangeset = { changes };
	if (maxId >= 0) {
		changeset.maxId = brand(maxId);
	}
	return changeset;
}

class ModularChangeEncoder extends ChangeEncoder<ModularChangeset> {
	constructor(private readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>) {
		super();
	}

	encodeForJson(formatVersion: number, change: ModularChangeset): JsonCompatibleReadOnly {
		return encodeForJsonFormat0(this.fieldKinds, change);
	}

	decodeJson(formatVersion: number, change: JsonCompatibleReadOnly): ModularChangeset {
		return decodeJsonFormat0(this.fieldKinds, change);
	}
}

/**
 * @sealed
 * @alpha
 */
export class ModularEditBuilder
	extends ProgressiveEditBuilderBase<ModularChangeset>
	implements ProgressiveEditBuilder<ModularChangeset>
{
	constructor(
		family: ChangeFamily<unknown, ModularChangeset>,
		changeReceiver: (change: ModularChangeset) => void,
		anchors: AnchorSet,
	) {
		super(family, changeReceiver, anchors);
	}

	public apply(change: ModularChangeset): void {
		this.applyChange(change);
	}

	/**
	 * Adds a change to the edit builder
	 * @param path - path to the parent node of the field being edited
	 * @param field - the field which is being edited
	 * @param fieldKind - the kind of the field
	 * @param change - the change to the field
	 * @param maxId - the highest `ChangesetLocalId` used in this change
	 */
	submitChange(
		path: UpPath | undefined,
		field: FieldKey,
		fieldKind: FieldKindIdentifier,
		change: FieldChangeset,
		maxId: ChangesetLocalId = brand(-1),
	): void {
		let fieldChangeMap: FieldChangeMap = new Map([[field, { fieldKind, change }]]);

		let remainingPath = path;
		while (remainingPath !== undefined) {
			const nodeChange: NodeChangeset = { fieldChanges: fieldChangeMap };
			const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(
				remainingPath.parentIndex,
				nodeChange,
			);
			fieldChangeMap = new Map([
				[
					remainingPath.parentField,
					{ fieldKind: genericFieldKind.identifier, change: brand(fieldChange) },
				],
			]);
			remainingPath = remainingPath.parent;
		}

		this.applyChange(makeModularChangeset(fieldChangeMap, maxId));
	}

	setValue(path: UpPath, value: Value): void {
		const valueChange: ValueChange = value === undefined ? {} : { value };
		const nodeChange: NodeChangeset = { valueChange };
		const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(
			path.parentIndex,
			nodeChange,
		);
		this.submitChange(
			path.parent,
			path.parentField,
			genericFieldKind.identifier,
			brand(fieldChange),
		);
	}
}
