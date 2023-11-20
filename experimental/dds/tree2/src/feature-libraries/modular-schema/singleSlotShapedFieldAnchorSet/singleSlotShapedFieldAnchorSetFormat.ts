/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, TSchema, Type } from "@sinclair/typebox";

export const EncodedSingleSlotFieldAnchorSet = <Schema extends TSchema>(tData: Schema) =>
	Type.Optional(tData);

/**
 * Note: TS doesn't easily support extracting a generic function's return type until 4.7:
 * https://github.com/microsoft/TypeScript/pull/47607
 * This type is a workaround and can be removed once we're on a version of typescript which
 * supports expressions more like:
 * `Static<ReturnType<typeof EncodedNodeUpdate<Schema>>>`
 */
class Wrapper<T extends TSchema> {
	public encodedSingleSlotFieldAnchorSet(e: T) {
		return EncodedSingleSlotFieldAnchorSet<T>(e);
	}
}

export type EncodedSingleSlotFieldAnchorSet<Schema extends TSchema> = Static<
	ReturnType<Wrapper<Schema>["encodedSingleSlotFieldAnchorSet"]>
>;
