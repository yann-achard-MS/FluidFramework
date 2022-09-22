/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeRebaser } from "../../rebase";
import { AnchorSet } from "../../tree";
import { toDelta } from "./changeset";
import { isAbstractChangeset, SequenceChangeset, WireChangeset } from "./sequenceChangeset";
import { compose } from "./compose";
import { invert } from "./invert";
import { rebase } from "./rebase";

export type SequenceChangeRebaser = ChangeRebaser<SequenceChangeset, WireChangeset>;

function rebaseAnchors(anchors: AnchorSet, over: SequenceChangeset): void {
    anchors.applyDelta(toDelta(over));
}

export const sequenceChangeRebaser: SequenceChangeRebaser = {
    compose,
    composeAbstract,
    invert,
    rebase,
    rebaseAnchors,
};

function composeAbstract(changes: WireChangeset[]): WireChangeset {
    if (changes.find(isAbstractChangeset) !== undefined) {
        throw new Error("TODO: compose abstract changesets");
    }
    return compose(changes as SequenceChangeset[]);
}
