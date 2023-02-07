/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	FieldKindIdentifier,
	Delta,
	JsonableTree,
	ITreeCursor,
	TaggedChange,
	RevisionTag,
	ITreeCursorSynchronous,
	TreeSchemaIdentifier,
	FieldSchema,
} from "../core";
import { brand, JsonCompatibleReadOnly } from "../util";
import { singleTextCursor, jsonableTreeFromCursor } from "./treeTextCursor";
import {
	FieldKind,
	Multiplicity,
	allowsTreeSchemaIdentifierSuperset,
	FieldChangeRebaser,
	FieldChangeHandler,
	FieldChangeEncoder,
	referenceFreeFieldChangeRebaser,
	NodeReviver,
	GenericNodeKey,
	genericAnchorSetFactory,
	GenericAnchorSet,
	baseAnchorSetEncoder,
	BaseAnchorSet,
	baseChangeHandlerKeyFunctions,
	singleCellAnchorSetFactory,
	SingleCellAnchorSet,
	SingleCellAnchor,
	SingleCellKey,
	singleCellKeyFunctions,
	singleCellFieldEncoder,
} from "./modular-schema";
import * as SequenceField from "./sequence-field";

type BrandedFieldKind<
	TName extends string,
	TMultiplicity extends Multiplicity,
	TEditor = unknown,
> = FieldKind<TEditor> & {
	identifier: TName & FieldKindIdentifier;
	multiplicity: TMultiplicity;
};

function brandedFieldKind<TName extends string, TMultiplicity extends Multiplicity, TEditor>(
	identifier: TName,
	multiplicity: TMultiplicity,
	changeHandler: FieldChangeHandler<any, unknown, unknown, TEditor>,
	allowsTreeSupersetOf: (
		originalTypes: ReadonlySet<TreeSchemaIdentifier> | undefined,
		superset: FieldSchema,
	) => boolean,
	handlesEditsFrom: ReadonlySet<FieldKindIdentifier>,
): BrandedFieldKind<TName, TMultiplicity, TEditor> {
	return new FieldKind<TEditor>(
		brand(identifier),
		multiplicity,
		changeHandler,
		allowsTreeSupersetOf,
		handlesEditsFrom,
	) as BrandedFieldKind<TName, TMultiplicity, TEditor>;
}

/**
 * Encoder for changesets which carry no information.
 *
 * @alpha
 * @sealed
 */
export const unitEncoder: FieldChangeEncoder<0, GenericAnchorSet<unknown>> = {
	...baseAnchorSetEncoder(genericAnchorSetFactory),
	encodeChangeForJson: (formatVersion: number, change: 0): JsonCompatibleReadOnly => 0,
	decodeChangeJson: (formatVersion: number, change: JsonCompatibleReadOnly): 0 => 0,
};

/**
 * Encoder for changesets which are just a json compatible value.
 *
 * @sealed
 */
export function valueEncoder<T extends JsonCompatibleReadOnly>(): FieldChangeEncoder<
	T,
	BaseAnchorSet<unknown, T>
> {
	return {
		...baseAnchorSetEncoder(genericAnchorSetFactory),
		encodeChangeForJson: (formatVersion: number, change: T): JsonCompatibleReadOnly => change,
		decodeChangeJson: (formatVersion: number, change: JsonCompatibleReadOnly): T => change as T,
	};
}

/**
 * @returns a ChangeRebaser that assumes all the changes commute, meaning that order does not matter.
 */
function commutativeRebaser<TChange>(data: {
	compose: (changes: TChange[]) => TChange;
	invert: (changes: TChange) => TChange;
}): FieldChangeRebaser<TChange> {
	const rebase = (change: TChange, _over: TChange) => change;
	return referenceFreeFieldChangeRebaser({ ...data, rebase });
}

/**
 * ChangeHandler that does not support any changes.
 *
 * TODO: Due to floating point precision compose is not quite associative.
 * This may violate our requirements.
 * This could be fixed by making this integer only
 * and handling values past Number.MAX_SAFE_INTEGER (ex: via an arbitrarily large integer library)
 * or via modular arithmetic.
 */
export const counterHandle: FieldChangeHandler<number, GenericNodeKey> = {
	...baseChangeHandlerKeyFunctions,
	anchorSetFactory: genericAnchorSetFactory,
	rebaser: commutativeRebaser({
		compose: (changes: number[]) => changes.reduce((a, b) => a + b, 0),
		invert: (change: number) => -change,
	}),
	encoder: valueEncoder(),
	editor: {},
	intoDelta: (change: number): Delta.MarkList => [],
};

/**
 * Picks the last value written.
 *
 * TODO: it seems impossible for this to obey the desired axioms.
 * Specifically inverse needs to cancel, restoring the value from the previous change which was discarded.
 */
export function lastWriteWinsRebaser<TChange>(data: {
	noop: TChange;
	invert: (changes: TChange) => TChange;
}): FieldChangeRebaser<TChange> {
	const compose = (changes: TChange[]) =>
		changes.length >= 0 ? changes[changes.length - 1] : data.noop;
	const rebase = (change: TChange, _over: TChange) => change;
	return referenceFreeFieldChangeRebaser({ ...data, compose, rebase });
}

export interface Replacement<T> {
	old: T;
	new: T;
}

export type ReplaceOp<T> = Replacement<T> | 0;

/**
 * Picks the last value written.
 *
 * Consistent if used on valid paths with correct old states.
 */
export function replaceRebaser<T>(): FieldChangeRebaser<ReplaceOp<T>> {
	return referenceFreeFieldChangeRebaser({
		rebase: (change: ReplaceOp<T>, over: ReplaceOp<T>) => {
			if (change === 0) {
				return 0;
			}
			if (over === 0) {
				return change;
			}
			return { old: over.new, new: change.new };
		},
		compose: (changes: ReplaceOp<T>[]) => {
			const f = changes.filter((c): c is Replacement<T> => c !== 0);
			if (f.length === 0) {
				return 0;
			}
			for (let index = 1; index < f.length; index++) {
				assert(f[index - 1].new === f[index].old, 0x3a4 /* adjacent replaces must match */);
			}
			return { old: f[0].old, new: f[f.length - 1].new };
		},
		invert: (changes: ReplaceOp<T>) => {
			return changes === 0 ? 0 : { old: changes.new, new: changes.old };
		},
	});
}

/**
 * ChangeHandler that only handles no-op / identity changes.
 * @alpha
 */
export const noChangeHandler: FieldChangeHandler<0> = {
	...baseChangeHandlerKeyFunctions,
	anchorSetFactory: genericAnchorSetFactory,
	rebaser: referenceFreeFieldChangeRebaser({
		compose: (changes: 0[]) => 0,
		invert: (changes: 0) => 0,
		rebase: (change: 0, over: 0) => 0,
	}),
	encoder: unitEncoder,
	editor: {},
	intoDelta: (change: 0): Delta.MarkList => [],
};

export type NodeUpdate =
	| { set: JsonableTree }
	| {
			/**
			 * The tag of the change that deleted the node being restored.
			 *
			 * Undefined when the operation is the product of a tag-less change being inverted.
			 * It is invalid to try convert such an operation to a delta.
			 */
			revert: RevisionTag | undefined;
	  };

export interface ValueChangeset {
	value?: NodeUpdate;
}

const valueRebaser: FieldChangeRebaser<ValueChangeset> = {
	compose: (changes: TaggedChange<ValueChangeset>[]): ValueChangeset => {
		if (changes.length === 0) {
			return {};
		}
		let newValue: NodeUpdate | undefined;
		for (const { change } of changes) {
			if (change.value !== undefined) {
				newValue = change.value;
			}
		}

		const composed: ValueChangeset = {};
		if (newValue !== undefined) {
			composed.value = newValue;
		}

		return composed;
	},

	invert: ({ revision, change }: TaggedChange<ValueChangeset>): ValueChangeset => {
		const inverse: ValueChangeset = {};
		if (change.value !== undefined) {
			inverse.value = { revert: revision };
		}
		return inverse;
	},

	rebase: (change: ValueChangeset, over: TaggedChange<ValueChangeset>): ValueChangeset => {
		return change;
	},
};

interface EncodedValueChangeset {
	value?: NodeUpdate;
}

const valueFieldEncoder: FieldChangeEncoder<
	ValueChangeset,
	SingleCellAnchorSet<unknown, ValueChangeset>
> = singleCellFieldEncoder({
	encodeChangeForJson: (formatVersion: number, change: ValueChangeset) => {
		const encoded: EncodedValueChangeset & JsonCompatibleReadOnly = {};
		if (change.value !== undefined) {
			encoded.value = change.value;
		}

		return encoded;
	},

	decodeChangeJson: (formatVersion: number, change: JsonCompatibleReadOnly) => {
		const encoded = change as EncodedValueChangeset;
		const decoded: ValueChangeset = {};
		if (encoded.value !== undefined) {
			decoded.value = encoded.value;
		}

		return decoded;
	},
});

export interface ValueFieldEditor {
	/**
	 * Creates a change which replaces the current value of the field with `newValue`.
	 */
	set(newValue: ITreeCursor): ValueChangeset;
}

const valueFieldEditor: ValueFieldEditor = {
	set: (newValue: ITreeCursor) => ({ value: { set: jsonableTreeFromCursor(newValue) } }),
};

const valueChangeHandler: FieldChangeHandler<
	ValueChangeset,
	SingleCellKey,
	SingleCellAnchor,
	ValueFieldEditor
> = {
	...singleCellKeyFunctions,
	anchorSetFactory: singleCellAnchorSetFactory,
	rebaser: valueRebaser,
	encoder: valueFieldEncoder,
	editor: valueFieldEditor,
	intoDelta: (change: ValueChangeset, reviver: NodeReviver) => {
		if (change.value !== undefined) {
			let newValue: ITreeCursorSynchronous;
			if ("revert" in change.value) {
				const revision = change.value.revert;
				assert(revision !== undefined, 0x477 /* Unable to revert to undefined revision */);
				newValue = reviver(revision, 0, 1)[0];
			} else {
				newValue = singleTextCursor(change.value.set);
			}
			return [
				{ type: Delta.MarkType.Delete, count: 1 },
				{
					type: Delta.MarkType.Insert,
					content: [newValue],
				},
			];
		}
		return [];
	},
};

/**
 * Exactly one item.
 */
export const value: BrandedFieldKind<"Value", Multiplicity.Value, ValueFieldEditor> =
	brandedFieldKind<"Value", Multiplicity.Value, ValueFieldEditor>(
		"Value",
		Multiplicity.Value,
		valueChangeHandler,
		(types, other) =>
			(other.kind === sequence.identifier ||
				other.kind === value.identifier ||
				other.kind === optional.identifier) &&
			allowsTreeSchemaIdentifierSuperset(types, other.types),
		new Set(),
	);

export interface OptionalFieldChange {
	/**
	 * The new content for the trait. If undefined, the trait will be cleared.
	 */
	newContent?: NodeUpdate;

	/**
	 * Whether the field was empty in the state this change is based on.
	 */
	wasEmpty: boolean;
}

export interface OptionalChangeset {
	/**
	 * If defined, specifies the new content for the field.
	 */
	fieldChange?: OptionalFieldChange;
}

const optionalChangeRebaser: FieldChangeRebaser<OptionalChangeset> = {
	compose: (changes: TaggedChange<OptionalChangeset>[]): OptionalChangeset => {
		let fieldChange: OptionalFieldChange | undefined;
		for (const { change } of changes) {
			if (change.fieldChange !== undefined) {
				if (fieldChange === undefined) {
					fieldChange = { wasEmpty: change.fieldChange.wasEmpty };
				}

				if (change.fieldChange.newContent !== undefined) {
					fieldChange.newContent = change.fieldChange.newContent;
				} else {
					delete fieldChange.newContent;
				}
			}
		}

		const composed: OptionalChangeset = {};
		if (fieldChange !== undefined) {
			composed.fieldChange = fieldChange;
		}

		return composed;
	},

	invert: ({ revision, change }: TaggedChange<OptionalChangeset>): OptionalChangeset => {
		const inverse: OptionalChangeset = {};

		const fieldChange = change.fieldChange;
		if (fieldChange !== undefined) {
			inverse.fieldChange = { wasEmpty: fieldChange.newContent === undefined };
			if (!fieldChange.wasEmpty) {
				inverse.fieldChange.newContent = { revert: revision };
			}
		}

		return inverse;
	},

	rebase: (
		change: OptionalChangeset,
		overTagged: TaggedChange<OptionalChangeset>,
	): OptionalChangeset => {
		const over = overTagged.change;
		if (change.fieldChange !== undefined) {
			if (over.fieldChange !== undefined) {
				const wasEmpty = over.fieldChange.newContent === undefined;

				// We don't have to rebase the child changes, since the other child changes don't apply to the same node
				return {
					...change,
					fieldChange: { ...change.fieldChange, wasEmpty },
				};
			}

			return change;
		}

		return change;
	},
};

export interface OptionalFieldEditor {
	/**
	 * Creates a change which replaces the field with `newContent`
	 * @param newContent - the new content for the field
	 * @param wasEmpty - whether the field is empty when creating this change
	 */
	set(newContent: ITreeCursor | undefined, wasEmpty: boolean): OptionalChangeset;
}

const optionalFieldEditor: OptionalFieldEditor = {
	set: (newContent: ITreeCursor | undefined, wasEmpty: boolean): OptionalChangeset => ({
		fieldChange: {
			newContent:
				newContent === undefined
					? undefined
					: {
							set: jsonableTreeFromCursor(newContent),
					  },
			wasEmpty,
		},
	}),
};

interface EncodedOptionalChangeset {
	fieldChange?: OptionalFieldChange;
	childChange?: JsonCompatibleReadOnly;
}

const optionalFieldEncoder: FieldChangeEncoder<
	OptionalChangeset,
	SingleCellAnchorSet<unknown, OptionalChangeset>
> = singleCellFieldEncoder({
	encodeChangeForJson: (formatVersion: number, change: OptionalChangeset) => {
		const encoded: EncodedOptionalChangeset & JsonCompatibleReadOnly = {};
		if (change.fieldChange !== undefined) {
			encoded.fieldChange = change.fieldChange;
		}

		return encoded;
	},

	decodeChangeJson: (formatVersion: number, change: JsonCompatibleReadOnly) => {
		const encoded = change as EncodedOptionalChangeset;
		const decoded: OptionalChangeset = {};
		if (encoded.fieldChange !== undefined) {
			decoded.fieldChange = encoded.fieldChange;
		}

		return decoded;
	},
});

/**
 * 0 or 1 items.
 */
export const optional: FieldKind<OptionalFieldEditor> = new FieldKind<OptionalFieldEditor>(
	brand("Optional"),
	Multiplicity.Optional,
	{
		...singleCellKeyFunctions,
		anchorSetFactory: singleCellAnchorSetFactory,
		rebaser: optionalChangeRebaser,
		encoder: optionalFieldEncoder,
		editor: optionalFieldEditor,
		intoDelta: (change: OptionalChangeset, reviver: NodeReviver) => {
			const update = change.fieldChange?.newContent;
			const shallow = [];
			if (change.fieldChange !== undefined && !change.fieldChange.wasEmpty) {
				shallow.push({ type: Delta.MarkType.Delete, count: 1 });
			}
			if (update !== undefined) {
				if ("set" in update) {
					shallow.push({
						type: Delta.MarkType.Insert,
						content: [singleTextCursor(update.set)],
					});
				} else {
					const revision = update.revert;
					assert(
						revision !== undefined,
						0x478 /* Unable to revert to undefined revision */,
					);
					const content = reviver(revision, 0, 1);
					shallow.push({
						type: Delta.MarkType.Insert,
						content,
					});
				}
			}
			return shallow;
		},
	},
	(types, other) =>
		(other.kind === sequence.identifier || other.kind === optional.identifier) &&
		allowsTreeSchemaIdentifierSuperset(types, other.types),
	new Set([value.identifier]),
);

/**
 * 0 or more items.
 */
export const sequence: FieldKind<SequenceField.SequenceFieldEditor> = new FieldKind(
	brand("Sequence"),
	Multiplicity.Sequence,
	SequenceField.sequenceFieldChangeHandler,
	(types, other) =>
		other.kind === sequence.identifier &&
		allowsTreeSchemaIdentifierSuperset(types, other.types),
	// TODO: add normalizer/importers for handling ops from other kinds.
	new Set([]),
);

/**
 * Exactly 0 items.
 *
 * Using Forbidden makes what types are listed for allowed in a field irrelevant
 * since the field will never have values in it.
 *
 * Using Forbidden is equivalent to picking a kind that permits empty (like sequence or optional)
 * and having no allowed types (or only never types).
 * Because of this, its possible to express everything constraint wise without Forbidden,
 * but using Forbidden can be more semantically clear than optional with no allowed types.
 *
 * For view schema, this can be useful if you need to:
 * - run a specific out of schema handler when a field is present,
 * but otherwise are ignoring or tolerating (ex: via extra fields) unmentioned fields.
 * - prevent a specific field from being used as an extra field
 * (perhaps for some past of future compatibility reason)
 * - keep a field in a schema for metadata purposes
 * (ex: for improved error messaging, error handling or documentation)
 * that is not used in this specific version of the schema (ex: to document what it was or will be used for).
 *
 * For stored schema, this can be useful if you need to:
 * - have a field which can have its schema updated to Optional or Sequence of any type.
 * - to exclude a field from extra fields
 * - for the schema system to use as a default for fields which aren't declared
 * (ex: when updating a field that did not exist into one that does)
 *
 * See {@link emptyField} for a constant, reusable field using Forbidden.
 */
export const forbidden = brandedFieldKind(
	"Forbidden",
	Multiplicity.Forbidden,
	noChangeHandler,
	// All multiplicities other than Value support empty.
	(types, other) => fieldKinds.get(other.kind)?.multiplicity !== Multiplicity.Value,
	new Set(),
);

/**
 * Default field kinds by identifier
 */
export const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind<any>> = new Map(
	[value, optional, sequence, forbidden].map((s) => [s.identifier, s]),
);
