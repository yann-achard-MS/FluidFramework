/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema } from "@sinclair/typebox";
import { ICodecFamily, IJsonCodec, makeCodecFamily } from "../../../codec";
import { SingleSlotFieldAnchorSet } from "./singleSlotShapedFieldAnchorSetTypes";
import { EncodedSingleSlotFieldAnchorSet } from "./singleSlotShapedFieldAnchorSetFormat";

export const makeSingleSlotShapedFieldAnchorSetCodecFamily = <TData>(
	childCodec: IJsonCodec<TData, TAnySchema>,
): ICodecFamily<SingleSlotFieldAnchorSet> =>
	makeCodecFamily([[0, makeOptionalFieldCodec(childCodec)]]);

function makeOptionalFieldCodec<TData>(
	childCodec: IJsonCodec<TData, TAnySchema>,
): IJsonCodec<SingleSlotFieldAnchorSet<TData>, EncodedSingleSlotFieldAnchorSet<TAnySchema>> {
	return {
		encode: (set: SingleSlotFieldAnchorSet<TData>) =>
			set.entry === undefined ? undefined : childCodec.encode(set.entry),
		decode: (set: EncodedSingleSlotFieldAnchorSet<TAnySchema>) =>
			set === undefined ? {} : { entry: childCodec.decode(set) },
	};
}
