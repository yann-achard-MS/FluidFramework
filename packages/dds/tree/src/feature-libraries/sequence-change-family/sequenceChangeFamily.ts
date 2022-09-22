/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import jsonata from "jsonata";
import { ChangeFamily } from "../../change-family";
import { AnchorSet, Delta, FieldKey, getGenericTreeField, JsonableTree, UpPath } from "../../tree";
import { toDelta } from "./changeset";
import { sequenceChangeRebaser } from "./sequenceChangeRebaser";
import { isAbstractChangeset, sequenceChangeEncoder, SequenceChangeset, WireChangeset } from "./sequenceChangeset";
import { SequenceEditBuilder } from "./sequenceEditBuilder";
// import {
//     RootedTextCursor,
//     jsonableTreeFromCursor as jsonableTreeFromCursorLegacy,
// } from "../treeTextCursorLegacy";

function buildEditor(
    deltaReceiver: (delta: Delta.Root) => void,
    changeConcretizer: (change: WireChangeset) => SequenceChangeset,
    anchorSet: AnchorSet,
): SequenceEditBuilder {
    return new SequenceEditBuilder(deltaReceiver, changeConcretizer, anchorSet);
}

export type SequenceChangeFamily = ChangeFamily<SequenceEditBuilder, SequenceChangeset, WireChangeset>;

export const sequenceChangeFamily: SequenceChangeFamily = {
    rebaser: sequenceChangeRebaser,
    buildEditor,
    concretize,
    intoDelta: toDelta,
    encoder: sequenceChangeEncoder,
};

function concretize(change: WireChangeset, tree: JsonableTree): SequenceChangeset {
    if (!isAbstractChangeset(change)) {
        return change;
    }
    const stack: [FieldKey, number][] = [];

    let path: UpPath | undefined = change.path;
    while (path !== undefined) {
        stack.push([path.parentField, path.parentIndex]);
        path = path.parent;
    }

    let subTree = tree;
    while (stack.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const [key, index] = stack.pop()!;
        const field = getGenericTreeField(tree, key, false);
        subTree = field[index];
        if (subTree === undefined) {
            return { marks: {} };
        }
    }
    const expression = jsonata(change.op);
    const concreteChange = expression.evaluate(subTree) as SequenceChangeset;
    return concreteChange;
}
