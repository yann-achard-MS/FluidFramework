/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily, IJsonCodec, makeCodecFamily } from "../../../codec";
import { EncodedEmptyChangeset } from "./emptyChangesetFormat";
import type { EmptyChangeset } from "./emptyChangesetTypes";

export function makeEmptyChangeCodec(): ICodecFamily<EmptyChangeset> {
	return makeCodecFamily([[0, makeV0Codec()]]);
}

function makeV0Codec(): IJsonCodec<EmptyChangeset, EncodedEmptyChangeset> {
	return {
		encode: (change: EmptyChangeset): EncodedEmptyChangeset => 0,
		decode: (encoded: EncodedEmptyChangeset): EmptyChangeset => 0,
		encodedSchema: EncodedEmptyChangeset,
	};
}
