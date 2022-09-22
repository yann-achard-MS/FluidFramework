/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeEncoder } from "../../change-family";
import { UpPath } from "../../tree";
import { JsonCompatible } from "../../util";
import { Transposed as T } from "./changeset";

export type SequenceChangeset = T.LocalChangeset;
export type WireChangeset = AbstractChangeset | SequenceChangeset;

export interface AbstractChangeset {
    readonly type: "Abstract";
    readonly path: UpPath;
    readonly op: string;
}

export function isAbstractChangeset(change: WireChangeset): change is AbstractChangeset {
    return "type" in change && change.type === "Abstract";
}

class SequenceChangeEncoder extends ChangeEncoder<WireChangeset> {
    public encodeForJson(formatVersion: number, change: WireChangeset): JsonCompatible {
        return change as unknown as JsonCompatible;
    }

    public decodeJson(formatVersion: number, change: JsonCompatible): WireChangeset {
        return change as unknown as WireChangeset;
    }
}

export const sequenceChangeEncoder: ChangeEncoder<WireChangeset> = new SequenceChangeEncoder();
