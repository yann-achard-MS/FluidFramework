/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeCodecFamily } from "../codec/index.js";
import {
	fieldKindConfigurations,
	FieldKinds,
	ModularChangeFormatVersion,
	type FieldKindConfigurationEntry,
} from "../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Keep experimental codec implementations isolated in this provider.
import { makeModularChangeCodecV3 } from "../feature-libraries/modular-schema/modularChangeCodecV3.js";
// eslint-disable-next-line import-x/no-internal-modules -- Keep experimental codec implementations isolated in this provider.
import { makeOptionalFieldCodec } from "../feature-libraries/optional-field/optionalFieldCodecV3.js";

import { toDetachedRootEditingSupport } from "./detachedRootEditingSupport.js";

/**
 * Enables reading and writing experimental detached-root changes.
 * @remarks
 * Pass this value to {@link SharedTreeOptions.enableDetachedRootEditing}.
 * Importing and using this value includes the experimental codecs in the application bundle.
 * Clients without this support reject experimental detached-root messages and summaries.
 * This feature is incomplete and must not be used in production.
 * @alpha
 */
export const DetachedRootEditing = toDetachedRootEditingSupport(
	(revisionTagCodec, fieldsCodec, codecOptions, chunkCompressionStrategy) => {
		const fieldKinds = new Map(fieldKindConfigurations.get(ModularChangeFormatVersion.v5));
		for (const kind of [FieldKinds.optional, FieldKinds.required]) {
			const entry: FieldKindConfigurationEntry = {
				kind,
				formatVersion: 3,
				codecsFactory: (revisionCodec) =>
					makeCodecFamily([[3, makeOptionalFieldCodec(revisionCodec)]]),
			};
			fieldKinds.set(kind.identifier, entry);
		}
		return makeModularChangeCodecV3(
			fieldKinds,
			revisionTagCodec,
			fieldsCodec,
			codecOptions,
			chunkCompressionStrategy,
		);
	},
);
