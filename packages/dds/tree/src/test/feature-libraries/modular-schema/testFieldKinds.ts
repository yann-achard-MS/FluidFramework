/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldChangeHandler,
	FieldKind,
	Multiplicity,
	FieldKinds,
	defaultKeyFunctions,
	referenceFreeFieldChangeRebaser,
	RebaseDirection,
	sequenceFieldAnchorSetOps,
	SequenceAnchorSetTypes,
	SequenceFieldAnchorSet,
	EmptyChangeset,
	singleCellKeyFunctions,
	slotFieldAnchorSetOps,
	SlotAnchorSetTypes,
	ChangesetLocalId,
	FieldChangeRebaser,
	genericAnchorSetOps,
	nestedChange,
	NodeChangeset,
	FieldChange,
	genericFieldKind,
} from "../../../feature-libraries";
import { Delta, FieldKindIdentifier, makeAnonChange, TaggedChange } from "../../../core";
import { brand, JsonCompatibleReadOnly, makeArray } from "../../../util";
import { singleJsonCursor } from "../../../domains";

export type ValueChangeset = FieldKinds.ReplaceOp<number>;

export const ValueAnchorSetURI = "ValueAnchorSetURI";
export type ValueAnchorSetURI = typeof ValueAnchorSetURI;

// Registers the types used by the value anchor set.
declare module "../../../feature-libraries/modular-schema/anchorSet" {
	interface AnchorSetOpRegistry<TData> {
		[ValueAnchorSetURI]: SequenceAnchorSetTypes<TData, ValueChangeset>;
	}
}

export const valueHandler: FieldChangeHandler<ValueAnchorSetURI> = {
	...defaultKeyFunctions,
	anchorSetOps: {
		rebase: () => {},
		...sequenceFieldAnchorSetOps,
	},
	rebaser: FieldKinds.replaceRebaser(),
	encoder: FieldKinds.valueEncoder<ValueChangeset & JsonCompatibleReadOnly>(),
	editor: {},
	intoDelta: (change): Delta.MarkList =>
		change === 0
			? []
			: // Using these Delta marks to represent the value replacement
			  [
					{ type: Delta.MarkType.Delete, count: 1 },
					{ type: Delta.MarkType.Insert, content: [singleJsonCursor(change.new)] },
			  ],
};

export const valueField = new FieldKind(
	brand("Value"),
	Multiplicity.Value,
	valueHandler,
	(a, b) => false,
	new Set(),
);

export interface AddDelChangeset {
	add: number;
	del: number;
}

const addDelRebaser = {
	compose: (changes: AddDelChangeset[]): AddDelChangeset => {
		let add = 0;
		let del = 0;
		for (const change of changes) {
			const cancelledAdds = Math.min(add, change.del);
			add -= cancelledAdds;
			del += change.del - cancelledAdds;
			add += change.add;
		}
		return { add, del };
	},
	invert: (change: AddDelChangeset) => ({ add: change.del, del: change.add }),
	rebase: (change: AddDelChangeset, over: AddDelChangeset) => ({
		add: change.add,
		del: change.del - Math.min(change.del, over.del),
	}),
};

function rebaseAnchorSet(
	set: SequenceFieldAnchorSet,
	over: TaggedChange<AddDelChangeset>,
	direction: RebaseDirection,
): void {
	if (direction === RebaseDirection.Backward) {
		return rebaseAnchorSet(
			set,
			makeAnonChange(addDelRebaser.invert(over.change)),
			RebaseDirection.Forward,
		);
	}
	// The keys only refer to nodes in the input context
	let iEntry = 0;
	const { del, add } = over.change;
	const net = add - del;
	while (iEntry < set.list.length && set.list[iEntry].key < del) {
		iEntry += 1;
	}
	set.list.splice(0, iEntry);
	for (const entry of set.list) {
		entry.key = brand(entry.key + net);
	}
}

export const AddDelAnchorSetURI = "AddDelAnchorSetURI";
export type AddDelAnchorSetURI = typeof AddDelAnchorSetURI;

// Registers the types used by the value anchor set.
declare module "../../../feature-libraries/modular-schema/anchorSet" {
	interface AnchorSetOpRegistry<TData> {
		[AddDelAnchorSetURI]: SequenceAnchorSetTypes<TData, AddDelChangeset>;
	}
}

export const addDelHandler: FieldChangeHandler<AddDelAnchorSetURI> = {
	...defaultKeyFunctions,
	anchorSetOps: {
		...sequenceFieldAnchorSetOps,
		rebase: rebaseAnchorSet,
	},
	rebaser: referenceFreeFieldChangeRebaser(addDelRebaser),
	encoder: FieldKinds.valueEncoder<AddDelChangeset & JsonCompatibleReadOnly>(),
	editor: {},
	intoDelta: (change): Delta.MarkList => {
		const markList: Delta.Mark[] = [];
		if (change.del > 0) {
			markList.push({ type: Delta.MarkType.Delete, count: change.del });
		}
		if (change.add > 0) {
			markList.push({
				type: Delta.MarkType.Insert,
				content: makeArray(change.add, () => singleJsonCursor({})),
			});
		}
		return markList;
	},
};

export const addDelField = new FieldKind(
	brand("AddDel"),
	Multiplicity.Sequence,
	addDelHandler,
	(a, b) => false,
	new Set(),
);

export const SingleNodeAnchorSetURI = "SingleNodeAnchorSetURI";
export type SingleNodeAnchorSetURI = typeof SingleNodeAnchorSetURI;

declare module "../../../feature-libraries/modular-schema/anchorSet" {
	interface AnchorSetOpRegistry<TData> {
		[SingleNodeAnchorSetURI]: SlotAnchorSetTypes<TData, EmptyChangeset>;
	}
}

const singleNodeHandler: FieldChangeHandler<SingleNodeAnchorSetURI> = {
	...FieldKinds.noChangeHandler,
	...singleCellKeyFunctions,
	encoder: FieldKinds.noChangeHandler.encoder,
	anchorSetOps: {
		...slotFieldAnchorSetOps,
		rebase: () => 0,
	},
};

export const singleNodeField = new FieldKind(
	brand("SingleNode"),
	Multiplicity.Value,
	singleNodeHandler,
	(a, b) => false,
	new Set(),
);

type IdChangeset = ChangesetLocalId;

const idFieldRebaser: FieldChangeRebaser<IdChangeset> = {
	compose: (changes, genId): IdChangeset => genId(),
	invert: (change, genId): IdChangeset => genId(),
	rebase: (change, over, genId): IdChangeset => genId(),
};

export const IdFieldAnchorSetURI = "IdFieldAnchorSetURI";
export type IdFieldAnchorSetURI = typeof IdFieldAnchorSetURI;

declare module "../../../feature-libraries/modular-schema/anchorSet" {
	interface AnchorSetOpRegistry<TData> {
		[IdFieldAnchorSetURI]: SequenceAnchorSetTypes<TData, IdChangeset>;
	}
}

const idFieldHandler: FieldChangeHandler<IdFieldAnchorSetURI> = {
	...defaultKeyFunctions,
	anchorSetOps: {
		...genericAnchorSetOps,
		rebase: () => {},
	},
	rebaser: idFieldRebaser,
	encoder: FieldKinds.valueEncoder<IdChangeset & JsonCompatibleReadOnly>(),
	editor: {},
	intoDelta: () => [],
};

/**
 * A field which just allocates a new `ChangesetLocalId` for every operation.
 */
export const idField = new FieldKind(
	brand("Id"),
	Multiplicity.Value,
	idFieldHandler,
	(a, b) => false,
	new Set(),
);

export const testFieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind<unknown, any>> = new Map(
	[singleNodeField, valueField, addDelField, idField].map((field) => [field.identifier, field]),
);

export function nestedSingleNodeChange(nodeChange: NodeChangeset): FieldChange {
	return nestedChange(singleNodeField, 0, nodeChange);
}

export function nestedValueChange(nodeChange: NodeChangeset): FieldChange {
	return nestedChange(valueField, 0, nodeChange);
}

export function nestedAddDelChange(index: number, nodeChange: NodeChangeset): FieldChange {
	return nestedChange(addDelField, index, nodeChange);
}

export function nestedGenericChange(index: number, nodeChange: NodeChangeset): FieldChange {
	return nestedChange(genericFieldKind, index, nodeChange);
}
