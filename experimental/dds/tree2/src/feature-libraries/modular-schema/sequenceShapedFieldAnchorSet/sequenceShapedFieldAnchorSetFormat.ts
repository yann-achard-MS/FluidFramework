/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, ObjectOptions, TSchema, Type } from "@sinclair/typebox";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

export const EncodedSequenceAnchorEntry = <Schema extends TSchema>(tData: Schema) =>
	Type.Object(
		{
			key: Type.Number(),
			data: tData,
		},
		noAdditionalProps,
	);

export const EncodedSequenceFieldAnchorSet = <Schema extends TSchema>(tData: Schema) =>
	Type.Array(EncodedSequenceAnchorEntry(tData));

/**
 * Note: TS doesn't easily support extracting a generic function's return type until 4.7:
 * https://github.com/microsoft/TypeScript/pull/47607
 * This type is a workaround and can be removed once we're on a version of typescript which
 * supports expressions more like:
 * `Static<ReturnType<typeof EncodedNodeUpdate<Schema>>>`
 */
class Wrapper<T extends TSchema> {
	public encodedSequenceAnchorEntry(e: T) {
		return EncodedSequenceAnchorEntry<T>(e);
	}
	public encodedSequenceFieldAnchorSet(e: T) {
		return EncodedSequenceFieldAnchorSet<T>(e);
	}
}

export type EncodedSequenceAnchorEntry<Schema extends TSchema> = Static<
	ReturnType<Wrapper<Schema>["encodedSequenceAnchorEntry"]>
>;

export type EncodedSequenceFieldAnchorSet<Schema extends TSchema> = Static<
	ReturnType<Wrapper<Schema>["encodedSequenceFieldAnchorSet"]>
>;
