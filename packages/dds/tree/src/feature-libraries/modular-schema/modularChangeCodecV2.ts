/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ICodecOptions,
	type IJsonCodec,
	type JsonCodecPart,
	withSchemaValidation,
} from "../../codec/index.js";
import type {
	ChangeEncodingContext,
	ChangeDecodingContext,
	RevisionTag,
	RevisionTagSchema,
} from "../../core/index.js";
import type { FieldBatchCodec } from "../chunked-forest/index.js";
import { TreeCompressionStrategy } from "../treeCompressionUtils.js";

import type { FieldKindConfiguration } from "./fieldKindConfiguration.js";
import {
	encodeChange,
	decodeChange,
	getFieldChangesetCodecs,
} from "./modularChangeCodecV1.js";
import { EncodedModularChangesetV2 } from "./modularChangeFormatV2.js";
import type { ModularChangeset } from "./modularChangeTypes.js";
import {
	fieldKindsFromConfiguration,
	fullChangeValidation,
	basicChangeValidation,
} from "./modularChangeUtils.js";

type ModularChangeCodec = IJsonCodec<
	ModularChangeset,
	EncodedModularChangesetV2,
	EncodedModularChangesetV2,
	ChangeEncodingContext,
	ChangeDecodingContext
>;

export function makeModularChangeCodecV2(
	fieldKinds: FieldKindConfiguration,
	revisionTagCodec: JsonCodecPart<
		RevisionTag,
		typeof RevisionTagSchema,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	codecOptions: ICodecOptions,
	chunkCompressionStrategy: TreeCompressionStrategy = TreeCompressionStrategy.Compressed,
): ModularChangeCodec {
	const fieldChangesetCodecs = getFieldChangesetCodecs(
		fieldKinds,
		revisionTagCodec,
		codecOptions,
	);

	const modularChangeCodec: ModularChangeCodec = {
		encode: (change, context) => {
			fullChangeValidation(
				"Malformed V2 encode input",
				change,
				fieldKindsFromConfiguration(fieldKinds),
			);
			const encoded = encodeChange(
				change,
				context,
				fieldChangesetCodecs,
				revisionTagCodec,
				fieldsCodec,
				chunkCompressionStrategy,
			) as EncodedModularChangesetV2;
			encoded.noChangeConstraint = change.noChangeConstraint;
			return encoded;
		},

		decode: (encodedChange: EncodedModularChangesetV2, context) => {
			const decoded = decodeChange(
				encodedChange,
				context,
				fieldKinds,
				fieldChangesetCodecs,
				revisionTagCodec,
				fieldsCodec,
				chunkCompressionStrategy,
			);
			if (encodedChange.noChangeConstraint !== undefined) {
				decoded.noChangeConstraint = encodedChange.noChangeConstraint;
			}
			basicChangeValidation(
				"Malformed V2 decode output",
				decoded,
				fieldKindsFromConfiguration(fieldKinds),
			);
			return decoded;
		},
	};

	return withSchemaValidation(
		EncodedModularChangesetV2,
		modularChangeCodec,
		codecOptions.jsonValidator,
	);
}
