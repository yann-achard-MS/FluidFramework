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
    rebaseAbstract,
    rebaseAnchors,
};

function rebaseAbstract(change: WireChangeset, base: SequenceChangeset): WireChangeset {
    if (isAbstractChangeset(change)) {
        const anchors = new AnchorSet();
        const anchor = anchors.track(change.path);
        anchors.applyDelta(toDelta(base));
        const path = anchors.locate(anchor);
        if (path === undefined) {
            // TODO: support for anchors that come back
            return { marks: {} };
        }
        return {
            ...change,
            path,
        };
    }
    return rebase(change, base);
}

function composeAbstract(changes: WireChangeset[]): WireChangeset {
    if (changes.length === 1) {
        return changes[0];
    }
    if (changes.find(isAbstractChangeset) !== undefined) {
        throw new Error("TODO: compose abstract changesets");
    }
    return compose(changes as SequenceChangeset[]);
}
