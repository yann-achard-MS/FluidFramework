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
import { AnchorSetContainer, RebaseDirection } from "./anchorSet";
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
	FieldAnchorContainer,
} from "./fieldChangeHandler";
import { FieldKind, BrandedAnchorSetOpsURI, BrandedFieldKind } from "./fieldKind";
import { genericAnchorSetOps, GenericAnchorSetURI, genericFieldKind } from "./genericFieldKind";
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

	/**
	 * Produces an equivalent list of `FieldChange`s that all target the same {@link FieldKind}.
	 * @param changes - The list of `FieldChange`s that need to be normalized.
	 * @returns An object that contains both the equivalent list of `FieldChange`s that all
	 * target the same {@link FieldKind}, and the `FieldKind` that they target.
	 * The returned `FieldChange`s may be a shallow copy of the input `FieldChange`s.
	 */
	private normalizeFieldChanges(changes: readonly FieldChange[]): {
		fieldKind: BrandedFieldKind;
		fieldChanges: readonly FieldChange[];
	} {
		// TODO: Handle the case where changes have conflicting field kinds
		const nonGenericChange = changes.find(
			(change) => change.fieldKind !== genericFieldKind.identifier,
		);
		if (nonGenericChange === undefined) {
			// All the changes are generic
			return {
				fieldKind: genericFieldKind as unknown as BrandedFieldKind,
				fieldChanges: changes,
			};
		}
		const kind = nonGenericChange.fieldKind;
		const fieldKind = getFieldKind(this.fieldKinds, kind) as unknown as BrandedFieldKind;
		const handler = fieldKind.changeHandler;
		const anchorSetOps = handler.anchorSetOps;
		const normalizedChanges = changes.map((change): FieldChange => {
			if (change.fieldKind === genericFieldKind.identifier) {
				const normalized: Mutable<FieldChange> = { fieldKind: kind };
				// The cast is based on the `fieldKind` check above
				const nestedGenericChanges = change.nested as unknown as AnchorSetContainer<
					GenericAnchorSetURI,
					NodeChangeset
				>;
				if (nestedGenericChanges !== undefined) {
					const set = anchorSetOps.factory<NodeChangeset>();
					for (const { key, data } of genericAnchorSetOps.entries(nestedGenericChanges)) {
						anchorSetOps.track(set, handler.getKey(key), data);
					}
					normalized.nested = set;
				}
				if (change.revision !== undefined) {
					normalized.revision = change.revision;
				}
				return normalized;
			}
			return change;
		});
		return { fieldKind, fieldChanges: normalizedChanges };
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
		const fieldMap = new Map<FieldKey, FieldChange[]>();
		for (const change of changes) {
			for (const [fieldKey, fieldChange] of change.change) {
				const fieldChangeToCompose =
					fieldChange.revision !== undefined || change.revision === undefined
						? fieldChange
						: {
								...fieldChange,
								revision: change.revision,
						  };

				getOrAddEmptyToMap(fieldMap, fieldKey).push(fieldChangeToCompose);
			}
		}

		const composedFields: FieldChangeMap = new Map();
		for (const [fieldKey, mixedFieldChanges] of fieldMap) {
			let composedField: Mutable<FieldChange>;
			if (mixedFieldChanges.length === 1) {
				composedField = mixedFieldChanges[0];
			} else {
				const { fieldKind, fieldChanges } = this.normalizeFieldChanges(mixedFieldChanges);
				assert(
					fieldChanges.length === fieldChanges.length,
					0x4a8 /* Number of changes should be constant when normalizing */,
				);
				composedField = { fieldKind: fieldKind.identifier };

				const taggedChangesets: TaggedChange<FieldChangeset>[] = [];
				for (const fieldChange of fieldChanges) {
					if (fieldChange.shallow !== undefined) {
						taggedChangesets.push(tagChange(fieldChange.shallow, fieldChange.revision));
					}
				}

				const changeHandler = fieldKind.changeHandler;
				const rebaser = changeHandler.rebaser;
				if (taggedChangesets.length > 0) {
					const composedChange = rebaser.compose(taggedChangesets, genId);
					composedField.shallow = brand(composedChange);
					if (taggedChangesets.length === 1) {
						composedField.revision = taggedChangesets[0].revision;
					}
				}

				let hasNestedChanges = false;
				const anchorOps = changeHandler.anchorSetOps;
				const childChanges = anchorOps.factory<TaggedChange<NodeChangeset>>();
				for (let i = fieldChanges.length - 1; i >= 0; --i) {
					const iThFieldChanges = fieldChanges[i];
					if (iThFieldChanges.shallow !== undefined) {
						anchorOps.rebase(
							childChanges,
							tagChange(iThFieldChanges.shallow, iThFieldChanges.revision),
							RebaseDirection.Backward,
						);
					}
					if (iThFieldChanges.nested !== undefined) {
						hasNestedChanges = true;
						const taggedIthChildChanges = anchorOps.map(
							iThFieldChanges.nested,
							(change) => tagChange(change, iThFieldChanges.revision),
						);
						anchorOps.mergeIn(
							childChanges,
							taggedIthChildChanges,
							(
								existing: TaggedChange<NodeChangeset>,
								added: TaggedChange<NodeChangeset>,
							) => makeAnonChange(this.composeNodeChanges([added, existing], genId)),
						);
					}
				}

				if (hasNestedChanges && anchorOps.count(childChanges) > 0) {
					composedField.nested = anchorOps.map(childChanges, (tagged) => tagged.change);
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
			const invertedFieldChange: Mutable<FieldChange> = {
				fieldKind: fieldChange.fieldKind,
			};

			const { revision } = fieldChange.revision !== undefined ? fieldChange : changes;
			if (revision !== undefined) {
				invertedFieldChange.revision = revision;
			}

			const handler = getChangeHandler(this.fieldKinds, fieldChange.fieldKind);
			const anchorOps = handler.anchorSetOps;

			if (fieldChange.shallow !== undefined) {
				const invertedChange = handler.rebaser.invert(
					{ revision, change: fieldChange.shallow },
					genId,
				);
				invertedFieldChange.shallow = brand(invertedChange);
			}

			if (fieldChange.nested !== undefined) {
				const childChanges = anchorOps.clone(fieldChange.nested);
				if (fieldChange.shallow !== undefined) {
					anchorOps.rebase(
						childChanges,
						tagChange(fieldChange.shallow, revision),
						RebaseDirection.Forward,
					);
				}
				anchorOps.updateAll(childChanges, (data) =>
					this.invertNodeChange({ revision, change: data }, genId),
				);
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
				const {
					fieldKind,
					fieldChanges: [normalFieldChange, normalBaseFieldChange],
				} = this.normalizeFieldChanges([fieldChange, baseChanges]);

				const rebaser = fieldKind.changeHandler.rebaser;
				const anchorOps = fieldKind.changeHandler.anchorSetOps;
				const rebasedFieldChange: Mutable<FieldChange> = {
					fieldKind: fieldKind.identifier,
				};

				const { revision } = fieldChange.revision !== undefined ? fieldChange : over;
				const taggedBaseChanges =
					normalBaseFieldChange.shallow !== undefined
						? tagChange(normalBaseFieldChange.shallow, revision)
						: undefined;
				if (normalFieldChange.shallow !== undefined) {
					if (taggedBaseChanges !== undefined) {
						const rebasedField = rebaser.rebase(
							normalFieldChange.shallow,
							taggedBaseChanges,
							genId,
						);
						rebasedFieldChange.shallow = brand(rebasedField);
					} else {
						rebasedFieldChange.shallow = normalFieldChange.shallow;
					}
				}

				if (normalFieldChange.nested !== undefined) {
					const childChanges = anchorOps.clone(normalFieldChange.nested);
					if (normalBaseFieldChange.nested !== undefined) {
						const nestedBaseChanges = normalBaseFieldChange.nested;
						anchorOps.updateAll(childChanges, (data, key) => {
							const baseChildChanges = anchorOps.lookup(nestedBaseChanges, key);
							if (baseChildChanges !== undefined) {
								return this.rebaseNodeChange(
									data,
									{ revision, change: baseChildChanges.data },
									genId,
								);
							}
							return data;
						});
					}
					if (taggedBaseChanges !== undefined) {
						anchorOps.rebase(childChanges, taggedBaseChanges, RebaseDirection.Forward);
						if (anchorOps.count(childChanges) > 0) {
							rebasedFieldChange.nested = childChanges;
						}
					} else {
						rebasedFieldChange.nested = childChanges;
					}
				}

				if (
					rebasedFieldChange.shallow !== undefined ||
					rebasedFieldChange.nested !== undefined
				) {
					rebasedFields.set(field, rebasedFieldChange);
				}
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
			const anchorOps = changeHandler.anchorSetOps;
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
				for (const { key, data } of anchorOps.entries(fieldChange.nested)) {
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

function getFieldKind(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
	kind: FieldKindIdentifier,
): BrandedFieldKind {
	if (kind === genericFieldKind.identifier) {
		return genericFieldKind as unknown as BrandedFieldKind;
	}
	const fieldKind = fieldKinds.get(kind);
	assert(fieldKind !== undefined, 0x3ad /* Unknown field kind */);
	return fieldKind as unknown as BrandedFieldKind;
}

export type BrandedChangeHandler = FieldChangeHandler<typeof BrandedAnchorSetOpsURI>;

export function getChangeHandler(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>,
	kind: FieldKindIdentifier,
): BrandedChangeHandler {
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
		this.submitFieldChange(path, field, { fieldKind, shallow: change }, maxId);
	}

	private submitFieldChange(
		path: UpPath | undefined,
		field: FieldKey,
		change: FieldChange,
		maxId: ChangesetLocalId = brand(-1),
	): void {
		let fieldChangeMap: FieldChangeMap = new Map([[field, change]]);

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
		this.submitFieldChange(path.parent, path.parentField, fieldChange);
	}
}

function makeGenericNestedChange(index: number, nodeChange: NodeChangeset): FieldChange {
	const nested = genericAnchorSetOps.factory<NodeChangeset>();
	const key = genericFieldKind.changeHandler.getKey(index);
	genericAnchorSetOps.track(nested, key, nodeChange);
	return {
		fieldKind: genericFieldKind.identifier,
		nested: nested as unknown as FieldAnchorContainer<NodeChangeset>,
	};
}
