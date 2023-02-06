/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldKey,
	FieldKindIdentifier,
	GlobalFieldKey,
	isGlobalFieldKey,
	keyFromSymbol,
	LocalFieldKey,
	symbolFromKey,
} from "../../core";
import { brand, JsonCompatibleReadOnly, Mutable } from "../../util";
import {
	ChangesetLocalId,
	FieldChange,
	FieldChangeMap,
	ModularChangeset,
	NodeChangeset,
	ValueChange,
} from "./fieldChangeHandler";
import { BrandedFieldKindMap } from "./fieldKind";
import { getChangeHandler } from "./modularChangeFamily";

/**
 * Format for encoding as json.
 */
interface EncodedNodeChangeset {
	valueChange?: ValueChange;
	fieldChanges?: EncodedFieldChangeMap;
}

interface EncodedModularChangeset {
	maxId?: ChangesetLocalId;
	changes: EncodedFieldChangeMap;
}

/**
 * Format for encoding as json.
 *
 * This chooses to use lists of named objects instead of maps:
 * this choice is somewhat arbitrary, but avoids user data being used as object keys,
 * which can sometimes be an issue (for example handling that for "__proto__" can require care).
 * It also allows dealing with global vs local field key disambiguation via a flag on the field.
 */
type EncodedFieldChangeMap = EncodedFieldChange[];

interface EncodedFieldChange {
	fieldKey: LocalFieldKey | GlobalFieldKey;
	keyIsGlobal: boolean;
	fieldKind: FieldKindIdentifier;
	/**
	 * Encoded in format selected by `fieldKind`
	 */
	shallow?: JsonCompatibleReadOnly;
	/**
	 * Encoded in format selected by `fieldKind`
	 */
	nested?: JsonCompatibleReadOnly;
}

export function encodeForJsonFormat0(
	fieldKinds: BrandedFieldKindMap,
	change: ModularChangeset,
): EncodedModularChangeset & JsonCompatibleReadOnly {
	return {
		maxId: change.maxId,
		changes: encodeFieldChangesForJson(fieldKinds, change.changes),
	};
}

function encodeFieldChangesForJson(
	fieldKinds: BrandedFieldKindMap,
	change: FieldChangeMap,
): EncodedFieldChangeMap & JsonCompatibleReadOnly {
	const encodedFields: EncodedFieldChangeMap & JsonCompatibleReadOnly = [];
	for (const [field, fieldChange] of change) {
		if (fieldChange.shallow === undefined && fieldChange.nested === undefined) {
			continue;
		}

		const global = isGlobalFieldKey(field);
		const fieldKey: LocalFieldKey | GlobalFieldKey = global ? keyFromSymbol(field) : field;
		const encodedField: Mutable<EncodedFieldChange> = {
			fieldKey,
			keyIsGlobal: global,
			fieldKind: fieldChange.fieldKind,
		};

		const encoder = getChangeHandler(fieldKinds, fieldChange.fieldKind).encoder;

		if (fieldChange.shallow !== undefined) {
			const shallow = encoder.encodeChangeForJson(0, fieldChange.shallow);
			encodedField.shallow = shallow;
		}

		if (fieldChange.nested !== undefined) {
			const childEncoder = (nodeChange: NodeChangeset): JsonCompatibleReadOnly =>
				encodeNodeChangesForJson(fieldKinds, nodeChange);
			const nested = encoder.encodeAnchorSetForJson(0, fieldChange.nested, childEncoder);
			encodedField.nested = nested;
		}

		encodedFields.push(encodedField);
	}

	return encodedFields;
}

function encodeNodeChangesForJson(
	fieldKinds: BrandedFieldKindMap,
	change: NodeChangeset,
): EncodedNodeChangeset & JsonCompatibleReadOnly {
	const encodedChange: EncodedNodeChangeset & JsonCompatibleReadOnly = {};
	if (change.valueChange !== undefined) {
		encodedChange.valueChange = change.valueChange;
	}

	if (change.fieldChanges !== undefined) {
		const encodedFieldChanges = encodeFieldChangesForJson(fieldKinds, change.fieldChanges);
		encodedChange.fieldChanges = encodedFieldChanges as unknown as EncodedFieldChangeMap;
	}

	return encodedChange;
}

export function decodeJsonFormat0(
	fieldKinds: BrandedFieldKindMap,
	change: JsonCompatibleReadOnly,
): ModularChangeset {
	const encodedChange = change as unknown as EncodedModularChangeset;
	const decoded: ModularChangeset = {
		changes: decodeFieldChangesFromJson(fieldKinds, encodedChange.changes),
	};
	if (encodedChange.maxId !== undefined) {
		decoded.maxId = encodedChange.maxId;
	}
	return decoded;
}

function decodeFieldChangesFromJson(
	fieldKinds: BrandedFieldKindMap,
	encodedChange: EncodedFieldChangeMap,
): FieldChangeMap {
	const decodedFields: FieldChangeMap = new Map();
	for (const field of encodedChange) {
		if (field.shallow === undefined && field.nested === undefined) {
			continue;
		}
		const decodedField: Mutable<FieldChange> = {
			fieldKind: field.fieldKind,
		};
		const encoder = getChangeHandler(fieldKinds, field.fieldKind).encoder;

		if (field.shallow !== undefined) {
			const shallow = encoder.decodeChangeJson(0, field.shallow);
			decodedField.shallow = shallow;
		}

		if (field.nested !== undefined) {
			const nested = encoder.decodeAnchorSetJson(0, field.nested, (encodedChild) =>
				decodeNodeChangesetFromJson(fieldKinds, encodedChild),
			);
			decodedField.nested = nested;
		}

		const fieldKey: FieldKey = field.keyIsGlobal
			? symbolFromKey(brand<GlobalFieldKey>(field.fieldKey))
			: brand<LocalFieldKey>(field.fieldKey);
		decodedFields.set(fieldKey, decodedField);
	}

	return decodedFields;
}

function decodeNodeChangesetFromJson(
	fieldKinds: BrandedFieldKindMap,
	change: JsonCompatibleReadOnly,
): NodeChangeset {
	const encodedChange = change as EncodedNodeChangeset;
	const decodedChange: NodeChangeset = {};
	if (encodedChange.valueChange !== undefined) {
		decodedChange.valueChange = encodedChange.valueChange;
	}

	if (encodedChange.fieldChanges !== undefined) {
		decodedChange.fieldChanges = decodeFieldChangesFromJson(
			fieldKinds,
			encodedChange.fieldChanges,
		);
	}

	return decodedChange;
}
