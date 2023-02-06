/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { JsonCompatibleReadOnly } from "../../util";
import { baseAnchorSetEncoder, FieldChangeEncoder } from "../modular-schema";
import { Changeset } from "./format";
import { anchorSetFactory, SequenceAnchorSet } from "./sequenceFieldAnchorSet";

export const sequenceFieldChangeEncoder: FieldChangeEncoder<Changeset, SequenceAnchorSet> = {
	...baseAnchorSetEncoder(anchorSetFactory),
	encodeChangeForJson,
	decodeChangeJson,
};

export function encodeChangeForJson(
	formatVersion: number,
	markList: Changeset,
): JsonCompatibleReadOnly {
	return markList as JsonCompatibleReadOnly;
}

export function decodeChangeJson(formatVersion: number, change: JsonCompatibleReadOnly): Changeset {
	return change as Changeset;
}
