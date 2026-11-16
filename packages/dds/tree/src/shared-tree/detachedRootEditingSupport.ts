/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces/internal";

import type { ICodecOptions, IJsonCodec, JsonCodecPart } from "../codec/index.js";
import type { ChangeEncodingContext, RevisionTag, RevisionTagSchema } from "../core/index.js";
import type {
	FieldBatchCodec,
	ModularChangeset,
	TreeCompressionStrategy,
} from "../feature-libraries/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

/**
 * Support for reading and writing experimental detached-root changes.
 * @remarks
 * Use {@link DetachedRootEditing} to enable this support in {@link SharedTreeOptions.enableDetachedRootEditing}.
 * @sealed @alpha
 */
export interface DetachedRootEditingSupport extends ErasedType<"DetachedRootEditingSupport"> {}

/**
 * Factory supplied by the detached-root implementation, without its field-kind configuration argument.
 */
export type DetachedRootCodecFactory = (
	revisionTagCodec: JsonCodecPart<
		RevisionTag,
		typeof RevisionTagSchema,
		ChangeEncodingContext
	>,
	fieldsCodec: FieldBatchCodec,
	codecOptions: ICodecOptions,
	chunkCompressionStrategy?: TreeCompressionStrategy,
) => IJsonCodec<
	ModularChangeset,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	ChangeEncodingContext
>;

/**
 * Creates an opaque detached-root capability from its codec factory.
 */
export function toDetachedRootEditingSupport(
	factory: DetachedRootCodecFactory,
): DetachedRootEditingSupport {
	return factory as unknown as DetachedRootEditingSupport;
}

/**
 * Gets the codec factory carried by a detached-root capability.
 */
export function getDetachedRootCodecFactory(
	support: DetachedRootEditingSupport,
): DetachedRootCodecFactory {
	return support as unknown as DetachedRootCodecFactory;
}
