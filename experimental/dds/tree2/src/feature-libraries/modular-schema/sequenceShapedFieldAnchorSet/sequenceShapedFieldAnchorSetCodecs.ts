/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema } from "@sinclair/typebox";
import { ICodecFamily, IJsonCodec, makeCodecFamily } from "../../../codec";
import { SequenceFieldAnchorSet } from "./sequenceShapedFieldAnchorSetTypes";
import { EncodedSequenceFieldAnchorSet } from "./sequenceShapedFieldAnchorSetFormat";

export const makeSequenceShapedFieldAnchorSetCodecFamily = <TData>(
	childCodec: IJsonCodec<TData, TAnySchema>,
): ICodecFamily<SequenceFieldAnchorSet> =>
	makeCodecFamily([[0, makeOptionalFieldCodec(childCodec)]]);

function makeOptionalFieldCodec<TData>(
	childCodec: IJsonCodec<TData, TAnySchema>,
): IJsonCodec<SequenceFieldAnchorSet<TData>, EncodedSequenceFieldAnchorSet<TAnySchema>> {
	return {
		encode: (set: SequenceFieldAnchorSet<TData>) =>
			set.list.map(({ key, data }) => ({ key, data: childCodec.encode(data) })),
		decode: (list: EncodedSequenceFieldAnchorSet<TAnySchema>) => ({
			list: list.map(({ key, data }) => ({ key, data: childCodec.decode(data) })),
		}),
	};
}
