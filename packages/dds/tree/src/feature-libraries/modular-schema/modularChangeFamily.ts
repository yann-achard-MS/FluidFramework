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
import { dummyRepairDataStore } from "../fakeRepairDataStore";
import { RebaseDirection } from "./anchorSet";
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
	FieldNodeKey,
	FieldNodeAnchor,
} from "./fieldChangeHandler";
import { FieldKind, BrandedFieldAnchorSet } from "./fieldKind";
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
	readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>;

	constructor(fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>) {
		this.fieldKinds = fieldKinds;
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
			let composedField: Mutable<FieldChange>;
			if (changesForField.length === 1) {
				composedField = changesForField[0];
			} else {
				const fieldKindId = changesForField[0].fieldKind;
				composedField = { fieldKind: fieldKindId };

				const taggedChangesets: TaggedChange<FieldChangeset>[] = [];
				for (const fieldChange of changesForField) {
					assert(fieldChange.fieldKind === fieldKindId, "Inconsistent field kind");
					if (fieldChange.shallow !== undefined) {
						taggedChangesets.push(tagChange(fieldChange.shallow, fieldChange.revision));
					}
				}

				const changeHandler = getFieldKind(this.fieldKinds, fieldKindId).changeHandler;
				const rebaser = changeHandler.rebaser;
				if (taggedChangesets.length > 0) {
					const composedChange = rebaser.compose(taggedChangesets, genId);
					composedField.shallow = brand(composedChange);
				}

				let hasNestedChanges = false;
				const childChanges =
					changeHandler.anchorSetFactory<NodeChangeset>() as unknown as BrandedFieldAnchorSet;
				for (let i = changesForField.length - 1; i >= 0; --i) {
					const iThFieldChanges = changesForField[i];
					if (iThFieldChanges.nested !== undefined) {
						hasNestedChanges = true;
						childChanges.mergeIn(
							iThFieldChanges.nested,
							(existing: NodeChangeset, added: NodeChangeset) =>
								this.composeNodeChanges(
									[
										makeAnonChange(existing),
										tagChange(added, iThFieldChanges.revision),
									],
									genId,
								),
						);
					}
					if (i > 0 && iThFieldChanges.shallow !== undefined) {
						childChanges.rebase(
							tagChange(iThFieldChanges.shallow, iThFieldChanges.revision),
							RebaseDirection.Backward,
						);
					}
				}

				if (hasNestedChanges) {
					composedField.nested = childChanges;
				}
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

			const invertedFieldChange: Mutable<FieldChange> = {
				fieldKind: fieldChange.fieldKind,
			};

			if (fieldChange.shallow !== undefined) {
				const invertedChange = getChangeHandler(
					this.fieldKinds,
					fieldChange.fieldKind,
				).rebaser.invert({ revision, change: fieldChange.shallow }, genId);
				invertedFieldChange.shallow = brand(invertedChange);
			}

			if (fieldChange.nested !== undefined) {
				const childChanges = fieldChange.nested.clone();
				if (fieldChange.shallow !== undefined) {
					childChanges.rebase(
						tagChange(fieldChange.shallow, revision),
						RebaseDirection.Forward,
					);
				}
				for (const { data } of childChanges.entries()) {
					this.invertNodeChange({ revision, change: data }, genId);
				}
				invertedFieldChange.nested = childChanges;
			}

			invertedFields.set(field, invertedFieldChange);
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
				const rebasedFieldChange: Mutable<FieldChange> = {
					fieldKind: fieldKind.identifier,
				};

				let taggedBaseChanges;
				const { revision } = fieldChange.revision !== undefined ? fieldChange : over;
				if (fieldChange.shallow !== undefined) {
					if (baseChanges.shallow !== undefined) {
						taggedBaseChanges = tagChange(baseChanges.shallow, revision);
						const rebasedField = rebaser.rebase(
							fieldChange.shallow,
							taggedBaseChanges,
							genId,
						);
						rebasedFieldChange.shallow = brand(rebasedField);
					} else {
						rebasedFieldChange.shallow = fieldChange.shallow;
					}
				}

				if (fieldChange.nested !== undefined) {
					const childChanges = fieldChange.nested.clone();
					if (baseChanges.nested !== undefined) {
						for (const { key, data } of childChanges.entries()) {
							const baseChildChanges = baseChanges.nested.lookup(key);
							if (baseChildChanges !== undefined) {
								this.rebaseNodeChange(
									data,
									{ revision, change: baseChildChanges.data },
									genId,
								);
							}
						}
					}
					if (taggedBaseChanges !== undefined) {
						childChanges.rebase(taggedBaseChanges, RebaseDirection.Forward);
					}
					rebasedFieldChange.nested = childChanges;
				}

				rebasedFields.set(field, rebasedFieldChange);
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
		const delta: Map<FieldKey, Delta.FieldChanges> = new Map();
		for (const [field, fieldChange] of change) {
			const changeHandler = getChangeHandler(this.fieldKinds, fieldChange.fieldKind);
			const fieldChanges: Mutable<Delta.FieldChanges> = {};
			let hasChanges = false;
			if (fieldChange.shallow !== undefined) {
				const shallow = changeHandler.intoDelta(
					fieldChange.shallow,
					(revision: RevisionTag, index: number, count: number): Delta.ProtoNode[] =>
						repairStore.getNodes(revision, path, field, index, count),
				);
				if (shallow.length > 0) {
					fieldChanges.shallow = shallow;
					hasChanges = true;
				}
			}

			const beforeShallow: Delta.NestedChange[] = [];
			const afterShallow: Delta.NestedChange[] = [];
			if (fieldChange.nested !== undefined) {
				for (const { key, data } of fieldChange.nested.entries()) {
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
						if (nodeDelta) {
							(deltaKey.context === Context.Input
								? beforeShallow
								: afterShallow
							).push({
								index: deltaKey.index,
								...nodeDelta,
							});
						}
					}
				}
				if (beforeShallow.length > 0) {
					fieldChanges.beforeShallow = beforeShallow;
					hasChanges = true;
				}
				if (afterShallow.length > 0) {
					fieldChanges.afterShallow = afterShallow;
					hasChanges = true;
				}
			}

			if (hasChanges) {
				delta.set(field, fieldChanges);
			}
		}
		return delta;
	}

	private deltaFromNodeChange(
		{ valueChange, fieldChanges }: NodeChangeset,
		repairStore: ReadonlyRepairDataStore,
		path?: UpPath,
	): Delta.NodeChanges | undefined {
		if (valueChange === undefined && fieldChanges === undefined) {
			return undefined;
		}

		const modify: Mutable<Delta.NodeChanges> = {};

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

		if (fieldChanges !== undefined) {
			modify.fields = this.intoDeltaImpl(fieldChanges, repairStore, path);
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

export type BrandedChangeHandler = FieldChangeHandler<
	FieldChangeset,
	FieldNodeKey,
	FieldNodeAnchor
>;

export function getChangeHandler(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
	kind: FieldKindIdentifier,
): BrandedChangeHandler {
	return getFieldKind(fieldKinds, kind).changeHandler as BrandedChangeHandler;
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
		let fieldChangeMap: FieldChangeMap = new Map([[field, { fieldKind, shallow: change }]]);

		let remainingPath = path;
		while (remainingPath !== undefined) {
			const nodeChange: NodeChangeset = { fieldChanges: fieldChangeMap };
			const fieldChange = makeGenericNestedChange(remainingPath.parentIndex, nodeChange);
			fieldChangeMap = new Map([[remainingPath.parentField, fieldChange]]);
			remainingPath = remainingPath.parent;
		}

		this.applyChange(makeModularChangeset(fieldChangeMap, maxId));
	}

	setValue(path: UpPath, value: Value): void {
		const valueChange: ValueChange = value === undefined ? {} : { value };
		const nodeChange: NodeChangeset = { valueChange };
		const fieldChange = makeGenericNestedChange(path.parentIndex, nodeChange);
		this.submitChange(
			path.parent,
			path.parentField,
			genericFieldKind.identifier,
			brand(fieldChange),
		);
	}
}

function makeGenericNestedChange(index: number, nodeChange: NodeChangeset): FieldChange {
	const nested = genericFieldKind.changeHandler.anchorSetFactory<NodeChangeset>();
	const key = genericFieldKind.changeHandler.getKey(index);
	nested.track(key, nodeChange);
	return {
		fieldKind: genericFieldKind.identifier,
		nested: nested as unknown as BrandedFieldAnchorSet,
	};
}
