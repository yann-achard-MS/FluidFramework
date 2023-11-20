/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema } from "@sinclair/typebox";
import { assert } from "@fluidframework/core-utils";
import { FieldKey, FieldKindIdentifier } from "../../core";
import { brand, fail, JsonCompatibleReadOnly, Mutable } from "../../util";
import {
	ICodecFamily,
	ICodecOptions,
	IJsonCodec,
	IMultiFormatCodec,
	makeCodecFamily,
	SchemaValidationFunction,
} from "../../codec";
import {
	FieldChange,
	FieldChangeMap,
	ModularChangeset,
	NodeChangeset,
	RevisionInfo,
} from "./modularChangeTypes";
import { genericFieldKind } from "./genericField";
import {
	EncodedFieldChange,
	EncodedFieldChangeMap,
	EncodedModularChangeset,
	EncodedNodeChangeset,
} from "./modularChangeFormat";
import { ModularFieldChangeset, ModularFieldKind } from "./brands";

function makeV0Codec(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, ModularFieldKind>,
	{ jsonValidator: validator }: ICodecOptions,
): IJsonCodec<ModularChangeset> {
	const nodeChangesetCodec: IJsonCodec<NodeChangeset, EncodedNodeChangeset> = {
		encode: encodeNodeChangesForJson,
		decode: decodeNodeChangesetFromJson,
		encodedSchema: EncodedNodeChangeset,
	};

	const getMapEntry = (field: ModularFieldKind) => {
		const codec = field.changeHandler.codecsFactory(nodeChangesetCodec).resolve(0);
		return {
			codec,
			compiledSchema: codec.json.encodedSchema
				? validator.compile(codec.json.encodedSchema)
				: undefined,
		};
	};

	const fieldChangesetCodecs: Map<
		FieldKindIdentifier,
		{
			compiledSchema?: SchemaValidationFunction<TAnySchema>;
			codec: IMultiFormatCodec<ModularFieldChangeset>;
		}
	> = new Map([
		[genericFieldKind.identifier, getMapEntry(genericFieldKind as unknown as ModularFieldKind)],
	]);

	fieldKinds.forEach((fieldKind, identifier) => {
		fieldChangesetCodecs.set(identifier, getMapEntry(fieldKind));
	});

	const getFieldChangesetCodec = (
		fieldKind: FieldKindIdentifier,
	): {
		codec: IMultiFormatCodec<ModularFieldChangeset>;
		compiledSchema?: SchemaValidationFunction<TAnySchema>;
	} => {
		const entry = fieldChangesetCodecs.get(fieldKind);
		assert(entry !== undefined, 0x5ea /* Tried to encode unsupported fieldKind */);
		return entry;
	};

	function encodeFieldChangesForJson(change: FieldChangeMap): EncodedFieldChangeMap {
		const encodedFields: EncodedFieldChangeMap = [];
		for (const [field, fieldChange] of change) {
			const { codec, compiledSchema } = getFieldChangesetCodec(fieldChange.fieldKind);
			const fieldKey: FieldKey = field;
			const encodedField: EncodedFieldChange = {
				fieldKey,
				fieldKind: fieldChange.fieldKind,
			};

			if (fieldChange.change !== undefined) {
				const encodedChange = codec.json.encode(fieldChange.change);
				if (compiledSchema !== undefined && !compiledSchema.check(encodedChange)) {
					fail("Encoded change didn't pass schema validation.");
				}
				encodedField.change = encodedChange;
			}

			encodedFields.push(encodedField);
		}

		return encodedFields;
	}

	function encodeNodeChangesForJson(change: NodeChangeset): EncodedNodeChangeset {
		const encodedChange: EncodedNodeChangeset = {};
		const { fieldChanges, nodeExistsConstraint } = change;

		if (fieldChanges !== undefined) {
			encodedChange.fieldChanges = encodeFieldChangesForJson(fieldChanges);
		}

		if (nodeExistsConstraint !== undefined) {
			encodedChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return encodedChange;
	}

	function decodeFieldChangesFromJson(encodedChange: EncodedFieldChangeMap): FieldChangeMap {
		const decodedFields: FieldChangeMap = new Map();
		for (const field of encodedChange) {
			const { codec, compiledSchema } = getFieldChangesetCodec(field.fieldKind);
			if (compiledSchema !== undefined && !compiledSchema.check(field.change)) {
				fail("Encoded change didn't pass schema validation.");
			}
			const fieldKey: FieldKey = brand<FieldKey>(field.fieldKey);

			const fieldChange: Mutable<FieldChange> = {
				fieldKind: field.fieldKind,
			};
			if (field.change !== undefined) {
				fieldChange.change = codec.json.decode(field.change);
			}

			decodedFields.set(fieldKey, fieldChange);
		}

		return decodedFields;
	}

	function decodeNodeChangesetFromJson(encodedChange: EncodedNodeChangeset): NodeChangeset {
		const decodedChange: NodeChangeset = {};
		const { fieldChanges, nodeExistsConstraint } = encodedChange;

		if (fieldChanges !== undefined) {
			decodedChange.fieldChanges = decodeFieldChangesFromJson(fieldChanges);
		}

		if (nodeExistsConstraint !== undefined) {
			decodedChange.nodeExistsConstraint = nodeExistsConstraint;
		}

		return decodedChange;
	}

	return {
		encode: (change) => {
			return {
				maxId: change.maxId,
				revisions: change.revisions as readonly RevisionInfo[] & JsonCompatibleReadOnly,
				changes: encodeFieldChangesForJson(change.fieldChanges),
			};
		},
		decode: (change) => {
			const encodedChange = change as unknown as EncodedModularChangeset;
			const decoded: Mutable<ModularChangeset> = {
				fieldChanges: decodeFieldChangesFromJson(encodedChange.changes),
			};
			if (encodedChange.revisions !== undefined) {
				decoded.revisions = encodedChange.revisions;
			}
			if (encodedChange.maxId !== undefined) {
				decoded.maxId = encodedChange.maxId;
			}
			return decoded;
		},
		encodedSchema: EncodedModularChangeset,
	};
}

export function makeModularChangeCodecFamily(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, ModularFieldKind>,
	options: ICodecOptions,
): ICodecFamily<ModularChangeset> {
	return makeCodecFamily([[0, makeV0Codec(fieldKinds, options)]]);
}
